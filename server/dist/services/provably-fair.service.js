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
     * Calculate optimal hand total considering aces
     */
    calculateHandTotal(cards) {
        let total = 0;
        let hasAce = false;
        for (const card of cards) {
            const value = this.getBlackjackValue(card);
            total += value;
            if (card === 1)
                hasAce = true; // Track aces
        }
        // Adjust for aces if total > 21
        if (hasAce && total > 21) {
            total -= 10; // Convert ace from 11 to 1
        }
        return { total, hasAce };
    }
    /**
     * Check if hand is a natural blackjack
     */
    isNaturalBlackjack(cards) {
        return cards.length === 2 && this.calculateHandTotal(cards).total === 21;
    }
}
exports.ProvablyFairService = ProvablyFairService;
//# sourceMappingURL=provably-fair.service.js.map