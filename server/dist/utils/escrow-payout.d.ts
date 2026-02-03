/**
 * Send a single prize payout from the Tournament Prize Escrow to a winner.
 * Caller must ensure total payouts do not exceed the pool.
 */
export declare function sendEscrowPayout(tournamentId: string, winnerAddress: string, amount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=escrow-payout.d.ts.map