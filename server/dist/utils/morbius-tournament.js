"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMorbiusTournamentCompleted = setMorbiusTournamentCompleted;
exports.setMorbiusTournamentActive = setMorbiusTournamentActive;
exports.hasJoinedMorbiusTournament = hasJoinedMorbiusTournament;
exports.joinMorbiusTournament = joinMorbiusTournament;
exports.cancelMorbiusTournament = cancelMorbiusTournament;
exports.refundMorbiusTournamentPlayer = refundMorbiusTournamentPlayer;
exports.getMorbiusTournamentPrizePool = getMorbiusTournamentPrizePool;
exports.sendMorbiusTournamentPayout = sendMorbiusTournamentPayout;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const morbius_tournament_1 = require("../abi/morbius-tournament");
const logger_1 = require("./logger");
const MORBIUS_TOURNAMENT_ADDRESS = '0x1F30Aa16B4Da0124308E33b8650C351BBCA70704';
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
 * Call setCompleted(tournamentId) on MorbiusTournament contract.
 * Run after distributePrizes when tournament has on_chain_tournament_id.
 */
async function setMorbiusTournamentCompleted(onChainTournamentId) {
    // Address is hardcoded, always available
    const id = BigInt(onChainTournamentId);
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MORBIUS_TOURNAMENT_ADDRESS,
                abi: morbius_tournament_1.morbiusTournamentAbi,
                functionName: 'setCompleted',
                args: [id],
            });
            logger_1.logger.info('MorbiusTournament setCompleted', { onChainTournamentId: id.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('MorbiusTournament setCompleted failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Call setActive(tournamentId) on MorbiusTournament contract.
 * Run when first player joins a tournament with on_chain_tournament_id.
 */
async function setMorbiusTournamentActive(onChainTournamentId) {
    // Address is hardcoded, always available
    const id = BigInt(onChainTournamentId);
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MORBIUS_TOURNAMENT_ADDRESS,
                abi: morbius_tournament_1.morbiusTournamentAbi,
                functionName: 'setActive',
                args: [id],
            });
            logger_1.logger.info('MorbiusTournament setActive', { onChainTournamentId: id.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('MorbiusTournament setActive failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Check if hasJoined[tournamentId][player] on MorbiusTournament contract.
 */
async function hasJoinedMorbiusTournament(onChainTournamentId, playerAddress) {
    // Address is hardcoded, always available
    try {
        const publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
        const result = await publicClient.readContract({
            address: MORBIUS_TOURNAMENT_ADDRESS,
            abi: morbius_tournament_1.morbiusTournamentAbi,
            functionName: 'hasJoined',
            args: [BigInt(onChainTournamentId), playerAddress],
        });
        return Boolean(result);
    }
    catch {
        return false;
    }
}
/**
 * Join a tournament on-chain (for rebuy). Player must approve MORBIUS token first.
 * This is called server-side when processing a rebuy for an on-chain tournament.
 * NOTE: Frontend should handle approval + join, but this provides server-side verification.
 */
async function joinMorbiusTournament(onChainTournamentId, playerAddress, buyInAmount) {
    // Address is hardcoded, always available
    // Note: This function verifies the join happened, but doesn't actually call joinTournament
    // because that requires the player's wallet signature. The frontend must handle the actual join.
    // This is a verification-only function.
    const id = BigInt(onChainTournamentId);
    try {
        const publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
        const hasJoined = await publicClient.readContract({
            address: MORBIUS_TOURNAMENT_ADDRESS,
            abi: morbius_tournament_1.morbiusTournamentAbi,
            functionName: 'hasJoined',
            args: [id, playerAddress],
        });
        // For rebuy, player should already be joined, so this verifies they're still in
        // The actual rebuy join must happen via frontend wallet interaction
        return { success: Boolean(hasJoined) };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Failed to verify on-chain join status: ${msg}` };
    }
}
/**
 * Cancel a tournament on-chain. Only callable by authorized server or creator.
 */
async function cancelMorbiusTournament(onChainTournamentId) {
    // Address is hardcoded, always available
    const id = BigInt(onChainTournamentId);
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MORBIUS_TOURNAMENT_ADDRESS,
                abi: morbius_tournament_1.morbiusTournamentAbi,
                functionName: 'cancelTournament',
                args: [id],
            });
            logger_1.logger.info('MorbiusTournament cancelled', { onChainTournamentId: id.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('MorbiusTournament cancel failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Refund a player from a cancelled on-chain tournament.
 * Note: Players can call refund() themselves, but this allows server to batch refunds.
 */
async function refundMorbiusTournamentPlayer(onChainTournamentId, playerAddress) {
    // Address is hardcoded, always available
    const id = BigInt(onChainTournamentId);
    const player = playerAddress;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MORBIUS_TOURNAMENT_ADDRESS,
                abi: morbius_tournament_1.morbiusTournamentAbi,
                functionName: 'refund',
                args: [id, player],
            });
            logger_1.logger.info('MorbiusTournament refund sent', { onChainTournamentId: id.toString(), player: playerAddress, txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('MorbiusTournament refund failed', { attempt, onChainTournamentId: id.toString(), player: playerAddress, error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Read prize pool from MorbiusTournament contract.
 */
async function getMorbiusTournamentPrizePool(onChainTournamentId) {
    try {
        const publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
        const result = await publicClient.readContract({
            address: MORBIUS_TOURNAMENT_ADDRESS,
            abi: morbius_tournament_1.morbiusTournamentAbi,
            functionName: 'getTournament',
            args: [BigInt(onChainTournamentId)],
        });
        // getTournament returns: (creator, buyInAmount, maxPlayers, prizeToken, prizeAmount, prizePool, entryCount, status, createdAt)
        const prizePool = result[5];
        return prizePool ?? 0n;
    }
    catch (err) {
        logger_1.logger.error('Failed to read MorbiusTournament prize pool', { onChainTournamentId, error: err });
        return 0n;
    }
}
/**
 * Pay out prize from MorbiusTournament contract (platform MORBIUS tournaments).
 */
async function sendMorbiusTournamentPayout(onChainTournamentId, winnerAddress, amount) {
    // Address is hardcoded, always available
    if (amount <= 0n) {
        return { success: true };
    }
    const id = BigInt(onChainTournamentId);
    const winner = winnerAddress;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MORBIUS_TOURNAMENT_ADDRESS,
                abi: morbius_tournament_1.morbiusTournamentAbi,
                functionName: 'payout',
                args: [id, winner, amount],
            });
            logger_1.logger.info('MorbiusTournament payout', { onChainTournamentId: id.toString(), winner: winnerAddress, amount: amount.toString(), txHash: hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('MorbiusTournament payout failed', { attempt, onChainTournamentId: id.toString(), error: msg });
            if (attempt === maxRetries) {
                return { success: false, error: msg };
            }
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
//# sourceMappingURL=morbius-tournament.js.map