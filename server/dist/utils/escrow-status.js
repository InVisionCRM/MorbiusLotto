"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEscrowPoolStatus = getEscrowPoolStatus;
exports.getEscrowV3PoolStatus = getEscrowV3PoolStatus;
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_1 = require("../abi/tournament-prize-escrow");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const tournament_prize_escrow_v3_1 = require("../abi/tournament-prize-escrow-v3");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS;
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25';
/**
 * Read tournament prize pool status from the escrow contract.
 * Supports both V1 and V2 contracts. V2 returns additional fields.
 * Returns null if escrow is not configured or the call fails.
 */
async function getEscrowPoolStatus(tournamentId) {
    if (!ESCROW_ADDRESS)
        return null;
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
        // Try V2 first (has more fields)
        try {
            const result = await client.readContract({
                address: ESCROW_ADDRESS,
                abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                functionName: 'getPool',
                args: [idBytes32],
            });
            // V2 returns: token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled
            const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result;
            return {
                token,
                totalDeposited,
                amountPaidOut,
                depositor,
                depositedAt,
                cancelled,
            };
        }
        catch (v2Error) {
            // Fallback to V1 if V2 call fails (backwards compatibility)
            const [token, totalDeposited, amountPaidOut] = await client.readContract({
                address: ESCROW_ADDRESS,
                abi: tournament_prize_escrow_1.tournamentPrizeEscrowAbi,
                functionName: 'getPool',
                args: [idBytes32],
            });
            return { token, totalDeposited, amountPaidOut };
        }
    }
    catch {
        return null;
    }
}
/**
 * Read tournament prize pool status from Escrow V3 (uint256 tournament IDs).
 */
async function getEscrowV3PoolStatus(onChainTournamentId) {
    // Address is hardcoded, always available
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const result = await client.readContract({
            address: ESCROW_V3_ADDRESS,
            abi: tournament_prize_escrow_v3_1.tournamentPrizeEscrowV3Abi,
            functionName: 'getPool',
            args: [BigInt(onChainTournamentId)],
        });
        const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result;
        return {
            token,
            totalDeposited,
            amountPaidOut,
            depositor,
            depositedAt,
            cancelled,
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=escrow-status.js.map