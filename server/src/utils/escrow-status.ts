import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowAbi } from '../abi/tournament-prize-escrow';
import { tournamentPrizeEscrowV2Abi } from '../abi/tournament-prize-escrow-v2';
import { tournamentPrizeEscrowV3Abi } from '../abi/tournament-prize-escrow-v3';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';

/** Tournament Prize Escrow V2 (bytes32 tournament IDs) - hardcoded for reliability */
const ESCROW_V2_ADDRESS = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1' as const;
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25' as const;

export interface EscrowPoolStatus {
  token: `0x${string}`;
  totalDeposited: bigint;
  amountPaidOut: bigint;
  // V2 fields (optional, will be undefined for V1)
  depositor?: `0x${string}`;
  depositedAt?: bigint;
  cancelled?: boolean;
}

/**
 * Read tournament prize pool status from the escrow contract.
 * Supports both V1 and V2 contracts. V2 returns additional fields.
 * Returns null if escrow is not configured or the call fails.
 */
export async function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null> {
  try {
    const client = getPublicClient();
    const idBytes32 = tournamentIdToBytes32(tournamentId);
    
    // Try V2 first (has more fields)
    try {
      const result = await client.readContract({
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'getPool',
        args: [idBytes32],
      });
      
      // V2 returns: token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled
      const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result as [
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        boolean
      ];
      
      return {
        token,
        totalDeposited,
        amountPaidOut,
        depositor,
        depositedAt,
        cancelled,
      };
    } catch (v2Error) {
      // Fallback to V1 if V2 call fails (backwards compatibility)
      const [token, totalDeposited, amountPaidOut] = await client.readContract({
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowAbi,
        functionName: 'getPool',
        args: [idBytes32],
      });
      
      return { token, totalDeposited, amountPaidOut };
    }
  } catch {
    return null;
  }
}

/**
 * Read tournament prize pool status from Escrow V3 (uint256 tournament IDs).
 */
export async function getEscrowV3PoolStatus(onChainTournamentId: number | bigint): Promise<EscrowPoolStatus | null> {
  // Address is hardcoded, always available
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_V3_ADDRESS,
      abi: tournamentPrizeEscrowV3Abi,
      functionName: 'getPool',
      args: [BigInt(onChainTournamentId)],
    });
    const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result as [
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      boolean
    ];
    return {
      token,
      totalDeposited,
      amountPaidOut,
      depositor,
      depositedAt,
      cancelled,
    };
  } catch {
    return null;
  }
}
