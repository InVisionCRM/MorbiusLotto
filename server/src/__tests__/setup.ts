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

// Test player addresses and their starting balances (in MORBIUS wei)
export const TEST_PLAYERS = [
  '0xtest1000000000000000000000000000000000001',
  '0xtest1000000000000000000000000000000000002',
  '0xtest1000000000000000000000000000000000003',
  '0xtest1000000000000000000000000000000000004',
  '0xtest1000000000000000000000000000000000005',
  '0xtest1000000000000000000000000000000000006',
];

// 10,000,000 MORBIUS (18 decimals) per test player
export const TEST_BALANCE = '10000000000000000000000000';

// Standard buy-in: 1,000 MORBIUS
export const TEST_BUY_IN = BigInt('1000000000000000000000');

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
  // Clean up test players and any tournaments they created
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
}

/**
 * Get current balance for a test player.
 */
export async function getTestBalance(address: string): Promise<bigint> {
  const r = await testPool.query(
    'SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)',
    [address]
  );
  return BigInt(r.rows[0]?.balance ?? '0');
}
