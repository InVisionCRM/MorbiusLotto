/**
 * Call setCompleted(tournamentId) on MorbiusTournament contract.
 * Run after distributePrizes when tournament has on_chain_tournament_id.
 */
export declare function setMorbiusTournamentCompleted(onChainTournamentId: number | bigint): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
}>;
//# sourceMappingURL=morbius-tournament.d.ts.map