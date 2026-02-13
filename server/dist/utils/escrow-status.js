"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEscrowPoolStatus = getEscrowPoolStatus;
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_1 = require("../abi/tournament-prize-escrow");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS;
/**
 * Read tournament prize pool status from the escrow contract.
 * Returns null if escrow is not configured or the call fails.
 */
async function getEscrowPoolStatus(tournamentId) {
    if (!ESCROW_ADDRESS)
        return null;
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
        const [token, totalDeposited, amountPaidOut] = await client.readContract({
            address: ESCROW_ADDRESS,
            abi: tournament_prize_escrow_1.tournamentPrizeEscrowAbi,
            functionName: 'getPool',
            args: [idBytes32],
        });
        return { token, totalDeposited, amountPaidOut };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=escrow-status.js.map