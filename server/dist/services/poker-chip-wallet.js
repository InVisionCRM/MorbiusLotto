"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformFeeWalletLower = getPlatformFeeWalletLower;
exports.getPokerChipBalance = getPokerChipBalance;
exports.applyPokerChipDelta = applyPokerChipDelta;
const logger_1 = require("../utils/logger");
const DEFAULT_PLATFORM_FEE_WALLET = '0x41682815b05fe6b54a6c0f8813bb99423ee0309d';
function getPlatformFeeWalletLower() {
    const raw = process.env.PLATFORM_FEE_WALLET?.trim();
    if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw))
        return raw.toLowerCase();
    return DEFAULT_PLATFORM_FEE_WALLET;
}
function normalizeAddr(addr) {
    const a = addr.trim().toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a))
        throw new Error('Invalid wallet address');
    return a;
}
async function getPokerChipBalance(db, walletAddress) {
    const addr = normalizeAddr(walletAddress);
    const r = await db.query('SELECT balance::text AS balance FROM player_poker_chips WHERE wallet_address = $1', [addr]);
    if (r.rows.length === 0)
        return 0n;
    return BigInt(r.rows[0].balance ?? '0');
}
/**
 * Apply a signed chip delta inside an open transaction (`client` must already be in BEGIN).
 * Positive = credit, negative = debit.
 */
async function applyPokerChipDelta(client, walletAddress, delta, reason, ref) {
    if (delta === 0n) {
        return getPokerChipBalance(client, walletAddress);
    }
    const addr = normalizeAddr(walletAddress);
    await client.query(`INSERT INTO player_poker_chips (wallet_address, balance) VALUES ($1, 0)
     ON CONFLICT (wallet_address) DO NOTHING`, [addr]);
    const row = await client.query(`SELECT balance::text AS balance FROM player_poker_chips WHERE wallet_address = $1 FOR UPDATE`, [addr]);
    const before = BigInt(row.rows[0]?.balance ?? '0');
    const after = before + delta;
    if (after < 0n) {
        throw new Error('Insufficient poker chips');
    }
    await client.query(`UPDATE player_poker_chips SET balance = $2::NUMERIC, updated_at = NOW() WHERE wallet_address = $1`, [addr, after.toString()]);
    const refId = ref?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref.id)
        ? ref.id
        : null;
    await client.query(`INSERT INTO poker_chip_ledger (wallet_address, delta, balance_after, reason, ref_type, ref_id)
     VALUES ($1, $2::NUMERIC, $3::NUMERIC, $4, $5, $6)`, [addr, delta.toString(), after.toString(), reason, ref?.type ?? null, refId]);
    logger_1.logger.debug('Poker chip delta', { wallet: addr, delta: delta.toString(), after: after.toString(), reason });
    return after;
}
//# sourceMappingURL=poker-chip-wallet.js.map