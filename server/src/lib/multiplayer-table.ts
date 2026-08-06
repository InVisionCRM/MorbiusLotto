/**
 * multiplayer-table.ts — the parts of a shared table that are genuinely the
 * same between games.
 *
 * WHAT THIS IS NOT
 *
 * It is not a base class every multiplayer game inherits. That was tempting
 * and would have been wrong: the seat and round SQL is different per game for
 * real reasons, not incidental ones. Blackjack takes turns; craps has no acting
 * player at all; Ultimate Hold'em has a shared board with per-seat decisions.
 * Forcing one lifecycle over those three would mean a config object with a flag
 * per difference, which is worse than three honest implementations.
 *
 * So this holds only the pieces that were provably identical once a SECOND
 * shared table existed — the per-table lock, the state version counter, the
 * broadcast plumbing, and the seed-epoch commit/reveal dance. Everything here
 * was copied verbatim between craps and blackjack multi before it moved.
 *
 * Table and column names are passed in rather than assumed, so a game keeps
 * owning its own schema.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Per-table serialisation
// ---------------------------------------------------------------------------

/**
 * One in-flight operation per key at a time.
 *
 * Every shared-table action mutates a row other players are reading, so each
 * game funnels its writes through this. Copied identically in
 * blackjack-multi-game.service.ts and craps-multi-game.service.ts before it
 * lived here.
 */
export class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    const prevLock = this.locks.get(key) ?? Promise.resolve();
    let releaseFn!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFn = resolve; });
    this.locks.set(key, prevLock.then(() => gate));
    await prevLock;
    return releaseFn;
  }

  delete(key: string): void {
    this.locks.delete(key);
  }
}

// ---------------------------------------------------------------------------
// State versions + broadcast
// ---------------------------------------------------------------------------

/**
 * A monotonic counter per table, so a client can tell a stale broadcast from a
 * fresh one, plus the callback the socket layer registers to push state.
 *
 * Kept together because every game does exactly this pair and nothing else with
 * either.
 */
export class TableBroadcaster {
  private readonly versions = new Map<string, number>();
  private callback: ((tableId: string) => Promise<void>) | null = null;

  constructor(
    /** Prefix for log lines, e.g. 'CrapsMulti'. */
    private readonly label: string,
    private readonly logError: (msg: string, meta: Record<string, unknown>) => void,
  ) {}

  setCallback(cb: (tableId: string) => Promise<void>): void {
    this.callback = cb;
  }

  version(tableId: string): number {
    return this.versions.get(tableId) ?? 0;
  }

  bump(tableId: string): number {
    const v = this.version(tableId) + 1;
    this.versions.set(tableId, v);
    return v;
  }

  forget(tableId: string): void {
    this.versions.delete(tableId);
  }

  /** Never throws into game logic — a failed push must not fail a settled bet. */
  async push(tableId: string, reason: string): Promise<void> {
    if (!this.callback) return;
    await this.callback(tableId).catch((error) =>
      this.logError(`${this.label}: broadcast error`, { tableId, reason, error }),
    );
  }
}

// ---------------------------------------------------------------------------
// Provably-fair seed epochs
// ---------------------------------------------------------------------------

export interface SeedEpochTables {
  /** Table holding server_seed_hash / seed_epoch / nonce_counter. */
  tables: string;
  /** Table holding the live plaintext seed, keyed by table_id. */
  pending: string;
  /** Table archiving retired epochs so old rounds stay verifiable. */
  revealed: string;
}

export interface NewServerSeed {
  seed: string;
  hash: string;
}

/** A fresh server seed and its published commitment. */
export function newServerSeed(): NewServerSeed {
  const seed = crypto.randomBytes(32).toString('hex');
  const hash = '0x' + crypto.createHash('sha256').update(seed).digest('hex');
  return { seed, hash };
}

/**
 * The plaintext seed for the live epoch.
 *
 * Throws NO_LIVE_SEED rather than returning null: a game that has lost its seed
 * must not quietly deal from something else.
 */
export async function loadPendingSeed(
  client: PoolClient,
  schema: SeedEpochTables,
  tableId: string,
): Promise<string> {
  const r = await client.query<{ server_seed: string }>(
    `SELECT server_seed FROM ${schema.pending} WHERE table_id = $1`,
    [tableId],
  );
  if (r.rows.length === 0) throw new Error('NO_LIVE_SEED');
  return r.rows[0].server_seed;
}

/** Store the freshly minted plaintext seed for a table. */
export async function storePendingSeed(
  client: PoolClient,
  schema: SeedEpochTables,
  tableId: string,
  seed: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ${schema.pending} (table_id, server_seed) VALUES ($1, $2)
     ON CONFLICT (table_id) DO UPDATE SET server_seed = EXCLUDED.server_seed`,
    [tableId, seed],
  );
}

/**
 * Retire the live epoch and issue a new one.
 *
 * The retired seed is archived rather than deleted, which is the whole point: a
 * table that never stops still has to leave every past round provable. Callers
 * decide WHEN this is legal (craps refuses while a point is on) — that rule is
 * game-specific and deliberately not here.
 */
export async function rotateSeedEpoch(
  client: PoolClient,
  schema: SeedEpochTables,
  tableId: string,
): Promise<NewServerSeed> {
  const t = await client.query<{ seed_epoch: number; server_seed_hash: string }>(
    `SELECT seed_epoch, server_seed_hash FROM ${schema.tables} WHERE id = $1 FOR UPDATE`,
    [tableId],
  );
  if (t.rows.length === 0) throw new Error('NOT_FOUND');

  const epoch = Number(t.rows[0].seed_epoch);
  const plaintext = await loadPendingSeed(client, schema, tableId);

  await client.query(
    `INSERT INTO ${schema.revealed} (table_id, seed_epoch, server_seed, server_seed_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (table_id, seed_epoch) DO NOTHING`,
    [tableId, epoch, plaintext, t.rows[0].server_seed_hash],
  );

  const next = newServerSeed();
  await client.query(
    `UPDATE ${schema.tables}
        SET server_seed_hash = $1, seed_epoch = $2, nonce_counter = 0
      WHERE id = $3`,
    [next.hash, epoch + 1, tableId],
  );
  await storePendingSeed(client, schema, tableId, next.seed);
  return next;
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

/**
 * Next occupied seat clockwise from `from`, wrapping, or null when nobody is
 * left. Used for passing the dice in craps and the button in Hold'em.
 *
 * `from` itself is returned when it is the only seat — a lone player keeps
 * whatever they were holding rather than the table stranding it.
 */
export function nextOccupiedSeat(occupied: number[], from: number): number | null {
  if (occupied.length === 0) return null;
  const sorted = [...occupied].sort((a, b) => a - b);
  return sorted.find((p) => p > from) ?? sorted[0];
}
