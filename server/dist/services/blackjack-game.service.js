"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlackjackGameService = void 0;
const logger_1 = require("../utils/logger");
class BlackjackGameService {
    dbService;
    pfService;
    static GAME_NONCE_MULTIPLIER = 1_000_000; // avoid collisions within a game
    constructor(dbService, pfService) {
        this.dbService = dbService;
        this.pfService = pfService;
    }
    getGameBaseNonce(gameNumber) {
        return gameNumber * BlackjackGameService.GAME_NONCE_MULTIPLIER;
    }
    ensureSessionSeed(session) {
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
    async createGame(request) {
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
            // Generate per-game nonce (Stake-style: stable seeds, increment nonce)
            const gameNumber = session.game_count + 1;
            const baseNonce = this.getGameBaseNonce(gameNumber);
            // If gameHash is provided, verify it matches
            if (request.gameHash) {
                const timestamp = Math.floor(Date.now() / 1000);
                // Remove 0x prefix if present for comparison (server returns hex without 0x)
                const receivedHash = request.gameHash.startsWith('0x')
                    ? request.gameHash.slice(2).toLowerCase()
                    : request.gameHash.toLowerCase();
                const expectedHash = this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, request.betAmount, timestamp).toLowerCase();
                // Allow some timestamp variance (within 60 seconds)
                const hashMatches = expectedHash === receivedHash ||
                    this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, request.betAmount, timestamp - 60).toLowerCase() === receivedHash ||
                    this.pfService.generateGameHash(session.server_seed_hash, clientSeed, gameNumber, request.betAmount, timestamp + 60).toLowerCase() === receivedHash;
                if (!hashMatches) {
                    logger_1.logger.warn('Game hash mismatch', {
                        expected: expectedHash,
                        received: receivedHash,
                        serverSeedHash: session.server_seed_hash,
                        clientSeed,
                        gameNumber,
                        betAmount: request.betAmount.toString(),
                        timestamp: timestamp
                    });
                    // Don't fail, but log warning - hash verification can be done later
                }
                else {
                    logger_1.logger.debug('Game hash verified', { gameHash: receivedHash });
                }
            }
            // Generate initial cards using provably fair randomness
            const dealingSeeds = {
                serverSeed: session.server_seed,
                clientSeed,
                nonce: baseNonce, // drawIndex starts at 0 for initial deal
            };
            const randoms = this.pfService.generateBlackjackRandoms(dealingSeeds, 4);
            let rngCounter = 4; // we consumed 4 draws
            // Deal cards: player gets 2 cards, dealer gets 2 cards (1 face down)
            const initialPlayerCards = [randoms[0], randoms[2]];
            const dealerCards = [randoms[1], randoms[3]];
            // Create initial hand
            const initialHand = {
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
            let status = 'player_turn';
            let result;
            if (initialHand.isBlackjack && dealerBlackjack) {
                status = 'completed';
                result = 'push';
                initialHand.result = 'push';
                initialHand.payout = request.betAmount;
            }
            else if (initialHand.isBlackjack) {
                status = 'completed';
                result = 'blackjack';
                initialHand.result = 'blackjack';
                // 3:2 payout for natural blackjack
                initialHand.payout = (request.betAmount * 3n) / 2n;
            }
            else if (dealerBlackjack) {
                status = 'completed';
                result = 'loss';
                initialHand.result = 'loss';
                initialHand.payout = 0n;
            }
            // Deduct bet amount from off-chain balance
            await this.dbService.deductPlayerBalance(request.playerAddress, request.betAmount);
            logger_1.logger.debug('Deducted initial bet from balance', {
                playerAddress: request.playerAddress,
                betAmount: request.betAmount.toString()
            });
            // Create game record
            const game = await this.dbService.createGame(session.id, {
                game_number: gameNumber,
                total_bet_amount: request.betAmount,
                dealer_cards: dealerCards,
                dealer_total: this.pfService.calculateHandTotal(dealerCards).total,
                result,
                total_payout: initialHand.payout,
                client_seed_commitment: clientSeed,
                hand_count: 1,
                current_hand_index: 0,
                rng_counter: rngCounter,
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
            // Update session stats for game start (increments game_count)
            await this.dbService.updateSessionStats(session.id, request.betAmount, 0n, true);
            // If the game completed immediately, record profit + credit payout + reveal server seed for verification
            if (result) {
                const profit = initialHand.payout > request.betAmount ? initialHand.payout - request.betAmount : 0n;
                if (profit > 0n) {
                    await this.dbService.updateSessionStats(session.id, 0n, profit, false);
                }
                if (initialHand.payout > 0n) {
                    await this.dbService.addPlayerBalance(request.playerAddress, initialHand.payout);
                    logger_1.logger.debug('Added winnings to balance', {
                        playerAddress: request.playerAddress,
                        payout: initialHand.payout.toString()
                    });
                }
                await this.dbService.revealServerSeed(game.id, session.server_seed_hash, session.server_seed);
            }
            const gameState = {
                gameId: game.id,
                sessionId: session.id,
                playerHands: [initialHand],
                dealerCards: dealerCards, // Send both cards - frontend will hide the second one
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
            logger_1.logger.info('Game created', {
                gameId: game.id,
                playerAddress: request.playerAddress,
                betAmount: request.betAmount.toString(),
                hands: gameState.playerHands.length,
                status: gameState.status
            });
            return gameState;
        }
        catch (error) {
            logger_1.logger.error('Error creating game:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create game: ${errorMessage}`);
        }
    }
    /**
     * Check if hand can be split
     */
    canSplit(cards) {
        return cards.length === 2 &&
            this.pfService.getBlackjackValue(cards[0]) === this.pfService.getBlackjackValue(cards[1]);
    }
    /**
     * Handle player action
     */
    async handlePlayerAction(request) {
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
            const playerHands = gameHands.map(gh => ({
                id: gh.id,
                cards: gh.cards,
                total: gh.total || 0,
                hasAce: gh.has_ace,
                isBlackjack: gh.is_blackjack,
                isBust: gh.is_bust,
                betAmount: gh.bet_amount,
                result: gh.result,
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
            // Stake-style: client seed can remain stable; server seed is committed per session.
            // For blackjack we use a per-game base nonce and a per-draw rng_counter to ensure each draw is unique.
            const clientSeed = game.client_seed_commitment || 'default';
            const serverSeed = session.server_seed;
            const baseNonce = this.getGameBaseNonce(game.game_number);
            const rngCounter = Number(game.rng_counter ?? 0);
            const gameSeeds = {
                serverSeed,
                clientSeed,
                nonce: baseNonce + rngCounter, // next draw nonce
            };
            // Handle different actions
            if (request.action === 'split') {
                return this.handleSplit(request.gameId, game, playerHands, handIndex, gameSeeds);
            }
            else {
                return this.handleHandAction(request.gameId, game, playerHands, handIndex, request.action, gameSeeds);
            }
        }
        catch (error) {
            logger_1.logger.error('Error handling player action:', error);
            throw error;
        }
    }
    /**
     * Handle splitting a hand
     */
    async handleSplit(gameId, game, playerHands, handIndex, gameSeeds) {
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
        const baseNonce = this.getGameBaseNonce(game.game_number);
        const splitNonce1 = gameSeeds.nonce;
        const splitNonce2 = gameSeeds.nonce + 1;
        const nextRngCounter = (splitNonce2 - baseNonce) + 1; // consumed 2 draws total
        // Create new hands
        const hand1 = {
            id: '',
            cards: card1,
            total: this.pfService.calculateHandTotal(card1).total,
            hasAce: this.pfService.calculateHandTotal(card1).hasAce,
            isBlackjack: false,
            isBust: false,
            betAmount: handToSplit.betAmount, // Additional bet required for split
            payout: 0n,
            actions: [{ type: 'split', timestamp: Date.now(), nonce1: splitNonce1, nonce2: splitNonce2, cards: [randoms[0], randoms[1]] }],
            canHit: true,
            canStand: true,
            canDoubleDown: true,
            canSplit: false
        };
        const hand2 = {
            ...hand1,
            cards: card2,
            total: this.pfService.calculateHandTotal(card2).total,
            hasAce: this.pfService.calculateHandTotal(card2).hasAce
        };
        // Update total bet amount
        const totalBetAmount = game.total_bet_amount + handToSplit.betAmount;
        // Deduct additional bet for split hand from off-chain balance
        const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
        await this.dbService.deductPlayerBalance(playerAddress, handToSplit.betAmount);
        logger_1.logger.debug('Deducted split bet from balance', {
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
    async handleHandAction(gameId, game, playerHands, handIndex, action, gameSeeds) {
        const currentHand = playerHands[handIndex];
        const baseNonce = this.getGameBaseNonce(game.game_number);
        let rngCounter = gameSeeds.nonce - baseNonce;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/blackjack-game.service.ts:handleHandAction:entry', message: 'handleHandAction entry', data: { action, gameId, currentHandId: currentHand?.id, handIndex, cardsLen: currentHand?.cards?.length, result: currentHand?.result }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        if (action === 'hit') {
            // Deal new card
            const nonceUsed = baseNonce + rngCounter;
            const randoms = this.pfService.generateBlackjackRandoms({ ...gameSeeds, nonce: nonceUsed }, 1);
            rngCounter += 1;
            currentHand.cards.push(randoms[0]);
            currentHand.actions.push({ type: 'hit', card: randoms[0], nonce: nonceUsed, timestamp: Date.now() });
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
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'server/src/services/blackjack-game.service.ts:handleHandAction:beforeUpdateHand', message: 'About to update hand in DB', data: { handId: currentHand.id, updateKeys: ['cards', 'total', 'has_ace', 'is_bust', 'result', 'actions'], cardsLen: currentHand.cards.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
            // #endregion
            await this.dbService.updateGameHand(currentHand.id, {
                cards: currentHand.cards,
                total: currentHand.total,
                has_ace: currentHand.hasAce,
                is_bust: currentHand.isBust,
                result: currentHand.result,
                actions: currentHand.actions
            });
            await this.dbService.updateGame(gameId, { rng_counter: rngCounter });
        }
        else if (action === 'stand') {
            currentHand.actions.push({ type: 'stand', timestamp: Date.now() });
            currentHand.canHit = false;
            currentHand.canStand = false;
            currentHand.canDoubleDown = false;
            await this.dbService.updateGameHand(currentHand.id, {
                actions: currentHand.actions
            });
        }
        else if (action === 'double_down') {
            if (currentHand.cards.length !== 2) {
                throw new Error('Can only double down on first two cards');
            }
            // Double the bet
            const originalBet = currentHand.betAmount;
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
            // Deduct additional bet for double down from off-chain balance
            const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
            await this.dbService.deductPlayerBalance(playerAddress, originalBet);
            logger_1.logger.debug('Deducted double down bet from balance', {
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
        const activeHands = playerHands.filter(hand => hand.canHit || hand.canStand);
        if (activeHands.length === 0) {
            // All hands completed, dealer plays
            const nextSeeds = { ...gameSeeds, nonce: baseNonce + rngCounter };
            return this.playDealerAndComplete(gameId, game, playerHands, nextSeeds);
        }
        // Move to next active hand
        const nextHandIndex = playerHands.findIndex(hand => hand.canHit || hand.canStand);
        // Persist current_hand_index to database so next action uses correct hand
        if (nextHandIndex !== handIndex) {
            await this.dbService.updateGame(gameId, { current_hand_index: nextHandIndex });
        }
        return {
            gameId,
            sessionId: game.session_id,
            playerHands,
            dealerCards: game.dealer_cards, // Send both cards - frontend will hide the second one
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
    async playDealerAndComplete(gameId, game, playerHands, gameSeeds) {
        const dealerCards = [...game.dealer_cards];
        const dealerActions = [];
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
            const randoms = this.pfService.generateBlackjackRandoms({ ...gameSeeds, nonce: nonceUsed }, 1);
            nextNonce += 1;
            dealerCards.push(randoms[0]);
            dealerActions.push({
                type: 'hit',
                card: randoms[0],
                nonce: nonceUsed,
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
            }
            else if (finalDealerTotal > 21) {
                // Dealer bust
                hand.result = 'win';
                hand.payout = hand.betAmount * 2n;
            }
            else if (hand.total > finalDealerTotal) {
                hand.result = 'win';
                hand.payout = hand.betAmount * 2n;
            }
            else if (hand.total < finalDealerTotal) {
                hand.result = 'loss';
                hand.payout = 0n;
            }
            else {
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
        const overallResult = hasWin ? 'win' : allPush ? 'push' : 'loss';
        // Update game
        const rngCounter = nextNonce - baseNonce;
        await this.dbService.updateGame(gameId, {
            dealer_cards: dealerCards,
            dealer_total: finalDealerTotal,
            result: overallResult,
            total_payout: totalPayout,
            dealer_actions: dealerActions,
            rng_counter: rngCounter,
            completed_at: new Date()
        });
        // Add winnings to off-chain balance
        if (totalPayout > 0n) {
            const playerAddress = await this.dbService.getPlayerAddressFromSession(game.session_id);
            await this.dbService.addPlayerBalance(playerAddress, totalPayout);
            logger_1.logger.debug('Added game winnings to balance', {
                playerAddress,
                totalPayout: totalPayout.toString(),
                gameId
            });
        }
        // Update session win stats (profit only; do NOT increment game_count)
        const profit = totalPayout > game.total_bet_amount ? totalPayout - game.total_bet_amount : 0n;
        if (profit > 0n) {
            await this.dbService.updateSessionStats(game.session_id, 0n, profit, false);
        }
        // Reveal server seed commitment for verification
        const session = await this.dbService.getSessionById(game.session_id);
        if (session?.server_seed) {
            await this.dbService.revealServerSeed(gameId, session.server_seed_hash, session.server_seed);
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
    async verifyGame(gameId) {
        return this.getGameResult(gameId);
    }
    /**
     * Get game result for verification
     */
    async getGameResult(gameId) {
        try {
            const game = await this.dbService.getGame(gameId);
            if (!game || !game.result)
                return null;
            const hands = await this.dbService.getGameHands(gameId);
            const seedReveal = await this.dbService.getSeedReveal(gameId);
            const baseNonce = this.getGameBaseNonce(game.game_number);
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
                serverSeedHash: seedReveal?.server_seed_hash ? `0x${seedReveal.server_seed_hash}` : undefined,
                serverSeed: seedReveal?.server_seed,
                clientSeed: game.client_seed_commitment || 'default',
                gameNumber: game.game_number,
                baseNonce,
                nonceScheme: {
                    baseNonceMultiplier: BlackjackGameService.GAME_NONCE_MULTIPLIER,
                    initialDealOrder: ['player', 'dealer', 'player', 'dealer'],
                    note: 'Each card draw uses nonce = baseNonce + drawIndex; drawIndex increments globally per game.',
                },
                actions: game.actions || [],
                dealerActions: game.dealer_actions || []
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting game result:', error);
            return null;
        }
    }
}
exports.BlackjackGameService = BlackjackGameService;
//# sourceMappingURL=blackjack-game.service.js.map