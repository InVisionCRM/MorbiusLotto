export interface EscrowPoolStatus {
    token: `0x${string}`;
    totalDeposited: bigint;
    amountPaidOut: bigint;
    depositor?: `0x${string}`;
    depositedAt?: bigint;
    cancelled?: boolean;
    active?: boolean;
}
/**
 * Read tournament prize pool status from the escrow contract.
 * Supports both V1 and V2 contracts. V2 returns additional fields.
 * Returns null if escrow is not configured or the call fails.
 */
export declare function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null>;
/**
 * Read tournament prize pool status from Escrow V3 (uint256 tournament IDs).
 */
export declare function getEscrowV3PoolStatus(onChainTournamentId: number | bigint): Promise<EscrowPoolStatus | null>;
//# sourceMappingURL=escrow-status.d.ts.map