/**
 * Unit tests for the persistent provably-fair seed pair
 * (server/src/services/arcade-seed.service.ts).
 *
 * These lock down the properties that make the one-shot games (Dice, Limbo,
 * Roulette) actually provable rather than merely self-consistent:
 *   1. The server-seed commitment is stable across many bets (published once,
 *      up front) — not re-minted per bet.
 *   2. Nonces are handed out sequentially and gap-free, so the operator can't
 *      grind by skipping to a favorable nonce.
 *   3. The plaintext server seed stays hidden until its pair is revealed
 *      (rotated) — revealedSeedForRound returns null while active.
 *   4. The consumed seed reproduces the game outcome (same HMAC recipe the
 *      public verifier re-runs).
 *
 * The service issues raw SQL against a pg client; we back it with a tiny
 * in-memory fake that pattern-matches the exact statements it uses.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import {
  consumeSeedForBet,
  revealedSeedForRound,
} from '../services/arcade-seed.service';
import { ProvablyFairService } from '../services/provably-fair.service';
import { resolveDice } from '../services/arcade-dice';

interface PairRow {
  id: string;
  wallet: string;
  hash: string;
  clientSeed: string;
  serverSeed: string | null;
  nonce: number;
  status: 'active' | 'revealed';
}

/** Minimal in-memory stand-in for the two seed tables. */
class FakeDb {
  pairs = new Map<string, PairRow>();
  pending = new Map<string, string>();

  activeFor(wallet: string): PairRow | undefined {
    return [...this.pairs.values()].find(
      (p) => p.wallet === wallet && p.status === 'active',
    );
  }

  query = async (sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (sql.includes('INSERT INTO arcade_seed_pairs')) {
      const [id, wallet, hash, clientSeed] = params as string[];
      if (this.activeFor(wallet)) return { rows: [] }; // ON CONFLICT DO NOTHING
      this.pairs.set(id, { id, wallet, hash, clientSeed, serverSeed: null, nonce: 0, status: 'active' });
      return { rows: [{ id }] };
    }
    if (sql.includes('INSERT INTO arcade_seed_pair_pending')) {
      const [seedPairId, serverSeed] = params as string[];
      this.pending.set(seedPairId, serverSeed);
      return { rows: [] };
    }
    if (sql.includes('FROM arcade_seed_pairs') && sql.includes('FOR UPDATE')) {
      const p = this.activeFor(params[0] as string);
      return {
        rows: p ? [{ id: p.id, server_seed_hash: p.hash, client_seed: p.clientSeed, nonce_counter: p.nonce }] : [],
      };
    }
    if (sql.includes('FROM arcade_seed_pair_pending')) {
      const s = this.pending.get(params[0] as string);
      return { rows: s ? [{ server_seed: s }] : [] };
    }
    if (sql.includes('UPDATE arcade_seed_pairs SET nonce_counter')) {
      const [next, id] = params as [number, string];
      const p = this.pairs.get(id);
      if (p) p.nonce = next;
      return { rows: [] };
    }
    if (sql.includes('SELECT server_seed, status FROM arcade_seed_pairs')) {
      const p = this.pairs.get(params[0] as string);
      return { rows: p ? [{ server_seed: p.serverSeed, status: p.status }] : [] };
    }
    throw new Error(`FakeDb: unhandled SQL: ${sql}`);
  };
}

const asClient = (db: FakeDb) => db as unknown as PoolClient;
const pf = new ProvablyFairService();

describe('consumeSeedForBet', () => {
  it('commits one seed lazily and reuses it across bets', async () => {
    const db = new FakeDb();
    const a = await consumeSeedForBet(asClient(db), '0xWALLET');
    const b = await consumeSeedForBet(asClient(db), '0xWALLET');

    // Same commitment across bets — published once, not per bet.
    expect(b.serverSeedHash).toBe(a.serverSeedHash);
    expect(b.serverSeed).toBe(a.serverSeed);
    expect(b.clientSeed).toBe(a.clientSeed);
    expect(b.seedPairId).toBe(a.seedPairId);
    // Exactly one active pair exists.
    expect(db.pairs.size).toBe(1);
  });

  it('hands out sequential, gap-free nonces', async () => {
    const db = new FakeDb();
    const nonces: number[] = [];
    for (let i = 0; i < 5; i++) {
      nonces.push((await consumeSeedForBet(asClient(db), '0xabc')).nonce);
    }
    expect(nonces).toEqual([0, 1, 2, 3, 4]);
  });

  it('commits the seed hash as sha256 of the plaintext', async () => {
    const db = new FakeDb();
    const s = await consumeSeedForBet(asClient(db), '0xabc');
    expect(pf.createServerSeedHash(s.serverSeed)).toBe(s.serverSeedHash);
  });

  it('keeps wallets isolated (separate commitments & nonce streams)', async () => {
    const db = new FakeDb();
    const a1 = await consumeSeedForBet(asClient(db), '0xaaa');
    const b1 = await consumeSeedForBet(asClient(db), '0xbbb');
    const a2 = await consumeSeedForBet(asClient(db), '0xaaa');
    expect(a1.serverSeedHash).not.toBe(b1.serverSeedHash);
    expect(a1.nonce).toBe(0);
    expect(b1.nonce).toBe(0);
    expect(a2.nonce).toBe(1);
  });

  it('reproduces the dice roll from the consumed seed (verifier recipe)', async () => {
    const db = new FakeDb();
    const s = await consumeSeedForBet(asClient(db), '0xabc');
    const r = pf.bytesToFloat(pf.hmacByteStream(s.serverSeed, s.clientSeed, s.nonce, 0));
    const outcome = resolveDice(5000, 100, r);
    // Independent recompute with the same inputs must match exactly.
    const r2 = pf.bytesToFloat(pf.hmacByteStream(s.serverSeed, s.clientSeed, s.nonce, 0));
    expect(resolveDice(5000, 100, r2).rollX100).toBe(outcome.rollX100);
  });
});

describe('revealedSeedForRound', () => {
  it('passes through a legacy inline server seed (already public)', async () => {
    const db = new FakeDb();
    const out = await revealedSeedForRound(db, null, 'legacyseed');
    expect(out).toEqual({ serverSeed: 'legacyseed', revealed: true });
  });

  it('hides the plaintext while the pair is still active', async () => {
    const db = new FakeDb();
    const id = crypto.randomUUID();
    db.pairs.set(id, {
      id, wallet: '0xabc', hash: 'h', clientSeed: 'c', serverSeed: null, nonce: 3, status: 'active',
    });
    const out = await revealedSeedForRound(db, id, null);
    expect(out).toEqual({ serverSeed: null, revealed: false });
  });

  it('reveals the plaintext once the pair has been rotated', async () => {
    const db = new FakeDb();
    const id = crypto.randomUUID();
    db.pairs.set(id, {
      id, wallet: '0xabc', hash: 'h', clientSeed: 'c', serverSeed: 'plaintext', nonce: 7, status: 'revealed',
    });
    const out = await revealedSeedForRound(db, id, null);
    expect(out).toEqual({ serverSeed: 'plaintext', revealed: true });
  });

  it('returns not-revealed when the round has no pair link', async () => {
    const db = new FakeDb();
    const out = await revealedSeedForRound(db, null, null);
    expect(out).toEqual({ serverSeed: null, revealed: false });
  });
});
