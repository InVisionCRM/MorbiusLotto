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
 * Batched escrow payout via V4's `payoutMultiple(bytes32, address[], uint256[] amounts)`.
 *
 * Single on-chain tx pays N recipients atomically. Replaces the legacy loop-of-`payout()`
 * pattern that silently failed on Railway's RPC (N sequential writes, drops mid-loop,
 * no rollback). Now: one nonce, one round-trip, all-or-nothing.
 *
 * The V4 contract takes raw wei amounts (V2's `payoutMultiple` took percentages, but
 * (a) V2's bytecode didn't actually have the function deployed, and (b) percentages
 * caused rounding loss). Server already has exact amounts from `calculate_tournament_prizes`
 * so wei is the natural unit.
 */
export declare function sendEscrowPayoutMultiple(tournamentId: string, recipients: {
    address: string;
    amount: bigint;
}[]): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Backup path: when `payoutMultiple` fails, record per-winner claimable amounts on-chain
 * so winners can pull from their own wallets via `claim()`. Idempotent overwrite.
 *
 * Called after a push failure as a safety net — even if every push attempt drops, the
 * pool still has the funds and the claimable mapping tells winners exactly what they're owed.
 */
export declare function setEscrowUnclaimedShares(tournamentId: string, recipients: {
    address: string;
    amount: bigint;
}[]): Promise<{
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
 * Cancel a tournament in the escrow contract (V1/V2). Only callable by authorized server.
 * Marks the tournament as cancelled so creator can reclaim funds.
 */
export declare function cancelTournamentInEscrow(tournamentId: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Cancel a tournament in Escrow V3 (uint256 tournament IDs).
 */
export declare function cancelEscrowV3Tournament(onChainTournamentId: number | bigint): Promise<{
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