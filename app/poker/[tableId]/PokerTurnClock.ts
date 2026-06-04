'use client';

import { useEffect, useRef, useState } from 'react';
import type { PokerCurrentHand } from '@/lib/websocket-client';

/**
 * Per-turn countdown. `totalSeconds` should match the server's clock for this table —
 * the tournament's `actionTimerSeconds` (creator-chosen), or 60 for cash games / when unset.
 * Keeping these in sync means the on-screen countdown hits 0 exactly when the server
 * auto-checks/folds, instead of the old hardcoded 60s that drifted on faster clocks.
 */
export function usePokerTurnClock(
  hand: PokerCurrentHand | null | undefined,
  totalSeconds: number = 60,
) {
  const total = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 60;
  const [timeLeft, setTimeLeft] = useState<number>(total);
  const timerHandIdRef = useRef<string | null>(null);
  const timerPositionRef = useRef<number | null>(null);

  useEffect(() => {
    const turnStartedAt = hand?.turnStartedAt ?? null;
    const actingPosition = hand?.actingPosition ?? null;

    const key = `${hand?.handId}:${actingPosition}`;
    const prevKey = `${timerHandIdRef.current}:${timerPositionRef.current}`;
    if (key !== prevKey) {
      timerHandIdRef.current = hand?.handId ?? null;
      timerPositionRef.current = actingPosition;
      if (turnStartedAt && actingPosition != null) {
        const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
        setTimeLeft(Math.max(0, Math.round(total - elapsed)));
      } else {
        setTimeLeft(total);
      }
    }

    if (!turnStartedAt || actingPosition == null) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
      const remaining = Math.max(0, Math.round(total - elapsed));
      setTimeLeft(remaining);
    }, 500);

    return () => clearInterval(interval);
  }, [hand?.turnStartedAt, hand?.actingPosition, hand?.handId, total]);

  return timeLeft;
}
