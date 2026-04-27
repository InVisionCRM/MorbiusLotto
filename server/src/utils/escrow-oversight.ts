import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowV2Abi } from '../abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';

/** Active escrow (V4 deployed at this address). Variable name kept for backward-compat. */
const ESCROW_V2_ADDRESS = '0x29d65B552c8246293740e686C9b4F90F359A9F1b' as const;

/**
 * V4 dropped the on-chain aggregation helpers (`getEscrowSummary`, `getActivePools`,
 * `getPoolsByDepositor`, `getTotalValueLocked`) to keep the contract small. We compute
 * them in JS off `getAllTournamentIds()` + per-id `getPool()` instead. For the small
 * tournament counts we have, the cost is trivial; for larger counts we'd cache or paginate.
 */

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

interface RawPool {
  id: `0x${string}`;
  token: `0x${string}`;
  depositor: `0x${string}`;
  totalDeposited: bigint;
  amountPaidOut: bigint;
  depositedAt: bigint;
  cancelled: boolean;
}

/** Read every pool from the contract. Single source of truth for the JS aggregators below. */
async function readAllPools(): Promise<RawPool[]> {
  const client = getPublicClient();
  const idsRaw = (await client.readContract({
    address: ESCROW_V2_ADDRESS,
    abi: tournamentPrizeEscrowV2Abi,
    functionName: 'getAllTournamentIds',
  })) as readonly `0x${string}`[];
  const ids = idsRaw as `0x${string}`[];
  if (ids.length === 0) return [];
  // Read pools in parallel — small N, public RPC handles burst fine.
  const pools = await Promise.all(
    ids.map(async (id) => {
      const r = (await client.readContract({
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'getPool',
        args: [id],
      })) as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean];
      return {
        id,
        token: r[0],
        depositor: r[1],
        totalDeposited: r[2],
        amountPaidOut: r[3],
        depositedAt: r[4],
        cancelled: r[5],
      } satisfies RawPool;
    }),
  );
  return pools;
}

/** Aggregate over all pools in JS — replaces the contract's removed `getEscrowSummary`. */
export async function getEscrowSummary(): Promise<EscrowSummary | null> {
  try {
    const pools = await readAllPools();
    let active = 0;
    let cancelled = 0;
    let tvl = 0n;
    for (const p of pools) {
      if (p.token === '0x0000000000000000000000000000000000000000') continue;
      if (p.cancelled) {
        cancelled++;
      } else if (p.amountPaidOut < p.totalDeposited) {
        // V4 has no `active` flag; "active" = funded and not yet fully paid.
        active++;
        tvl += p.totalDeposited - p.amountPaidOut;
      }
    }
    return {
      totalTournaments: pools.length,
      activeTournaments: active,
      cancelledTournaments: cancelled,
      totalValueLocked: tvl,
    };
  } catch {
    return null;
  }
}

/** Returns bytes32 IDs as strings — the original UUIDs aren't recoverable from the hash. */
export async function getAllTournamentIds(): Promise<string[]> {
  try {
    const pools = await readAllPools();
    return pools.map((p) => p.id);
  } catch {
    return [];
  }
}

function poolToDetails(p: RawPool, tournamentId?: string): EscrowPoolDetails {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const ageSeconds = p.depositedAt > 0n ? now - p.depositedAt : 0n;
  const ageDays = Number(ageSeconds) / 86400;
  return {
    tournamentId: tournamentId ?? p.id,
    token: p.token,
    depositor: p.depositor,
    totalDeposited: p.totalDeposited,
    amountPaidOut: p.amountPaidOut,
    remainingBalance: p.totalDeposited - p.amountPaidOut,
    depositedAt: p.depositedAt,
    cancelled: p.cancelled,
    ageDays: Math.round(ageDays * 100) / 100,
  };
}

/** Pools belonging to a given depositor — JS filter over `readAllPools`. */
export async function getPoolsByDepositor(depositor: `0x${string}`): Promise<EscrowPoolDetails[]> {
  try {
    const pools = await readAllPools();
    const lower = depositor.toLowerCase();
    return pools
      .filter((p) => p.depositor.toLowerCase() === lower)
      .map((p) => poolToDetails(p));
  } catch {
    return [];
  }
}

/** Pools that are funded, not cancelled, and have remaining balance. */
export async function getActivePools(): Promise<Array<{ tournamentId: string; balance: bigint }>> {
  try {
    const pools = await readAllPools();
    return pools
      .filter((p) =>
        p.token !== '0x0000000000000000000000000000000000000000' &&
        !p.cancelled &&
        p.amountPaidOut < p.totalDeposited,
      )
      .map((p) => ({ tournamentId: p.id, balance: p.totalDeposited - p.amountPaidOut }));
  } catch {
    return [];
  }
}

/**
 * Per-tournament details. Caller passes the off-chain UUID; we hash it server-side.
 * Returns the friendly UUID in the response so admin UIs don't have to track both.
 */
export async function getPoolDetails(tournamentId: string): Promise<EscrowPoolDetails | null> {
  try {
    const client = getPublicClient();
    const idBytes32 = tournamentIdToBytes32(tournamentId);
    const r = (await client.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: tournamentPrizeEscrowV2Abi,
      functionName: 'getPool',
      args: [idBytes32],
    })) as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean];
    const raw: RawPool = {
      id: idBytes32,
      token: r[0],
      depositor: r[1],
      totalDeposited: r[2],
      amountPaidOut: r[3],
      depositedAt: r[4],
      cancelled: r[5],
    };
    return poolToDetails(raw, tournamentId);
  } catch {
    return null;
  }
}

/** TVL for a specific token across all funded, non-cancelled pools. */
export async function getTotalValueLocked(token: `0x${string}`): Promise<bigint> {
  try {
    const pools = await readAllPools();
    const lower = token.toLowerCase();
    let total = 0n;
    for (const p of pools) {
      if (p.token.toLowerCase() !== lower) continue;
      if (p.cancelled) continue;
      if (p.amountPaidOut >= p.totalDeposited) continue;
      total += p.totalDeposited - p.amountPaidOut;
    }
    return total;
  } catch {
    return 0n;
  }
}
