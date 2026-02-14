import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowV2Abi } from '../abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';

const ESCROW_ADDRESS = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS as `0x${string}` | undefined;

export interface EscrowPoolDetails {
  tournamentId: string;
  token: `0x${string}`;
  depositor: `0x${string}`;
  totalDeposited: bigint;
  amountPaidOut: bigint;
  remainingBalance: bigint;
  depositedAt: bigint;
  cancelled: boolean;
  ageDays: number;
}

export interface EscrowSummary {
  totalTournaments: number;
  activeTournaments: number;
  cancelledTournaments: number;
  totalValueLocked: bigint;
}

/**
 * Get escrow summary statistics
 */
export async function getEscrowSummary(): Promise<EscrowSummary | null> {
  if (!ESCROW_ADDRESS) return null;
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getEscrowSummary',
    });
    
    const [totalTournaments, activeTournaments, cancelledTournaments, totalValueLocked] = result as [
      bigint,
      bigint,
      bigint,
      bigint
    ];
    
    return {
      totalTournaments: Number(totalTournaments),
      activeTournaments: Number(activeTournaments),
      cancelledTournaments: Number(cancelledTournaments),
      totalValueLocked,
    };
  } catch {
    return null;
  }
}

/**
 * Get all tournament IDs in escrow
 */
export async function getAllTournamentIds(): Promise<string[]> {
  if (!ESCROW_ADDRESS) return [];
  try {
    const client = getPublicClient();
    const ids = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getAllTournamentIds',
    });
    
    // Convert bytes32[] to string[] (they're stored as bytes32 but represent UUIDs)
    return (ids as `0x${string}`[]).map(() => 'unknown'); // We can't reverse bytes32 to UUID easily
  } catch {
    return [];
  }
}

/**
 * Get pools by depositor (creator)
 */
export async function getPoolsByDepositor(depositor: `0x${string}`): Promise<EscrowPoolDetails[]> {
  if (!ESCROW_ADDRESS) return [];
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getPoolsByDepositor',
      args: [depositor],
    });
    
    const [ids, tokens, totalDepositeds, amountPaidOuts, depositedAts, cancelleds] = result as [
      `0x${string}`[],
      `0x${string}`[],
      bigint[],
      bigint[],
      bigint[],
      boolean[]
    ];
    
    const now = BigInt(Math.floor(Date.now() / 1000));
    return ids.map((id, i) => {
      const depositedAt = depositedAts[i];
      const ageSeconds = now - depositedAt;
      const ageDays = Number(ageSeconds) / 86400;
      
      return {
        tournamentId: id, // bytes32 representation
        token: tokens[i],
        depositor,
        totalDeposited: totalDepositeds[i],
        amountPaidOut: amountPaidOuts[i],
        remainingBalance: totalDepositeds[i] - amountPaidOuts[i],
        depositedAt,
        cancelled: cancelleds[i],
        ageDays: Math.round(ageDays * 100) / 100,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get active pools (non-cancelled with remaining balance)
 */
export async function getActivePools(): Promise<Array<{ tournamentId: string; balance: bigint }>> {
  if (!ESCROW_ADDRESS) return [];
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getActivePools',
    });
    
    const [activeIds, balances] = result as [`0x${string}`[], bigint[]];
    
    return activeIds.map((id, i) => ({
      tournamentId: id,
      balance: balances[i],
    }));
  } catch {
    return [];
  }
}

/**
 * Get pool details for a specific tournament
 */
export async function getPoolDetails(tournamentId: string): Promise<EscrowPoolDetails | null> {
  if (!ESCROW_ADDRESS) return null;
  try {
    const client = getPublicClient();
    const idBytes32 = tournamentIdToBytes32(tournamentId);
    const result = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getPool',
      args: [idBytes32],
    });
    
    const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result as [
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      boolean
    ];
    
    const now = BigInt(Math.floor(Date.now() / 1000));
    const ageSeconds = now - depositedAt;
    const ageDays = Number(ageSeconds) / 86400;
    
    return {
      tournamentId,
      token,
      depositor,
      totalDeposited,
      amountPaidOut,
      remainingBalance: totalDeposited - amountPaidOut,
      depositedAt,
      cancelled,
      ageDays: Math.round(ageDays * 100) / 100,
    };
  } catch {
    return null;
  }
}

/**
 * Get total value locked for a specific token
 */
export async function getTotalValueLocked(token: `0x${string}`): Promise<bigint> {
  if (!ESCROW_ADDRESS) return 0n;
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getTotalValueLocked',
      args: [token],
    });
    
    return result as bigint;
  } catch {
    return 0n;
  }
}
