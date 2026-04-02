'use client';

import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import {
  SOUNDS_DEALER_BLACKJACK,
  SOUNDS_DEALER_WINS,
  SOUNDS_PLAYER_BLACKJACK,
  SOUNDS_PLAYER_WINS,
  SOUND_PUSH,
  pickRandom,
} from '@/app/BLACKJACK/constants';
import type { Card, Game, GameResult, GameStateUI, Hand } from '@/app/BLACKJACK/types';
import { GameState } from '@/app/BLACKJACK/types';

interface PendingGameCompletionData {
  gameResult: GameResult;
  chartBetAmount: bigint;
  chartPayout: bigint;
  chartMeta: { gameId?: string; result?: string };
  ppResult?: string;
}

interface UseBlackjackCompletionOrchestratorOptions {
  currentGame: Game | null;
  address: string | undefined;
  initialBetRef: MutableRefObject<number>;
  chipResultRef: MutableRefObject<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>;
  pendingGameCompletionRef: MutableRefObject<PendingGameCompletionData | null>;
  pendingChipResult: 'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null;
  pendingWinData: { amount: bigint; isBlackjack: boolean } | null;
  setPendingChipResult: Dispatch<SetStateAction<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>>;
  setPendingWinData: Dispatch<SetStateAction<{ amount: bigint; isBlackjack: boolean } | null>>;
  setCurrentGameResult: Dispatch<SetStateAction<'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null>>;
  setWinAmount: Dispatch<SetStateAction<bigint>>;
  setIsBlackjackWin: Dispatch<SetStateAction<boolean>>;
  setShowWinNotification: Dispatch<SetStateAction<boolean>>;
  setLastBetAmount: Dispatch<SetStateAction<string>>;
  setGameState: Dispatch<SetStateAction<GameStateUI>>;
  playDealerVoice: (path: string, volume?: number) => Promise<void>;
  fetchBalance: () => Promise<void> | void;
  tournament: any;
  queryClient: any;
  chartRef: MutableRefObject<{ addGameResult: (bet: bigint, payout: bigint, meta?: { gameId?: string; result?: string }) => void } | null>;
  createCard: (value: number, suit: string, hidden?: boolean) => Card;
  createEmptyHand: () => Hand;
  calculateHandTotal: (cards: Card[]) => { total: number; hasAce: boolean };
}

export function useBlackjackCompletionOrchestrator(options: UseBlackjackCompletionOrchestratorOptions) {
  const {
    currentGame,
    address,
    initialBetRef,
    chipResultRef,
    pendingGameCompletionRef,
    pendingChipResult,
    pendingWinData,
    setPendingChipResult,
    setPendingWinData,
    setCurrentGameResult,
    setWinAmount,
    setIsBlackjackWin,
    setShowWinNotification,
    setLastBetAmount,
    setGameState,
    playDealerVoice,
    fetchBalance,
    tournament,
    queryClient,
    chartRef,
    createCard,
    createEmptyHand,
    calculateHandTotal,
  } = options;

  const handleGameCompletion = useCallback((data: any) => {
    try {
      const payout: bigint =
        typeof data?.payout === 'bigint' ? data.payout : BigInt(String(data?.payout || '0'));
      const betAmount: bigint =
        typeof data?.betAmount === 'bigint' ? data.betAmount : BigInt(String(data?.betAmount || '0'));
      const profit: bigint = payout - betAmount;

      const betInMorbius = initialBetRef.current > 0 ? initialBetRef.current : Math.floor(Number(formatEther(betAmount)));
      setLastBetAmount(betInMorbius.toString());

      let chipAnimResult: 'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null = null;
      if (data.result === 'blackjack') {
        chipAnimResult = 'blackjack';
      } else if (data.result === 'dealer_blackjack') {
        chipAnimResult = 'dealer_blackjack';
      } else if (data.result === 'loss' || (payout === BigInt(0) && betAmount > BigInt(0))) {
        const dHand = data.processedGame?.dealerHand || data.gameState?.dealerHand;
        const dealerHadBJ = dHand?.isBlackjack || (dHand?.total === 21 && dHand?.cards?.length === 2);
        chipAnimResult = dealerHadBJ ? 'dealer_blackjack' : 'loss';
      } else if (profit > BigInt(0)) {
        chipAnimResult = 'win';
      } else if (profit < BigInt(0)) {
        chipAnimResult = 'loss';
      } else {
        chipAnimResult = 'push';
      }

      setPendingChipResult(chipAnimResult);

      let playerHand: Hand = createEmptyHand();
      let dealerHand: Hand = createEmptyHand();

      if (data.processedGame) {
        if (data.processedGame.playerHand && data.processedGame.playerHand.cards.length > 0) {
          playerHand = {
            ...data.processedGame.playerHand,
            betAmount: data.processedGame.playerHand.betAmount || betAmount
          };
        }
        if (data.processedGame.dealerHand && data.processedGame.dealerHand.cards.length > 0) {
          dealerHand = data.processedGame.dealerHand;
        }
      } else if (data.gameState) {
        let extractedPlayerHand: Hand | null = null;
        let extractedDealerHand: Hand | null = null;
        const serverGameState = data.gameState;
        const gameId = String(serverGameState.gameId || serverGameState.id || '');
        const currentHandIndex = Number(serverGameState.currentHandIndex ?? 0);

        const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
        const suitFor = (idx: number) => {
          const salt = gameId.length;
          return suits[(idx + salt) % suits.length];
        };
        const completionIsV2 = serverGameState.rngVersion === 2;
        const toCard = (value: number, idx: number, hidden = false): Card => {
          const n = Number(value);
          if (completionIsV2 && n >= 0 && n <= 51) {
            const rank = (n % 13) + 1;
            const suitIndex = Math.floor(n / 13);
            return createCard(rank, suits[suitIndex % 4], hidden);
          }
          if (n >= 10 && n <= 133) {
            const v = Math.floor(n / 10);
            const suitIndex = n % 10;
            return createCard(v, suits[suitIndex % 4], hidden);
          }
          return createCard(n, suitFor(idx), hidden);
        };

        const rawHands = Array.isArray(serverGameState.playerHands) ? serverGameState.playerHands : [];
        if (rawHands.length > 0) {
          const playerHands: Hand[] = rawHands.map((h: any, handIdx: number) => {
            const rawCards: number[] = Array.isArray(h.cards) ? h.cards.map((c: any) => Number(c)) : [];
            const cards = rawCards.map((c, idx) => toCard(c, handIdx * 10 + idx));
            const totals = calculateHandTotal(cards);
            return {
              id: String(h.id || `${gameId}-hand-${handIdx}`),
              cards,
              total: Number(h.total ?? totals.total),
              hasAce: Boolean(h.hasAce ?? totals.hasAce),
              isBlackjack: Boolean(h.isBlackjack ?? false),
              isBust: Boolean(h.isBust ?? false),
              betAmount: toBigIntSafe(h.betAmount ?? betAmount),
              result: h.result,
              payout: toBigIntSafe(h.payout),
              actions: Array.isArray(h.actions) ? h.actions : [],
              canHit: false,
              canStand: false,
              canDoubleDown: false,
              canSplit: false,
            };
          });

          const activePlayerHand = playerHands[currentHandIndex] || playerHands[0];
          if (activePlayerHand && activePlayerHand.cards.length > 0) {
            extractedPlayerHand = {
              ...activePlayerHand,
              betAmount: activePlayerHand.betAmount || betAmount
            };
          }
        }

        const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
          ? serverGameState.dealerCards.map((c: any) => Number(c))
          : [];

        if (rawDealerCards.length > 0) {
          const dealerCards = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
          const dealerTotals = calculateHandTotal(dealerCards);
          extractedDealerHand = {
            id: `${gameId}-dealer`,
            cards: dealerCards,
            total: Number(serverGameState.dealerTotal ?? dealerTotals.total),
            hasAce: Boolean(serverGameState.dealerHasAce ?? dealerTotals.hasAce),
            isBlackjack: false,
            isBust: Number(serverGameState.dealerTotal ?? dealerTotals.total) > 21,
            betAmount: BigInt(0),
            payout: BigInt(0),
            actions: Array.isArray(serverGameState.dealerActions) ? serverGameState.dealerActions : [],
            canHit: false,
            canStand: false,
            canDoubleDown: false,
            canSplit: false,
          };
        }

        if (extractedPlayerHand && extractedPlayerHand.cards.length > 0) {
          playerHand = extractedPlayerHand;
        } else {
          const currentPlayerHand = currentGame?.playerHand || createEmptyHand();
          playerHand = {
            ...currentPlayerHand,
            betAmount: currentPlayerHand.betAmount || betAmount
          };
        }

        if (extractedDealerHand && extractedDealerHand.cards.length > 0) {
          dealerHand = extractedDealerHand;
        } else {
          dealerHand = currentGame?.dealerHand || createEmptyHand();
        }
      } else {
        const currentPlayerHand = currentGame?.playerHand || createEmptyHand();
        playerHand = {
          ...currentPlayerHand,
          betAmount: currentPlayerHand.betAmount || betAmount
        };
        dealerHand = currentGame?.dealerHand || createEmptyHand();
      }

      const freshHands = data.processedGame?.playerHands;
      const allPlayerHands = freshHands && freshHands.length > 0
        ? freshHands
        : [playerHand];
      const wasSplit = allPlayerHands.length > 1;
      const wasDoubleDown = allPlayerHands.some((h: Hand) =>
        Array.isArray(h.actions) && h.actions.some((a: any) => a.type === 'double_down'));

      const isTournament = !!data.isTournament;
      const payoutForHistory = isTournament
        ? BigInt(Math.floor(Number(payout) / 1e18))
        : payout;

      const gameResult: GameResult = {
        gameId: data?.gameId ? String(data.gameId) : `game-${Date.now()}`,
        playerHand,
        dealerHand,
        payout: payoutForHistory,
        isBlackjack: data.result === 'blackjack',
        timestamp: Date.now(),
        ...(allPlayerHands.length > 0 && { playerHands: allPlayerHands }),
        ...(wasSplit && { wasSplit: true }),
        ...(wasDoubleDown && { wasDoubleDown: true }),
        ...(isTournament && { isTournament: true }),
      };

      pendingGameCompletionRef.current = {
        gameResult,
        chartBetAmount: betAmount,
        chartPayout: payout,
        chartMeta: {
          gameId: data?.gameId ? String(data.gameId) : undefined,
          result: data?.result ? String(data.result) : undefined,
        },
        ppResult: data.processedGame?.perfectPairsResult,
      };

      if (profit > BigInt(0)) {
        setPendingWinData({
          amount: profit,
          isBlackjack: data.result === 'blackjack'
        });
      }
    } catch (error) {
      console.error('Error in handleGameCompletion:', error);
    }
  }, [
    calculateHandTotal,
    createCard,
    createEmptyHand,
    currentGame,
    initialBetRef,
    pendingGameCompletionRef,
    setLastBetAmount,
    setPendingChipResult,
    setPendingWinData,
  ]);

  const handleDealerRevealComplete = useCallback(() => {
    if (tournament.tournamentState.inTournament) {
      tournament.commitDisplayState();
    }

    setGameState(prev => {
      if (prev.currentGame?.state === GameState.COMPLETE) {
        return { ...prev, isPlaying: false };
      }
      return prev;
    });

    if (pendingChipResult) {
      chipResultRef.current = pendingChipResult;
      setCurrentGameResult(pendingChipResult);
      setPendingChipResult(null);
      if (pendingChipResult === 'dealer_blackjack') {
        playDealerVoice(pickRandom(SOUNDS_DEALER_BLACKJACK));
      } else if (pendingChipResult === 'loss') {
        if (SOUNDS_DEALER_WINS.length > 0) {
          playDealerVoice(pickRandom(SOUNDS_DEALER_WINS));
        }
      } else if (pendingChipResult === 'blackjack') {
        playDealerVoice(pickRandom(SOUNDS_PLAYER_BLACKJACK));
      } else if (pendingChipResult === 'win') {
        playDealerVoice(pickRandom(SOUNDS_PLAYER_WINS));
      } else if (pendingChipResult === 'push') {
        playDealerVoice(SOUND_PUSH);
      }
    }

    if (pendingWinData) {
      setWinAmount(pendingWinData.amount);
      setIsBlackjackWin(pendingWinData.isBlackjack);
      setShowWinNotification(true);
      setPendingWinData(null);
    }

    const pending = pendingGameCompletionRef.current;
    if (pending) {
      pendingGameCompletionRef.current = null;

      chartRef.current?.addGameResult(pending.chartBetAmount, pending.chartPayout, pending.chartMeta);

      const ppResult = pending.ppResult;
      if (ppResult === 'perfect') toast.success('Perfect Pair! 10:1', { description: 'Exact match — same rank and suit!' });
      else if (ppResult === 'colored') toast.success('Colored Pair! 12:1', { description: 'Same rank, same color!' });
      else if (ppResult === 'mixed') toast.success('Mixed Pair! 5:1', { description: 'Same rank, different color!' });

      const gameResult = pending.gameResult;
      setGameState(prev => {
        const existingIndex = prev.history.findIndex(h => h.gameId === gameResult.gameId);
        if (existingIndex >= 0) {
          const shouldUpdate = gameResult.playerHand.cards.length > 0 || gameResult.dealerHand.cards.length > 0;
          if (shouldUpdate) {
            const updatedHistory = [...prev.history];
            updatedHistory[existingIndex] = gameResult;
            return { ...prev, history: updatedHistory, lastResult: gameResult };
          }
          return prev;
        }
        const newHistory = [gameResult, ...prev.history].slice(0, 50);

        if (address && typeof window !== 'undefined') {
          try {
            const storageKey = `blackjack_history_${address.toLowerCase()}`;
            const historyToStore = newHistory.map(result => ({
              gameId: result.gameId,
              playerHand: {
                id: result.playerHand.id,
                cards: result.playerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.playerHand.total,
                hasAce: result.playerHand.hasAce,
                isBlackjack: result.playerHand.isBlackjack,
                isBust: result.playerHand.isBust,
                betAmount: result.playerHand.betAmount.toString(),
                payout: result.playerHand.payout.toString(),
                result: result.playerHand.result,
                actions: result.playerHand.actions,
              },
              dealerHand: {
                id: result.dealerHand.id,
                cards: result.dealerHand.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: result.dealerHand.total,
                hasAce: result.dealerHand.hasAce,
                isBlackjack: result.dealerHand.isBlackjack,
                isBust: result.dealerHand.isBust,
                betAmount: result.dealerHand.betAmount.toString(),
                payout: result.dealerHand.payout.toString(),
                actions: result.dealerHand.actions,
              },
              payout: result.payout.toString(),
              isBlackjack: result.isBlackjack,
              timestamp: result.timestamp,
              ...(result.playerHands && { playerHands: result.playerHands.map(h => ({
                id: h.id,
                cards: h.cards.map(c => ({ value: c.value, suit: c.suit })),
                total: h.total,
                hasAce: h.hasAce,
                isBlackjack: h.isBlackjack,
                isBust: h.isBust,
                betAmount: h.betAmount.toString(),
                payout: h.payout.toString(),
                result: h.result,
                actions: h.actions,
              })) }),
              ...(result.wasSplit && { wasSplit: true }),
              ...(result.wasDoubleDown && { wasDoubleDown: true }),
              ...(result.isTournament && { isTournament: true }),
            }));
            localStorage.setItem(storageKey, JSON.stringify(historyToStore));
          } catch (error) {
            console.error('Failed to save history to localStorage:', error);
          }
        }

        return { ...prev, history: newHistory, lastResult: gameResult };
      });
    }

    Promise.resolve(fetchBalance()).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['playerGames'] });
    queryClient.invalidateQueries({ queryKey: ['blackjackRecentGamesGlobal'] });
  }, [
    address,
    chipResultRef,
    chartRef,
    fetchBalance,
    pendingChipResult,
    pendingGameCompletionRef,
    pendingWinData,
    playDealerVoice,
    queryClient,
    setCurrentGameResult,
    setGameState,
    setIsBlackjackWin,
    setPendingChipResult,
    setPendingWinData,
    setShowWinNotification,
    setWinAmount,
    tournament,
  ]);

  return {
    handleGameCompletion,
    handleDealerRevealComplete,
  };
}
