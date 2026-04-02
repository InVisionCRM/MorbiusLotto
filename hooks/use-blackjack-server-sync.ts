'use client';

import { useCallback } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { ANIMATION_TIMINGS } from '@/app/BLACKJACK/constants';
import type { Card, Hand, GameStateUI } from '@/app/BLACKJACK/types';
import { GameState } from '@/app/BLACKJACK/types';

interface UseBlackjackServerSyncOptions {
  address: string | undefined;
  clientSeed: string;
  setGameState: React.Dispatch<React.SetStateAction<GameStateUI>>;
  playSfx: (path: string, volume?: number) => void;
  prevPlayerCardCountRef: React.MutableRefObject<number>;
  prevDealerCardCountRef: React.MutableRefObject<number>;
  setNewCardIndices: React.Dispatch<React.SetStateAction<{ player: Set<number>; dealer: Set<number> }>>;
  createCard: (value: number, suit: string, hidden?: boolean) => Card;
  calculateHandTotal: (cards: Card[]) => { total: number; hasAce: boolean };
}

export function useBlackjackServerSync({
  address,
  clientSeed,
  setGameState,
  playSfx,
  prevPlayerCardCountRef,
  prevDealerCardCountRef,
  setNewCardIndices,
  createCard,
  calculateHandTotal,
}: UseBlackjackServerSyncOptions) {
  const updateGameStateFromServerCore = useCallback((serverGameState: any, maxPlayerCards?: number, maxDealerCards?: number) => {
    if (!address) return null;

    const gameId = String(serverGameState.gameId || serverGameState.id || '');
    const status = String(serverGameState.status || 'waiting');
    const currentHandIndex = Number(serverGameState.currentHandIndex ?? 0);

    const suits: Array<Card['suit']> = ['hearts', 'diamonds', 'clubs', 'spades'];
    const suitFor = (idx: number) => {
      const salt = gameId.length;
      return suits[(idx + salt) % suits.length];
    };
    const isV2 = (serverGameState.rngVersion ?? 2) === 2;
    const toCard = (raw: number, idx: number, hidden = false): Card => {
      const n = Number(raw);
      if (isV2 && n >= 0 && n <= 51) {
        const rank = (n % 13) + 1;
        const suitIndex = Math.floor(n / 13);
        return createCard(rank, suits[suitIndex % 4], hidden);
      }
      if (n >= 10 && n <= 133) {
        const value = Math.floor(n / 10);
        const suitIndex = n % 10;
        return createCard(value, suits[suitIndex % 4], hidden);
      }
      return createCard(n, suitFor(idx), hidden);
    };

    const totalBetAmount = toBigIntSafe(serverGameState.totalBetAmount ?? serverGameState.betAmount);
    const totalPayout = toBigIntSafe(serverGameState.totalPayout ?? serverGameState.payout);

    const rawHands = Array.isArray(serverGameState.playerHands)
      ? serverGameState.playerHands
      : [];

    const playerHands: Hand[] = rawHands.map((h: any, handIdx: number) => {
      const rawCards: number[] = Array.isArray(h.cards) ? h.cards.map((c: any) => Number(c)) : [];
      const cards = rawCards.map((c, idx) => toCard(c, handIdx * 10 + idx));
      const totals = calculateHandTotal(cards);
      return {
        id: String(h.id || `${gameId}-hand-${handIdx}`),
        cards,
        total: totals.total,
        hasAce: totals.hasAce,
        isBlackjack: Boolean(h.isBlackjack ?? false),
        isBust: totals.total > 21,
        betAmount: toBigIntSafe(h.betAmount ?? totalBetAmount),
        result: h.result,
        payout: toBigIntSafe(h.payout),
        actions: Array.isArray(h.actions) ? h.actions : [],
        canHit: Boolean(h.canHit ?? true),
        canStand: Boolean(h.canStand ?? true),
        canDoubleDown: Boolean(h.canDoubleDown ?? false),
        canSplit: Boolean(h.canSplit ?? false),
      };
    });

    const activePlayerHand = playerHands[currentHandIndex] || playerHands[0];

    const playerHandsSliced = maxPlayerCards != null
      ? playerHands.map(h => {
          const slicedCards = h.cards.slice(0, maxPlayerCards);
          const totals = calculateHandTotal(slicedCards);
          return { ...h, cards: slicedCards, total: totals.total, hasAce: totals.hasAce };
        })
      : playerHands;
    const activePlayerHandSliced = playerHandsSliced[currentHandIndex] || playerHandsSliced[0];

    const rawDealerCards: number[] = Array.isArray(serverGameState.dealerCards)
      ? serverGameState.dealerCards.map((c: any) => Number(c))
      : [];

    const dealerCardsRaw = rawDealerCards.map((c, idx) => toCard(c, 100 + idx));
    const dealerCards = maxDealerCards != null ? dealerCardsRaw.slice(0, maxDealerCards) : dealerCardsRaw;
    const dealerTotals = calculateHandTotal(dealerCardsRaw);
    const dealerTotalNum = Number(serverGameState.dealerTotal ?? dealerTotals.total);
    const dealerHasBlackjack = status === 'completed' && dealerCardsRaw.length === 2 && dealerTotalNum === 21;
    const dealerHand: Hand = {
      id: `${gameId}-dealer`,
      cards: dealerCards,
      total: dealerTotalNum,
      hasAce: Boolean(serverGameState.dealerHasAce ?? dealerTotals.hasAce),
      isBlackjack: dealerHasBlackjack,
      isBust: dealerTotalNum > 21,
      betAmount: BigInt(0),
      payout: BigInt(0),
      actions: Array.isArray(serverGameState.dealerActions) ? serverGameState.dealerActions : [],
      canHit: false,
      canStand: false,
      canDoubleDown: false,
      canSplit: false,
    };

    const mappedState = status === 'player_turn'
      ? GameState.PLAYER_TURN
      : status === 'dealer_turn'
        ? GameState.DEALER_TURN
        : status === 'completed'
          ? GameState.COMPLETE
          : GameState.WAITING;

    const localGame: any = {
      id: gameId,
      player: address,
      betAmount: totalBetAmount,
      state: mappedState,
      playerHand: activePlayerHandSliced || {
        id: `${gameId}-hand-0`,
        cards: [],
        total: 0,
        hasAce: false,
        isBlackjack: false,
        isBust: false,
        betAmount: BigInt(0),
        payout: BigInt(0),
        actions: [],
        canHit: false,
        canStand: false,
        canDoubleDown: false,
        canSplit: false,
      },
      dealerHand,
      playerHands: playerHandsSliced,
      currentHandIndex,
      totalBetAmount,
      totalPayout,
      canSplit: Boolean(serverGameState.canSplit ?? activePlayerHand?.canSplit ?? false),
      isBlackjack: Boolean(serverGameState.isBlackjack ?? activePlayerHand?.isBlackjack ?? false),
      perfectPairsBetAmount: serverGameState.perfectPairsBetAmount != null ? toBigIntSafe(serverGameState.perfectPairsBetAmount) : undefined,
      perfectPairsResult: serverGameState.perfectPairsResult ?? undefined,
      perfectPairsPayout: serverGameState.perfectPairsPayout != null ? toBigIntSafe(serverGameState.perfectPairsPayout) : undefined,
      timestamp: Date.now(),
      clientSeed,
    };

    setGameState(prev => ({
      ...prev,
      currentGame: localGame,
      isPlaying: status === 'completed' ? true : status === 'player_turn' || status === 'dealer_turn',
    }));

    const currentPlayerCardCount = activePlayerHandSliced?.cards.length || 0;
    const currentDealerCardCount = dealerCards.length;

    if (currentPlayerCardCount > prevPlayerCardCountRef.current) {
      const newIndices = new Set<number>();
      for (let i = prevPlayerCardCountRef.current; i < currentPlayerCardCount; i++) {
        newIndices.add(i);
      }
      playSfx('/BlackJack/sounds/cards.wav');
      setNewCardIndices(prev => ({ ...prev, player: newIndices }));
      const indicesArray = Array.from(newIndices);
      const maxIndex = indicesArray.length > 0 ? Math.max(...indicesArray) : 0;
      const animationDelay = maxIndex * 250;
      const animationDuration = ANIMATION_TIMINGS.CARD_DEAL;
      const totalTime = animationDelay + animationDuration + 100;
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.player);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, player: updated };
        });
      }, totalTime);
    }

    if (currentDealerCardCount > prevDealerCardCountRef.current) {
      const newIndices = new Set<number>();
      for (let i = prevDealerCardCountRef.current; i < currentDealerCardCount; i++) {
        newIndices.add(i);
      }
      playSfx('/BlackJack/sounds/cards.wav');
      setNewCardIndices(prev => ({ ...prev, dealer: newIndices }));
      const indicesArray = Array.from(newIndices);
      const maxIndex = indicesArray.length > 0 ? Math.max(...indicesArray) : 0;
      const animationDelay = maxIndex * 250;
      const animationDuration = ANIMATION_TIMINGS.CARD_DEAL;
      const totalTime = animationDelay + animationDuration + 100;
      setTimeout(() => {
        setNewCardIndices(prev => {
          const updated = new Set(prev.dealer);
          newIndices.forEach(idx => updated.delete(idx));
          return { ...prev, dealer: updated };
        });
      }, totalTime);
    }

    prevPlayerCardCountRef.current = currentPlayerCardCount;
    prevDealerCardCountRef.current = currentDealerCardCount;

    return localGame;
  }, [
    address,
    calculateHandTotal,
    clientSeed,
    createCard,
    playSfx,
    prevDealerCardCountRef,
    prevPlayerCardCountRef,
    setGameState,
    setNewCardIndices,
  ]);

  const updateGameStateFromServer = useCallback((serverGameState: any) => {
    return updateGameStateFromServerCore(serverGameState);
  }, [updateGameStateFromServerCore]);

  const DEAL_PHASE_MS = 250;
  const applyPhasedBlackjackDeal = useCallback((serverGameState: any, onComplete: (localGame: any) => void) => {
    const p1 = updateGameStateFromServerCore(serverGameState, 1, 0);
    if (!p1) { onComplete(null!); return; }
    const t1 = setTimeout(() => {
      updateGameStateFromServerCore(serverGameState, 2, 0);
      setTimeout(() => {
        updateGameStateFromServerCore(serverGameState, 2, 1);
        setTimeout(() => {
          const final = updateGameStateFromServerCore(serverGameState);
          onComplete(final!);
        }, DEAL_PHASE_MS);
      }, DEAL_PHASE_MS);
    }, DEAL_PHASE_MS);
    return () => { clearTimeout(t1); };
  }, [updateGameStateFromServerCore]);

  return {
    updateGameStateFromServer,
    applyPhasedBlackjackDeal,
  };
}
