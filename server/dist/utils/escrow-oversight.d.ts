/**
 * V4 dropped the on-chain aggregation helpers (`getEscrowSummary`, `getActivePools`,
 * `getPoolsByDepositor`, `getTotalValueLocked`); V6 went a step further and removed
 * `getAllTournamentIds()` / the `tournamentIds[]` array entirely (per the V6 commit:
 * "Removed unused tournamentIds[] array + enumeration views"). There is no longer any
 * way to enumerate every pool from the chain.
 *
 * Until we wire enumeration to the DB (query `tournaments.escrow_tournament_id_bytes32
 * WHERE NOT NULL`, then read each pool with `getPool(id)`), the aggregator functions
 * below return safe-empty results. Single-pool reads via `getPoolDetails(uuid)` still
 * work because they go straight through `tournamentIdToBytes32` → `getPool`.
 *
 * TODO(escrow-oversight): swap stubbed enumeration for the DB-backed list. See:
 *   - server/src/services/poker-tournament.service.ts (existing query reads
 *     escrow_tournament_id_bytes32 for the reclaim list)
 *   - admin oversight endpoints under server/src/routes/admin.routes.ts that consume
 *     getEscrowSummary / getPoolsByDepositor / getActivePools / getTotalValueLocked
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