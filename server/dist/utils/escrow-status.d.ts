export interface EscrowPoolStatus {
    token: `0x${string}`;
    totalDeposited: bigint;
    amountPaidOut: bigint;
}
/**
 * Read tournament prize pool status from the escrow contract.
 * Returns null if escrow is not configured or the call fails.
 */
export declare function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null>;
//# sourceMappingURL=escrow-status.d.ts.map