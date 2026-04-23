/**
 * Jest global setup for poker tournament integration tests.
 * Uses the real DATABASE_URL from server/.env.
 * Each test should wrap mutations in a transaction and ROLLBACK for isolation.
 */
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load server/.env (running from server/ directory via jest)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Test player addresses (valid 42-char Ethereum addresses)
export const TEST_PLAYERS = [
  '0x000000000000000000000000000000000000dead',
  '0x000000000000000000000000000000000000beef',
  '0x000000000000000000000000000000000000cafe',
  '0x000000000000000000000000000000000000babe',
  '0x000000000000000000000000000000000000face',
  '0x000000000000000000000000000000000000fade',
];

// 10,000,000 MORBIUS (18 decimals) per test player — blackjack / on-chain balance
export const TEST_BALANCE = '10000000000000000000000000';

/** Wei string — blackjack tournaments and legacy buy-in columns. */
export const TEST_BUY_IN = BigInt('1000000000000000000000');

/** Paid poker SNG buy-in in whole off-chain chips. */
export const TEST_POKER_BUY_IN_CHIPS = 1000n;

/** Freeroll guaranteed pool in whole chips. */
export const TEST_POKER_GUARANTEE_CHIPS = 5000n;

/** Per-player poker chip wallet seed (generous for integration tests). */
export const TEST_POKER_CHIPS_PER_PLAYER = '1000000000000000000000000';

export let testPool: Pool;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — create server/.env with DATABASE_URL before running tests');
  }

  testPool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Seed test players — upsert so re-runs don't fail
  await testPool.query(`
    INSERT INTO players (wallet_address, balance)
    SELECT unnest($1::text[]), $2::NUMERIC
    ON CONFLICT (wallet_address) DO UPDATE SET balance = EXCLUDED.balance
  `, [TEST_PLAYERS, TEST_BALANCE]);
});

afterAll(async () => {
  await testPool
    .query(`DELETE FROM player_poker_chips WHERE wallet_address = ANY($1::text[])`, [TEST_PLAYERS])
    .catch(() => {});
  await testPool.query(
    `DELETE FROM players WHERE wallet_address = ANY($1::text[])`,
    [TEST_PLAYERS]
  ).catch(() => {}); // Best effort
  await testPool.end();
});

/**
 * Run a test function inside a BEGIN/ROLLBACK transaction.
 * All mutations in fn() are rolled back after the test — no persistent state.
 */
export async function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reset test player balances between tests.
 * Call this in beforeEach if a test modifies balances outside a transaction.
 */
export async function resetTestBalances(): Promise<void> {
  await testPool.query(`
    UPDATE players SET balance = $1::NUMERIC
    WHERE wallet_address = ANY($2::text[])
  `, [TEST_BALANCE, TEST_PLAYERS]);
  await resetTestPokerChips();
}

/** Reset off-chain poker chip wallets for test addresses. */
export async function resetTestPokerChips(): Promise<void> {
  await testPool.query(
    `
    INSERT INTO player_poker_chips (wallet_address, balance)
    SELECT unnest($1::text[]), $2::NUMERIC
    ON CONFLICT (wallet_address) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()
    `,
    [TEST_PLAYERS, TEST_POKER_CHIPS_PER_PLAYER],
  );
}

/**
 * Get current MORBIUS balance for a test player.
 */
export async function getTestBalance(address: string): Promise<bigint> {
  const r = await testPool.query(
    'SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)',
    [address]
  );
  return BigInt(r.rows[0]?.balance ?? '0');
}

/** Off-chain poker chip balance. */
export async function getTestChipBalance(address: string): Promise<bigint> {
  const r = await testPool.query(
    'SELECT balance::text AS balance FROM player_poker_chips WHERE LOWER(wallet_address) = LOWER($1)',
    [address]
  );
  if (r.rows.length === 0) return 0n;
  return BigInt(r.rows[0]?.balance ?? '0');
}
