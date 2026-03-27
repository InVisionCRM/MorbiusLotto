/**
 * Jest global setup for poker tournament integration tests.
 * Uses the real DATABASE_URL from server/.env.
 * Each test should wrap mutations in a transaction and ROLLBACK for isolation.
 */
import { Pool, PoolClient } from 'pg';
export declare const TEST_PLAYERS: string[];
export declare const TEST_BALANCE = "10000000000000000000000000";
export declare const TEST_BUY_IN: bigint;
export declare let testPool: Pool;
/**
 * Run a test function inside a BEGIN/ROLLBACK transaction.
 * All mutations in fn() are rolled back after the test — no persistent state.
 */
export declare function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
/**
 * Reset test player balances between tests.
 * Call this in beforeEach if a test modifies balances outside a transaction.
 */
export declare function resetTestBalances(): Promise<void>;
/**
 * Get current balance for a test player.
 */
export declare function getTestBalance(address: string): Promise<bigint>;
//# sourceMappingURL=setup.d.ts.map