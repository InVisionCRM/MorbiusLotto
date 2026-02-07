import crypto from 'crypto';
import { logger } from '../utils/logger';

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

export class ProvablyFairService {
  private readonly ALGORITHM = 'sha256';
  private readonly DIGEST_FORMAT = 'hex';

  /**
   * Generate a cryptographically secure random server seed
   */
  generateServerSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create HMAC hash of server seed for public verification
   */
  createServerSeedHash(serverSeed: string): string {
    return crypto.createHash(this.ALGORITHM).update(serverSeed).digest(this.DIGEST_FORMAT);
  }

  /**
   * Generate a provably fair random number using HMAC-SHA256
   */
  generateProvablyFairRandom(seeds: GameSeeds, min: number = 0, max: number = 100): ProvablyFairResult {
    const { serverSeed, clientSeed, nonce } = seeds;

    // Create HMAC with server seed as key and client seed + nonce as message
    const message = `${clientSeed}:${nonce}`;
    const hmac = crypto.createHmac(this.ALGORITHM, serverSeed);
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
  generateBlackjackRandoms(seeds: GameSeeds, numCards: number = 6): number[] {
    const results: number[] = [];

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
  generateBlackjackSuits(seeds: GameSeeds, startNonce: number, count: number): number[] {
    const results: number[] = [];
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
  decodeCardValue(card: number): number {
    if (card >= 10 && card <= 133) return Math.floor(card / 10);
    return card >= 1 && card <= 13 ? card : 1;
  }

  /**
   * Decode card to suit 0-3. Encoded cards are value*10+suit; legacy cards default to 0.
   */
  decodeCardSuit(card: number): number {
    if (card >= 10 && card <= 133) return card % 10;
    return 0;
  }

  /**
   * Generate dealer action (hit/stand) decision
   */
  generateDealerAction(seeds: GameSeeds, dealerTotal: number, hasAce: boolean): 'hit' | 'stand' {
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
  verifyProvablyFairResult(
    serverSeedHash: string,
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    expectedResult: number,
    min: number = 0,
    max: number = 100
  ): boolean {
    try {
      // Verify server seed hash matches
      const calculatedHash = this.createServerSeedHash(serverSeed);
      if (calculatedHash !== serverSeedHash) {
        logger.warn('Server seed hash verification failed', { calculatedHash, serverSeedHash });
        return false;
      }

      // Regenerate the result
      const seeds: GameSeeds = { serverSeed, clientSeed, nonce };
      const pfResult = this.generateProvablyFairRandom(seeds, min, max);

      // Check if result matches
      if (pfResult.result !== expectedResult) {
        logger.warn('Result verification failed', {
          expected: expectedResult,
          calculated: pfResult.result,
          serverSeed,
          clientSeed,
          nonce
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error verifying provably fair result:', error);
      return false;
    }
  }

  /**
   * Create a client seed commitment (hash of client seed for strategy commitment)
   */
  createClientSeedCommitment(clientSeed: string): string {
    return crypto.createHash(this.ALGORITHM).update(clientSeed).digest(this.DIGEST_FORMAT);
  }

  /**
   * Verify client seed against commitment
   */
  verifyClientSeedCommitment(commitment: string, clientSeed: string): boolean {
    const calculatedCommitment = this.createClientSeedCommitment(clientSeed);
    return calculatedCommitment === commitment;
  }

  /**
   * Generate a unique game identifier for verification
   */
  generateGameHash(serverSeedHash: string, clientSeed: string, nonce: number, betAmount: bigint, timestamp: number): string {
    // IMPORTANT:
    // - The client only knows the server seed *commitment* (hash) before betting.
    // - Therefore the gameHash must be derived from serverSeedHash (not serverSeed).
    // - Frontend and backend both use the exact colon-delimited format.
    const normalizedServerSeedHash = serverSeedHash.startsWith('0x') ? serverSeedHash.slice(2) : serverSeedHash;
    const data = `${normalizedServerSeedHash}:${clientSeed}:${nonce}:${betAmount.toString()}:${timestamp}`;
    return crypto.createHash(this.ALGORITHM).update(data).digest(this.DIGEST_FORMAT);
  }

  /**
   * Shuffle a deck using Fisher-Yates algorithm with provably fair randomness
   */
  shuffleDeck(seeds: GameSeeds, deckSize: number = 312): number[] {
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
  getBlackjackValue(cardValue: number): number {
    if (cardValue === 1) return 11; // Ace = 11 initially
    if (cardValue >= 11 && cardValue <= 13) return 10; // Face cards = 10
    return cardValue; // 2-10 = face value
  }

  /**
   * Calculate optimal hand total considering aces (standard blackjack).
   * Each ace counts as 11 until we bust, then we treat one ace as 1 (subtract 10); repeat per ace.
   * Accepts encoded cards (value*10+suit) or raw values 1-13.
   */
  calculateHandTotal(cards: number[]): { total: number; hasAce: boolean } {
    let total = 0;
    let aceCount = 0;

    for (const card of cards) {
      const rank = this.decodeCardValue(card);
      const value = this.getBlackjackValue(rank);
      total += value;
      if (rank === 1) aceCount++;
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
  isNaturalBlackjack(cards: number[]): boolean {
    return cards.length === 2 && this.calculateHandTotal(cards).total === 21;
  }

  /**
   * Encode a card as value*10 + suit for storage (value 1-13, suit 0-3).
   * 0=hearts, 1=diamonds, 2=clubs, 3=spades (red=0,1; black=2,3).
   */
  encodeCard(value: number, suit: number): number {
    return value * 10 + (suit % 4);
  }
}