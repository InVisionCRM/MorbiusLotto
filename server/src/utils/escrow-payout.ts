import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { tournamentPrizeEscrowAbi } from '../abi/tournament-prize-escrow';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { logger } from './logger';

const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS as `0x${string}` | undefined;
const AUTHORIZED_KEY = (process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY) as `0x${string}` | undefined;

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function getWalletClient() {
  if (!AUTHORIZED_KEY) {
    throw new Error('TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY not set');
  }
  if (!walletClient) {
    const account = privateKeyToAccount(AUTHORIZED_KEY);
    walletClient = createWalletClient({
      account,
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return walletClient;
}

/**
 * Send a single prize payout from the Tournament Prize Escrow to a winner.
 * Caller must ensure total payouts do not exceed the pool.
 */
export async function sendEscrowPayout(
  tournamentId: string,
  winnerAddress: string,
  amount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!ESCROW_ADDRESS) {
    logger.warn('TOURNAMENT_PRIZE_ESCROW_ADDRESS not set; skipping escrow payout');
    return { success: false, error: 'Escrow not configured' };
  }
  if (amount <= 0n) {
    return { success: true };
  }

  const idBytes32 = tournamentIdToBytes32(tournamentId);
  const winner = winnerAddress as `0x${string}`;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowAbi,
        functionName: 'payout',
        args: [idBytes32, winner, amount],
      });
      logger.info('Escrow payout sent', { tournamentId, winner: winnerAddress, amount: amount.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow payout attempt failed', { attempt, tournamentId, winner: winnerAddress, error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}
