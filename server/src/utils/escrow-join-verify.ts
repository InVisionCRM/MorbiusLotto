import { parseEventLogs } from 'viem';
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

    const prizeLogs = parseEventLogs({
      abi: tournamentPrizeEscrowV2Abi,
      logs: receipt.logs,
      eventName: 'PrizePoolAdded',
      strict: false,
    });

    const match = prizeLogs.find((log) => {
      if (!log.args || typeof log.args !== 'object') return false;
      const a = log.args as Record<string, unknown>;
      const tid = String(a.tournamentId ?? '').toLowerCase();
      const tok = String(a.token ?? '').toLowerCase();
      const amt = a.amount as bigint | undefined;
      const contrib = String(a.contributor ?? '').toLowerCase();
      return (
        log.address.toLowerCase() === escrowAddr &&
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
