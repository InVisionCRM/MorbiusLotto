import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowAbi } from '../abi/tournament-prize-escrow';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';

const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS as `0x${string}` | undefined;

export interface EscrowPoolStatus {
  token: `0x${string}`;
  totalDeposited: bigint;
  amountPaidOut: bigint;
}

/**
 * Read tournament prize pool status from the escrow contract.
 * Returns null if escrow is not configured or the call fails.
 */
export async function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null> {
  if (!ESCROW_ADDRESS) return null;
  try {
    const client = getPublicClient();
    const idBytes32 = tournamentIdToBytes32(tournamentId);
    const [token, totalDeposited, amountPaidOut] = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowAbi,
      functionName: 'getPool',
      args: [idBytes32],
    });
    return { token, totalDeposited, amountPaidOut };
  } catch {
    return null;
  }
}
