/**
 * Always-open bot cash table(s) ("cash games so anyone can join at any time").
 *
 * The manager keeps POKER_BOT_CASH_TABLES public cash tables alive at
 * POKER_BOT_CASH_SB/BB blinds, each with a few `role = 'cash'` bots seated
 * (poker_bot_accounts, migration 201). Real players join through the normal
 * cash-table flow — nothing about the table is special except that the bot
 * action tick (`tickServerTournamentBots`) also drives bots at tables listed
 * in `poker_bot_cash_tables`, and bot pot wins are not raked.
 *
 *   - A bot sits with exactly POKER_BOT_CASH_BUYIN chips (funded from the bot
 *     bankroll, same path as tournament bots — never the rake/fee wallets).
 *   - A bot whose stack drops below one big blind LEAVES between hands (no
 *     auto-rebuy unless POKER_BOT_CASH_REBUY=true) and sits out a cooldown.
 *   - When fewer than POKER_BOT_CASH_MIN_BOTS bots are seated a fresh bot sits
 *     (POKER_BOT_CASH_REFILL, default on), always leaving at least
 *     POKER_BOT_CASH_OPEN_SEATS seats free for humans, so the table never dies.
 *
 * Env:
 *   POKER_BOT_CASH_ENABLED            true to run (default false)
 *   POKER_BOT_CASH_TABLES             tables to keep open (default 1, max 3)
 *   POKER_BOT_CASH_SB / _BB           blinds (default 5 / 10; BB must be 2×SB)
 *   POKER_BOT_CASH_SEATS              seats per table (default 10)
 *   POKER_BOT_CASH_BUYIN              bot buy-in chips (default 500 = 50 BB; 40–100 BB rule)
 *   POKER_BOT_CASH_MIN_BOTS           bots kept seated (default 4)
 *   POKER_BOT_CASH_OPEN_SEATS         seats always left free for humans (default 3)
 *   POKER_BOT_CASH_REFILL             seat a fresh bot after one leaves (default true)
 *   POKER_BOT_CASH_REBUY              busted bot re-buys instead of leaving (default false)
 *   POKER_BOT_CASH_REJOIN_COOLDOWN_MIN minutes before a busted bot may sit again (default 20)
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import { listPokerBotAccounts } from '../lib/poker-bot-registry';
import { fundPokerBotToBalance } from '../lib/poker-bot-bankroll';

const POLL_MS = 7_000;

export interface BotCashConfig {
  enabled: boolean;
  tables: number;
  smallBlind: number;
  bigBlind: number;
  seats: number;
  buyIn: number;
  minBots: number;
  openSeats: number;
  refill: boolean;
  rebuy: boolean;
  cooldownMs: number;
}

function intEnv(name: string, dflt: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return dflt;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

function boolEnv(name: string, dflt: boolean): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return dflt;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export function readBotCashConfig(): BotCashConfig {
  const smallBlind = intEnv('POKER_BOT_CASH_SB', 5, 1, 1_000_000);
  const bigBlind = intEnv('POKER_BOT_CASH_BB', smallBlind * 2, 2, 2_000_000);
  const seats = intEnv('POKER_BOT_CASH_SEATS', 10, 2, 10);
  return {
    enabled: boolEnv('POKER_BOT_CASH_ENABLED', false),
    tables: intEnv('POKER_BOT_CASH_TABLES', 1, 0, 3),
    smallBlind,
    bigBlind,
    seats,
    buyIn: intEnv('POKER_BOT_CASH_BUYIN', bigBlind * 50, 1, 100_000_000),
    minBots: intEnv('POKER_BOT_CASH_MIN_BOTS', 4, 2, seats),
    openSeats: intEnv('POKER_BOT_CASH_OPEN_SEATS', 3, 0, seats),
    refill: boolEnv('POKER_BOT_CASH_REFILL', true),
    rebuy: boolEnv('POKER_BOT_CASH_REBUY', false),
    cooldownMs: intEnv('POKER_BOT_CASH_REJOIN_COOLDOWN_MIN', 20, 0, 24 * 60) * 60_000,
  };
}

export interface CashSeat {
  address: string;
  stack: number;
  isBot: boolean;
}

/**
 * Pure planning step (unit-tested): which bots must leave and how many may sit.
 * `handActive` = a hand is in progress; leaving waits for the gap between hands so
 * a bot never forfeits a pot it is still in.
 */
export function planCashTable(
  seats: CashSeat[],
  cfg: Pick<BotCashConfig, 'seats' | 'bigBlind' | 'minBots' | 'openSeats' | 'refill'>,
  handActive: boolean,
): { leave: string[]; sit: number } {
  const leave = handActive
    ? []
    : seats.filter((s) => s.isBot && s.stack < cfg.bigBlind).map((s) => s.address);
  const remaining = seats.filter((s) => !leave.includes(s.address));
  const botsSeated = remaining.filter((s) => s.isBot).length;
  const free = cfg.seats - remaining.length;
  const room = Math.max(0, free - cfg.openSeats);
  const want = Math.max(0, cfg.minBots - botsSeated);
  // First fill (no bots yet) always happens; later fills obey POKER_BOT_CASH_REFILL.
  const allowed = cfg.refill || botsSeated === 0;
  return { leave, sit: allowed ? Math.min(want, room) : 0 };
}

/** Narrow slice of PokerGameService the manager needs (keeps the service unit-testable). */
export interface CashGameOps {
  createTable(sb: number, bb: number, maxSeats: number, pin?: string, creator?: string | null): Promise<string>;
  joinTable(tableId: string, addr: string, buyInChips: string): Promise<unknown>;
  leaveTable(tableId: string, addr: string): Promise<unknown>;
}

export class PokerBotCashService {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly game: CashGameOps,
  ) {}

  start(): void {
    const cfg = readBotCashConfig();
    if (!cfg.enabled || cfg.tables === 0) {
      logger.info('[bot-cash] disabled (POKER_BOT_CASH_ENABLED != true)');
      return;
    }
    if (cfg.bigBlind !== cfg.smallBlind * 2) {
      logger.error('[bot-cash] POKER_BOT_CASH_BB must equal 2× POKER_BOT_CASH_SB; not starting', cfg);
      return;
    }
    logger.info('[bot-cash] started', cfg);
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Bot cash tables that still exist (stale rows for deleted tables are dropped). */
  async listTables(): Promise<string[]> {
    await this.pool.query(
      `DELETE FROM poker_bot_cash_tables c
        WHERE NOT EXISTS (SELECT 1 FROM poker_tables pt WHERE pt.id = c.table_id)`,
    );
    const r = await this.pool.query(`SELECT table_id FROM poker_bot_cash_tables ORDER BY created_at`);
    return r.rows.map((x) => String(x.table_id));
  }

  async tick(nowMs = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cfg = readBotCashConfig();
      if (!cfg.enabled) return;
      let tables = await this.listTables();
      while (tables.length < cfg.tables) {
        const id = await this.game.createTable(cfg.smallBlind, cfg.bigBlind, cfg.seats, undefined, null);
        await this.pool.query(`INSERT INTO poker_bot_cash_tables (table_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
        logger.info('[bot-cash] created bot cash table', { tableId: id, sb: cfg.smallBlind, bb: cfg.bigBlind });
        tables = await this.listTables();
      }
      for (const tableId of tables.slice(0, Math.max(cfg.tables, 0))) {
        await this.manageTable(tableId, cfg, nowMs);
      }
    } catch (err) {
      logger.error('[bot-cash] tick failed', { error: (err as Error)?.message });
    } finally {
      this.busy = false;
    }
  }

  private async manageTable(tableId: string, cfg: BotCashConfig, nowMs: number): Promise<void> {
    const bots = listPokerBotAccounts('cash');
    const botSet = new Set(bots.map((b) => b.walletAddress));
    const seatRows = await this.pool.query(
      `SELECT LOWER(player_address) AS addr, COALESCE(stack, 0)::TEXT AS stack
         FROM poker_seats WHERE table_id = $1 AND player_address IS NOT NULL`,
      [tableId],
    );
    const seats: CashSeat[] = seatRows.rows.map((r) => ({
      address: String(r.addr),
      stack: Number(String(r.stack).split('.')[0]) || 0,
      isBot: botSet.has(String(r.addr)),
    }));
    const active = await this.pool.query(
      `SELECT 1 FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId],
    );
    const plan = planCashTable(seats, cfg, active.rows.length > 0);

    for (const addr of plan.leave) {
      try {
        await this.game.leaveTable(tableId, addr);
        logger.info('[bot-cash] bot left (out of buy-in)', { tableId, bot: addr });
        if (cfg.rebuy) {
          await this.seatBot(tableId, addr, cfg);
        } else {
          this.cooldownUntil.set(addr, nowMs + cfg.cooldownMs);
        }
      } catch (err) {
        logger.warn('[bot-cash] bot leave failed', { tableId, bot: addr, error: (err as Error)?.message });
      }
    }

    if (plan.sit <= 0) return;
    // Bots already seated at ANY bot cash table are unavailable.
    const busy = await this.pool.query(
      `SELECT LOWER(s.player_address) AS addr FROM poker_seats s
         JOIN poker_bot_cash_tables c ON c.table_id = s.table_id
        WHERE s.player_address IS NOT NULL`,
    );
    const taken = new Set(busy.rows.map((r) => String(r.addr)));
    const candidates = bots
      .map((b) => b.walletAddress)
      .filter((a) => !taken.has(a) && (this.cooldownUntil.get(a) ?? 0) <= nowMs);
    shuffle(candidates);
    let sat = 0;
    for (const bot of candidates) {
      if (sat >= plan.sit) break;
      if (await this.seatBot(tableId, bot, cfg)) sat++;
    }
  }

  private async seatBot(tableId: string, bot: string, cfg: BotCashConfig): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await fundPokerBotToBalance(client, bot, BigInt(cfg.buyIn), { type: 'poker_table', id: tableId });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      await this.game.joinTable(tableId, bot, String(cfg.buyIn));
      logger.info('[bot-cash] bot sat down', { tableId, bot, buyIn: cfg.buyIn });
      return true;
    } catch (err) {
      logger.warn('[bot-cash] bot sit failed', { tableId, bot, error: (err as Error)?.message });
      return false;
    }
  }
}

function shuffle<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
