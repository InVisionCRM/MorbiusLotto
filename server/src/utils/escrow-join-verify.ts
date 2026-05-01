import { decodeEventLog, type Hex } from 'viem';
import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowV2Abi } from '../abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { getTournamentPrizeEscrowAddress } from './tournament-escrow-address';

/**
 * Verify `addToPrizePool` landed from `playerAddress` for this tournament UUID.
 */
export async function verifyEscrowAddToPrizePoolJoinTx(params: {
  tournamentIdUuid: string;
  txHash: `0x${string}`;
  playerAddress: string;
  prizeTokenAddress: string;
  buyInAmountWei: bigint;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    tournamentIdUuid,
    txHash,
    playerAddress,
    prizeTokenAddress,
    buyInAmountWei,
  } = params;

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: 'Invalid tx hash' };
  }

  const escrowAddr = getTournamentPrizeEscrowAddress().toLowerCase();
  const wantBytes32 = tournamentIdToBytes32(tournamentIdUuid).toLowerCase();
  const tokenWant = prizeTokenAddress.toLowerCase();
  const player = playerAddress.toLowerCase();

  try {
    const client = getPublicClient();
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== 'success') {
      return { ok: false, error: 'Transaction not successful or not found' };
    }

    const tx = await client.getTransaction({ hash: txHash });
    if (!tx?.from) {
      return { ok: false, error: 'Could not load transaction sender' };
    }
    if (String(tx.from).toLowerCase() !== player) {
      return { ok: false, error: 'Deposit transaction sender does not match player wallet' };
    }

    /** Server uses viem ^1.x — `parseEventLogs` is v2+; decode each log with `decodeEventLog`. */
    type RpcLog = (typeof receipt.logs)[number];
    const decodedRows: Array<{ address: string; args: Record<string, unknown> }> = [];
    for (const rawLog of receipt.logs) {
      const log = rawLog as RpcLog;
      if (!log.topics?.length) continue;
      try {
        const decoded = decodeEventLog({
          abi: tournamentPrizeEscrowV2Abi,
          data: (log.data ?? '0x') as Hex,
          topics: log.topics as [Hex, ...Hex[]],
          strict: false,
        });
        if (decoded.eventName !== 'PrizePoolAdded') continue;
        const args = decoded.args;
        if (!args || typeof args !== 'object') continue;
        decodedRows.push({
          address: String(log.address).toLowerCase(),
          args: args as Record<string, unknown>,
        });
      } catch {
        /* wrong selector / not this contract */
      }
    }

    const match = decodedRows.find((row) => {
      const a = row.args;
      const tid = String(a.tournamentId ?? '').toLowerCase();
      const tok = String(a.token ?? '').toLowerCase();
      const amt = a.amount as bigint | undefined;
      const contrib = String(a.contributor ?? '').toLowerCase();
      return (
        row.address === escrowAddr &&
        tid === wantBytes32 &&
        tok === tokenWant &&
        amt === buyInAmountWei &&
        contrib === player
      );
    });

    if (!match) {
      return {
        ok: false,
        error:
          'No matching PrizePoolAdded event for this tournament, token, amount, and contributor on the escrow contract',
      };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Escrow join verification failed: ${msg}` };
  }
}
