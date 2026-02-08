"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvablyFairService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
class ProvablyFairService {
    ALGORITHM = 'sha256';
    DIGEST_FORMAT = 'hex';
    /**
     * Generate a cryptographically secure random server seed
     */
    generateServerSeed() {
        return crypto_1.default.randomBytes(32).toString('hex');
    }
    /**
     * Create HMAC hash of server seed for public verification
     */
    createServerSeedHash(serverSeed) {
        return crypto_1.default.createHash(this.ALGORITHM).update(serverSeed).digest(this.DIGEST_FORMAT);
    }
    /**
     * Generate a provably fair random number using HMAC-SHA256
     */
    generateProvablyFairRandom(seeds, min = 0, max = 100) {
        const { serverSeed, clientSeed, nonce } = seeds;
        // Create HMAC with server seed as key and client seed + nonce as message
        const message = `${clientSeed}:${nonce}`;
        const hmac = crypto_1.default.createHmac(this.ALGORITHM, serverSeed);
        hmac.update(message);
        const hmacDigest = hmac.digest(this.DIGEST_FORMAT);
        // Convert first 8 characters of HMAC to integer
        const hashValue = parseInt(hmacDigest.substring(0, 8), 16);
        // Map to desired range
        const range = max - min + 1;
        const result = (hashValue % range) + min;
        return {
            serverSeed,
            serverSeedHash: this.createServerSeedHash(serverSeed),
            clientSeed,
            nonce,
            result,
            hmac: hmacDigest
        };
    }
    /**
     * Generate multiple random numbers for a blackjack game
     * Returns array of numbers for: player cards, dealer cards, dealer actions
     */
    generateBlackjackRandoms(seeds, numCards = 6) {
        const results = [];
        for (let i = 0; i < numCards; i++) {
            const gameSeeds = { ...seeds, nonce: seeds.nonce + i };
            const pfResult = this.generateProvablyFairRandom(gameSeeds, 1, 13); // Card values 1-13 (Ace=1, King=13)
            results.push(pfResult.result);
        }
        return results;
    }
    /**
     * Generate suit indices 0-3 for cards (0=hearts, 1=diamonds, 2=clubs, 3=spades).
     * Used with initial deal for Perfect Pairs (provably fair full card identity).
     */
    generateBlackjackSuits(seeds, startNonce, count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            const gameSeeds = { ...seeds, nonce: startNonce + i };
            const pfResult = this.generateProvablyFairRandom(gameSeeds, 0, 3);
            results.push(pfResult.result);
        }
        return results;
    }
    /**
     * Decode card to value 1-13. Handles encoded cards (value*10+suit, 10-133) and legacy raw values (1-13).
     */
    decodeCardValue(card) {
        if (card >= 10 && card <= 133)
            return Math.floor(card / 10);
        return card >= 1 && card <= 13 ? card : 1;
    }
    /**
     * Decode card to suit 0-3. Encoded cards are value*10+suit; legacy cards default to 0.
     */
    decodeCardSuit(card) {
        if (card >= 10 && card <= 133)
            return card % 10;
        return 0;
    }
    /**
     * Generate dealer action (hit/stand) decision
     */
    generateDealerAction(seeds, dealerTotal, hasAce) {
        const pfResult = this.generateProvablyFairRandom(seeds, 0, 1);
        const shouldHit = pfResult.result === 1;
        // Standard blackjack dealer rules: hit on soft 17
        if (dealerTotal < 17 || (dealerTotal === 17 && hasAce)) {
            return 'hit';
        }
        return 'stand';
    }
    /**
     * Verify a provably fair result
     */
    verifyProvablyFairResult(serverSeedHash, serverSeed, clientSeed, nonce, expectedResult, min = 0, max = 100) {
        try {
            // Verify server seed hash matches
            const calculatedHash = this.createServerSeedHash(serverSeed);
            if (calculatedHash !== serverSeedHash) {
                logger_1.logger.warn('Server seed hash verification failed', { calculatedHash, serverSeedHash });
                return false;
            }
            // Regenerate the result
            const seeds = { serverSeed, clientSeed, nonce };
            const pfResult = this.generateProvablyFairRandom(seeds, min, max);
            // Check if result matches
            if (pfResult.result !== expectedResult) {
                logger_1.logger.warn('Result verification failed', {
                    expected: expectedResult,
                    calculated: pfResult.result,
                    serverSeed,
                    clientSeed,
                    nonce
                });
                return false;
            }
            return true;
        }
        catch (error) {
            logger_1.logger.error('Error verifying provably fair result:', error);
            return false;
        }
    }
    /**
     * Create a client seed commitment (hash of client seed for strategy commitment)
     */
    createClientSeedCommitment(clientSeed) {
        return crypto_1.default.createHash(this.ALGORITHM).update(clientSeed).digest(this.DIGEST_FORMAT);
    }
    /**
     * Verify client seed against commitment
     */
    verifyClientSeedCommitment(commitment, clientSeed) {
        const calculatedCommitment = this.createClientSeedCommitment(clientSeed);
        return calculatedCommitment === commitment;
    }
    /**
     * Generate a unique game identifier for verification
     */
    generateGameHash(serverSeedHash, clientSeed, nonce, betAmount, timestamp) {
        // IMPORTANT:
        // - The client only knows the server seed *commitment* (hash) before betting.
        // - Therefore the gameHash must be derived from serverSeedHash (not serverSeed).
        // - Frontend and backend both use the exact colon-delimited format.
        const normalizedServerSeedHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash;
        const data = `${normalizedServerSeedHash}:${clientSeed}:${nonce}:${betAmount.toString()}:${timestamp}`;
        return crypto_1.default.createHash(this.ALGORITHM).update(data).digest(this.DIGEST_FORMAT);
    }
    /**
     * Shuffle a deck using Fisher-Yates algorithm with provably fair randomness
     */
    shuffleDeck(seeds, deckSize = 312) {
        const deck = Array.from({ length: deckSize }, (_, i) => i);
        for (let i = deck.length - 1; i > 0; i--) {
            const gameSeeds = { ...seeds, nonce: seeds.nonce + (deckSize - i) };
            const pfResult = this.generateProvablyFairRandom(gameSeeds, 0, i);
            const j = pfResult.result;
            // Swap elements
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    // ============================================
    // V2 RNG: Fisher-Yates 52-card deck (Stake.com standard)
    // ============================================
    /**
     * HMAC byte stream — core primitive for Fisher-Yates shuffle.
     * Extracts 4 bytes from a cursor-indexed HMAC-SHA256 byte stream.
     * message = `${clientSeed}:${nonce}:${Math.floor(cursor / 32)}`
     * Returns 4 bytes starting at `cursor % 32`, handling 32-byte boundary crossing.
     */
    hmacByteStream(serverSeed, clientSeed, nonce, cursor) {
        const roundIndex = Math.floor(cursor / 32);
        const byteOffset = cursor % 32;
        const message = `${clientSeed}:${nonce}:${roundIndex}`;
        const hmacBuf = crypto_1.default.createHmac(this.ALGORITHM, serverSeed).update(message).digest();
        if (byteOffset + 4 <= 32) {
            // All 4 bytes within one HMAC round
            return hmacBuf.subarray(byteOffset, byteOffset + 4);
        }
        // Straddles boundary — get remaining bytes from next round
        const bytesFromCurrent = 32 - byteOffset;
        const nextMessage = `${clientSeed}:${nonce}:${roundIndex + 1}`;
        const nextHmacBuf = crypto_1.default.createHmac(this.ALGORITHM, serverSeed).update(nextMessage).digest();
        return Buffer.concat([
            hmacBuf.subarray(byteOffset, 32),
            nextHmacBuf.subarray(0, 4 - bytesFromCurrent),
        ]);
    }
    /**
     * Convert 4 bytes to a float in [0, 1) — unbiased mapping.
     * byte[0]/256 + byte[1]/256^2 + byte[2]/256^3 + byte[3]/256^4
     */
    bytesToFloat(bytes) {
        return (bytes[0] / 256 +
            bytes[1] / (256 * 256) +
            bytes[2] / (256 * 256 * 256) +
            bytes[3] / (256 * 256 * 256 * 256));
    }
    /**
     * Fisher-Yates shuffle of a 52-card deck using cursor-based HMAC byte stream.
     * One nonce per game. Returns array of card indices 0-51.
     * Consumes 51 * 4 = 204 bytes (~7 HMAC rounds).
     */
    fisherYatesShuffle(serverSeed, clientSeed, nonce) {
        const deck = Array.from({ length: 52 }, (_, i) => i);
        let cursor = 0;
        for (let i = 51; i >= 1; i--) {
            const bytes = this.hmacByteStream(serverSeed, clientSeed, nonce, cursor);
            cursor += 4;
            const float = this.bytesToFloat(bytes);
            const j = Math.floor(float * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    /**
     * Card index (0-51) to rank (1-13). A=1, 2=2, ..., K=13.
     */
    cardIndexToRank(idx) {
        return (idx % 13) + 1;
    }
    /**
     * Card index (0-51) to suit (0-3). 0=hearts, 1=diamonds, 2=clubs, 3=spades.
     */
    cardIndexToSuit(idx) {
        return Math.floor(idx / 13);
    }
    /**
     * Calculate hand total for v2 card indices (0-51).
     */
    calculateHandTotalV2(cards) {
        let total = 0;
        let aceCount = 0;
        for (const card of cards) {
            const rank = this.cardIndexToRank(card);
            const value = this.getBlackjackValue(rank);
            total += value;
            if (rank === 1)
                aceCount++;
        }
        while (total > 21 && aceCount > 0) {
            total -= 10;
            aceCount--;
        }
        return { total, hasAce: aceCount > 0 };
    }
    /**
     * Check if hand is a natural blackjack for v2 card indices (0-51).
     */
    isNaturalBlackjackV2(cards) {
        return cards.length === 2 && this.calculateHandTotalV2(cards).total === 21;
    }
    /**
     * Convert card value to blackjack value (1=Ace=11/1, 11-13=10)
     */
    getBlackjackValue(cardValue) {
        if (cardValue === 1)
            return 11; // Ace = 11 initially
        if (cardValue >= 11 && cardValue <= 13)
            return 10; // Face cards = 10
        return cardValue; // 2-10 = face value
    }
    /**
     * Calculate optimal hand total considering aces (standard blackjack).
     * Each ace counts as 11 until we bust, then we treat one ace as 1 (subtract 10); repeat per ace.
     * Accepts encoded cards (value*10+suit) or raw values 1-13.
     */
    calculateHandTotal(cards) {
        let total = 0;
        let aceCount = 0;
        for (const card of cards) {
            const rank = this.decodeCardValue(card);
            const value = this.getBlackjackValue(rank);
            total += value;
            if (rank === 1)
                aceCount++;
        }
        // Soften aces one at a time until total <= 21 or we've used all aces
        while (total > 21 && aceCount > 0) {
            total -= 10;
            aceCount--;
        }
        return { total, hasAce: aceCount > 0 };
    }
    /**
     * Check if hand is a natural blackjack
     */
    isNaturalBlackjack(cards) {
        return cards.length === 2 && this.calculateHandTotal(cards).total === 21;
    }
    /**
     * Encode a card as value*10 + suit for storage (value 1-13, suit 0-3).
     * 0=hearts, 1=diamonds, 2=clubs, 3=spades (red=0,1; black=2,3).
     */
    encodeCard(value, suit) {
        return value * 10 + (suit % 4);
    }
}
exports.ProvablyFairService = ProvablyFairService;
//# sourceMappingURL=provably-fair.service.js.map