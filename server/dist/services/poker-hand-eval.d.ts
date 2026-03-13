/**
 * Texas Hold'em hand evaluation for 5-7 cards.
 * Card indices 0-51: rank = (idx % 13) + 1 (A=1, K=13), suit = floor(idx/13).
 */
export declare const enum HandRank {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    Trips = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    Quads = 7,
    StraightFlush = 8
}
export interface RankedHand {
    rank: HandRank;
    /** Comparable values: e.g. [pair rank, kicker1, kicker2, kicker3] for pair */
    values: number[];
    cards: number[];
}
/**
 * Best 5-card hand from 5 to 7 card indices (0-51).
 */
export declare function bestHand(cardIndices: number[]): RankedHand;
/** Human-readable hand name for UI. */
export declare function handRankToName(rank: HandRank): string;
/**
 * Compare two ranked hands. Returns positive if a > b, negative if a < b, 0 if tie.
 */
export declare function compareHands(a: RankedHand, b: RankedHand): number;
/**
 * Given multiple hands (e.g. at showdown), return winner indices (can be tie).
 * Each hand is array of 5-7 card indices for that player.
 */
export declare function winners(hands: number[][]): number[];
//# sourceMappingURL=poker-hand-eval.d.ts.map