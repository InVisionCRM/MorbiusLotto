"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testPool = exports.TEST_BUY_IN = exports.TEST_BALANCE = exports.TEST_PLAYERS = void 0;
exports.withRollback = withRollback;
exports.resetTestBalances = resetTestBalances;
exports.getTestBalance = getTestBalance;
/**
 * Jest global setup for poker tournament integration tests.
 * Uses the real DATABASE_URL from server/.env.
 * Each test should wrap mutations in a transaction and ROLLBACK for isolation.
 */
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load server/.env (running from server/ directory via jest)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Test player addresses (valid 42-char Ethereum addresses)
exports.TEST_PLAYERS = [
    '0x000000000000000000000000000000000000dead',
    '0x000000000000000000000000000000000000beef',
    '0x000000000000000000000000000000000000cafe',
    '0x000000000000000000000000000000000000babe',
    '0x000000000000000000000000000000000000face',
    '0x000000000000000000000000000000000000fade',
];
// 10,000,000 MORBIUS (18 decimals) per test player
exports.TEST_BALANCE = '10000000000000000000000000';
// Standard buy-in: 1,000 MORBIUS
exports.TEST_BUY_IN = BigInt('1000000000000000000000');
beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set — create server/.env with DATABASE_URL before running tests');
    }
    exports.testPool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    // Seed test players — upsert so re-runs don't fail
    await exports.testPool.query(`
    INSERT INTO players (wallet_address, balance)
    SELECT unnest($1::text[]), $2::NUMERIC
    ON CONFLICT (wallet_address) DO UPDATE SET balance = EXCLUDED.balance
  `, [exports.TEST_PLAYERS, exports.TEST_BALANCE]);
});
afterAll(async () => {
    // Clean up test players and any tournaments they created
    await exports.testPool.query(`DELETE FROM players WHERE wallet_address = ANY($1::text[])`, [exports.TEST_PLAYERS]).catch(() => { }); // Best effort
    await exports.testPool.end();
});
/**
 * Run a test function inside a BEGIN/ROLLBACK transaction.
 * All mutations in fn() are rolled back after the test — no persistent state.
 */
async function withRollback(fn) {
    const client = await exports.testPool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('ROLLBACK');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
/**
 * Reset test player balances between tests.
 * Call this in beforeEach if a test modifies balances outside a transaction.
 */
async function resetTestBalances() {
    await exports.testPool.query(`
    UPDATE players SET balance = $1::NUMERIC
    WHERE wallet_address = ANY($2::text[])
  `, [exports.TEST_BALANCE, exports.TEST_PLAYERS]);
}
/**
 * Get current balance for a test player.
 */
async function getTestBalance(address) {
    const r = await exports.testPool.query('SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)', [address]);
    return BigInt(r.rows[0]?.balance ?? '0');
}
//# sourceMappingURL=setup.js.map