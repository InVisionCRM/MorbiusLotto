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
export declare function getEscrowSummary(): Promise<EscrowSummary | null>;
/**
 * Get all tournament IDs in escrow
 */
export declare function getAllTournamentIds(): Promise<string[]>;
/**
 * Get pools by depositor (creator)
 */
export declare function getPoolsByDepositor(depositor: `0x${string}`): Promise<EscrowPoolDetails[]>;
/**
 * Get active pools (non-cancelled with remaining balance)
 */
export declare function getActivePools(): Promise<Array<{
    tournamentId: string;
    balance: bigint;
}>>;
/**
 * Get pool details for a specific tournament
 */
export declare function getPoolDetails(tournamentId: string): Promise<EscrowPoolDetails | null>;
/**
 * Get total value locked for a specific token
 */
export declare function getTotalValueLocked(token: `0x${string}`): Promise<bigint>;
//# sourceMappingURL=escrow-oversight.d.ts.map