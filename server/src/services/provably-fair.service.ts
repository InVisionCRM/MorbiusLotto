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

    // Dealer stands on all 17s (S17)
    if (dealerTotal < 17) {
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

  // ============================================
  // V2 RNG: Fisher-Yates 52-card deck (Stake.com standard)
  // ============================================

  /**
   * HMAC byte stream — core primitive for Fisher-Yates shuffle.
   * Extracts 4 bytes from a cursor-indexed HMAC-SHA256 byte stream.
   * message = `${clientSeed}:${nonce}:${Math.floor(cursor / 32)}`
   * Returns 4 bytes starting at `cursor % 32`, handling 32-byte boundary crossing.
   */
  hmacByteStream(serverSeed: string, clientSeed: string, nonce: number, cursor: number): Buffer {
    const roundIndex = Math.floor(cursor / 32);
    const byteOffset = cursor % 32;

    const message = `${clientSeed}:${nonce}:${roundIndex}`;
    const hmacBuf = crypto.createHmac(this.ALGORITHM, serverSeed).update(message).digest();

    if (byteOffset + 4 <= 32) {
      // All 4 bytes within one HMAC round
      return hmacBuf.subarray(byteOffset, byteOffset + 4);
    }

    // Straddles boundary — get remaining bytes from next round
    const bytesFromCurrent = 32 - byteOffset;
    const nextMessage = `${clientSeed}:${nonce}:${roundIndex + 1}`;
    const nextHmacBuf = crypto.createHmac(this.ALGORITHM, serverSeed).update(nextMessage).digest();

    return Buffer.concat([
      hmacBuf.subarray(byteOffset, 32),
      nextHmacBuf.subarray(0, 4 - bytesFromCurrent),
    ]);
  }

  /**
   * Convert 4 bytes to a float in [0, 1) — unbiased mapping.
   * byte[0]/256 + byte[1]/256^2 + byte[2]/256^3 + byte[3]/256^4
   */
  bytesToFloat(bytes: Buffer | Uint8Array): number {
    return (
      bytes[0] / 256 +
      bytes[1] / (256 * 256) +
      bytes[2] / (256 * 256 * 256) +
      bytes[3] / (256 * 256 * 256 * 256)
    );
  }

  /**
   * Generate 6 distinct numbers in [1, 55] for Instant Lottery 6-of-55 (provably fair).
   * Uses Fisher-Yates over a pool of 55 slots (values 1–55) with HMAC-SHA256 byte stream.
   * Same message format as Blackjack: message = `${clientSeed}:${nonce}:${roundIndex}`.
   * Returns sorted [n1, n2, n3, n4, n5, n6] so contract and verifier get identical result.
   * Verification: given serverSeed, clientSeed, nonce — recompute with this algorithm and compare.
   */
  generate6of55WinningNumbers(serverSeed: string, clientSeed: string, nonce: number): [number, number, number, number, number, number] {
    const MIN = 1;
    const MAX = 55;
    const COUNT = 6;
    const pool = Array.from({ length: MAX }, (_, i) => i + MIN);
    let cursor = 0;
    for (let i = pool.length - 1; i >= 1; i--) {
      const bytes = this.hmacByteStream(serverSeed, clientSeed, nonce, cursor);
      cursor += 4;
      const float = this.bytesToFloat(bytes);
      const j = Math.floor(float * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const drawn = pool.slice(0, COUNT).sort((a, b) => a - b);
    return [drawn[0], drawn[1], drawn[2], drawn[3], drawn[4], drawn[5]];
  }

  /**
   * Draw 10 distinct Keno numbers in [1, 40] (Stake-style Keno) — provably fair.
   * Partial Fisher-Yates over a pool of 40 slots (values 1–40) using the same
   * HMAC-SHA256 byte stream as the 6-of-55 lottery and the blackjack deck
   * (message = `${clientSeed}:${nonce}:${roundIndex}`), then takes the first 10
   * shuffled slots. Returned in DRAW ORDER (not sorted) so a reveal animation can
   * replay them; Keno scoring is order-independent. Runs the standard partial
   * Fisher-Yates optimisation: 10 swaps fix the top 10 slots (a uniform sample of
   * 10 from 40), consuming 10 × 4 = 40 bytes of the HMAC stream.
   * Verification: given serverSeed, clientSeed, nonce — recompute with this exact
   * algorithm and compare the 10 numbers.
   */
  drawKenoNumbers(serverSeed: string, clientSeed: string, nonce: number): number[] {
    const MIN = 1;
    const MAX = 40;
    const DRAW = 10;
    const pool = Array.from({ length: MAX }, (_, i) => i + MIN);
    let cursor = 0;
    // Only need the top DRAW slots settled — shuffle from the high end down to
    // index (MAX - DRAW), each swap fixing one final position.
    for (let i = pool.length - 1; i >= MAX - DRAW; i--) {
      const bytes = this.hmacByteStream(serverSeed, clientSeed, nonce, cursor);
      cursor += 4;
      const float = this.bytesToFloat(bytes);
      const j = Math.floor(float * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(MAX - DRAW);
  }

  /**
   * Fisher-Yates shuffle of a 52-card deck using cursor-based HMAC byte stream.
   * One nonce per game. Returns array of card indices 0-51.
   * Consumes 51 * 4 = 204 bytes (~7 HMAC rounds).
   */
  fisherYatesShuffle(serverSeed: string, clientSeed: string, nonce: number): number[] {
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
  cardIndexToRank(idx: number): number {
    return (idx % 13) + 1;
  }

  /**
   * Card index (0-51) to suit (0-3). 0=hearts, 1=diamonds, 2=clubs, 3=spades.
   */
  cardIndexToSuit(idx: number): number {
    return Math.floor(idx / 13);
  }

  /**
   * Calculate hand total for v2 card indices (0-51).
   */
  calculateHandTotalV2(cards: number[]): { total: number; hasAce: boolean } {
    let total = 0;
    let aceCount = 0;

    for (const card of cards) {
      const rank = this.cardIndexToRank(card);
      const value = this.getBlackjackValue(rank);
      total += value;
      if (rank === 1) aceCount++;
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
  isNaturalBlackjackV2(cards: number[]): boolean {
    return cards.length === 2 && this.calculateHandTotalV2(cards).total === 21;
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