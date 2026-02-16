"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMorbiusTournamentCompleted = setMorbiusTournamentCompleted;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const morbius_tournament_1 = require("../abi/morbius-tournament");
const logger_1 = require("./logger");
const MORBIUS_TOURNAMENT_ADDRESS = process.env.MORBIUS_TOURNAMENT_ADDRESS;
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
    if (!MORBIUS_TOURNAMENT_ADDRESS || !MORBIUS_TOURNAMENT_ADDRESS.startsWith('0x')) {
        return { success: false, error: 'MORBIUS_TOURNAMENT_ADDRESS not configured' };
    }
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
//# sourceMappingURL=morbius-tournament.js.map