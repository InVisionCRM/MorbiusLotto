import { useEffect, useMemo, useRef, useState } from 'react';

type UseBlackjackDealerRevealOptions = {
  totalCards: number;
  phase: string;
  playingPhase?: string;
  revealPhases?: string[];
  holeCardDelayMs?: number;
  perCardDelayMs?: number;
  onRevealCard?: () => void;
};

/**
 * Shared dealer reveal flow for blackjack table UIs.
 * - During playing phase: show currently available dealer cards (typically 1).
 * - During reveal phases: when card count increases, reveal one card at a time.
 */
export function useBlackjackDealerReveal({
  totalCards,
  phase,
  playingPhase = 'playing',
  revealPhases = ['dealer_turn', 'completed'],
  holeCardDelayMs = 800,
  perCardDelayMs = 1200,
  onRevealCard,
}: UseBlackjackDealerRevealOptions) {
  const [visibleCards, setVisibleCards] = useState(0);
  const visibleRef = useRef(0);
  const prevTotalRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    visibleRef.current = visibleCards;
  }, [visibleCards]);

  const revealPhaseSet = useMemo(() => new Set(revealPhases), [revealPhases]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (totalCards === 0) {
      clearTimer();
      prevTotalRef.current = 0;
      if (visibleRef.current !== 0) {
        visibleRef.current = 0;
        setVisibleCards(0);
      }
      return;
    }

    if (phase === playingPhase) {
      clearTimer();
      prevTotalRef.current = totalCards;
      if (visibleRef.current !== totalCards) {
        visibleRef.current = totalCards;
        setVisibleCards(totalCards);
      }
      return;
    }

    const prevTotal = prevTotalRef.current;
    const shouldReveal = totalCards > prevTotal && revealPhaseSet.has(phase);
    if (!shouldReveal) {
      prevTotalRef.current = totalCards;
      return;
    }

    clearTimer();

    let idx = Math.max(visibleRef.current, 1);
    const revealNext = () => {
      idx += 1;
      if (idx <= totalCards) {
        visibleRef.current = idx;
        setVisibleCards(idx);
        onRevealCard?.();
        if (idx < totalCards) {
          timerRef.current = setTimeout(revealNext, perCardDelayMs);
        }
      }
    };

    timerRef.current = setTimeout(revealNext, holeCardDelayMs);
    prevTotalRef.current = totalCards;

    return clearTimer;
  }, [
    totalCards,
    phase,
    playingPhase,
    revealPhaseSet,
    holeCardDelayMs,
    perCardDelayMs,
    onRevealCard,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return visibleCards;
}

