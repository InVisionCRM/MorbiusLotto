import { DatabaseService, Game, GameHand } from './database.service';
import { ProvablyFairService, GameSeeds } from './provably-fair.service';
import { TournamentService, TournamentState, TOURNAMENT_CONFIG } from './tournament.service';
import { logger } from '../utils/logger';

export interface Hand {
  id: string;
  cards: number[];
  total: number;
  hasAce: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  betAmount: bigint;
  result?: 'win' | 'loss' | 'push' | 'blackjack';
  payout: bigint;
  actions: any[];
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
}

export interface GameState {
  gameId: string;
  sessionId: string;
  playerHands: Hand[];
  dealerCards: number[];
  dealerTotal: number;
  dealerHasAce: boolean;
  status: 'waiting' | 'player_turn' | 'dealer_turn' | 'completed';
  totalBetAmount: bigint;
  totalPayout: bigint;
  actions: any[];
  dealerActions: any[];
  currentHandIndex: number;
  canSplit: boolean;
  isBlackjack: boolean;
  /** Perfect Pairs side bet result (first two cards). */
  perfectPairsResult?: PerfectPairsResult;
  /** Payout for Perfect Pairs (0 if no bet or no pair). */
  perfectPairsPayout?: bigint;
  /** Side bet amount (for display). */
  perfectPairsBetAmount?: bigint;
  /** RNG version: 2 = Fisher-Yates 52-card deck (card indices 0-51). */
  rngVersion?: number;
}

export interface CreateGameRequest {
  playerAddress: string;
  betAmount: bigint;
  /** Optional Perfect Pairs side bet (first two cards). Locked together with main bet. */
  perfectPairsBetAmount?: bigint;
  clientSeedCommitment?: string;
  gameHash?: string; // Optional game hash from frontend (for verification)
}

/** Perfect Pairs result for the first two player cards.
 *  V1 (infinite deck): 'perfect' = same rank + same suit.
 *  V2 (52-card deck):  'colored' = same rank + same color, 'mixed' = same rank + different color.
 *  'perfect' is impossible with a single 52-card deck (no duplicate cards).
 */
export type PerfectPairsResult = 'perfect' | 'colored' | 'mixed' | 'none';

export interface CreateTournamentGameRequest {
  playerAddress: string;
  betAmount: number; // Tournament chips (not MORBIUS)
  entryId: string;
  clientSeedCommitment?: string;
}

export interface TournamentGameState extends GameState {
  tournamentEntryId: string;
  tournamentChips: number;
  handsPlayed: number;
  handsRemaining: number;
  currentRank: number;
}

export interface PlayerActionRequest {
  gameId: string;
  action: 'hit' | 'stand' | 'double_down' | 'split';
  handIndex?: number; // For multi-hand games
  clientSeed?: string; // Revealed on first action
}

/** Perfect Pairs payout multipliers (stake returned on win).
 *  V1: perfect (same rank + suit) = 10:1.
 *  V2: colored (same rank + same color) = 12:1, mixed (same rank + different color) = 5:1.
 */
const PERFECT_PAIRS_PAYOUT_MULTIPLIER = 10; // v1 legacy
const COLORED_PAIR_PAYOUT_MULTIPLIER = 12;  // v2: same rank + same color (e.g. both red)
const MIXED_PAIR_PAYOUT_MULTIPLIER = 5;     // v2: same rank + different color

export class BlackjackGameService {
  private static readonly GAME_NONCE_MULTIPLIER = 10_000_000; // avoid nonce collisions between games
  private tournamentService?: TournamentService;

  constructor(
    private dbService: DatabaseService,
    private pfService: ProvablyFairService
  ) {}

  /**
   * Set the tournament service (optional, for tournament mode support)
   */
  setTournamentService(tournamentService: TournamentService): void {
    this.tournamentService = tournamentService;
  }

  private getGameBaseNonce(gameNumber: number): number {
    return gameNumber * BlackjackGameService.GAME_NONCE_MULTIPLIER;
  }

  /** Resolve Blackjack fee % and fee wallet from admin config + env. Fee applies to profit only. */
  private async getBlackjackFeeConfig(): Promise<{ feePercent: number; feeWallet: string | null }> {
    let feePercent = 0;
    try {
      const config = await this.dbService.getAdminGameConfig();
      const raw = config.blackjack_fee_percent?.trim();
      if (raw !== undefined && raw !== '') {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 100) feePercent = n;
      }
    } catch (err) {
      logger.warn('Failed to load blackjack_fee_percent from admin config', { error: err });
    }
    const feeWallet = (process.env.BLACKJACK_FEE_WALLET as string | undefined)?.trim() || null;
    if (feePercent > 0 && !feeWallet) {
      logger.warn('blackjack_fee_percent is set but BLACKJACK_FEE_WALLET is not; fee will not be collected');
    }
    return { feePercent, feeWallet };
  }

  /** Apply fee on profit (if configured); credit player (payout - fee) and fee wallet (fee). Returns fee amount applied. */
  private async creditPayoutWithFee(
    playerAddress: string,
    totalStake: bigint,
    grossPayout: bigint
  ): Promise<bigint> {
    if (grossPayout <= 0n) return 0n;
    const { feePercent, feeWallet } = await this.getBlackjackFeeConfig();
    const profit = grossPayout > totalStake ? grossPayout - totalStake : 0n;
    if (feePercent > 0 && feeWallet && profit > 0n) {
      const feeAmount = (profit * BigInt(feePercent)) / 100n;
      const playerGets = grossPayout - feeAmount;
      await this.dbService.addPlayerBalance(playerAddress, playerGets);
      await this.dbService.addBalanceToAddress(feeWallet, feeAmount);
      logger.debug('Blackjack payout with fee', {
        playerAddress,
        grossPayout: grossPayout.toString(),
        feePercent,
        feeAmount: feeAmount.toString(),
        playerGets: playerGets.toString(),
      });
      return feeAmount;
    }
    await this.dbService.addPlayerBalance(playerAddress, grossPayout);
    return 0n;
  }

  private ensureSessionSeed(session: any): { serverSeed: string; serverSeedHash: string } {
    // game_sessions now stores server_seed (secret) + server_seed_hash (commitment).
    // Older rows may have only the hash; we self-heal by generating a new seed and updating the session.
    if (session?.server_seed && typeof session.server_seed === 'string' && session.server_seed.length > 0) {
      return { serverSeed: session.server_seed, serverSeedHash: session.server_seed_hash };
    }
    const serverSeed = this.pfService.generateServerSeed();
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    return { serverSeed, serverSeedHash };
  }

  /**
   * Create a new blackjack game
   */
  async createGame(request: CreateGameRequest): Promise<GameState> {
    try {
      // Get or create player
      const player = await this.dbService.getOrCreatePlayer(request.playerAddress);

      // Get or create active session
      let session = await this.dbService.getActiveSession(player.id);
      if (!session) {
        const serverSeed = this.pfService.generateServerSeed();
        const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);

        session = await this.dbService.createGameSession(player.id, serverSeed, serverSeedHash);
      }

      // Ensure session has a real server seed (self-heal older DB rows)
      const ensured = this.ensureSessionSeed(session);
      if (!session.server_seed) {
        await this.dbService.setSessionServerSeed(session.id, ensured.serverSeed, ensured.serverSeedHash);
        session = { ...session, server_seed: ensured.serverSeed, server_seed_hash: ensured.serverSeedHash };
      }

      const clientSeed = request.clientSeedCommitment || 'default';
      const perfectPairsBet = request.perfectPairsBetAmount ?? 0n;
      const totalStake = request.betAmount + perfectPairsBet;

      // Generate per-game nonce (Stake-style: stable seeds, increment nonce)
      const gameNumber = session.game_count + 1;
      const baseNonce = this.getGameBaseNonce(gameNumber);

      // If gameHash is provided, verify it matches (hash uses total stake for contract lock)
      if (request.gameHash) {
        const timestamp = Math.floor(Date.now() / 1000);
        const receivedHash = request.gameHash.startsWith('0x')
          ? request.gameHash.slice(2).toLowerCase()
          : request.gameHash.toLowerCase();

        const expectedHash = this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, totalStake, timestamp).toLowerCase();
        const hashMatches = expectedHash === receivedHash ||
          this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, totalStake, timestamp - 60).toLowerCase() === receivedHash ||
          this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, totalStake, timestamp + 60).toLowerCase() === receivedHash;

        if (!hashMatches) {
          logger.warn('Game hash mismatch', {
            expected: expectedHash,
            received: receivedHash,
            gameNumber,
            totalStake: totalStake.toString(),
            timestamp
          });
        } else {
          logger.debug('Game hash verified', { gameHash: receivedHash });
        }
      }

      // V2: Fisher-Yates 52-card deck — gameNumber IS the nonce
      const shuffledDeck = this.pfService.fisherYatesShuffle(session.server_seed!, clientSeed, gameNumber);
      // Deal order: player, dealer, player, dealer
      const initialPlayerCards = [shuffledDeck[0], shuffledDeck[2]];
      const dealerCards = [shuffledDeck[1], shuffledDeck[3]];
      let rngCounter = 4; // deck position (next card index)

      // Perfect Pairs: classify first two player cards (v2)
      const perfectPairsResult = this.classifyPerfectPairV2(initialPlayerCards[0], initialPlayerCards[1]);
      const perfectPairsPayout = this.getPerfectPairsPayout(perfectPairsBet, perfectPairsResult);

      // Create initial hand (v2: use card index helpers)
      const playerHandTotal = this.pfService.calculateHandTotalV2(initialPlayerCards);
      const initialHand: Hand = {
        id: '', // Will be set when created in DB
        cards: initialPlayerCards,
        total: playerHandTotal.total,
        hasAce: playerHandTotal.hasAce,
        isBlackjack: this.pfService.isNaturalBlackjackV2(initialPlayerCards),
        isBust: false,
        betAmount: request.betAmount,
        payout: 0n,
        actions: [],
        canHit: true,
        canStand: true,
        canDoubleDown: true,
        canSplit: this.canSplitV2(initialPlayerCards)
      };

      // Calculate dealer visible total (v2)
      const dealerVisibleHand = this.pfService.calculateHandTotalV2([dealerCards[0]]);
      const dealerBlackjack = this.pfService.isNaturalBlackjackV2(dealerCards);

      // Determine game status
      let status: GameState['status'] = 'player_turn';
      let result: Game['result'];

      if (initialHand.isBlackjack && dealerBlackjack) {
        status = 'completed';
        result = 'push';
        initialHand.result = 'push';
        initialHand.payout = request.betAmount;
      } else if (initialHand.isBlackjack) {
        status = 'completed';
        result = 'blackjack';
        initialHand.result = 'blackjack';
        // 3:2 payout for natural blackjack: 2.5x total (bet + 1.5x winnings)
        initialHand.payout = (request.betAmount * 5n) / 2n;
      } else if (dealerBlackjack) {
        status = 'completed';
        result = 'loss';
        initialHand.result = 'loss';
        initialHand.payout = 0n;
      }

      // Deduct total stake (main + Perfect Pairs) from off-chain balance
      await this.dbService.deductPlayerBalance(request.playerAddress, totalStake);
      logger.debug('Deducted stake from balance', {
        playerAddress: request.playerAddress,
        totalStake: totalStake.toString(),
        perfectPairsBet: perfectPairsBet.toString()
      });

      const immediatePayout = initialHand.payout + perfectPairsPayout;

      // Create game record (v2: rng_version = 2, rng_counter = deck position)
      const game = await this.dbService.createGame(session.id, {
        game_number: gameNumber,
        total_bet_amount: request.betAmount,
        dealer_cards: dealerCards,
        dealer_total: this.pfService.calculateHandTotalV2(dealerCards).total,
        result,
        total_payout: immediatePayout,
        client_seed_commitment: clientSeed,
        hand_count: 1,
        current_hand_index: 0,
        rng_counter: rngCounter,
        perfect_pairs_bet_amount: perfectPairsBet,
        perfect_pairs_payout: perfectPairsPayout,
        rng_version: 2,
      });

      // Create initial hand record
      const gameHand = await this.dbService.createGameHand(game.id, {
        hand_index: 0,
        cards: initialHand.cards,
        total: initialHand.total,
        has_ace: initialHand.hasAce,
        is_blackjack: initialHand.isBlackjack,
        is_bust: initialHand.isBust,
        bet_amount: initialHand.betAmount,
        result: initialHand.result,
        payout: initialHand.payout
      });

      initialHand.id = gameHand.id;

      // Update session stats for game start (increments game_count; use total stake wagered)
      await this.dbService.updateSessionStats(session.id, totalStake, 0n, true);

      // If the game completed immediately, record profit + credit payout (main + Perfect Pairs) + reveal server seed
      if (result) {
        if (immediatePayout > 0n) {
          const feeApplied = await this.creditPayoutWithFee(request.playerAddress, totalStake, immediatePayout);
          const profit = immediatePayout > totalStake ? immediatePayout - totalStake : 0n;
          if (profit > 0n) {
            await this.dbService.updateSessionStats(session.id, 0n, profit - feeApplied, false);
          }
          logger.debug('Added winnings to balance', {
            playerAddress: request.playerAddress,
            payout: immediatePayout.toString(),
            perfectPairsPayout: perfectPairsPayout.toString()
          });
        }
        await this.dbService.revealServerSeed(game.id, session.server_seed_hash, session.server_seed!);

        // Rotate server seed for next game (per-game isolation)
        const newServerSeed = this.pfService.generateServerSeed();
        const newServerSeedHash = this.pfService.createServerSeedHash(newServerSeed);
        await this.dbService.setSessionServerSeed(session.id, newServerSeed, newServerSeedHash);
      }

      const dealerFullHand = this.pfService.calculateHandTotalV2(dealerCards);
      const gameState: GameState = {
        gameId: game.id,
        sessionId: session.id,
        playerHands: [initialHand],
        dealerCards: status === 'completed' ? dealerCards : dealerCards.slice(0, 1),
        dealerTotal: status === 'completed' ? dealerFullHand.total : dealerVisibleHand.total,
        dealerHasAce: status === 'completed' ? dealerFullHand.hasAce : dealerVisibleHand.hasAce,
        status,
        totalBetAmount: request.betAmount,
        totalPayout: immediatePayout,
        actions: [],
        dealerActions: [],
        currentHandIndex: 0,
        canSplit: initialHand.canSplit && status === 'player_turn',
        isBlackjack: initialHand.isBlackjack,
        perfectPairsResult: perfectPairsResult !== 'none' ? perfectPairsResult : undefined,
        perfectPairsPayout: perfectPairsPayout > 0n ? perfectPairsPayout : undefined,
        perfectPairsBetAmount: perfectPairsBet > 0n ? perfectPairsBet : undefined,
        rngVersion: 2,
      };

      logger.info('Game created', {
        gameId: game.id,
        playerAddress: request.playerAddress,
        betAmount: request.betAmount.toString(),
        hands: gameState.playerHands.length,
        status: gameState.status
      });

      return gameState;

    } catch (error) {
      logger.error('Error creating game:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create game: ${errorMessage}`);
    }
  }

  /**
   * Split value: 10/J/Q/K (ranks 10-13) all map to 10; 2-9 and Ace use rank.
   * Standard blackjack allows splitting any two 10-value cards (e.g. King+Jack).
   */
  private getSplitValue(rank: number): number {
    if (rank >= 10 && rank <= 13) return 10;
    return rank;
  }

  /**
   * Check if hand can be split (same blackjack value: 10/J/Q/K interchangeable)
   */
  private canSplit(cards: number[]): boolean {
    if (cards.length !== 2) return false;
    const r1 = this.pfService.decodeCardValue(cards[0]);
    const r2 = this.pfService.decodeCardValue(cards[1]);
    return this.getSplitValue(r1) === this.getSplitValue(r2);
  }

  /**
   * Classify Perfect Pairs: exact match only (same rank AND same suit).
   */
  private classifyPerfectPair(card1: number, card2: number): PerfectPairsResult {
    const v1 = this.pfService.decodeCardValue(card1);
    const v2 = this.pfService.decodeCardValue(card2);
    if (v1 !== v2) return 'none';
    const s1 = this.pfService.decodeCardSuit(card1);
    const s2 = this.pfService.decodeCardSuit(card2);
    return s1 === s2 ? 'perfect' : 'none';
  }

  /**
   * Check if hand can be split — v2 card indices (0-51): same blackjack value (10/J/Q/K interchangeable)
   */
  private canSplitV2(cards: number[]): boolean {
    if (cards.length !== 2) return false;
    const r1 = this.pfService.cardIndexToRank(cards[0]);
    const r2 = this.pfService.cardIndexToRank(cards[1]);
    return this.getSplitValue(r1) === this.getSplitValue(r2);
  }

  /**
   * Classify Perfect Pairs for v2 card indices (0-51).
   * With a single 52-card deck, same rank+suit is impossible.
   * Suits: 0=hearts(red), 1=diamonds(red), 2=clubs(black), 3=spades(black).
   * Colored pair = same rank + same color. Mixed pair = same rank + different color.
   */
  private classifyPerfectPairV2(card1: number, card2: number): PerfectPairsResult {
    const r1 = this.pfService.cardIndexToRank(card1);
    const r2 = this.pfService.cardIndexToRank(card2);
    if (r1 !== r2) return 'none';
    const s1 = this.pfService.cardIndexToSuit(card1);
    const s2 = this.pfService.cardIndexToSuit(card2);
    // Color: suits 0,1 are red; suits 2,3 are black
    const color1 = s1 < 2 ? 'red' : 'black';
    const color2 = s2 < 2 ? 'red' : 'black';
    return color1 === color2 ? 'colored' : 'mixed';
  }

  private getPerfectPairsPayout(bet: bigint, result: PerfectPairsResult): bigint {
    if (result === 'none' || bet <= 0n) return 0n;
    if (result === 'perfect') return bet + bet * BigInt(PERFECT_PAIRS_PAYOUT_MULTIPLIER); // v1: 10:1
    if (result === 'colored') return bet + bet * BigInt(COLORED_PAIR_PAYOUT_MULTIPLIER); // v2: 12:1
    if (result === 'mixed') return bet + bet * BigInt(MIXED_PAIR_PAYOUT_MULTIPLIER);     // v2: 5:1
    return 0n;
  }

  /** Draw one encoded card (value*10+suit), consumes 2 nonces. */
  private drawEncodedCard(seeds: GameSeeds, nonce: number): { card: number; nextNonce: number } {
    const valueRandoms = this.pfService.generateBlackjackRandoms({ ...seeds, nonce }, 1);
    const suitRandoms = this.pfService.generateBlackjackSuits(seeds, nonce + 1, 1);
    const card = this.pfService.encodeCard(valueRandoms[0], suitRandoms[0]);
    return { card, nextNonce: nonce + 2 };
  }

  /**
   * Handle player action
   */
  async handlePlayerAction(request: PlayerActionRequest): Promise<GameState> {
    try {
      const game = await this.dbService.getGame(request.gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.result !== 'ongoing') {
        throw new Error('Game already completed');
      }

      // game.session_id is the session UUID, not a player_id
      const session = await this.dbService.getSessionById(game.session_id);
      if (!session) {
        throw new Error('Session not found');
      }

      // Ensure session seed exists (older rows may not have server_seed populated)
      if (!session.server_seed) {
        const serverSeed = this.pfService.generateServerSeed();
        const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
        await this.dbService.setSessionServerSeed(session.id, serverSeed, serverSeedHash);
        session.server_seed = serverSeed;
        session.server_seed_hash = serverSeedHash;
      }

      // Get current hands
      const gameHands = await this.dbService.getGameHands(request.gameId);
      logger.info('Loaded game hands from DB', {
        gameId: request.gameId,
        handCount: gameHands.length,
        hands: gameHands.map((gh, idx) => ({
          idx,
          id: gh.id,
          actions: gh.actions,
          is_bust: gh.is_bust
        }))
      });
      const rngVersion = Number(game.rng_version ?? 1);
      const playerHands: Hand[] = gameHands.map(gh => {
        const actions = gh.actions || [];
        const hasStandAction = actions.some((a: any) => a.type === 'stand');
        const hasDoubleDownAction = actions.some((a: any) => a.type === 'double_down');
        const isHandComplete = gh.is_bust || hasStandAction || hasDoubleDownAction;
        logger.info('Processing hand from DB', {
          handId: gh.id,
          actionsTypes: actions.map((a: any) => a.type),
          hasStandAction,
          hasDoubleDownAction,
          is_bust: gh.is_bust,
          isHandComplete,
          canHit: !isHandComplete
        });

        const canSplitHand = rngVersion === 2
          ? this.canSplitV2(gh.cards)
          : this.canSplit(gh.cards);

        return {
          id: gh.id,
          cards: gh.cards,
          total: gh.total || 0,
          hasAce: gh.has_ace,
          isBlackjack: gh.is_blackjack,
          isBust: gh.is_bust,
          betAmount: gh.bet_amount,
          result: gh.result as any,
          payout: gh.payout,
          actions,
          canHit: !isHandComplete,
          canStand: !isHandComplete,
          canDoubleDown: !isHandComplete && gh.cards.length === 2,
          canSplit: !isHandComplete && canSplitHand
        };
      });

      // Use nullish coalescing to handle handIndex=0 correctly
      const handIndex = request.handIndex ?? game.current_hand_index ?? 0;
      const currentHand = playerHands[handIndex];

      logger.info('Selected hand for action', {
        gameId: request.gameId,
        action: request.action,
        requestHandIndex: request.handIndex,
        gameCurrentHandIndex: game.current_hand_index,
        resolvedHandIndex: handIndex,
        handFound: !!currentHand,
        handCanHit: currentHand?.canHit,
        handCanStand: currentHand?.canStand
      });

      if (!currentHand) {
        throw new Error('Hand not found');
      }

      // Validate that the hand can still be acted upon
      if (!currentHand.canHit && !currentHand.canStand) {
        logger.warn('Attempted action on completed hand', {
          gameId: request.gameId,
          action: request.action,
          handIndex,
          handId: currentHand.id
        });
        throw new Error('This hand has already been completed');
      }

      const clientSeed = game.client_seed_commitment || 'default';
      const serverSeed = session.server_seed!;
      const rngCounter = Number(game.rng_counter ?? 0);

      if (rngVersion === 2) {
        // V2: re-derive shuffled deck, use deck position
        const deck = this.pfService.fisherYatesShuffle(serverSeed, clientSeed, game.game_number);
        let deckPosition = rngCounter;

        if (request.action === 'split') {
          return this.handleSplitV2(request.gameId, game, playerHands, handIndex, deck, deckPosition);
        } else {
          return this.handleHandActionV2(request.gameId, game, playerHands, handIndex, request.action, deck, deckPosition);
        }
      } else {
        // V1: legacy nonce-based drawing
        const baseNonce = this.getGameBaseNonce(game.game_number);
        const gameSeeds: GameSeeds = {
          serverSeed,
          clientSeed,
          nonce: baseNonce + rngCounter,
        };

        if (request.action === 'split') {
          return this.handleSplit(request.gameId, game, playerHands, handIndex, gameSeeds);
        } else {
          return this.handleHandAction(request.gameId, game, playerHands, handIndex, request.action, gameSeeds);
        }
      }

    } catch (error) {
      logger.error('Error handling player action:', error);
      throw error;
    }
  }

  /**
   * Handle splitting a hand
   */
  private async handleSplit(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    handIndex: number,
    gameSeeds: GameSeeds
  ): Promise<GameState> {
    const handToSplit = playerHands[handIndex];

    if (!this.canSplit(handToSplit.cards)) {
      throw new Error('Cannot split this hand');
    }

    // Check balance FIRST before making any state changes
    const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
    const currentBalance = await this.dbService.getPlayerBalance(playerAddress);
    if (currentBalance < handToSplit.betAmount) {
      throw new Error(`Insufficient balance to split. Need ${handToSplit.betAmount.toString()}, have ${currentBalance.toString()}`);
    }

    // Create two new hands from the split
    const card1 = [handToSplit.cards[0]];
    const card2 = [handToSplit.cards[1]];

    const baseNonce = this.getGameBaseNonce(game.game_number);
    const draw1 = this.drawEncodedCard(gameSeeds, gameSeeds.nonce);
    const draw2 = this.drawEncodedCard(gameSeeds, draw1.nextNonce);
    card1.push(draw1.card);
    card2.push(draw2.card);
    const nextRngCounter = draw2.nextNonce - baseNonce;

    // Create new hands
    const hand1: Hand = {
      id: '',
      cards: card1,
      total: this.pfService.calculateHandTotal(card1).total,
      hasAce: this.pfService.calculateHandTotal(card1).hasAce,
      isBlackjack: false,
      isBust: false,
      betAmount: handToSplit.betAmount,
      payout: 0n,
      actions: [{ type: 'split', timestamp: Date.now(), nonce1: gameSeeds.nonce, nonce2: draw1.nextNonce, cards: [draw1.card, draw2.card] }],
      canHit: true,
      canStand: true,
      canDoubleDown: true,
      canSplit: false
    };

    const hand2: Hand = {
      ...hand1,
      cards: card2,
      total: this.pfService.calculateHandTotal(card2).total,
      hasAce: this.pfService.calculateHandTotal(card2).hasAce
    };

    // Update total bet amount
    const totalBetAmount = game.total_bet_amount + handToSplit.betAmount;

    // Deduct additional bet for split hand from off-chain balance (balance already validated above)
    await this.dbService.deductPlayerBalance(playerAddress, handToSplit.betAmount);
    logger.debug('Deducted split bet from balance', {
      playerAddress,
      splitBetAmount: handToSplit.betAmount.toString()
    });

    // Session stats: add extra bet (do NOT increment game_count)
    await this.dbService.updateSessionStats(game.session_id, handToSplit.betAmount, 0n, false);
    
    // Persist split:
    // - Reuse the existing hand row for hand1 (so we don't create duplicate hand_index entries)
    // - Create a new row for hand2
    hand1.id = handToSplit.id;
    await this.dbService.updateGameHand(handToSplit.id, {
      cards: hand1.cards,
      total: hand1.total,
      has_ace: hand1.hasAce,
      is_blackjack: false,
      is_bust: false,
      actions: hand1.actions
    });

    const gameHand2 = await this.dbService.createGameHand(gameId, {
      hand_index: playerHands.length,
      cards: hand2.cards,
      total: hand2.total,
      has_ace: hand2.hasAce,
      is_blackjack: false,
      is_bust: false,
      bet_amount: hand2.betAmount,
      actions: hand2.actions
    });

    hand2.id = gameHand2.id;

    // Replace the original hand with the two new hands
    playerHands.splice(handIndex, 1, hand1, hand2);

    // Update game with new hand count and total bet
    await this.dbService.updateGame(gameId, {
      hand_count: playerHands.length,
      total_bet_amount: totalBetAmount,
      current_hand_index: handIndex,
      rng_counter: nextRngCounter,
    });

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards: game.dealer_cards.slice(0, 1), // Show only first dealer card
      dealerTotal: this.pfService.calculateHandTotal([game.dealer_cards[0]]).total,
      dealerHasAce: this.pfService.calculateHandTotal([game.dealer_cards[0]]).hasAce,
      status: 'player_turn',
      totalBetAmount,
      totalPayout: 0n,
      actions: [],
      dealerActions: [],
      currentHandIndex: handIndex,
      canSplit: false,
      isBlackjack: false
    };
  }

  /**
   * Handle action on a specific hand
   */
  private async handleHandAction(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    handIndex: number,
    action: 'hit' | 'stand' | 'double_down',
    gameSeeds: GameSeeds
  ): Promise<GameState> {
    const currentHand = playerHands[handIndex];
    const baseNonce = this.getGameBaseNonce(game.game_number);
    let rngCounter = gameSeeds.nonce - baseNonce;

    if (action === 'hit') {
      const nonceUsed = baseNonce + rngCounter;
      const { card, nextNonce } = this.drawEncodedCard({ ...gameSeeds, nonce: nonceUsed }, nonceUsed);
      rngCounter = nextNonce - baseNonce;
      currentHand.cards.push(card);
      currentHand.actions.push({ type: 'hit', card, nonce: nonceUsed, timestamp: Date.now() });

      const handTotal = this.pfService.calculateHandTotal(currentHand.cards);
      currentHand.total = handTotal.total;
      currentHand.hasAce = handTotal.hasAce;

      // Check for bust
      if (currentHand.total > 21) {
        currentHand.isBust = true;
        currentHand.result = 'loss';
        currentHand.canHit = false;
        currentHand.canStand = false;
        currentHand.canDoubleDown = false;
      }

      // Update hand in database
      await this.dbService.updateGameHand(currentHand.id, {
        cards: currentHand.cards,
        total: currentHand.total,
        has_ace: currentHand.hasAce,
        is_bust: currentHand.isBust,
        result: currentHand.result,
        actions: currentHand.actions
      });
      await this.dbService.updateGame(gameId, { rng_counter: rngCounter });

    } else if (action === 'stand') {
      currentHand.actions.push({ type: 'stand', timestamp: Date.now() });
      currentHand.canHit = false;
      currentHand.canStand = false;
      currentHand.canDoubleDown = false;

      await this.dbService.updateGameHand(currentHand.id, {
        actions: currentHand.actions
      });

    } else if (action === 'double_down') {
      if (currentHand.cards.length !== 2) {
        throw new Error('Can only double down on first two cards');
      }

      // Check balance FIRST before making any state changes
      const originalBet = currentHand.betAmount;
      const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
      const currentBalance = await this.dbService.getPlayerBalance(playerAddress);
      if (currentBalance < originalBet) {
        throw new Error(`Insufficient balance to double down. Need ${originalBet.toString()}, have ${currentBalance.toString()}`);
      }

      // Double the bet (only after balance check passes)
      currentHand.betAmount *= 2n;

      // Deal one more card
      const nonceUsed = baseNonce + rngCounter;
      const randoms = this.pfService.generateBlackjackRandoms({ ...gameSeeds, nonce: nonceUsed }, 1);
      rngCounter += 1;
      currentHand.cards.push(randoms[0]);
      currentHand.actions.push({ type: 'double_down', card: randoms[0], nonce: nonceUsed, timestamp: Date.now() });

      const handTotal = this.pfService.calculateHandTotal(currentHand.cards);
      currentHand.total = handTotal.total;
      currentHand.hasAce = handTotal.hasAce;

      // Check for bust
      if (currentHand.total > 21) {
        currentHand.isBust = true;
        currentHand.result = 'loss';
      }

      currentHand.canHit = false;
      currentHand.canStand = false;
      currentHand.canDoubleDown = false;

      // Update total bet amount
      const totalBetAmount = game.total_bet_amount + originalBet;

      // Deduct additional bet for double down from off-chain balance (balance already validated above)
      await this.dbService.deductPlayerBalance(playerAddress, originalBet);
      logger.debug('Deducted double down bet from balance', {
        playerAddress,
        doubleDownAmount: originalBet.toString()
      });

      // Session stats: add extra bet (do NOT increment game_count)
      await this.dbService.updateSessionStats(game.session_id, originalBet, 0n, false);

      await this.dbService.updateGame(gameId, { total_bet_amount: totalBetAmount, rng_counter: rngCounter });
      await this.dbService.updateGameHand(currentHand.id, {
        cards: currentHand.cards,
        total: currentHand.total,
        has_ace: currentHand.hasAce,
        is_bust: currentHand.isBust,
        bet_amount: currentHand.betAmount,
        result: currentHand.result,
        actions: currentHand.actions
      });

      // keep in-memory game totals in sync for response below
      game.total_bet_amount = totalBetAmount;
    }

    // Check if all hands are completed
    logger.info('Checking for active hands', {
      gameId,
      playerHands: playerHands.map((h, idx) => ({
        idx,
        id: h.id,
        canHit: h.canHit,
        canStand: h.canStand,
        actionsTypes: h.actions?.map((a: any) => a.type) || []
      }))
    });
    const activeHands = playerHands.filter(hand => hand.canHit || hand.canStand);
    logger.info('Active hands result', {
      gameId,
      activeCount: activeHands.length,
      activeHandIds: activeHands.map(h => h.id)
    });
    if (activeHands.length === 0) {
      // All hands completed, dealer plays
      logger.info('All hands completed, triggering dealer play', { gameId });
      const nextSeeds: GameSeeds = { ...gameSeeds, nonce: baseNonce + rngCounter };
      return this.playDealerAndComplete(gameId, game, playerHands, nextSeeds);
    }

    // Move to next active hand
    const nextHandIndex = playerHands.findIndex(hand => hand.canHit || hand.canStand);
    logger.info('Moving to next active hand', { gameId, nextHandIndex, currentHandIndex: handIndex });

    // Persist current_hand_index to database so next action uses correct hand
    if (nextHandIndex !== handIndex) {
      await this.dbService.updateGame(gameId, { current_hand_index: nextHandIndex });
    }

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      // SECURITY: Only send visible dealer card during player turn to prevent cheating
      dealerCards: game.dealer_cards.slice(0, 1),
      dealerTotal: this.pfService.calculateHandTotal([game.dealer_cards[0]]).total,
      dealerHasAce: this.pfService.calculateHandTotal([game.dealer_cards[0]]).hasAce,
      status: 'player_turn',
      totalBetAmount: game.total_bet_amount,
      totalPayout: 0n,
      actions: [],
      dealerActions: [],
      currentHandIndex: nextHandIndex,
      canSplit: false,
      isBlackjack: false
    };
  }

  /**
   * Play dealer turn and complete the game
   */
  private async playDealerAndComplete(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    gameSeeds: GameSeeds
  ): Promise<GameState> {
    const dealerCards = [...game.dealer_cards];
    const dealerActions: any[] = [];
    const baseNonce = this.getGameBaseNonce(game.game_number);
    let nextNonce = gameSeeds.nonce; // already includes baseNonce + rng_counter

    // Dealer hits on soft 17
    while (true) {
      const dealerHand = this.pfService.calculateHandTotal(dealerCards);

      if (dealerHand.total >= 17 && !(dealerHand.total === 17 && dealerHand.hasAce)) {
        dealerActions.push({ type: 'stand', timestamp: Date.now() });
        break;
      }

      const nonceUsed = nextNonce;
      const { card, nextNonce: next } = this.drawEncodedCard({ ...gameSeeds, nonce: nonceUsed }, nonceUsed);
      nextNonce = next;
      dealerCards.push(card);
      dealerActions.push({
        type: 'hit',
        card,
        nonce: nonceUsed,
        timestamp: Date.now()
      });
    }

    const finalDealerTotal = this.pfService.calculateHandTotal(dealerCards).total;
    let totalPayout = 0n;

    // Calculate results for each hand
    for (const hand of playerHands) {
      // Never overwrite natural blackjack (3:2 payout) - should not reach here for immediate-completion games
      if (hand.result === 'blackjack' && hand.isBlackjack) {
        hand.payout = (hand.betAmount * 5n) / 2n; // 3:2 = 2.5x total
      } else if (hand.isBust) {
        hand.result = 'loss';
        hand.payout = 0n;
      } else if (finalDealerTotal > 21) {
        // Dealer bust
        hand.result = 'win';
        hand.payout = hand.betAmount * 2n;
      } else if (hand.total > finalDealerTotal) {
        hand.result = 'win';
        hand.payout = hand.betAmount * 2n;
      } else if (hand.total < finalDealerTotal) {
        hand.result = 'loss';
        hand.payout = 0n;
      } else {
        hand.result = 'push';
        hand.payout = hand.betAmount;
      }

      totalPayout += hand.payout;

      // Update hand in database
      await this.dbService.updateGameHand(hand.id, {
        result: hand.result,
        payout: hand.payout,
        completed_at: new Date()
      });
    }

    // Include Perfect Pairs payout in total (result was set at game creation)
    const perfectPairsPayout = game.perfect_pairs_payout ?? 0n;
    const totalPayoutWithSideBet = totalPayout + perfectPairsPayout;
    const firstHandInitialCards = playerHands[0]?.cards?.slice(0, 2) ?? [];
    const perfectPairsResult: PerfectPairsResult | undefined = firstHandInitialCards.length === 2
      ? this.classifyPerfectPair(playerHands[0].cards[0], playerHands[0].cards[1])
      : undefined;

    // Determine overall game result (win if any hand won, loss if all lost, push if all pushed)
    const hasWin = playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
    const hasLoss = playerHands.some(h => h.result === 'loss');
    const allPush = playerHands.every(h => h.result === 'push');
    const overallResult: Game['result'] = hasWin ? 'win' : allPush ? 'push' : 'loss';

    const totalStakeForGame = game.total_bet_amount + (game.perfect_pairs_bet_amount ?? 0n);

    // Update game
    const rngCounter = nextNonce - baseNonce;
    await this.dbService.updateGame(gameId, {
      dealer_cards: dealerCards,
      dealer_total: finalDealerTotal,
      result: overallResult,
      total_payout: totalPayoutWithSideBet,
      dealer_actions: dealerActions,
      rng_counter: rngCounter,
      completed_at: new Date()
    });

    // Add winnings to off-chain balance (main hand(s) + Perfect Pairs), applying fee on profit if configured
    if (totalPayoutWithSideBet > 0n) {
      const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
      const feeApplied = await this.creditPayoutWithFee(playerAddress, totalStakeForGame, totalPayoutWithSideBet);
      logger.debug('Added game winnings to balance', {
        playerAddress,
        totalPayout: totalPayoutWithSideBet.toString(),
        perfectPairsPayout: perfectPairsPayout.toString(),
        gameId
      });

      // Update session win stats (net profit after fee; do NOT increment game_count)
      const profit = totalPayoutWithSideBet > totalStakeForGame ? totalPayoutWithSideBet - totalStakeForGame : 0n;
      if (profit > 0n) {
        await this.dbService.updateSessionStats(game.session_id, 0n, profit - feeApplied, false);
      }
    }

    // Reveal server seed commitment for verification
    const session = await this.dbService.getSessionById(game.session_id);
    if (session?.server_seed) {
      await this.dbService.revealServerSeed(gameId, session.server_seed_hash, session.server_seed);

      // Rotate server seed for next game (per-game isolation)
      const newServerSeed = this.pfService.generateServerSeed();
      const newServerSeedHash = this.pfService.createServerSeedHash(newServerSeed);
      await this.dbService.setSessionServerSeed(game.session_id, newServerSeed, newServerSeedHash);
    }

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards,
      dealerTotal: finalDealerTotal,
      dealerHasAce: this.pfService.calculateHandTotal(dealerCards).hasAce,
      status: 'completed',
      totalBetAmount: game.total_bet_amount,
      totalPayout: totalPayoutWithSideBet,
      actions: [],
      dealerActions,
      currentHandIndex: 0,
      canSplit: false,
      isBlackjack: false,
      perfectPairsResult: perfectPairsResult !== undefined && perfectPairsResult !== 'none' ? perfectPairsResult : undefined,
      perfectPairsPayout: perfectPairsPayout > 0n ? perfectPairsPayout : undefined,
      perfectPairsBetAmount: (game.perfect_pairs_bet_amount ?? 0n) > 0n ? game.perfect_pairs_bet_amount : undefined,
    };
  }

  // ============================================
  // V2 methods: deck-based card drawing (Fisher-Yates)
  // ============================================

  /**
   * Handle splitting a hand — v2 deck-based
   */
  private async handleSplitV2(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    handIndex: number,
    deck: number[],
    deckPosition: number
  ): Promise<GameState> {
    const handToSplit = playerHands[handIndex];

    if (!this.canSplitV2(handToSplit.cards)) {
      throw new Error('Cannot split this hand');
    }

    const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
    const currentBalance = await this.dbService.getPlayerBalance(playerAddress);
    if (currentBalance < handToSplit.betAmount) {
      throw new Error(`Insufficient balance to split. Need ${handToSplit.betAmount.toString()}, have ${currentBalance.toString()}`);
    }

    const card1 = [handToSplit.cards[0]];
    const card2 = [handToSplit.cards[1]];

    // Draw 2 cards from deck
    const newCard1 = deck[deckPosition++];
    const newCard2 = deck[deckPosition++];
    card1.push(newCard1);
    card2.push(newCard2);

    const hand1Total = this.pfService.calculateHandTotalV2(card1);
    const hand2Total = this.pfService.calculateHandTotalV2(card2);

    const hand1: Hand = {
      id: '',
      cards: card1,
      total: hand1Total.total,
      hasAce: hand1Total.hasAce,
      isBlackjack: false,
      isBust: false,
      betAmount: handToSplit.betAmount,
      payout: 0n,
      actions: [{ type: 'split', timestamp: Date.now(), deckPositions: [deckPosition - 2, deckPosition - 1], cards: [newCard1, newCard2] }],
      canHit: true,
      canStand: true,
      canDoubleDown: true,
      canSplit: false
    };

    const hand2: Hand = {
      ...hand1,
      cards: card2,
      total: hand2Total.total,
      hasAce: hand2Total.hasAce
    };

    const totalBetAmount = game.total_bet_amount + handToSplit.betAmount;

    await this.dbService.deductPlayerBalance(playerAddress, handToSplit.betAmount);
    await this.dbService.updateSessionStats(game.session_id, handToSplit.betAmount, 0n, false);

    hand1.id = handToSplit.id;
    await this.dbService.updateGameHand(handToSplit.id, {
      cards: hand1.cards,
      total: hand1.total,
      has_ace: hand1.hasAce,
      is_blackjack: false,
      is_bust: false,
      actions: hand1.actions
    });

    const gameHand2 = await this.dbService.createGameHand(gameId, {
      hand_index: playerHands.length,
      cards: hand2.cards,
      total: hand2.total,
      has_ace: hand2.hasAce,
      is_blackjack: false,
      is_bust: false,
      bet_amount: hand2.betAmount,
      actions: hand2.actions
    });

    hand2.id = gameHand2.id;
    playerHands.splice(handIndex, 1, hand1, hand2);

    await this.dbService.updateGame(gameId, {
      hand_count: playerHands.length,
      total_bet_amount: totalBetAmount,
      current_hand_index: handIndex,
      rng_counter: deckPosition,
    });

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards: game.dealer_cards.slice(0, 1),
      dealerTotal: this.pfService.calculateHandTotalV2([game.dealer_cards[0]]).total,
      dealerHasAce: this.pfService.calculateHandTotalV2([game.dealer_cards[0]]).hasAce,
      status: 'player_turn',
      totalBetAmount,
      totalPayout: 0n,
      actions: [],
      dealerActions: [],
      currentHandIndex: handIndex,
      canSplit: false,
      isBlackjack: false,
      rngVersion: 2,
    };
  }

  /**
   * Handle action on a specific hand — v2 deck-based
   */
  private async handleHandActionV2(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    handIndex: number,
    action: 'hit' | 'stand' | 'double_down',
    deck: number[],
    deckPosition: number
  ): Promise<GameState> {
    const currentHand = playerHands[handIndex];

    if (action === 'hit') {
      const card = deck[deckPosition++];
      currentHand.cards.push(card);
      currentHand.actions.push({ type: 'hit', card, deckPosition: deckPosition - 1, timestamp: Date.now() });

      const handTotal = this.pfService.calculateHandTotalV2(currentHand.cards);
      currentHand.total = handTotal.total;
      currentHand.hasAce = handTotal.hasAce;

      if (currentHand.total > 21) {
        currentHand.isBust = true;
        currentHand.result = 'loss';
        currentHand.canHit = false;
        currentHand.canStand = false;
        currentHand.canDoubleDown = false;
      }

      await this.dbService.updateGameHand(currentHand.id, {
        cards: currentHand.cards,
        total: currentHand.total,
        has_ace: currentHand.hasAce,
        is_bust: currentHand.isBust,
        result: currentHand.result,
        actions: currentHand.actions
      });
      await this.dbService.updateGame(gameId, { rng_counter: deckPosition });

    } else if (action === 'stand') {
      currentHand.actions.push({ type: 'stand', timestamp: Date.now() });
      currentHand.canHit = false;
      currentHand.canStand = false;
      currentHand.canDoubleDown = false;

      await this.dbService.updateGameHand(currentHand.id, {
        actions: currentHand.actions
      });

    } else if (action === 'double_down') {
      if (currentHand.cards.length !== 2) {
        throw new Error('Can only double down on first two cards');
      }

      const originalBet = currentHand.betAmount;
      const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
      const currentBalance = await this.dbService.getPlayerBalance(playerAddress);
      if (currentBalance < originalBet) {
        throw new Error(`Insufficient balance to double down. Need ${originalBet.toString()}, have ${currentBalance.toString()}`);
      }

      currentHand.betAmount *= 2n;

      const card = deck[deckPosition++];
      currentHand.cards.push(card);
      currentHand.actions.push({ type: 'double_down', card, deckPosition: deckPosition - 1, timestamp: Date.now() });

      const handTotal = this.pfService.calculateHandTotalV2(currentHand.cards);
      currentHand.total = handTotal.total;
      currentHand.hasAce = handTotal.hasAce;

      if (currentHand.total > 21) {
        currentHand.isBust = true;
        currentHand.result = 'loss';
      }

      currentHand.canHit = false;
      currentHand.canStand = false;
      currentHand.canDoubleDown = false;

      const totalBetAmount = game.total_bet_amount + originalBet;

      await this.dbService.deductPlayerBalance(playerAddress, originalBet);
      await this.dbService.updateSessionStats(game.session_id, originalBet, 0n, false);

      await this.dbService.updateGame(gameId, { total_bet_amount: totalBetAmount, rng_counter: deckPosition });
      await this.dbService.updateGameHand(currentHand.id, {
        cards: currentHand.cards,
        total: currentHand.total,
        has_ace: currentHand.hasAce,
        is_bust: currentHand.isBust,
        bet_amount: currentHand.betAmount,
        result: currentHand.result,
        actions: currentHand.actions
      });

      game.total_bet_amount = totalBetAmount;
    }

    // Check if all hands are completed
    const activeHands = playerHands.filter(hand => hand.canHit || hand.canStand);
    if (activeHands.length === 0) {
      return this.playDealerAndCompleteV2(gameId, game, playerHands, deck, deckPosition);
    }

    const nextHandIndex = playerHands.findIndex(hand => hand.canHit || hand.canStand);
    if (nextHandIndex !== handIndex) {
      await this.dbService.updateGame(gameId, { current_hand_index: nextHandIndex });
    }

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards: game.dealer_cards.slice(0, 1),
      dealerTotal: this.pfService.calculateHandTotalV2([game.dealer_cards[0]]).total,
      dealerHasAce: this.pfService.calculateHandTotalV2([game.dealer_cards[0]]).hasAce,
      status: 'player_turn',
      totalBetAmount: game.total_bet_amount,
      totalPayout: 0n,
      actions: [],
      dealerActions: [],
      currentHandIndex: nextHandIndex,
      canSplit: false,
      isBlackjack: false,
      rngVersion: 2,
    };
  }

  /**
   * Play dealer turn and complete the game — v2 deck-based
   */
  private async playDealerAndCompleteV2(
    gameId: string,
    game: Game,
    playerHands: Hand[],
    deck: number[],
    deckPosition: number
  ): Promise<GameState> {
    const dealerCards = [...game.dealer_cards];
    const dealerActions: any[] = [];

    // Dealer hits on soft 17
    while (true) {
      const dealerHand = this.pfService.calculateHandTotalV2(dealerCards);

      if (dealerHand.total >= 17 && !(dealerHand.total === 17 && dealerHand.hasAce)) {
        dealerActions.push({ type: 'stand', timestamp: Date.now() });
        break;
      }

      const card = deck[deckPosition++];
      dealerCards.push(card);
      dealerActions.push({
        type: 'hit',
        card,
        deckPosition: deckPosition - 1,
        timestamp: Date.now()
      });
    }

    const finalDealerTotal = this.pfService.calculateHandTotalV2(dealerCards).total;
    let totalPayout = 0n;

    for (const hand of playerHands) {
      if (hand.result === 'blackjack' && hand.isBlackjack) {
        hand.payout = (hand.betAmount * 5n) / 2n;
      } else if (hand.isBust) {
        hand.result = 'loss';
        hand.payout = 0n;
      } else if (finalDealerTotal > 21) {
        hand.result = 'win';
        hand.payout = hand.betAmount * 2n;
      } else if (hand.total > finalDealerTotal) {
        hand.result = 'win';
        hand.payout = hand.betAmount * 2n;
      } else if (hand.total < finalDealerTotal) {
        hand.result = 'loss';
        hand.payout = 0n;
      } else {
        hand.result = 'push';
        hand.payout = hand.betAmount;
      }

      totalPayout += hand.payout;

      await this.dbService.updateGameHand(hand.id, {
        result: hand.result,
        payout: hand.payout,
        completed_at: new Date()
      });
    }

    const perfectPairsPayout = game.perfect_pairs_payout ?? 0n;
    const totalPayoutWithSideBet = totalPayout + perfectPairsPayout;
    const firstHandInitialCards = playerHands[0]?.cards?.slice(0, 2) ?? [];
    const perfectPairsResult: PerfectPairsResult | undefined = firstHandInitialCards.length === 2
      ? this.classifyPerfectPairV2(playerHands[0].cards[0], playerHands[0].cards[1])
      : undefined;

    const hasWin = playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
    const allPush = playerHands.every(h => h.result === 'push');
    const overallResult: Game['result'] = hasWin ? 'win' : allPush ? 'push' : 'loss';

    const totalStakeForGame = game.total_bet_amount + (game.perfect_pairs_bet_amount ?? 0n);

    await this.dbService.updateGame(gameId, {
      dealer_cards: dealerCards,
      dealer_total: finalDealerTotal,
      result: overallResult,
      total_payout: totalPayoutWithSideBet,
      dealer_actions: dealerActions,
      rng_counter: deckPosition,
      completed_at: new Date()
    });

    if (totalPayoutWithSideBet > 0n) {
      const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
      const feeApplied = await this.creditPayoutWithFee(playerAddress, totalStakeForGame, totalPayoutWithSideBet);
      const profit = totalPayoutWithSideBet > totalStakeForGame ? totalPayoutWithSideBet - totalStakeForGame : 0n;
      if (profit > 0n) {
        await this.dbService.updateSessionStats(game.session_id, 0n, profit - feeApplied, false);
      }
    }

    const session = await this.dbService.getSessionById(game.session_id);
    if (session?.server_seed) {
      await this.dbService.revealServerSeed(gameId, session.server_seed_hash, session.server_seed);
      const newServerSeed = this.pfService.generateServerSeed();
      const newServerSeedHash = this.pfService.createServerSeedHash(newServerSeed);
      await this.dbService.setSessionServerSeed(game.session_id, newServerSeed, newServerSeedHash);
    }

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards,
      dealerTotal: finalDealerTotal,
      dealerHasAce: this.pfService.calculateHandTotalV2(dealerCards).hasAce,
      status: 'completed',
      totalBetAmount: game.total_bet_amount,
      totalPayout: totalPayoutWithSideBet,
      actions: [],
      dealerActions,
      currentHandIndex: 0,
      canSplit: false,
      isBlackjack: false,
      perfectPairsResult: perfectPairsResult !== undefined && perfectPairsResult !== 'none' ? perfectPairsResult : undefined,
      perfectPairsPayout: perfectPairsPayout > 0n ? perfectPairsPayout : undefined,
      perfectPairsBetAmount: (game.perfect_pairs_bet_amount ?? 0n) > 0n ? game.perfect_pairs_bet_amount : undefined,
      rngVersion: 2,
    };
  }

  /**
   * Verify game result (alias for getGameResult for API compatibility)
   */
  async verifyGame(gameId: string): Promise<any> {
    return this.getGameResult(gameId);
  }

  /**
   * Get game result for verification
   */
  async getGameResult(gameId: string): Promise<any> {
    try {
      const id = typeof gameId === 'string' ? gameId.trim() : gameId;
      const game = await this.dbService.getGame(id);
      if (!game) return null;
      if (!game.result || game.result === 'ongoing') return null;

      const hands = await this.dbService.getGameHands(id);
      const seedReveal = await this.dbService.getSeedReveal(id);
      const rngVersion = Number(game.rng_version ?? 1);
      const baseNonce = this.getGameBaseNonce(game.game_number);

      return {
        gameId: game.id,
        playerHands: hands.map(h => ({
          cards: h.cards,
          total: h.total,
          result: h.result,
          payout: h.payout,
          actions: h.actions || []
        })),
        dealerCards: game.dealer_cards,
        dealerTotal: game.dealer_total,
        totalPayout: game.total_payout,
        betAmount: game.total_bet_amount,
        timestamp: game.created_at ? new Date(game.created_at).getTime() : undefined,
        serverSeedHash: seedReveal?.server_seed_hash ? `0x${seedReveal.server_seed_hash}` : undefined,
        serverSeed: seedReveal?.server_seed,
        clientSeed: game.client_seed_commitment || 'default',
        gameNumber: game.game_number,
        rngVersion,
        baseNonce,
        nonce: rngVersion === 2 ? game.game_number : Number(baseNonce),
        nonceScheme: rngVersion === 2
          ? {
              type: 'fisher-yates-52',
              nonce: game.game_number,
              note: 'Fisher-Yates shuffle of 52-card deck. nonce = gameNumber. Cards dealt sequentially from shuffled deck.',
            }
          : {
              baseNonceMultiplier: BlackjackGameService.GAME_NONCE_MULTIPLIER,
              initialDealOrder: ['player', 'dealer', 'player', 'dealer'],
              note: 'Each card draw uses nonce = baseNonce + drawIndex; drawIndex increments globally per game.',
            },
        actions: game.actions || [],
        dealerActions: game.dealer_actions || [],
        result: game.result
      };
    } catch (error) {
      logger.error('Error getting game result:', error);
      return null;
    }
  }

  // ============================================
  // Tournament Mode Methods
  // ============================================

  /**
   * Create a tournament game using tournament chips
   */
  async createTournamentGame(request: CreateTournamentGameRequest): Promise<TournamentGameState> {
    if (!this.tournamentService) {
      throw new Error('Tournament service not configured');
    }

    try {
      // Get tournament state
      const tournamentState = await this.tournamentService.getTournamentState(request.playerAddress);
      if (!tournamentState) {
        throw new Error('No active tournament entry found');
      }

      if (tournamentState.status !== 'playing') {
        throw new Error('Tournament entry is not active');
      }

      if (tournamentState.handsRemaining <= 0) {
        throw new Error('No hands remaining in tournament');
      }

      // Validate bet amount
      const validation = this.tournamentService.validateTournamentBet(
        tournamentState.chips,
        request.betAmount
      );
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Get or create player and session (same as regular game)
      const player = await this.dbService.getOrCreatePlayer(request.playerAddress);
      let session = await this.dbService.getActiveSession(player.id);
      if (!session) {
        const serverSeed = this.pfService.generateServerSeed();
        const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
        session = await this.dbService.createGameSession(player.id, serverSeed, serverSeedHash);
      }

      // Ensure session has a real server seed
      const ensured = this.ensureSessionSeed(session);
      if (!session.server_seed) {
        await this.dbService.setSessionServerSeed(session.id, ensured.serverSeed, ensured.serverSeedHash);
        session = { ...session, server_seed: ensured.serverSeed, server_seed_hash: ensured.serverSeedHash };
      }

      const clientSeed = request.clientSeedCommitment || 'default';
      const gameNumber = session.game_count + 1;
      const baseNonce = this.getGameBaseNonce(gameNumber);

      // V2: Fisher-Yates 52-card deck (same as regular blackjack for consistency and verification)
      const shuffledDeck = this.pfService.fisherYatesShuffle(session.server_seed!, clientSeed, gameNumber);
      const initialPlayerCards = [shuffledDeck[0], shuffledDeck[2]];
      const dealerCards = [shuffledDeck[1], shuffledDeck[3]];
      let rngCounter = 4;

      // Create initial hand (V2 helpers for 52-card deck)
      const initialHand: Hand = {
        id: '',
        cards: initialPlayerCards,
        total: this.pfService.calculateHandTotalV2(initialPlayerCards).total,
        hasAce: this.pfService.calculateHandTotalV2(initialPlayerCards).hasAce,
        isBlackjack: this.pfService.isNaturalBlackjackV2(initialPlayerCards),
        isBust: false,
        betAmount: BigInt(request.betAmount), // Store as bigint for compatibility
        payout: 0n,
        actions: [],
        canHit: true,
        canStand: true,
        canDoubleDown: tournamentState.chips >= request.betAmount * 2,
        canSplit: this.canSplitV2(initialPlayerCards) && tournamentState.chips >= request.betAmount * 2
      };

      const dealerVisibleHand = this.pfService.calculateHandTotalV2([dealerCards[0]]);
      const dealerBlackjack = this.pfService.isNaturalBlackjackV2(dealerCards);

      let status: GameState['status'] = 'player_turn';
      let result: Game['result'];
      let chipDelta = 0;

      if (initialHand.isBlackjack && dealerBlackjack) {
        status = 'completed';
        result = 'push';
        initialHand.result = 'push';
        initialHand.payout = BigInt(request.betAmount);
        chipDelta = 0; // Push - no change
      } else if (initialHand.isBlackjack) {
        status = 'completed';
        result = 'blackjack';
        initialHand.result = 'blackjack';
        // 3:2 payout in chips: 2.5x total
        const betBig = BigInt(request.betAmount);
        initialHand.payout = (betBig * 5n) / 2n;
        chipDelta = Number(initialHand.payout) - request.betAmount;
      } else if (dealerBlackjack) {
        status = 'completed';
        result = 'loss';
        initialHand.result = 'loss';
        initialHand.payout = 0n;
        chipDelta = -request.betAmount;
      }

      // Create game record (use 0 for bet amount since this is tournament mode; V2 RNG)
      const game = await this.dbService.createGame(session.id, {
        game_number: gameNumber,
        total_bet_amount: 0n, // Tournament games don't use real MORBIUS
        dealer_cards: dealerCards,
        dealer_total: this.pfService.calculateHandTotalV2(dealerCards).total,
        result,
        total_payout: 0n,
        client_seed_commitment: clientSeed,
        hand_count: 1,
        current_hand_index: 0,
        rng_counter: rngCounter,
        rng_version: 2,
      });

      // Create initial hand record
      const gameHand = await this.dbService.createGameHand(game.id, {
        hand_index: 0,
        cards: initialHand.cards,
        total: initialHand.total,
        has_ace: initialHand.hasAce,
        is_blackjack: initialHand.isBlackjack,
        is_bust: initialHand.isBust,
        bet_amount: BigInt(request.betAmount),
        result: initialHand.result,
        payout: initialHand.payout
      });

      initialHand.id = gameHand.id;

      // Update session stats (increment game_count)
      await this.dbService.updateSessionStats(session.id, 0n, 0n, true);

      // Calculate new chip count
      const newChips = tournamentState.chips + chipDelta;

      // Record tournament hand if game completed immediately
      if (result) {
        await this.tournamentService.recordTournamentHand(
          request.entryId,
          game.id,
          request.betAmount,
          tournamentState.chips,
          newChips,
          result
        );

        // Check for bust or completion
        if (newChips <= 0) {
          await this.tournamentService.bustOut(request.entryId);
        } else if (tournamentState.handsPlayed + 1 >= tournamentState.maxHands) {
          await this.tournamentService.completeTournamentEntry(request.entryId);
        }

        // Reveal server seed for verification
        await this.dbService.revealServerSeed(game.id, session.server_seed_hash, session.server_seed!);

        // Rotate server seed for next game (per-game isolation)
        const newServerSeed = this.pfService.generateServerSeed();
        const newServerSeedHash = this.pfService.createServerSeedHash(newServerSeed);
        await this.dbService.setSessionServerSeed(session.id, newServerSeed, newServerSeedHash);
      }

      // Get updated tournament state
      const updatedState = await this.tournamentService.getTournamentState(request.playerAddress);

      const gameState: TournamentGameState = {
        gameId: game.id,
        sessionId: session.id,
        playerHands: [initialHand],
        dealerCards: status === 'completed' ? dealerCards : dealerCards.slice(0, 1),
        dealerTotal: dealerVisibleHand.total,
        dealerHasAce: dealerVisibleHand.hasAce,
        status,
        totalBetAmount: BigInt(request.betAmount),
        totalPayout: initialHand.payout,
        actions: [],
        dealerActions: [],
        currentHandIndex: 0,
        canSplit: initialHand.canSplit && status === 'player_turn',
        isBlackjack: initialHand.isBlackjack,
        tournamentEntryId: request.entryId,
        tournamentChips: updatedState?.chips ?? newChips,
        handsPlayed: updatedState?.handsPlayed ?? tournamentState.handsPlayed + (result ? 1 : 0),
        handsRemaining: updatedState?.handsRemaining ?? tournamentState.handsRemaining - (result ? 1 : 0),
        currentRank: updatedState?.currentRank ?? tournamentState.currentRank,
      };

      logger.info('Tournament game created', {
        gameId: game.id,
        entryId: request.entryId,
        betAmount: request.betAmount,
        chips: gameState.tournamentChips,
        handsRemaining: gameState.handsRemaining,
        status: gameState.status
      });

      return gameState;

    } catch (error) {
      logger.error('Error creating tournament game:', error);
      throw error;
    }
  }

  /**
   * Handle player action in tournament mode
   */
  async handleTournamentPlayerAction(
    gameId: string,
    action: 'hit' | 'stand' | 'double_down' | 'split',
    entryId: string,
    handIndex?: number
  ): Promise<TournamentGameState> {
    if (!this.tournamentService) {
      throw new Error('Tournament service not configured');
    }

    try {
      // Get the regular game state first
      const gameState = await this.handlePlayerAction({
        gameId,
        action,
        handIndex,
      });

      // Get tournament entry
      const game = await this.dbService.getGame(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
      const tournamentState = await this.tournamentService.getTournamentState(playerAddress);

      if (!tournamentState) {
        throw new Error('Tournament entry not found');
      }

      // If game is completed, update tournament
      if (gameState.status === 'completed') {
        // Calculate chip delta from all hands
        let totalBet = 0;
        let totalPayout = 0;
        for (const hand of gameState.playerHands) {
          totalBet += Number(hand.betAmount);
          totalPayout += Number(hand.payout);
        }
        const chipDelta = totalPayout - totalBet;
        const newChips = tournamentState.chips + chipDelta;

        // Get overall result
        const hasWin = gameState.playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
        const allPush = gameState.playerHands.every(h => h.result === 'push');
        const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';

        // Record the tournament hand
        await this.tournamentService.recordTournamentHand(
          entryId,
          gameId,
          totalBet,
          tournamentState.chips,
          Math.max(0, newChips),
          overallResult
        );

        // Check for bust or completion
        if (newChips <= 0) {
          await this.tournamentService.bustOut(entryId);
        } else if (tournamentState.handsPlayed + 1 >= tournamentState.maxHands) {
          await this.tournamentService.completeTournamentEntry(entryId);
        }
      }

      // Get updated tournament state
      const updatedState = await this.tournamentService.getTournamentState(playerAddress);

      return {
        ...gameState,
        tournamentEntryId: entryId,
        tournamentChips: updatedState?.chips ?? tournamentState.chips,
        handsPlayed: updatedState?.handsPlayed ?? tournamentState.handsPlayed,
        handsRemaining: updatedState?.handsRemaining ?? tournamentState.handsRemaining,
        currentRank: updatedState?.currentRank ?? tournamentState.currentRank,
      };

    } catch (error) {
      logger.error('Error handling tournament player action:', error);
      throw error;
    }
  }
}