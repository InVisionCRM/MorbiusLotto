/**
 * WeeklyDropService — "The Weekly Drop" raffle jackpot.
 *
 * Spec: WEEKLY_DROP_SPEC.md (repo root — approved design 2026-07-01).
 * Schema: migration 171_weekly_drop.sql.
 *
 * Model:
 *   - One draw is 'open' at any time. Every settled bet (a negative `*_bet`
 *     delta in poker_chip_ledger — the same definition VipService uses for
 *     wager volume) funds 0.25% of the wager into the open draw's pot and
 *     accrues raffle-entry progress at that game's rate.
 *   - Public math: 1 entry per 1,000 MORBIUS wagered. Internally each game has
 *     an edge-proportional weight (DROP_ENTRY_RATES) so thin-edge games can't
 *     cheaply farm entries against the guaranteed pot.
 *   - Every Sunday 8:00 PM Eastern the draw closes: commit → select 3 winners
 *     (seeded deterministic weighted sampling, without replacement per player)
 *     → credit chips → reveal seed → open next draw.
 *   - Prizes: 60 / 25 / 15 % of max(pot, 25,000 chips), credited to the
 *     winner's chip (reserve) balance via applyPokerChipDelta with ledger
 *     reason 'weekly_drop_prize' — the same credit path as VIP rakeback and
 *     holder rewards.
 *
 * UNITS: whole chips throughout (1 chip = 1 MORBIUS = 10^18 wei), matching
 * poker_chip_ledger deltas and the recent-wins feed. The wei-scale
 * players.balance is never touched here. All amounts travel as bigint /
 * numeric strings — never floats.
 *
 * Draw time zone: "Sunday 8:00 PM" means 8 PM in America/New_York (US Eastern),
 * DST-aware — so it is always 8 PM for Eastern players (20:00 EDT = 00:00 UTC in
 * summer, 20:00 EST = 01:00 UTC in winter). We store the resolved UTC instant in
 * drop_draws.closes_at and count down to it, so clients need no timezone logic.
 */

import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { applyPokerChipDelta } from './poker-chip-wallet';

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

/** Pot funding: 0.25% (25 bps) of every settled wager, all games. */
export const DROP_POT_BPS = 25n;

/** Public entry math: 1 entry per 1,000 chips of (effective) wager. */
export const CHIPS_PER_ENTRY = 1000n;

/** House-guaranteed minimum prize pool per draw (whole chips). */
export const DROP_GUARANTEED_MIN_CHIPS = 25000n;

/** Prize split for ranks 1..3, in bps of max(pot, guarantee). Sums to 10000. */
export const DROP_PRIZE_SPLIT_BPS: readonly bigint[] = [6000n, 2500n, 1500n];

/** Draws close Sunday at this wall-clock hour in DROP_TZ (20 = 8 PM). */
export const DROP_CLOSE_LOCAL_HOUR = 20;
/** The timezone the drop's "8 PM" is fixed to (DST-aware). */
export const DROP_TZ = 'America/New_York';

/**
 * Per-game entry rates: chips wagered per 1 raffle entry, keyed by the ledger
 * game key (the `*_bet` reason minus its `_bet` suffix, e.g. 'arcade_dice').
 *
 * Edge-weighting (WEEKLY_DROP_SPEC.md "Entries"): the raffle pot is funded by
 * a flat 0.25% of turnover but partly house-guaranteed, so a 98%-RTP game
 * wagered at huge volume would let a grinder farm tickets far more cheaply
 * (in expected loss) than, say, Keno. Each game's rate is therefore roughly
 * inversely proportional to its house edge: thin-edge games need MORE chips
 * per entry. Casual players never see this — the UI shows the simple
 * 1-per-1,000 public math and a game-agnostic progress bar (progress is
 * tracked in "effective chips" on the public 1,000-chip scale).
 *
 * Launch defaults — review per game after real volume data.
 */
export const DROP_ENTRY_RATES: Record<string, bigint> = {
  // ~1% edge coin-flip style games: 2x the base rate.
  arcade_dice: 2000n,
  arcade_dicex2: 2000n,
  arcade_limbo: 2000n,
  arcade_crash: 2000n,
  arcade_hilo: 2000n,
  arcade_baccarat: 2000n,
  arcade_dragon_tiger: 2000n,
  // Near-optimal-play games with sub-1% edges.
  blackjack: 2500n,
  video_poker: 2500n,
  arcade_three_card_poker: 1500n,
  arcade_craps: 1500n,
  arcade_roulette: 1500n,
  // Mid/high-edge games sit at the public base rate (1 entry / 1,000 chips):
  // keno, plinko, arcade_mines, arcade_towers, arcade_chicken, arcade_pachinko,
  // arcade_cascade, arcade_firewalk, arcade_heist, arcade_greed_dice,
  // arcade_cipher, … (anything not listed uses DEFAULT_CHIPS_PER_ENTRY).
  //
  // Poker cash games are pot-based — there is no per-player `*_bet` ledger row
  // to meter — so accrual keys off each player's RAKE share instead (wired in
  // poker-game.service.ts hand settlement). Rake IS pure expected loss, so its
  // rate is far below the turnover rates: 40 chips of rake ≈ the EV-loss behind
  // one entry on the turnover games (dice 2,000 @ ~1% = 20; roulette 1,500 @
  // ~2.7% = 40; keno 1,000 @ ~6% = 60).
  poker_rake: 40n,
  // Tournament buy-ins (poker chip tournaments via the 'tournament_buyin'
  // ledger reason + legacy MORBIUS blackjack tournaments, wei → chips). ~3-5%
  // of the buy-in is fee/rake → mid-edge, public base rate. Accrual is
  // REVERSED (reverseWagerAccrual) when a buy-in is refunded (unregister /
  // cancel) so register→refund loops can't farm tickets against the
  // guaranteed pot.
  tournament: 1000n,
};

/** Fallback rate for any game key not present in DROP_ENTRY_RATES. */
export const DEFAULT_CHIPS_PER_ENTRY = CHIPS_PER_ENTRY;

// ─────────────────────────────────────────────────────────────────────────────
// Pure fairness helpers (exported for unit tests + the verify endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export interface DropEntrySnapshot {
  address: string; // lowercase 0x wallet
  entries: number; // whole tickets (> 0 to participate)
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Canonical JSON for an entry list: entries with > 0 tickets, sorted by
 * address ascending, serialized with a fixed key order. This exact string is
 * what gets hashed into the commitment — the verify endpoint documents it.
 */
export function canonicalEntryListJSON(entries: DropEntrySnapshot[]): string {
  const canonical = entries
    .filter((e) => e.entries > 0)
    .map((e) => ({ address: e.address.toLowerCase(), entries: e.entries }))
    .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  return JSON.stringify(canonical);
}

/** sha256 hex of the canonical entry list. */
export function entryListHash(entries: DropEntrySnapshot[]): string {
  return sha256Hex(canonicalEntryListJSON(entries));
}

/** commitment = sha256(serverSeed || sha256(canonicalEntryListJSON)) — poker PF pattern. */
export function computeCommitment(serverSeed: string, listHash: string): string {
  return sha256Hex(serverSeed + listHash);
}

/**
 * Seeded deterministic weighted sampling WITHOUT replacement per player.
 *
 * Recipe (also described by GET /api/drop/verify/:drawId):
 *   1. Canonicalize the entry list (see canonicalEntryListJSON) — entries > 0,
 *      sorted by address ascending.
 *   2. For draw index k = 0, 1, 2, …:
 *        roll = HMAC-SHA256(key = serverSeed, msg = `weekly-drop:winner:${k}`)
 *        r    = BigInt('0x' + roll) mod (sum of remaining entry counts)
 *      Walk the remaining list in canonical order accumulating entry counts;
 *      the first player whose cumulative count exceeds r wins rank k+1 and is
 *      removed from the pool (a player can win at most one rank).
 *   (The 256-bit roll modulo a < 2^53 total makes modulo bias ~2^-200 — nil.)
 *
 * Pure: same (seed, entries, n) always returns the same winners.
 */
export function selectWinners(
  serverSeed: string,
  entries: DropEntrySnapshot[],
  n: number,
): string[] {
  const pool = entries
    .filter((e) => Number.isFinite(e.entries) && e.entries > 0)
    .map((e) => ({ address: e.address.toLowerCase(), entries: Math.floor(e.entries) }))
    .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));

  const winners: string[] = [];
  while (winners.length < n && pool.length > 0) {
    let total = 0n;
    for (const e of pool) total += BigInt(e.entries);
    if (total <= 0n) break;

    const roll = crypto
      .createHmac('sha256', serverSeed)
      .update(`weekly-drop:winner:${winners.length}`)
      .digest('hex');
    const r = BigInt('0x' + roll) % total;

    let acc = 0n;
    for (let i = 0; i < pool.length; i++) {
      acc += BigInt(pool[i].entries);
      if (r < acc) {
        winners.push(pool[i].address);
        pool.splice(i, 1);
        break;
      }
    }
  }
  return winners;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Minutes to ADD to UTC to get DROP_TZ local time at instant `date` (DST-aware). */
function tzOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DROP_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** A DROP_TZ wall-clock (y, 0-based m, d, h) → the correct UTC instant (DST-aware). */
function zonedWallClockToUTC(y: number, m: number, d: number, h: number): Date {
  // Treat the wall time as UTC, then subtract the zone offset. Re-evaluate once
  // in case the first guess landed on the wrong side of a DST transition.
  const guessUTC = Date.UTC(y, m, d, h, 0, 0);
  const off1 = tzOffsetMinutes(new Date(guessUTC));
  let ts = guessUTC - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(ts));
  if (off2 !== off1) ts = guessUTC - off2 * 60000;
  return new Date(ts);
}

/** The DROP_TZ calendar date + weekday for the instant `date`. */
function zonedDateParts(date: Date): { y: number; m: number; d: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DROP_TZ, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return { y: +p.year, m: +p.month - 1, d: +p.day, wd: WEEKDAY_INDEX[p.weekday] };
}

/**
 * Next Sunday 8:00 PM Eastern (DROP_TZ), as a UTC instant, strictly AFTER `from`.
 * If `from` is a Sunday before 8 PM Eastern, that same day's 8 PM qualifies.
 * DST-aware: the returned instant is 00:00 UTC in summer, 01:00 UTC in winter.
 */
export function nextSundayCloseUTC(from: Date): Date {
  const { y, m, d, wd } = zonedDateParts(from);
  const daysUntilSunday = (7 - wd) % 7;
  let close = zonedWallClockToUTC(y, m, d + daysUntilSunday, DROP_CLOSE_LOCAL_HOUR);
  if (close.getTime() <= from.getTime()) {
    close = zonedWallClockToUTC(y, m, d + daysUntilSunday + 7, DROP_CLOSE_LOCAL_HOUR);
  }
  return close;
}

/** Split a prize pot 60/25/15 (bps) across up to 3 ranks; rank 1 absorbs the floor remainder. */
export function splitPrizes(prizePot: bigint): bigint[] {
  const shares = DROP_PRIZE_SPLIT_BPS.map((bps) => (prizePot * bps) / 10000n);
  const distributed = shares.reduce((s, x) => s + x, 0n);
  shares[0] += prizePot - distributed; // integer-division dust → rank 1
  return shares;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/** Matches the exact response contract the home-page module consumes. */
export interface CurrentDrop {
  draw: {
    id: string;
    closesAt: string;        // ISO
    potChips: string;        // whole chips, floor max(pot, guaranteed_min) applied
    guaranteedMin: string;   // whole chips
    accruedChips: string;    // whole chips actually fed by bets so far (pre-floor)
    status: string;
  };
  you: {
    entries: number;
    progressWagered: string; // effective chips toward next entry (0..progressTarget-1)
    progressTarget: string;  // "1000" — public 1-entry-per-1000 scale
  } | null;
  /** Players holding ≥ 1 entry in the open draw (drives "N players entered"). */
  totalEntrants: number;
  lastWinners: Array<{
    rank: number;
    address: string;
    displayName: string | null;
    amountChips: string;
  }>;
  /** Commitment of the most recently completed draw (verifiable via /api/drop/verify). */
  commitment: string | null;
}

/** Coded error so routes can map to proper HTTP statuses. */
export class WeeklyDropError extends Error {
  constructor(public readonly code: 'NO_WAGER_HISTORY' | 'ALREADY_CLAIMED' | 'NO_OPEN_DRAW') {
    super(code);
    this.name = 'WeeklyDropError';
  }
}

const POLL_INTERVAL_MS = 60_000;

function normalizeAddr(addr: string): string {
  const a = String(addr ?? '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(a)) throw new Error('Invalid wallet address');
  return a;
}

export class WeeklyDropService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickRunning = false;

  constructor(private readonly pool: Pool) {}

  // ──────────────────────────────────────────────────────────────────
  // Scheduler
  // ──────────────────────────────────────────────────────────────────

  /** Boot: make sure an open draw exists, then poll every minute for a due close. */
  start(): void {
    if (this.intervalId) return;
    this.ensureOpenDraw().catch((err) =>
      logger.error('[WeeklyDrop] ensureOpenDraw on boot failed', err),
    );
    this.intervalId = setInterval(() => {
      this.tick().catch((err) =>
        logger.error('[WeeklyDrop] tick crashed (will retry next minute)', err),
      );
    }, POLL_INTERVAL_MS);
    logger.info('[WeeklyDrop] scheduler started (poll every 60s, close Sunday 8 PM America/New_York)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      await this.ensureOpenDraw(); // self-heal if somehow none exists
      const due = await this.pool.query(
        `SELECT 1 FROM drop_draws WHERE status = 'open' AND closes_at <= NOW() LIMIT 1`,
      );
      if (due.rows.length > 0) await this.runDraw();
    } finally {
      this.tickRunning = false;
    }
  }

  /**
   * Insert an open draw if none exists (boot / self-heal). Race-safe enough:
   * worst case two servers insert one each; accrual targets the earliest-
   * closing open draw, and runDraw drains them one per tick.
   */
  async ensureOpenDraw(): Promise<void> {
    const open = await this.pool.query(`SELECT 1 FROM drop_draws WHERE status = 'open' LIMIT 1`);
    if (open.rows.length > 0) return;
    const closesAt = nextSundayCloseUTC(new Date());
    await this.pool.query(
      `INSERT INTO drop_draws (opens_at, closes_at, pot_chips, guaranteed_min)
       VALUES (NOW(), $1, 0, $2)`,
      [closesAt.toISOString(), DROP_GUARANTEED_MIN_CHIPS.toString()],
    );
    logger.info(`[WeeklyDrop] opened new draw, closes ${closesAt.toISOString()}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Wager accrual (called from the applyPokerChipDelta settlement hook)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Accrue 0.25% of a settled wager into the open draw's pot and entry
   * progress at the game's rate. `gameKey` is the ledger reason minus its
   * `_bet` suffix (e.g. 'arcade_dice', 'keno', 'blackjack').
   *
   * Runs INSIDE the game's settlement transaction (`client` is mid-BEGIN) so
   * pot/entries commit atomically with the bet — but it must NEVER break
   * settlement. All work happens under a SAVEPOINT: any failure rolls back to
   * the savepoint, is logged, and is swallowed (WEEKLY_DROP_SPEC.md
   * "Settlement hook"). Single-statement upsert, so it stays batch-friendly.
   *
   * Progress is stored in "effective chips" on the public 1,000-chips-per-
   * entry scale: effective = wager * 1000 / DROP_ENTRY_RATES[gameKey]. That
   * lets one progress bar (x / 1000) blend games with different weights.
   */
  async accrueFromWager(
    client: PoolClient,
    address: string,
    wagerChips: bigint,
    gameKey: string,
  ): Promise<void> {
    if (wagerChips <= 0n) return;
    let addr: string;
    try {
      addr = normalizeAddr(address);
    } catch {
      return; // non-wallet ledger rows (shouldn't happen for *_bet) — skip
    }
    const chipsPerEntry = DROP_ENTRY_RATES[gameKey] ?? DEFAULT_CHIPS_PER_ENTRY;
    const effectiveChips = (wagerChips * CHIPS_PER_ENTRY) / chipsPerEntry;
    const potDelta = (wagerChips * DROP_POT_BPS) / 10000n;
    if (effectiveChips <= 0n && potDelta <= 0n) return;

    await client.query('SAVEPOINT weekly_drop_accrual');
    try {
      // One upsert per (open draw, player): tickets roll up from carried
      // progress; the 0.25% pot funding accrues per player (summed at close)
      // to avoid a platform-wide hot row on drop_draws.
      await client.query(
        `INSERT INTO drop_entries AS de
           (draw_id, player_address, entries, wager_progress, pot_contributed)
         SELECT d.id, $1,
                FLOOR($2::NUMERIC / $4::NUMERIC)::INT,
                MOD($2::NUMERIC, $4::NUMERIC),
                $3::NUMERIC
         FROM (SELECT id FROM drop_draws WHERE status = 'open'
               ORDER BY closes_at ASC LIMIT 1) d
         ON CONFLICT (draw_id, player_address) DO UPDATE SET
           entries         = de.entries + FLOOR((de.wager_progress + $2::NUMERIC) / $4::NUMERIC)::INT,
           wager_progress  = MOD(de.wager_progress + $2::NUMERIC, $4::NUMERIC),
           pot_contributed = de.pot_contributed + $3::NUMERIC,
           updated_at      = NOW()`,
        [addr, effectiveChips.toString(), potDelta.toString(), CHIPS_PER_ENTRY.toString()],
      );
      await client.query('RELEASE SAVEPOINT weekly_drop_accrual');
    } catch (err) {
      // Roll back ONLY the accrual; the bet settlement proceeds untouched.
      await client.query('ROLLBACK TO SAVEPOINT weekly_drop_accrual');
      logger.error('[WeeklyDrop] wager accrual failed (settlement unaffected)', {
        address: addr,
        gameKey,
        wagerChips: wagerChips.toString(),
        error: (err as Error).message,
      });
    }
  }

  /**
   * Undo a prior accrual when a wager/buy-in is REFUNDED (e.g. tournament
   * unregister, blackjack bet returned). Subtracts the refunded wager's
   * effective chips from (entries × 1,000 + progress) and its 0.25% from the
   * player's pot contribution, both clamped at 0 — so refund loops can't farm
   * tickets, and a refund can never drive a row negative. Only touches the
   * OPEN draw: if the draw already rolled over the reversal is a no-op there
   * (clamped), an accepted edge. Same fail-safe contract as accrueFromWager:
   * SAVEPOINT + swallow — never breaks the caller's settlement.
   */
  async reverseWagerAccrual(
    client: PoolClient,
    address: string,
    wagerChips: bigint,
    gameKey: string,
  ): Promise<void> {
    if (wagerChips <= 0n) return;
    let addr: string;
    try {
      addr = normalizeAddr(address);
    } catch {
      return;
    }
    const chipsPerEntry = DROP_ENTRY_RATES[gameKey] ?? DEFAULT_CHIPS_PER_ENTRY;
    const effectiveChips = (wagerChips * CHIPS_PER_ENTRY) / chipsPerEntry;
    const potDelta = (wagerChips * DROP_POT_BPS) / 10000n;
    if (effectiveChips <= 0n && potDelta <= 0n) return;

    await client.query('SAVEPOINT weekly_drop_reversal');
    try {
      // NOTE: every SET expression reads the row's OLD values (SQL semantics),
      // so entries/progress recompute from one shared "total effective" figure.
      await client.query(
        `UPDATE drop_entries de SET
           entries         = FLOOR(GREATEST(de.entries * $4::NUMERIC + de.wager_progress - $2::NUMERIC, 0) / $4::NUMERIC)::INT,
           wager_progress  = MOD(GREATEST(de.entries * $4::NUMERIC + de.wager_progress - $2::NUMERIC, 0), $4::NUMERIC),
           pot_contributed = GREATEST(de.pot_contributed - $3::NUMERIC, 0),
           updated_at      = NOW()
         WHERE de.draw_id = (SELECT id FROM drop_draws WHERE status = 'open'
                             ORDER BY closes_at ASC LIMIT 1)
           AND de.player_address = $1`,
        [addr, effectiveChips.toString(), potDelta.toString(), CHIPS_PER_ENTRY.toString()],
      );
      await client.query('RELEASE SAVEPOINT weekly_drop_reversal');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT weekly_drop_reversal');
      logger.error('[WeeklyDrop] refund reversal failed (settlement unaffected)', {
        address: addr,
        gameKey,
        wagerChips: wagerChips.toString(),
        error: (err as Error).message,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Free daily entry
  // ──────────────────────────────────────────────────────────────────

  /**
   * +1 free entry for a SIWE-authenticated sign-in. Gates:
   *   - ≥ 1 lifetime settled wager (any negative `*_bet` ledger row — the same
   *     lifetime-wager source VipService derives tiers from). Blocks
   *     multi-account farming.
   *   - once per UTC day per address (drop_daily_claims PK).
   */
  async claimDailyEntry(address: string): Promise<{ entries: number }> {
    const addr = normalizeAddr(address);

    const hasWager = await this.pool.query(
      `SELECT 1 FROM poker_chip_ledger
       WHERE wallet_address = $1 AND reason LIKE '%\\_bet' AND delta < 0
       LIMIT 1`,
      [addr],
    );
    if (hasWager.rows.length === 0) throw new WeeklyDropError('NO_WAGER_HISTORY');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const draw = await client.query<{ id: string }>(
        `SELECT id FROM drop_draws WHERE status = 'open' ORDER BY closes_at ASC LIMIT 1`,
      );
      if (draw.rows.length === 0) throw new WeeklyDropError('NO_OPEN_DRAW');
      const drawId = draw.rows[0].id;

      const claim = await client.query(
        `INSERT INTO drop_daily_claims (player_address, claim_date, draw_id)
         VALUES ($1, (NOW() AT TIME ZONE 'utc')::DATE, $2)
         ON CONFLICT (player_address, claim_date) DO NOTHING
         RETURNING claim_date`,
        [addr, drawId],
      );
      if (claim.rows.length === 0) throw new WeeklyDropError('ALREADY_CLAIMED');

      const upsert = await client.query<{ entries: number }>(
        `INSERT INTO drop_entries AS de (draw_id, player_address, entries)
         VALUES ($1, $2, 1)
         ON CONFLICT (draw_id, player_address) DO UPDATE SET
           entries = de.entries + 1,
           updated_at = NOW()
         RETURNING entries`,
        [drawId, addr],
      );
      await client.query('COMMIT');
      return { entries: upsert.rows[0]?.entries ?? 1 };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────

  /** Home-module payload. `address` (optional) fills the personal `you` block. */
  async getCurrentDrop(address?: string): Promise<CurrentDrop | null> {
    const draw = await this.pool.query<{
      id: string;
      closes_at: string;
      pot: string;
      guaranteed_min: string;
      status: string;
      total_entrants: number;
    }>(
      `SELECT d.id, d.closes_at, d.guaranteed_min::TEXT AS guaranteed_min, d.status,
              (d.pot_chips + COALESCE(
                 (SELECT SUM(e.pot_contributed) FROM drop_entries e WHERE e.draw_id = d.id), 0
               ))::TEXT AS pot,
              (SELECT COUNT(*) FROM drop_entries e2
                WHERE e2.draw_id = d.id AND e2.entries > 0)::INT AS total_entrants
       FROM drop_draws d
       WHERE d.status = 'open'
       ORDER BY d.closes_at ASC
       LIMIT 1`,
    );
    if (draw.rows.length === 0) return null;
    const d = draw.rows[0];

    const potAccrued = BigInt(d.pot ?? '0');
    const guaranteed = BigInt(d.guaranteed_min ?? '0');
    const potShown = potAccrued > guaranteed ? potAccrued : guaranteed; // floor applied

    let you: CurrentDrop['you'] = null;
    if (address) {
      try {
        const addr = normalizeAddr(address);
        const mine = await this.pool.query<{ entries: number; wager_progress: string }>(
          `SELECT entries, FLOOR(wager_progress)::TEXT AS wager_progress
           FROM drop_entries WHERE draw_id = $1 AND player_address = $2`,
          [d.id, addr],
        );
        you = {
          entries: mine.rows[0]?.entries ?? 0,
          progressWagered: mine.rows[0]?.wager_progress ?? '0',
          progressTarget: CHIPS_PER_ENTRY.toString(),
        };
      } catch {
        you = null; // bad address in query string — just omit the personal block
      }
    }

    // Most recently completed draw: winners (+ display names, recent-wins
    // style) and its commitment so the module can link "verifiable".
    const last = await this.pool.query<{
      draw_id: string;
      commitment: string | null;
      rank: number;
      player_address: string;
      display_name: string | null;
      amount: string;
    }>(
      `WITH last_draw AS (
         SELECT id, commitment FROM drop_draws
         WHERE status = 'paid'
         ORDER BY closes_at DESC
         LIMIT 1
       )
       SELECT ld.id AS draw_id, ld.commitment, w.rank, w.player_address,
              cdn.display_name, w.amount::TEXT AS amount
       FROM last_draw ld
       JOIN drop_winners w ON w.draw_id = ld.id
       LEFT JOIN chat_display_names cdn
         ON LOWER(cdn.wallet_address) = LOWER(w.player_address)
       ORDER BY w.rank ASC`,
    );

    return {
      draw: {
        id: d.id,
        closesAt: new Date(d.closes_at).toISOString(),
        potChips: potShown.toString(),
        guaranteedMin: guaranteed.toString(),
        accruedChips: potAccrued.toString(),
        status: d.status,
      },
      you,
      totalEntrants: Number(d.total_entrants ?? 0),
      lastWinners: last.rows.map((r) => ({
        rank: r.rank,
        address: r.player_address,
        displayName: r.display_name,
        amountChips: r.amount,
      })),
      commitment: last.rows[0]?.commitment ?? null,
    };
  }

  /**
   * Entrant list for GET /api/drop/entrants. Defaults to the OPEN draw when no
   * drawId is given. Display names join chat_display_names (recent-wins style).
   * Sorted entries DESC, then address ASC; capped at 500 rows (totals cover
   * ALL entrants, not just the returned page). Null when no draw exists.
   */
  async getEntrants(drawId?: string): Promise<{
    drawId: string;
    totalEntrants: number;
    totalEntries: number;
    entrants: Array<{ address: string; displayName: string | null; entries: number }>;
  } | null> {
    let id = drawId;
    if (id != null && !/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    if (!id) {
      const open = await this.pool.query<{ id: string }>(
        `SELECT id FROM drop_draws WHERE status = 'open' ORDER BY closes_at ASC LIMIT 1`,
      );
      if (open.rows.length === 0) return null;
      id = open.rows[0].id;
    }
    const rows = await this.pool.query<{
      player_address: string;
      display_name: string | null;
      entries: number;
    }>(
      `SELECT e.player_address, e.entries, cdn.display_name
       FROM drop_entries e
       LEFT JOIN chat_display_names cdn
         ON LOWER(cdn.wallet_address) = LOWER(e.player_address)
       WHERE e.draw_id = $1 AND e.entries > 0
       ORDER BY e.entries DESC, e.player_address ASC
       LIMIT 500`,
      [id],
    );
    const totals = await this.pool.query<{ n: string; s: string }>(
      `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(entries), 0)::TEXT AS s
       FROM drop_entries WHERE draw_id = $1 AND entries > 0`,
      [id],
    );
    return {
      drawId: id,
      totalEntrants: Number(totals.rows[0]?.n ?? '0'),
      totalEntries: Number(totals.rows[0]?.s ?? '0'),
      entrants: rows.rows.map((r) => ({
        address: r.player_address,
        displayName: r.display_name,
        entries: r.entries,
      })),
    };
  }

  /** Fairness data for GET /api/drop/verify/:drawId. Null if unknown draw. */
  async getVerifyData(drawId: string): Promise<Record<string, unknown> | null> {
    if (!/^[0-9a-f-]{36}$/i.test(String(drawId ?? ''))) return null;
    const draw = await this.pool.query<{
      id: string;
      opens_at: string;
      closes_at: string;
      pot_chips: string;
      guaranteed_min: string;
      commitment: string | null;
      server_seed: string | null;
      entry_list_hash: string | null;
      entry_list_json: unknown;
      status: string;
    }>(
      `SELECT id, opens_at, closes_at, pot_chips::TEXT AS pot_chips,
              guaranteed_min::TEXT AS guaranteed_min, commitment, server_seed,
              entry_list_hash, entry_list_json, status
       FROM drop_draws WHERE id = $1`,
      [drawId],
    );
    if (draw.rows.length === 0) return null;
    const d = draw.rows[0];

    const winners = await this.pool.query<{
      rank: number; player_address: string; amount: string; credited_at: string | null;
    }>(
      `SELECT rank, player_address, amount::TEXT AS amount, credited_at
       FROM drop_winners WHERE draw_id = $1 ORDER BY rank ASC`,
      [drawId],
    );

    return {
      drawId: d.id,
      status: d.status,
      opensAt: new Date(d.opens_at).toISOString(),
      closesAt: new Date(d.closes_at).toISOString(),
      potChips: d.pot_chips,
      guaranteedMin: d.guaranteed_min,
      commitment: d.commitment,           // published before selection
      serverSeed: d.server_seed,          // null until revealed at payout
      entryListHash: d.entry_list_hash,   // sha256(canonical entry list JSON)
      entries: d.entry_list_json ?? null, // the frozen snapshot itself
      winners: winners.rows.map((w) => ({
        rank: w.rank,
        address: w.player_address,
        amountChips: w.amount,
        creditedAt: w.credited_at ? new Date(w.credited_at).toISOString() : null,
      })),
      recipe:
        'commitment = sha256(serverSeed || sha256(entryListJSON)) where entryListJSON is ' +
        'the entries array (entries > 0, sorted by address ascending) serialized as ' +
        'JSON.stringify([{"address":…,"entries":…},…]). Winners: for k = 0..2, ' +
        'roll = HMAC-SHA256(key=serverSeed, msg="weekly-drop:winner:"+k); ' +
        'r = BigInt(roll) mod sum(remaining entries); walk the remaining list in ' +
        'canonical order accumulating entry counts — first player whose cumulative ' +
        'count exceeds r wins rank k+1 and is removed (one rank max per player). ' +
        'Prizes: 60/25/15% of max(potChips, guaranteedMin), rank 1 takes rounding dust. ' +
        'Amounts are whole chips (1 chip = 1 MORBIUS).',
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // The draw
  // ──────────────────────────────────────────────────────────────────

  /**
   * Close-commit-draw-credit-reveal-reopen. Double-run safe: the initial
   * status transition (WHERE status='open' AND closes_at<=NOW()) claims the
   * draw atomically; a second runner matches zero rows and exits.
   */
  async runDraw(): Promise<void> {
    // 1) Claim the due draw (open → drawn) and freeze the accrued pot.
    const claimed = await this.pool.query<{
      id: string; pot_chips: string; guaranteed_min: string;
    }>(
      `UPDATE drop_draws d SET
         status = 'drawn',
         pot_chips = d.pot_chips + COALESCE(
           (SELECT SUM(e.pot_contributed) FROM drop_entries e WHERE e.draw_id = d.id), 0),
         updated_at = NOW()
       WHERE d.id = (SELECT id FROM drop_draws
                     WHERE status = 'open' AND closes_at <= NOW()
                     ORDER BY closes_at ASC LIMIT 1)
         AND d.status = 'open'
       RETURNING d.id, d.pot_chips::TEXT AS pot_chips, d.guaranteed_min::TEXT AS guaranteed_min`,
    );
    if (claimed.rows.length === 0) return; // nothing due, or another runner won the race
    const drawId = claimed.rows[0].id;
    const accruedPot = BigInt(claimed.rows[0].pot_chips ?? '0');
    const guaranteed = BigInt(claimed.rows[0].guaranteed_min ?? '0');

    try {
      // 2) Freeze the entry list (rows stop changing once status != 'open').
      const entryRows = await this.pool.query<{ player_address: string; entries: number }>(
        `SELECT player_address, entries FROM drop_entries
         WHERE draw_id = $1 AND entries > 0
         ORDER BY player_address ASC`,
        [drawId],
      );
      const snapshot: DropEntrySnapshot[] = entryRows.rows.map((r) => ({
        address: r.player_address,
        entries: r.entries,
      }));

      // 3) Commit BEFORE selection: publish commitment + entry snapshot/hash.
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const canonical = canonicalEntryListJSON(snapshot);
      const listHash = sha256Hex(canonical);
      const commitment = computeCommitment(serverSeed, listHash);
      await this.pool.query(
        `UPDATE drop_draws
         SET commitment = $2, entry_list_hash = $3, entry_list_json = $4::JSONB,
             updated_at = NOW()
         WHERE id = $1`,
        [drawId, commitment, listHash, canonical],
      );

      // 4) Deterministic winner selection + prize math (whole chips, bigint).
      const winnerAddrs = selectWinners(serverSeed, snapshot, 3);
      const prizePot = accruedPot > guaranteed ? accruedPot : guaranteed;
      const shares = splitPrizes(prizePot);
      let paidTotal = 0n;

      // 5) Credit winners + reveal seed + open next draw, atomically.
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < winnerAddrs.length; i++) {
          const amount = shares[i];
          paidTotal += amount;
          // Existing chip credit path — same as VIP rakeback / holder rewards.
          // Ledger note: reason 'weekly_drop_prize', ref weekly_drop:<drawId>.
          await applyPokerChipDelta(client, winnerAddrs[i], amount, 'weekly_drop_prize', {
            type: 'weekly_drop',
            id: drawId,
          });
          await client.query(
            `INSERT INTO drop_winners (draw_id, rank, player_address, amount, credited_at)
             VALUES ($1, $2, $3, $4::NUMERIC, NOW())`,
            [drawId, i + 1, winnerAddrs[i], amount.toString()],
          );
        }
        await client.query(
          `UPDATE drop_draws SET status = 'paid', server_seed = $2, updated_at = NOW()
           WHERE id = $1`,
          [drawId, serverSeed],
        );

        // Player-funded pot never vanishes: if fewer than 3 winners existed
        // (thin week), whatever accrued but wasn't paid seeds the next pot.
        const carryover = accruedPot > paidTotal ? accruedPot - paidTotal : 0n;
        const nextClose = nextSundayCloseUTC(new Date());
        await client.query(
          `INSERT INTO drop_draws (opens_at, closes_at, pot_chips, guaranteed_min)
           VALUES (NOW(), $1, $2::NUMERIC, $3::NUMERIC)`,
          [
            nextClose.toISOString(),
            (winnerAddrs.length >= DROP_PRIZE_SPLIT_BPS.length ? 0n : carryover).toString(),
            DROP_GUARANTEED_MIN_CHIPS.toString(),
          ],
        );
        await client.query('COMMIT');
        logger.info('[WeeklyDrop] draw complete', {
          drawId,
          pot: prizePot.toString(),
          winners: winnerAddrs,
          commitment,
        });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      // Draw is stuck at 'drawn' — visible in DB for manual retry; next ticks
      // won't double-pay because the open→drawn transition already happened.
      logger.error('[WeeklyDrop] runDraw failed after claiming draw', { drawId, err });
      // Self-heal the platform: make sure players can keep earning entries.
      await this.ensureOpenDraw().catch(() => undefined);
    }
  }
}
