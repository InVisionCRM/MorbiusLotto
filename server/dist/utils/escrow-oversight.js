"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEscrowSummary = getEscrowSummary;
exports.getAllTournamentIds = getAllTournamentIds;
exports.getPoolsByDepositor = getPoolsByDepositor;
exports.getActivePools = getActivePools;
exports.getPoolDetails = getPoolDetails;
exports.getTotalValueLocked = getTotalValueLocked;
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
/** Tournament Prize Escrow V2 - hardcoded for reliability */
const ESCROW_V2_ADDRESS = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
/**
 * Get escrow summary statistics
 */
async function getEscrowSummary() {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getEscrowSummary',
        });
        const [totalTournaments, activeTournaments, cancelledTournaments, totalValueLocked] = result;
        return {
            totalTournaments: Number(totalTournaments),
            activeTournaments: Number(activeTournaments),
            cancelledTournaments: Number(cancelledTournaments),
            totalValueLocked,
        };
    }
    catch {
        return null;
    }
}
/**
 * Get all tournament IDs in escrow
 */
async function getAllTournamentIds() {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const ids = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getAllTournamentIds',
        });
        // Convert bytes32[] to string[] (they're stored as bytes32 but represent UUIDs)
        return ids.map(() => 'unknown'); // We can't reverse bytes32 to UUID easily
    }
    catch {
        return [];
    }
}
/**
 * Get pools by depositor (creator)
 */
async function getPoolsByDepositor(depositor) {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getPoolsByDepositor',
            args: [depositor],
        });
        const [ids, tokens, totalDepositeds, amountPaidOuts, depositedAts, cancelleds] = result;
        const now = BigInt(Math.floor(Date.now() / 1000));
        return ids.map((id, i) => {
            const depositedAt = depositedAts[i];
            const ageSeconds = now - depositedAt;
            const ageDays = Number(ageSeconds) / 86400;
            return {
                tournamentId: id, // bytes32 representation
                token: tokens[i],
                depositor,
                totalDeposited: totalDepositeds[i],
                amountPaidOut: amountPaidOuts[i],
                remainingBalance: totalDepositeds[i] - amountPaidOuts[i],
                depositedAt,
                cancelled: cancelleds[i],
                ageDays: Math.round(ageDays * 100) / 100,
            };
        });
    }
    catch {
        return [];
    }
}
/**
 * Get active pools (non-cancelled with remaining balance)
 */
async function getActivePools() {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getActivePools',
        });
        const [activeIds, balances] = result;
        return activeIds.map((id, i) => ({
            tournamentId: id,
            balance: balances[i],
        }));
    }
    catch {
        return [];
    }
}
/**
 * Get pool details for a specific tournament
 */
async function getPoolDetails(tournamentId) {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getPool',
            args: [idBytes32],
        });
        const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result;
        const now = BigInt(Math.floor(Date.now() / 1000));
        const ageSeconds = now - depositedAt;
        const ageDays = Number(ageSeconds) / 86400;
        return {
            tournamentId,
            token,
            depositor,
            totalDeposited,
            amountPaidOut,
            remainingBalance: totalDeposited - amountPaidOut,
            depositedAt,
            cancelled,
            ageDays: Math.round(ageDays * 100) / 100,
        };
    }
    catch {
        return null;
    }
}
/**
 * Get total value locked for a specific token
 */
async function getTotalValueLocked(token) {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getTotalValueLocked',
            args: [token],
        });
        return result;
    }
    catch {
        return 0n;
    }
}
//# sourceMappingURL=escrow-oversight.js.map