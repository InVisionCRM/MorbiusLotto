/**
 * Send a single prize payout from the Tournament Prize Escrow to a winner.
 * Caller must ensure total payouts do not exceed the pool.
 */
export declare function sendEscrowPayout(tournamentId: string, winnerAddress: string, amount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Send any remaining (unclaimed) escrow balance for a tournament to the configured reclaim wallet.
 * Call after distributePrizes so escrow never holds leftover funds.
 * Uses same authorized server key as payouts. Set ESCROW_REMAINDER_WALLET or PLATFORM_FEE_WALLET.
 */
export declare function sendEscrowRemainderToReclaimWallet(tournamentId: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=escrow-payout.d.ts.map