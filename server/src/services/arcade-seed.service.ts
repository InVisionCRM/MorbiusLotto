/**
 * arcade-seed.service.ts — persistent provably-fair seed pairs for the instant
 * (one-shot) arcade games (Dice, Limbo, Roulette, …).
 *
 * WHY: a one-shot game has no player decision between commit and reveal, so a
 * per-round "generate seed → settle → reveal" flow proves self-consistency but
 * NOT that the seed predated the bet. The fix is Stake's model, identical in
 * spirit to arcade_craps_sessions: each wallet holds ONE active server seed
 * whose SHA-256 commitment is published up front; every bet consumes it at a
 * sequential nonce; the plaintext is revealed only when the player rotates.
 *
 * Lifecycle (mirrors arcade_craps_session_pending_seeds):
 *   ensureActivePair → commit hash, plaintext hidden in arcade_seed_pair_pending
 *   consumeSeedForBet → lock active pair, read plaintext, hand out (seed, hash,
 *                       clientSeed, nonce), bump nonce_counter by exactly 1
 *   rotateActiveSeed  → move plaintext onto arcade_seed_pairs.server_seed,
 *                       mark 'revealed', commit a fresh active pair
 *
 * The transactional helpers (ensureActivePair / consumeSeedForBet) take an open
 * PoolClient so a bet debit + roll + nonce bump commit or roll back together.
 * The wallet-scoped helpers open their own transaction via DatabaseService.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { ProvablyFairService } from './provably-fair.service';
import type { DatabaseService } from './database.service';

const pf = new ProvablyFairService();

/** A tiny structural type so these helpers work with a Pool or a PoolClient. */
interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ConsumedSeed {
  seedPairId: string;
  /** Plaintext server seed — server-side only, NEVER returned to the client. */
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface PublicSeedState {
  seedPairId: string;
  serverSeedHash: string;
  clientSeed: string;
  /** Next bet's nonce under this commitment. */
  nonce: number;
  /** Most recently rotated (revealed) pair, if any — lets the UI verify it. */
  previous: {
    serverSeedHash: string;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  } | null;
}

/** Normalize + bound a user-supplied client seed. Empty → null (use default). */
function cleanClientSeed(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, 128);
  return s.length > 0 ? s : null;
}

/**
 * Guarantee the wallet has an active seed pair, committing one lazily if not.
 * Safe under concurrency: the INSERT races against the partial unique index and
 * the loser simply no-ops (the pair already exists). Idempotent.
 */
export async function ensureActivePair(client: Queryable, wallet: string): Promise<void> {
  const w = wallet.toLowerCase();
  const serverSeed = pf.generateServerSeed();
  const serverSeedHash = pf.createServerSeedHash(serverSeed);
  const clientSeed = crypto.randomBytes(16).toString('hex');
  const id = crypto.randomUUID();

  const ins = await client.query(
    `INSERT INTO arcade_seed_pairs (id, wallet_address, server_seed_hash, client_seed, status)
       VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (wallet_address) WHERE status = 'active' DO NOTHING
     RETURNING id`,
    [id, w, serverSeedHash, clientSeed],
  );
  // Only seed the pending plaintext when THIS insert created the pair.
  if (ins.rows.length > 0) {
    await client.query(
      'INSERT INTO arcade_seed_pair_pending (seed_pair_id, server_seed) VALUES ($1, $2)',
      [id, serverSeed],
    );
  }
}

/**
 * Consume the wallet's active seed pair for one bet. MUST run inside the same
 * transaction (PoolClient) that debits the bet, so the nonce advances iff the
 * bet is actually recorded. Locks the pair FOR UPDATE, reads the hidden
 * plaintext, and bumps the nonce by exactly 1 (gap-free, non-grindable).
 */
export async function consumeSeedForBet(client: PoolClient, wallet: string): Promise<ConsumedSeed> {
  const w = wallet.toLowerCase();
  await ensureActivePair(client, w);

  const r = await client.query(
    `SELECT id, server_seed_hash, client_seed, nonce_counter
       FROM arcade_seed_pairs
      WHERE wallet_address = $1 AND status = 'active'
      FOR UPDATE`,
    [w],
  );
  if (r.rows.length === 0) throw new Error('No active seed pair after ensure — unexpected.');
  const row = r.rows[0];
  const seedPairId = String(row.id);

  const p = await client.query(
    'SELECT server_seed FROM arcade_seed_pair_pending WHERE seed_pair_id = $1',
    [seedPairId],
  );
  if (p.rows.length === 0) throw new Error('Active seed pair has no live plaintext seed.');

  const nonce = Number(row.nonce_counter);
  await client.query(
    'UPDATE arcade_seed_pairs SET nonce_counter = $1 WHERE id = $2',
    [nonce + 1, seedPairId],
  );

  return {
    seedPairId,
    serverSeed: String(p.rows[0].server_seed),
    serverSeedHash: String(row.server_seed_hash),
    clientSeed: String(row.client_seed),
    nonce,
  };
}

/** Read the active commitment (+ last revealed pair), committing lazily. */
export async function getPublicSeedState(
  dbService: DatabaseService,
  wallet: string,
): Promise<PublicSeedState> {
  const w = wallet.toLowerCase();
  return dbService.withTransaction(async (client) => {
    await ensureActivePair(client, w);
    const active = await client.query(
      `SELECT id, server_seed_hash, client_seed, nonce_counter
         FROM arcade_seed_pairs WHERE wallet_address = $1 AND status = 'active'`,
      [w],
    );
    const a = active.rows[0];
    return {
      seedPairId: String(a.id),
      serverSeedHash: String(a.server_seed_hash),
      clientSeed: String(a.client_seed),
      nonce: Number(a.nonce_counter),
      previous: await lastRevealed(client, w),
    };
  });
}

/** Reveal the active pair and commit a fresh one. Optionally set a new client seed. */
export async function rotateActiveSeed(
  dbService: DatabaseService,
  wallet: string,
  newClientSeed?: unknown,
): Promise<PublicSeedState> {
  const w = wallet.toLowerCase();
  const requested = cleanClientSeed(newClientSeed);
  return dbService.withTransaction(async (client) => {
    await ensureActivePair(client, w);
    const cur = await client.query(
      `SELECT id, server_seed_hash, client_seed, nonce_counter
         FROM arcade_seed_pairs WHERE wallet_address = $1 AND status = 'active'
         FOR UPDATE`,
      [w],
    );
    const old = cur.rows[0];
    const oldId = String(old.id);

    const p = await client.query(
      'SELECT server_seed FROM arcade_seed_pair_pending WHERE seed_pair_id = $1',
      [oldId],
    );
    const oldPlaintext = p.rows.length > 0 ? String(p.rows[0].server_seed) : null;

    // Reveal the outgoing pair — plaintext moves onto the row, pending is dropped.
    await client.query(
      `UPDATE arcade_seed_pairs
          SET status = 'revealed', server_seed = $1, revealed_at = NOW()
        WHERE id = $2`,
      [oldPlaintext, oldId],
    );
    await client.query('DELETE FROM arcade_seed_pair_pending WHERE seed_pair_id = $1', [oldId]);

    // Commit a fresh active pair (carry the client seed forward unless changed).
    const nextClientSeed = requested ?? String(old.client_seed);
    const newSeed = pf.generateServerSeed();
    const newHash = pf.createServerSeedHash(newSeed);
    const newId = crypto.randomUUID();
    await client.query(
      `INSERT INTO arcade_seed_pairs (id, wallet_address, server_seed_hash, client_seed, status)
         VALUES ($1, $2, $3, $4, 'active')`,
      [newId, w, newHash, nextClientSeed],
    );
    await client.query(
      'INSERT INTO arcade_seed_pair_pending (seed_pair_id, server_seed) VALUES ($1, $2)',
      [newId, newSeed],
    );

    return {
      seedPairId: newId,
      serverSeedHash: newHash,
      clientSeed: nextClientSeed,
      nonce: 0,
      previous: {
        serverSeedHash: String(old.server_seed_hash),
        serverSeed: oldPlaintext ?? '',
        clientSeed: String(old.client_seed),
        nonce: Number(old.nonce_counter),
      },
    };
  });
}

/** Change the active pair's client seed WITHOUT rotating the server seed. */
export async function setActiveClientSeed(
  dbService: DatabaseService,
  wallet: string,
  clientSeed: unknown,
): Promise<PublicSeedState> {
  const cs = cleanClientSeed(clientSeed);
  if (!cs) throw new Error('EMPTY_CLIENT_SEED');
  const w = wallet.toLowerCase();
  return dbService.withTransaction(async (client) => {
    await ensureActivePair(client, w);
    await client.query(
      `UPDATE arcade_seed_pairs SET client_seed = $1 WHERE wallet_address = $2 AND status = 'active'`,
      [cs, w],
    );
    const active = await client.query(
      `SELECT id, server_seed_hash, client_seed, nonce_counter
         FROM arcade_seed_pairs WHERE wallet_address = $1 AND status = 'active'`,
      [w],
    );
    const a = active.rows[0];
    return {
      seedPairId: String(a.id),
      serverSeedHash: String(a.server_seed_hash),
      clientSeed: String(a.client_seed),
      nonce: Number(a.nonce_counter),
      previous: await lastRevealed(client, w),
    };
  });
}

/**
 * Resolve the plaintext server seed for a settled bet row, for a verify
 * endpoint. Returns the seed ONLY when its pair has been revealed (rotated);
 * `null` means "still committed — rotate to reveal". `legacyServerSeed` covers
 * pre-migration rows that stored the plaintext inline and were already public.
 */
export async function revealedSeedForRound(
  db: Queryable,
  seedPairId: string | null,
  legacyServerSeed: string | null,
): Promise<{ serverSeed: string | null; revealed: boolean }> {
  if (legacyServerSeed) return { serverSeed: legacyServerSeed, revealed: true };
  if (!seedPairId) return { serverSeed: null, revealed: false };
  const r = await db.query(
    `SELECT server_seed, status FROM arcade_seed_pairs WHERE id = $1`,
    [seedPairId],
  );
  if (r.rows.length === 0) return { serverSeed: null, revealed: false };
  const row = r.rows[0];
  if (row.status === 'revealed' && row.server_seed) {
    return { serverSeed: String(row.server_seed), revealed: true };
  }
  return { serverSeed: null, revealed: false };
}

/** Most recent revealed pair for a wallet (or null). */
async function lastRevealed(
  client: Queryable,
  wallet: string,
): Promise<PublicSeedState['previous']> {
  const prev = await client.query(
    `SELECT server_seed_hash, server_seed, client_seed, nonce_counter
       FROM arcade_seed_pairs
      WHERE wallet_address = $1 AND status = 'revealed'
      ORDER BY revealed_at DESC NULLS LAST LIMIT 1`,
    [wallet.toLowerCase()],
  );
  if (prev.rows.length === 0) return null;
  const row = prev.rows[0];
  return {
    serverSeedHash: String(row.server_seed_hash),
    serverSeed: row.server_seed ? String(row.server_seed) : '',
    clientSeed: String(row.client_seed),
    nonce: Number(row.nonce_counter),
  };
}
