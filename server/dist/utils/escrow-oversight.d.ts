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
/** Aggregate over all pools in JS — replaces the contract's removed `getEscrowSummary`. */
export declare function getEscrowSummary(): Promise<EscrowSummary | null>;
/** Returns bytes32 IDs as strings — the original UUIDs aren't recoverable from the hash. */
export declare function getAllTournamentIds(): Promise<string[]>;
/** Pools belonging to a given depositor — JS filter over `readAllPools`. */
export declare function getPoolsByDepositor(depositor: `0x${string}`): Promise<EscrowPoolDetails[]>;
/** Pools that are funded, not cancelled, and have remaining balance. */
export declare function getActivePools(): Promise<Array<{
    tournamentId: string;
    balance: bigint;
}>>;
/**
 * Per-tournament details. Caller passes the off-chain UUID; we hash it server-side.
 * Returns the friendly UUID in the response so admin UIs don't have to track both.
 */
export declare function getPoolDetails(tournamentId: string): Promise<EscrowPoolDetails | null>;
/** TVL for a specific token across all funded, non-cancelled pools. */
export declare function getTotalValueLocked(token: `0x${string}`): Promise<bigint>;
//# sourceMappingURL=escrow-oversight.d.ts.map