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
     * HMAC byte stream — core primitive for Fisher-Yates shuffle.
     * Extracts 4 bytes from a cursor-indexed HMAC-SHA256 byte stream.
     * message = `${clientSeed}:${nonce}:${Math.floor(cursor / 32)}`
     * Returns 4 bytes starting at `cursor % 32`, handling 32-byte boundary crossing.
     */
    hmacByteStream(serverSeed: string, clientSeed: string, nonce: number, cursor: number): Buffer;
    /**
     * Convert 4 bytes to a float in [0, 1) — unbiased mapping.
     * byte[0]/256 + byte[1]/256^2 + byte[2]/256^3 + byte[3]/256^4
     */
    bytesToFloat(bytes: Buffer | Uint8Array): number;
    /**
     * Generate 6 distinct numbers in [1, 55] for Instant Lottery 6-of-55 (provably fair).
     * Uses Fisher-Yates over a pool of 55 slots (values 1–55) with HMAC-SHA256 byte stream.
     * Same message format as Blackjack: message = `${clientSeed}:${nonce}:${roundIndex}`.
     * Returns sorted [n1, n2, n3, n4, n5, n6] so contract and verifier get identical result.
     * Verification: given serverSeed, clientSeed, nonce — recompute with this algorithm and compare.
     */
    generate6of55WinningNumbers(serverSeed: string, clientSeed: string, nonce: number): [number, number, number, number, number, number];
    /**
     * Fisher-Yates shuffle of a 52-card deck using cursor-based HMAC byte stream.
     * One nonce per game. Returns array of card indices 0-51.
     * Consumes 51 * 4 = 204 bytes (~7 HMAC rounds).
     */
    fisherYatesShuffle(serverSeed: string, clientSeed: string, nonce: number): number[];
    /**
     * Card index (0-51) to rank (1-13). A=1, 2=2, ..., K=13.
     */
    cardIndexToRank(idx: number): number;
    /**
     * Card index (0-51) to suit (0-3). 0=hearts, 1=diamonds, 2=clubs, 3=spades.
     */
    cardIndexToSuit(idx: number): number;
    /**
     * Calculate hand total for v2 card indices (0-51).
     */
    calculateHandTotalV2(cards: number[]): {
        total: number;
        hasAce: boolean;
    };
    /**
     * Check if hand is a natural blackjack for v2 card indices (0-51).
     */
    isNaturalBlackjackV2(cards: number[]): boolean;
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