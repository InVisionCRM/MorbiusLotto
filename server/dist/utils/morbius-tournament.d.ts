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
 * Pay out prize from MorbiusTournament contract (platform MORBIUS tournaments).
 */
export declare function sendMorbiusTournamentPayout(onChainTournamentId: number | bigint, winnerAddress: string, amount: bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=morbius-tournament.d.ts.map