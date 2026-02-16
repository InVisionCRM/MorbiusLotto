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
/**
 * Send a single prize payout from Escrow V3 (uint256 tournament IDs).
 */
export declare function sendEscrowV3Payout(onChainTournamentId: number | bigint, winnerAddress: string, amount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Send remaining Escrow V3 balance to reclaim wallet.
 */
export declare function sendEscrowV3RemainderTo(onChainTournamentId: number | bigint, to: `0x${string}`): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Cancel a tournament in the escrow contract. Only callable by authorized server.
 * Marks the tournament as cancelled so creator can reclaim funds.
 */
export declare function cancelTournamentInEscrow(tournamentId: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Creator reclaims funds from a cancelled tournament.
 * Note: This function provides instructions. The creator must call creatorReclaim()
 * directly on the escrow contract using their wallet, as it requires their signature.
 */
export declare function creatorReclaimFromEscrow(tournamentId: string, creatorAddress: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=escrow-payout.d.ts.map