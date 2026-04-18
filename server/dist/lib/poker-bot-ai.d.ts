/**
 * Shared simple poker bot policy (tight-aggressive preflop, semi-random postflop).
 * Used by the CLI `poker-bot.ts` WebSocket clients and by in-server tournament bot ticks.
 */
/** Parse poker amounts that may be huge (tournament virtual chips in wei-scale) or scientific strings. */
export declare function pokerAmountToBigInt(v: string | number | bigint | null | undefined): bigint;
export interface PokerBotDecisionInput {
    street: string;
    pot: string;
    toCall: string;
    minRaise: string;
    myStack: string;
    myHoleCards: number[] | null;
}
export interface PokerBotDecision {
    action: string;
    amount?: string;
}
export declare function decidePokerBotAction(state: PokerBotDecisionInput): PokerBotDecision;
//# sourceMappingURL=poker-bot-ai.d.ts.map