import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared helper for blackjack dealer reveal completion.
 * Schedules a one-shot completion callback with optional delay and exposes
 * completion state for UI gates that should wait until reveal has finished.
 */
export function useBlackjackRevealCompletion(onComplete?: () => void) {
  const [revealComplete, setRevealComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRevealComplete = useCallback(() => {
    clearTimer();
    doneRef.current = false;
    setRevealComplete(false);
  }, [clearTimer]);

  const scheduleRevealComplete = useCallback(
    (delayMs = 0) => {
      if (doneRef.current || timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (doneRef.current) return;
        doneRef.current = true;
        setRevealComplete(true);
        onCompleteRef.current?.();
      }, Math.max(0, delayMs));
    },
    [],
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { revealComplete, scheduleRevealComplete, resetRevealComplete };
}

