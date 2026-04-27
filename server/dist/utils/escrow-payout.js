"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEscrowPayout = sendEscrowPayout;
exports.sendEscrowPayoutMultiple = sendEscrowPayoutMultiple;
exports.sendEscrowRemainderToReclaimWallet = sendEscrowRemainderToReclaimWallet;
exports.sendEscrowV3Payout = sendEscrowV3Payout;
exports.sendEscrowV3RemainderTo = sendEscrowV3RemainderTo;
exports.cancelTournamentInEscrow = cancelTournamentInEscrow;
exports.cancelEscrowV3Tournament = cancelEscrowV3Tournament;
exports.creatorReclaimFromEscrow = creatorReclaimFromEscrow;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const tournament_prize_escrow_v3_1 = require("../abi/tournament-prize-escrow-v3");
const escrow_status_1 = require("./escrow-status");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const logger_1 = require("./logger");
/** Tournament Prize Escrow V2 (bytes32 tournament IDs) - hardcoded for reliability */
// Active escrow (V4 deployed at this address). Variable name kept for backward-compat.
const ESCROW_V2_ADDRESS = '0x29d65B552c8246293740e686C9b4F90F359A9F1b';
/** V3 (uint256 IDs) - kept for cancel/reclaim of legacy V3-funded tournaments */
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25';
const AUTHORIZED_KEY = (process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY);
let walletClient = null;
function getWalletClient() {
    if (!AUTHORIZED_KEY) {
        throw new Error('TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY not set');
    }
    if (!walletClient) {
        const account = (0, accounts_1.privateKeyToAccount)(AUTHORIZED_KEY);
        walletClient = (0, viem_1.createWalletClient)({
            account,
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
    }
    return walletClient;
}
/**
 * Send a single prize payout from the Tournament Prize Escrow to a winner.
 * Caller must ensure total payouts do not exceed the pool.
 */
async function sendEscrowPayout(tournamentId, winnerAddress, amount) {
    if (amount <= 0n) {
        return { success: true };
    }
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    const winner = winnerAddress;
    // Log entry so we can see in production whether sendEscrowPayout is even being reached.
    // If we never see this line, the bug is upstream (Phase 2 not running). If we see this
    // but no "Escrow payout sent", the wallet/RPC/auth is wrong and we'll see the error below.
    logger_1.logger.info('sendEscrowPayout: invoking', {
        tournamentId,
        bytes32Id: idBytes32,
        escrow: ESCROW_V2_ADDRESS,
        winner,
        amount: amount.toString(),
        callerWallet: AUTHORIZED_KEY ? (0, accounts_1.privateKeyToAccount)(AUTHORIZED_KEY).address : '<MISSING_KEY>',
    });
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V2_ADDRESS,
                abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                functionName: 'payout',
                args: [idBytes32, winner, amount],
            });
            logger_1.logger.info('Escrow payout sent', { tournamentId, winner: winnerAddress, amount: amount.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            logger_1.logger.error('Escrow payout attempt failed', { attempt, tournamentId, winner: winnerAddress, error: msg, stack });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Batched escrow payout via V4's `payoutMultiple(bytes32, address[], uint256[] amounts)`.
 *
 * Single on-chain tx pays N recipients atomically. Replaces the legacy loop-of-`payout()`
 * pattern that silently failed on Railway's RPC (N sequential writes, drops mid-loop,
 * no rollback). Now: one nonce, one round-trip, all-or-nothing.
 *
 * The V4 contract takes raw wei amounts (V2's `payoutMultiple` took percentages, but
 * (a) V2's bytecode didn't actually have the function deployed, and (b) percentages
 * caused rounding loss). Server already has exact amounts from `calculate_tournament_prizes`
 * so wei is the natural unit.
 */
async function sendEscrowPayoutMultiple(tournamentId, recipients) {
    if (recipients.length === 0)
        return { success: true };
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    // Drop zero-amount entries; contract's `_push` already no-ops on them but it's
    // wasted calldata + log noise.
    const winners = [];
    const amounts = [];
    for (const r of recipients) {
        if (r.amount <= 0n)
            continue;
        winners.push(r.address);
        amounts.push(r.amount);
    }
    if (winners.length === 0) {
        return { success: true };
    }
    const totalAmount = amounts.reduce((sum, a) => sum + a, 0n);
    logger_1.logger.info('sendEscrowPayoutMultiple: invoking', {
        tournamentId,
        bytes32Id: idBytes32,
        recipientCount: winners.length,
        totalAmount: totalAmount.toString(),
        callerWallet: AUTHORIZED_KEY ? (0, accounts_1.privateKeyToAccount)(AUTHORIZED_KEY).address : '<MISSING_KEY>',
    });
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V2_ADDRESS,
                abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                functionName: 'payoutMultiple',
                args: [idBytes32, winners, amounts],
            });
            logger_1.logger.info('Escrow payoutMultiple sent', { tournamentId, recipientCount: winners.length, txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            logger_1.logger.error('Escrow payoutMultiple attempt failed', { attempt, tournamentId, error: msg, stack });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
const RECLAIM_WALLET = (process.env.ESCROW_REMAINDER_WALLET || process.env.PLATFORM_FEE_WALLET);
/**
 * Send any remaining (unclaimed) escrow balance for a tournament to the configured reclaim wallet.
 * Call after distributePrizes so escrow never holds leftover funds.
 * Uses same authorized server key as payouts. Set ESCROW_REMAINDER_WALLET or PLATFORM_FEE_WALLET.
 */
async function sendEscrowRemainderToReclaimWallet(tournamentId) {
    if (!RECLAIM_WALLET || !RECLAIM_WALLET.startsWith('0x')) {
        logger_1.logger.warn('ESCROW_REMAINDER_WALLET / PLATFORM_FEE_WALLET not set; skipping escrow remainder reclaim');
        return { success: false, error: 'Reclaim wallet not configured' };
    }
    const status = await (0, escrow_status_1.getEscrowPoolStatus)(tournamentId);
    if (!status)
        return { success: false, error: 'Could not read pool status' };
    const remaining = status.totalDeposited - status.amountPaidOut;
    if (remaining <= 0n)
        return { success: true };
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V2_ADDRESS,
                abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                functionName: 'payoutRemainderTo',
                args: [idBytes32, RECLAIM_WALLET],
            });
            logger_1.logger.info('Escrow remainder reclaimed', { tournamentId, to: RECLAIM_WALLET, amount: remaining.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow remainder reclaim failed', { attempt, tournamentId, error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Send a single prize payout from Escrow V3 (uint256 tournament IDs).
 */
async function sendEscrowV3Payout(onChainTournamentId, winnerAddress, amount) {
    // Address is hardcoded, always available
    if (amount <= 0n)
        return { success: true };
    const id = BigInt(onChainTournamentId);
    const winner = winnerAddress;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V3_ADDRESS,
                abi: tournament_prize_escrow_v3_1.tournamentPrizeEscrowV3Abi,
                functionName: 'payout',
                args: [id, winner, amount],
            });
            logger_1.logger.info('Escrow V3 payout sent', { onChainTournamentId: id.toString(), winner: winnerAddress, amount: amount.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow V3 payout failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Send remaining Escrow V3 balance to reclaim wallet.
 */
async function sendEscrowV3RemainderTo(onChainTournamentId, to) {
    // Address is hardcoded, always available
    const status = await (0, escrow_status_1.getEscrowV3PoolStatus)(onChainTournamentId);
    if (!status)
        return { success: false, error: 'Could not read pool status' };
    const remaining = status.totalDeposited - status.amountPaidOut;
    if (remaining <= 0n)
        return { success: true };
    const id = BigInt(onChainTournamentId);
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V3_ADDRESS,
                abi: tournament_prize_escrow_v3_1.tournamentPrizeEscrowV3Abi,
                functionName: 'payoutRemainderTo',
                args: [id, to],
            });
            logger_1.logger.info('Escrow V3 remainder reclaimed', { onChainTournamentId: id.toString(), to, amount: remaining.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow V3 remainder reclaim failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Cancel a tournament in the escrow contract (V1/V2). Only callable by authorized server.
 * Marks the tournament as cancelled so creator can reclaim funds.
 */
async function cancelTournamentInEscrow(tournamentId) {
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            // Use V2 ABI (has cancelTournament function)
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V2_ADDRESS,
                abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                functionName: 'cancelTournament',
                args: [idBytes32],
            });
            logger_1.logger.info('Tournament cancelled in escrow', { tournamentId, txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow cancel tournament attempt failed', { attempt, tournamentId, error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Cancel a tournament in Escrow V3 (uint256 tournament IDs).
 */
async function cancelEscrowV3Tournament(onChainTournamentId) {
    // Address is hardcoded, always available
    const id = BigInt(onChainTournamentId);
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_V3_ADDRESS,
                abi: tournament_prize_escrow_v3_1.tournamentPrizeEscrowV3Abi,
                functionName: 'cancelTournament',
                args: [id],
            });
            logger_1.logger.info('Escrow V3 tournament cancelled', { onChainTournamentId: id.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow V3 cancel tournament attempt failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Creator reclaims funds from a cancelled tournament.
 * Note: This function provides instructions. The creator must call creatorReclaim()
 * directly on the escrow contract using their wallet, as it requires their signature.
 */
async function creatorReclaimFromEscrow(tournamentId, creatorAddress) {
    // The creator needs to call the contract function directly from their wallet.
    // This is a security feature - only the creator (depositor) can reclaim.
    // We return instructions here, but the actual call must be made client-side.
    return {
        success: false,
        error: 'Creator must call creatorReclaim() directly on the escrow contract using their wallet. Use the tournament ID bytes32 hash.',
    };
}
//# sourceMappingURL=escrow-payout.js.map