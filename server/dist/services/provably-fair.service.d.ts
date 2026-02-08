export interface ProvablyFairResult {
    serverSeed: string;
    serverSeedHash: string;
    clientSeed?: string;
    nonce: number;
    result: number;
    hmac: string;
}
export interface GameSeeds {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
}
export declare class ProvablyFairService {
    private readonly ALGORITHM;
    private readonly DIGEST_FORMAT;
    /**
     * Generate a cryptographically secure random server seed
     */
    generateServerSeed(): string;
    /**
     * Create HMAC hash of server seed for public verification
     */
    createServerSeedHash(serverSeed: string): string;
    /**
     * Generate a provably fair random number using HMAC-SHA256
     */
    generateProvablyFairRandom(seeds: GameSeeds, min?: number, max?: number): ProvablyFairResult;
    /**
     * Generate multiple random numbers for a blackjack game
     * Returns array of numbers for: player cards, dealer cards, dealer actions
     */
    generateBlackjackRandoms(seeds: GameSeeds, numCards?: number): number[];
    /**
     * Generate suit indices 0-3 for cards (0=hearts, 1=diamonds, 2=clubs, 3=spades).
     * Used with initial deal for Perfect Pairs (provably fair full card identity).
     */
    generateBlackjackSuits(seeds: GameSeeds, startNonce: number, count: number): number[];
    /**
     * Decode card to value 1-13. Handles encoded cards (value*10+suit, 10-133) and legacy raw values (1-13).
     */
    decodeCardValue(card: number): number;
    /**
     * Decode card to suit 0-3. Encoded cards are value*10+suit; legacy cards default to 0.
     */
    decodeCardSuit(card: number): number;
    /**
     * Generate dealer action (hit/stand) decision
     */
    generateDealerAction(seeds: GameSeeds, dealerTotal: number, hasAce: boolean): 'hit' | 'stand';
    /**
     * Verify a provably fair result
     */
    verifyProvablyFairResult(serverSeedHash: string, serverSeed: string, clientSeed: string, nonce: number, expectedResult: number, min?: number, max?: number): boolean;
    /**
     * Create a client seed commitment (hash of client seed for strategy commitment)
     */
    createClientSeedCommitment(clientSeed: string): string;
    /**
     * Verify client seed against commitment
     */
    verifyClientSeedCommitment(commitment: string, clientSeed: string): boolean;
    /**
     * Generate a unique game identifier for verification
     */
    generateGameHash(serverSeedHash: string, clientSeed: string, nonce: number, betAmount: bigint, timestamp: number): string;
    /**
     * Shuffle a deck using Fisher-Yates algorithm with provably fair randomness
     */
    shuffleDeck(seeds: GameSeeds, deckSize?: number): number[];
    /**
     * Convert card value to blackjack value (1=Ace=11/1, 11-13=10)
     */
    getBlackjackValue(cardValue: number): number;
    /**
     * Calculate optimal hand total considering aces (standard blackjack).
     * Each ace counts as 11 until we bust, then we treat one ace as 1 (subtract 10); repeat per ace.
     * Accepts encoded cards (value*10+suit) or raw values 1-13.
     */
    calculateHandTotal(cards: number[]): {
        total: number;
        hasAce: boolean;
    };
    /**
     * Check if hand is a natural blackjack
     */
    isNaturalBlackjack(cards: number[]): boolean;
    /**
     * Encode a card as value*10 + suit for storage (value 1-13, suit 0-3).
     * 0=hearts, 1=diamonds, 2=clubs, 3=spades (red=0,1; black=2,3).
     */
    encodeCard(value: number, suit: number): number;
}
//# sourceMappingURL=provably-fair.service.d.ts.map