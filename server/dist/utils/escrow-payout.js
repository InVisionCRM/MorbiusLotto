"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEscrowPayout = sendEscrowPayout;
exports.sendEscrowRemainderToReclaimWallet = sendEscrowRemainderToReclaimWallet;
exports.cancelTournamentInEscrow = cancelTournamentInEscrow;
exports.creatorReclaimFromEscrow = creatorReclaimFromEscrow;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const tournament_prize_escrow_1 = require("../abi/tournament-prize-escrow");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const escrow_status_1 = require("./escrow-status");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const logger_1 = require("./logger");
const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS;
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
    if (!ESCROW_ADDRESS) {
        logger_1.logger.warn('TOURNAMENT_PRIZE_ESCROW_ADDRESS not set; skipping escrow payout');
        return { success: false, error: 'Escrow not configured' };
    }
    if (amount <= 0n) {
        return { success: true };
    }
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    const winner = winnerAddress;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_ADDRESS,
                abi: tournament_prize_escrow_1.tournamentPrizeEscrowAbi,
                functionName: 'payout',
                args: [idBytes32, winner, amount],
            });
            logger_1.logger.info('Escrow payout sent', { tournamentId, winner: winnerAddress, amount: amount.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('Escrow payout attempt failed', { attempt, tournamentId, winner: winnerAddress, error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
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
    if (!ESCROW_ADDRESS)
        return { success: false, error: 'Escrow not configured' };
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
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_ADDRESS,
                abi: tournament_prize_escrow_1.tournamentPrizeEscrowAbi,
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
 * Cancel a tournament in the escrow contract. Only callable by authorized server.
 * Marks the tournament as cancelled so creator can reclaim funds.
 */
async function cancelTournamentInEscrow(tournamentId) {
    if (!ESCROW_ADDRESS)
        return { success: false, error: 'Escrow not configured' };
    const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            // Use V2 ABI (has cancelTournament function)
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: ESCROW_ADDRESS,
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