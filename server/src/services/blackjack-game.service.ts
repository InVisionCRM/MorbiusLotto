import { DatabaseService, Game, GameHand } from './database.service';
import { ProvablyFairService, GameSeeds } from './provably-fair.service';
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
}

export interface CreateGameRequest {
  playerAddress: string;
  betAmount: bigint;
  clientSeedCommitment?: string;
}

export interface PlayerActionRequest {
  gameId: string;
  action: 'hit' | 'stand' | 'double_down' | 'split';
  handIndex?: number; // For multi-hand games
  clientSeed?: string; // Revealed on first action
}

export class BlackjackGameService {
  constructor(
    private dbService: DatabaseService,
    private pfService: ProvablyFairService
  ) {}

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

        session = await this.dbService.createGameSession(player.id, serverSeedHash);
      }

      // Generate game seeds
      const gameNonce = session.game_count + 1;
      const dealerSeed = this.pfService.generateServerSeed();
      const gameSeeds: GameSeeds = {
        serverSeed: session.server_seed_hash, // We'll reveal this later
        clientSeed: request.clientSeedCommitment || 'default',
        nonce: gameNonce
      };

      // Generate initial cards using provably fair randomness
      const randoms = this.pfService.generateBlackjackRandoms(gameSeeds, 4);

      // Deal cards: player gets 2 cards, dealer gets 2 cards (1 face down)
      const initialPlayerCards = [randoms[0], randoms[2]];
      const dealerCards = [randoms[1], randoms[3]];

      // Create initial hand
      const initialHand: Hand = {
        id: '', // Will be set when created in DB
        cards: initialPlayerCards,
        total: this.pfService.calculateHandTotal(initialPlayerCards).total,
        hasAce: this.pfService.calculateHandTotal(initialPlayerCards).hasAce,
        isBlackjack: this.pfService.isNaturalBlackjack(initialPlayerCards),
        isBust: false,
        betAmount: request.betAmount,
        payout: 0n,
        actions: [],
        canHit: true,
        canStand: true,
        canDoubleDown: true,
        canSplit: this.canSplit(initialPlayerCards)
      };

      // Calculate dealer visible total
      const dealerVisibleHand = this.pfService.calculateHandTotal([dealerCards[0]]);
      const dealerBlackjack = this.pfService.isNaturalBlackjack(dealerCards);

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
        // 3:2 payout for natural blackjack
        initialHand.payout = (request.betAmount * 3n) / 2n;
      } else if (dealerBlackjack) {
        status = 'completed';
        result = 'loss';
        initialHand.result = 'loss';
        initialHand.payout = 0n;
      }

      // Create game record
      const game = await this.dbService.createGame(session.id, {
        game_number: gameNonce,
        total_bet_amount: request.betAmount,
        dealer_cards: dealerCards,
        dealer_total: this.pfService.calculateHandTotal(dealerCards).total,
        result,
        total_payout: initialHand.payout,
        client_seed_commitment: request.clientSeedCommitment,
        dealer_seed: dealerSeed,
        hand_count: 1,
        current_hand_index: 0
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

      // Update session stats
      if (result) {
        await this.dbService.updateSessionStats(
          session.id,
          request.betAmount,
          initialHand.payout > request.betAmount ? initialHand.payout - request.betAmount : 0n
        );
      }

      const gameState: GameState = {
        gameId: game.id,
        sessionId: session.id,
        playerHands: [initialHand],
        dealerCards: [dealerCards[0]], // Hide dealer second card initially
        dealerTotal: dealerVisibleHand.total,
        dealerHasAce: dealerVisibleHand.hasAce,
        status,
        totalBetAmount: request.betAmount,
        totalPayout: initialHand.payout,
        actions: [],
        dealerActions: [],
        currentHandIndex: 0,
        canSplit: initialHand.canSplit && status === 'player_turn',
        isBlackjack: initialHand.isBlackjack
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
      throw new Error('Failed to create game');
    }
  }

  /**
   * Check if hand can be split
   */
  private canSplit(cards: number[]): boolean {
    return cards.length === 2 &&
           this.pfService.getBlackjackValue(cards[0]) === this.pfService.getBlackjackValue(cards[1]);
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

      const session = await this.dbService.getActiveSession(game.session_id);
      if (!session) {
        throw new Error('Session not found');
      }

      // Get current hands
      const gameHands = await this.dbService.getGameHands(request.gameId);
      const playerHands: Hand[] = gameHands.map(gh => ({
        id: gh.id,
        cards: gh.cards,
        total: gh.total || 0,
        hasAce: gh.has_ace,
        isBlackjack: gh.is_blackjack,
        isBust: gh.is_bust,
        betAmount: gh.bet_amount,
        result: gh.result as any,
        payout: gh.payout,
        actions: gh.actions || [],
        canHit: true,
        canStand: true,
        canDoubleDown: gh.cards.length === 2,
        canSplit: this.canSplit(gh.cards)
      }));

      const handIndex = request.handIndex || game.current_hand_index;
      const currentHand = playerHands[handIndex];

      if (!currentHand) {
        throw new Error('Hand not found');
      }

      // If this is the first action, reveal client seed and generate server seed
      let clientSeed = game.client_seed_commitment;
      let serverSeed = session.server_seed_hash;

      if (request.clientSeed && game.client_seed_commitment) {
        // Verify client seed commitment
        if (!this.pfService.verifyClientSeedCommitment(game.client_seed_commitment, request.clientSeed)) {
          throw new Error('Client seed does not match commitment');
        }
        clientSeed = request.clientSeed;

        // Generate actual server seed for this game
        serverSeed = this.pfService.generateServerSeed();

        // Update game with revealed seeds
        await this.dbService.updateGame(game.id, {
          server_seed_revealed: true
        });
      }

      const gameSeeds: GameSeeds = {
        serverSeed,
        clientSeed: clientSeed || 'default',
        nonce: game.game_number
      };

      // Handle different actions
      if (request.action === 'split') {
        return this.handleSplit(request.gameId, game, playerHands, handIndex, gameSeeds);
      } else {
        return this.handleHandAction(request.gameId, game, playerHands, handIndex, request.action, gameSeeds);
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

    // Create two new hands from the split
    const card1 = [handToSplit.cards[0]];
    const card2 = [handToSplit.cards[1]];

    // Deal one card to each new hand
    const randoms = this.pfService.generateBlackjackRandoms(gameSeeds, 2);
    card1.push(randoms[0]);
    card2.push(randoms[1]);

    // Create new hands
    const hand1: Hand = {
      id: '',
      cards: card1,
      total: this.pfService.calculateHandTotal(card1).total,
      hasAce: this.pfService.calculateHandTotal(card1).hasAce,
      isBlackjack: false,
      isBust: false,
      betAmount: handToSplit.betAmount, // Additional bet required for split
      payout: 0n,
      actions: [{ type: 'split', timestamp: Date.now() }],
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

    // Create hand records in database
    const gameHand1 = await this.dbService.createGameHand(gameId, {
      hand_index: handIndex,
      cards: hand1.cards,
      total: hand1.total,
      has_ace: hand1.hasAce,
      is_blackjack: false,
      is_bust: false,
      bet_amount: hand1.betAmount,
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

    hand1.id = gameHand1.id;
    hand2.id = gameHand2.id;

    // Replace the original hand with the two new hands
    playerHands.splice(handIndex, 1, hand1, hand2);

    // Update game with new hand count and total bet
    await this.dbService.updateGame(gameId, {
      hand_count: playerHands.length,
      total_bet_amount: totalBetAmount,
      current_hand_index: handIndex
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

    if (action === 'hit') {
      // Deal new card
      const randoms = this.pfService.generateBlackjackRandoms(gameSeeds, 1);
      currentHand.cards.push(randoms[0]);
      currentHand.actions.push({ type: 'hit', card: randoms[0], timestamp: Date.now() });

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

      // Double the bet
      const originalBet = currentHand.betAmount;
      currentHand.betAmount *= 2n;

      // Deal one more card
      const randoms = this.pfService.generateBlackjackRandoms(gameSeeds, 1);
      currentHand.cards.push(randoms[0]);
      currentHand.actions.push({ type: 'double_down', card: randoms[0], timestamp: Date.now() });

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

      await this.dbService.updateGame(gameId, { total_bet_amount: totalBetAmount });
      await this.dbService.updateGameHand(currentHand.id, {
        cards: currentHand.cards,
        total: currentHand.total,
        has_ace: currentHand.hasAce,
        is_bust: currentHand.isBust,
        bet_amount: currentHand.betAmount,
        result: currentHand.result,
        actions: currentHand.actions
      });
    }

    // Check if all hands are completed
    const activeHands = playerHands.filter(hand => hand.canHit || hand.canStand);
    if (activeHands.length === 0) {
      // All hands completed, dealer plays
      return this.playDealerAndComplete(gameId, game, playerHands, gameSeeds);
    }

    // Move to next active hand
    const nextHandIndex = playerHands.findIndex(hand => hand.canHit || hand.canStand);

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
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
    const dealerActions = [];

    // Dealer hits on soft 17
    while (true) {
      const dealerHand = this.pfService.calculateHandTotal(dealerCards);

      if (dealerHand.total >= 17 && !(dealerHand.total === 17 && dealerHand.hasAce)) {
        dealerActions.push({ type: 'stand', timestamp: Date.now() });
        break;
      }

      const randoms = this.pfService.generateBlackjackRandoms(
        { ...gameSeeds, nonce: gameSeeds.nonce + 1000 },
        1
      );

      dealerCards.push(randoms[0]);
      dealerActions.push({
        type: 'hit',
        card: randoms[0],
        timestamp: Date.now()
      });
    }

    const finalDealerTotal = this.pfService.calculateHandTotal(dealerCards).total;
    let totalPayout = 0n;

    // Calculate results for each hand
    for (const hand of playerHands) {
      if (hand.isBust) {
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

    // Determine overall game result (win if any hand won, loss if all lost, push if all pushed)
    const hasWin = playerHands.some(h => h.result === 'win' || h.result === 'blackjack');
    const hasLoss = playerHands.some(h => h.result === 'loss');
    const allPush = playerHands.every(h => h.result === 'push');
    const overallResult: Game['result'] = hasWin ? 'win' : allPush ? 'push' : 'loss';

    // Update game
    await this.dbService.updateGame(gameId, {
      dealer_cards: dealerCards,
      dealer_total: finalDealerTotal,
      result: overallResult,
      total_payout: totalPayout,
      dealer_actions: dealerActions,
      completed_at: new Date()
    });

    return {
      gameId,
      sessionId: game.session_id,
      playerHands,
      dealerCards,
      dealerTotal: finalDealerTotal,
      dealerHasAce: this.pfService.calculateHandTotal(dealerCards).hasAce,
      status: 'completed',
      totalBetAmount: game.total_bet_amount,
      totalPayout,
      actions: [],
      dealerActions,
      currentHandIndex: 0,
      canSplit: false,
      isBlackjack: false
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
      const game = await this.dbService.getGame(gameId);
      if (!game || !game.result) return null;

      const hands = await this.dbService.getGameHands(gameId);

      return {
        gameId: game.id,
        playerHands: hands.map(h => ({
          cards: h.cards,
          total: h.total,
          result: h.result,
          payout: h.payout
        })),
        dealerCards: game.dealer_cards,
        dealerTotal: game.dealer_total,
        totalPayout: game.total_payout,
        serverSeed: game.dealer_seed, // Revealed
        clientSeed: game.client_seed_commitment || 'default',
        nonce: game.game_number,
        actions: game.actions || [],
        dealerActions: game.dealer_actions || []
      };
    } catch (error) {
      logger.error('Error getting game result:', error);
      return null;
    }
  }
}