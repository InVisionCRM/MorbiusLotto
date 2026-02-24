/**
 * Call setCompleted(tournamentId) on MorbiusTournament contract.
 * Run after distributePrizes when tournament has on_chain_tournament_id.
 */
export declare function setMorbiusTournamentCompleted(onChainTournamentId: number | bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Call setActive(tournamentId) on MorbiusTournament contract.
 * Run when first player joins a tournament with on_chain_tournament_id.
 */
export declare function setMorbiusTournamentActive(onChainTournamentId: number | bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Check if hasJoined[tournamentId][player] on MorbiusTournament contract.
 */
export declare function hasJoinedMorbiusTournament(onChainTournamentId: number | bigint, playerAddress: string): Promise<boolean>;
/**
 * Verify that a player has joined a tournament on-chain.
 * NOTE: The server cannot call joinTournament() — that requires the player's wallet signature.
 * This is a read-only verification used when processing rebuys.
 */
export declare function verifyMorbiusTournamentJoin(onChainTournamentId: number | bigint, playerAddress: string, buyInAmount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Cancel a tournament on-chain. Only callable by authorized server or creator.
 */
export declare function cancelMorbiusTournament(onChainTournamentId: number | bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Refund a player from a cancelled on-chain tournament.
 * Note: Players can call refund() themselves, but this allows server to batch refunds.
 */
export declare function refundMorbiusTournamentPlayer(onChainTournamentId: number | bigint, playerAddress: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
/**
 * Read prize pool from MorbiusTournament contract.
 */
export declare function getMorbiusTournamentPrizePool(onChainTournamentId: number | bigint): Promise<bigint>;
/**
 * Pay out prize from MorbiusTournament contract (platform MORBIUS tournaments).
 */
export declare function sendMorbiusTournamentPayout(onChainTournamentId: number | bigint, winnerAddress: string, amount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=morbius-tournament.d.ts.map