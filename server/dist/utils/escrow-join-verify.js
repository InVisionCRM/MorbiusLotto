"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEscrowAddToPrizePoolJoinTx = verifyEscrowAddToPrizePoolJoinTx;
const viem_1 = require("viem");
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_v2_1 = require("../abi/tournament-prize-escrow-v2");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const tournament_escrow_address_1 = require("./tournament-escrow-address");
/**
 * Verify `addToPrizePool` landed from `playerAddress` for this tournament UUID.
 */
async function verifyEscrowAddToPrizePoolJoinTx(params) {
    const { tournamentIdUuid, txHash, playerAddress, prizeTokenAddress, buyInAmountWei, } = params;
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return { ok: false, error: 'Invalid tx hash' };
    }
    const escrowAddr = (0, tournament_escrow_address_1.getTournamentPrizeEscrowAddress)().toLowerCase();
    const wantBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentIdUuid).toLowerCase();
    const tokenWant = prizeTokenAddress.toLowerCase();
    const player = playerAddress.toLowerCase();
    try {
        const client = (0, chain_client_1.getPublicClient)();
        // viem v1 throws TransactionReceiptNotFoundError when the tx isn't mined yet on this RPC;
        // the server's RPC can lag behind the client's RPC, so retry for ~18s before giving up.
        let receipt = null;
        for (let i = 0; i < 6; i++) {
            try {
                receipt = await client.getTransactionReceipt({ hash: txHash });
                if (receipt)
                    break;
            }
            catch {
                /* not mined yet on this RPC — wait and retry */
            }
            if (i < 5)
                await new Promise((r) => setTimeout(r, 3000));
        }
        if (!receipt) {
            return { ok: false, error: 'Deposit tx not found on-chain after waiting (RPC may be lagging)' };
        }
        if (receipt.status !== 'success') {
            return { ok: false, error: 'Deposit transaction reverted on-chain — check token allowance, balance, and that the tournament has not already been funded with a different token' };
        }
        const tx = await client.getTransaction({ hash: txHash });
        if (!tx?.from) {
            return { ok: false, error: 'Could not load transaction sender' };
        }
        if (String(tx.from).toLowerCase() !== player) {
            return { ok: false, error: 'Deposit transaction sender does not match player wallet' };
        }
        const decodedRows = [];
        for (const rawLog of receipt.logs) {
            const log = rawLog;
            if (!log.topics?.length)
                continue;
            try {
                const decoded = (0, viem_1.decodeEventLog)({
                    abi: tournament_prize_escrow_v2_1.tournamentPrizeEscrowV2Abi,
                    data: (log.data ?? '0x'),
                    topics: log.topics,
                    strict: false,
                });
                if (decoded.eventName !== 'PrizePoolAdded')
                    continue;
                const args = decoded.args;
                if (!args || typeof args !== 'object')
                    continue;
                decodedRows.push({
                    address: String(log.address).toLowerCase(),
                    args: args,
                });
            }
            catch {
                /* wrong selector / not this contract */
            }
        }
        const match = decodedRows.find((row) => {
            const a = row.args;
            const tid = String(a.tournamentId ?? '').toLowerCase();
            const tok = String(a.token ?? '').toLowerCase();
            const amt = a.amount;
            const contrib = String(a.contributor ?? '').toLowerCase();
            return (row.address === escrowAddr &&
                tid === wantBytes32 &&
                tok === tokenWant &&
                amt === buyInAmountWei &&
                contrib === player);
        });
        if (!match) {
            return {
                ok: false,
                error: 'No matching PrizePoolAdded event for this tournament, token, amount, and contributor on the escrow contract',
            };
        }
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Escrow join verification failed: ${msg}` };
    }
}
//# sourceMappingURL=escrow-join-verify.js.map