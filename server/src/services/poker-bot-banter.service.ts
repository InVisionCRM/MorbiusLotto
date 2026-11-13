/**
 * Bot table talk: bots chat, emote and throw things at tables they sit at
 * (scheduled Beat-the-Bots tournaments, the bot cash table, anywhere a registry bot is seated).
 *
 * Runs on its own timer, completely outside the action path: it only READS table state
 * (getTableState, viewer = null) and broadcasts the same WS messages humans' quick-chat /
 * directed emotes produce (`poker_quick_reaction`, `poker_directed_emote`,
 * `poker_avatar_emotion`). It never awaits anything the bot action tick or the turn timer
 * waits on, so it can't slow a bot down or touch the clock. Every message is also recorded
 * in lib/poker-table-talk so the X stream (which polls the public snapshot) shows it.
 *
 * Logic + copy: lib/poker-bot-banter.ts (pure, unit-tested).
 *
 * Env:
 *   POKER_BOT_BANTER=false            turn it off (default on)
 *   POKER_BOT_BANTER_MIN_GAP_S=20     min seconds between bot messages per table
 *   POKER_BOT_BANTER_MAX_GAP_S=40     max (each gap is random in [min, max])
 *   POKER_BOT_BANTER_POLL_MS=2500     how often bot tables are looked at (1000–10000)
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import { getPokerBotAddressSet } from '../lib/poker-bot-registry';
import {
  DEFAULT_BANTER_CONFIG,
  detectBanterEvents,
  newBanterTableState,
  planBanter,
  snapshotFromState,
  type BanterAction,
  type BanterConfig,
  type BanterSnapshot,
  type BanterTableState,
} from '../lib/poker-bot-banter';
import { recordTableTalk } from '../lib/poker-table-talk';

type Emit = (room: string, type: string, payload: Record<string, unknown>) => void;

interface TableStateSource {
  getTableState(tableId: string, viewer: string | null): Promise<any>;
}

function numEnv(name: string, dflt: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

export function banterEnabled(): boolean {
  const v = String(process.env.POKER_BOT_BANTER ?? '').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'no' || v === 'off');
}

export function readBanterConfig(): BanterConfig {
  const minGapMs = numEnv('POKER_BOT_BANTER_MIN_GAP_S', DEFAULT_BANTER_CONFIG.minGapMs / 1000, 5, 600) * 1000;
  const maxGapMs = Math.max(minGapMs, numEnv('POKER_BOT_BANTER_MAX_GAP_S', DEFAULT_BANTER_CONFIG.maxGapMs / 1000, 5, 900) * 1000);
  return { ...DEFAULT_BANTER_CONFIG, minGapMs, maxGapMs };
}

export class PokerBotBanterService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly snaps = new Map<string, BanterSnapshot>();
  private readonly tables = new Map<string, BanterTableState>();
  private readonly cfg: BanterConfig;

  constructor(
    private readonly pool: Pool,
    private readonly game: TableStateSource,
    private readonly emit: Emit,
    private readonly rng: () => number = Math.random,
    cfg?: BanterConfig,
  ) {
    this.cfg = cfg ?? readBanterConfig();
  }

  start(): void {
    if (this.timer || !banterEnabled()) return;
    const every = numEnv('POKER_BOT_BANTER_POLL_MS', 2500, 1000, 10_000);
    this.timer = setInterval(() => { void this.tick(); }, every);
    this.timer.unref?.();
    logger.info('Poker bot banter started', { pollMs: every, minGapS: this.cfg.minGapMs / 1000, maxGapS: this.cfg.maxGapMs / 1000 });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over every table a bot is seated at. Never throws. */
  async tick(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let bots: Set<string>;
      try { bots = getPokerBotAddressSet(); } catch { return; }
      if (bots.size === 0) return;
      const r = await this.pool.query<{ table_id: string }>(
        `SELECT DISTINCT table_id::TEXT AS table_id FROM poker_seats
          WHERE player_address IS NOT NULL AND LOWER(player_address) = ANY($1::text[])
          LIMIT 25`,
        [[...bots]],
      );
      const live = new Set(r.rows.map((x) => String(x.table_id)));
      for (const id of [...this.snaps.keys()]) if (!live.has(id)) { this.snaps.delete(id); this.tables.delete(id); }
      for (const tableId of live) {
        try {
          await this.tickTable(tableId, bots, now);
        } catch (err) {
          logger.debug('bot banter table tick failed', { tableId, error: (err as Error)?.message });
        }
      }
    } catch (err) {
      logger.warn('Poker bot banter tick failed', { error: (err as Error)?.message });
    } finally {
      this.running = false;
    }
  }

  async tickTable(tableId: string, bots: Set<string>, now = Date.now()): Promise<BanterAction[]> {
    const state = await this.game.getTableState(tableId, null);
    const snap = snapshotFromState(state, (a) => bots.has(a));
    const prev = this.snaps.get(tableId) ?? null;
    this.snaps.set(tableId, snap);
    let st = this.tables.get(tableId);
    if (!st) {
      // first sight of a table (e.g. after a restart): stay quiet for one min gap, and
      // don't re-welcome humans who were already seated
      st = newBanterTableState(now);
      st.nextGapMs = this.cfg.minGapMs;
      for (const s of snap.seats) if (!s.isBot) st.greeted.add(s.address);
      this.tables.set(tableId, st);
    }
    const events = detectBanterEvents(prev, snap);
    if (events.length === 0) return [];
    const actions = planBanter(events, snap, st, now, this.rng, this.cfg);
    this.send(tableId, snap, actions);
    return actions;
  }

  private send(tableId: string, snap: BanterSnapshot, actions: BanterAction[]): void {
    const room = `poker:table:${tableId}`;
    const nameAt = (pos: number) => snap.seats.find((s) => s.position === pos)?.name ?? null;
    let delay = 0;
    for (const a of actions) {
      const fire = () => {
        try {
          if (a.kind === 'say') {
            recordTableTalk(tableId, { kind: 'say', fromPosition: a.from, fromName: nameAt(a.from), text: a.text, bot: true });
            this.emit(room, 'poker_quick_reaction', { tableId, seatIndex: a.from, type: 'phrase', value: a.text });
            if (a.emotion) this.emit(room, 'poker_avatar_emotion', { tableId, seatIndex: a.from, emotion: a.emotion });
          } else {
            recordTableTalk(tableId, { kind: 'emote', fromPosition: a.from, fromName: nameAt(a.from), toPosition: a.to, toName: nameAt(a.to), emote: a.emote, bot: true });
            this.emit(room, 'poker_directed_emote', { tableId, fromSeatIndex: a.from, toSeatIndex: a.to, kind: a.emote });
          }
        } catch (err) {
          logger.debug('bot banter emit failed', { tableId, error: (err as Error)?.message });
        }
      };
      if (delay === 0) fire();
      else setTimeout(fire, delay).unref?.();
      delay += 1500; // let the bubble land before the throw
    }
  }
}
