"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEscrowPayout = sendEscrowPayout;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const tournament_prize_escrow_1 = require("../abi/tournament-prize-escrow");
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
//# sourceMappingURL=escrow-payout.js.map