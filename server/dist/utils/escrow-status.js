"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEscrowPoolStatus = getEscrowPoolStatus;
exports.getEscrowV3PoolStatus = getEscrowV3PoolStatus;
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const tournament_prize_escrow_v3_1 = require("../abi/tournament-prize-escrow-v3");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
/** Tournament Prize Escrow V2 (bytes32 tournament IDs) - hardcoded for reliability */
const ESCROW_V2_ADDRESS = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25';
/**
 * Read tournament prize pool status from the deployed escrow contract.
 *
 * The deployed `TOURNAMENT_PRIZE_ESCROW_ADDRESS` returns 6 fields from `getPool`
 * (no `active` flag). The legacy V1 fallback that was here previously misread the
 * 6-field response as 3 V1 fields, silently shifting `depositor` into `totalDeposited`
 * and the real `totalDeposited` into `amountPaidOut`. That is what produced bogus
 * "Escrow has already paid out" rejections on freshly-funded pools. No fallback now —
 * if decode fails it really is broken (RPC, wrong address, etc.) and we return null.
 */
async function getEscrowPoolStatus(tournamentId) {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
        const result = await client.readContract({
            address: ESCROW_V2_ADDRESS,
            abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
            functionName: 'getPool',
            args: [idBytes32],
        });
        // Cast via `unknown` because some toolchains may still resolve the V2 ABI to a
        // 7-element tuple type (cached `node_modules`, parallel ABI files). The runtime
        // contract returns 6 fields regardless — see the comment on the ABI's `getPool` block.
        const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result;
        return {
            token,
            depositor,
            totalDeposited,
            amountPaidOut,
            depositedAt,
            cancelled,
            active: !cancelled && totalDeposited > amountPaidOut,
        };
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