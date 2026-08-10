'use client';

/**
 * useStagedReveal — turn "here are N cards" into a dealer laying them down.
 *
 * The server hands a felt a whole street, or a whole dealer hand, at once. Left
 * alone that renders as a jump cut: four cards appear in the same frame with a
 * rattle of sound over the top. This hook is the thing in between — it owns a
 * count of how many cards have actually been turned for this viewer, and walks
 * that count up on a timer so the table reads as a person dealing.
 *
 * It says nothing about cards. A game keeps rendering whatever the server sent
 * and simply asks "is index i under `shown` yet?" to decide face-up or face-down;
 * TableCard does the rest, because a change to `faceDown` is a real CSS flip.
 *
 * Lifted verbatim in behaviour from the multiplayer hold'em felt, which is where
 * this pacing was tuned, so every table that adopts it feels like the same room.
 *
 * REDUCED MOTION is deliberately not special-cased here. The stagger is pacing,
 * not movement — someone who has asked for less motion still wants to see the
 * dealer work through the hand, they just don't want the card to spin getting
 * there, and TableCard already drops the spin on its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Beat between two freshly dealt cards landing. */
export const REVEAL_DEAL_GAP = 280;
/** A hand that decides the round gets a beat to itself before it turns. */
export const REVEAL_SHOWDOWN_PAUSE = 420;
/** Turning an already-dealt card over reads slower than dealing a new one. */
export const REVEAL_FLIP_GAP = 340;
/** How long after the last card lands before the round is allowed to speak. */
export const REVEAL_SETTLE_DELAY = 260;

export interface RevealOptions {
  /** Milliseconds between cards. Defaults to REVEAL_DEAL_GAP. */
  gap?: number;
  /** Wait before the first card turns — a pause for effect. */
  startDelay?: number;
  /** Fires as each card turns, with its 0-based index. Play the sound here. */
  onCard?: (index: number) => void;
  /** Fires after the last card has had a beat to land. Settle the round here. */
  onSettled?: () => void;
  /** How long that beat is. Defaults to REVEAL_SETTLE_DELAY. */
  settleDelay?: number;
}

export interface StagedReveal {
  /** How many cards have been turned. Render index < shown as face-up. */
  shown: number;
  /** Walk `shown` up to `target`, one card per `gap`. */
  revealTo: (target: number, opts?: RevealOptions) => void;
  /**
   * Jump straight to `n` with no theatre. For walking in on a hand already in
   * progress: those cards were turned before we got here, so dealing them now
   * would be a performance about a moment that has passed.
   */
  snapTo: (n: number) => void;
  /**
   * Run something on this reveal's clock — cancelled and cleaned up with it.
   * For the beats that aren't a card turning, like the pair of hole cards being
   * pitched, which is sound with no face to show.
   */
  schedule: (delay: number, fn: () => void) => void;
  /** Drop any reveal still in flight. */
  cancel: () => void;
}

export function useStagedReveal(initial = 0): StagedReveal {
  const [shown, setShown] = useState(initial);
  // Mirrored so a caller can start a reveal from wherever the last one got to
  // without reading it inside a state updater — React may run an updater twice,
  // which would schedule the whole street's reveals twice over.
  const shownRef = useRef(initial);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // A reveal in flight when the felt goes away would otherwise fire into a dead
  // component.
  useEffect(() => cancel, [cancel]);

  const snapTo = useCallback(
    (n: number) => {
      cancel();
      shownRef.current = n;
      setShown(n);
    },
    [cancel],
  );

  const revealTo = useCallback((target: number, opts: RevealOptions = {}) => {
    const {
      gap = REVEAL_DEAL_GAP,
      startDelay = 0,
      onCard,
      onSettled,
      settleDelay = REVEAL_SETTLE_DELAY,
    } = opts;

    const from = shownRef.current;

    // Nothing new to turn. The round still has to be allowed to speak, or a
    // hand that reveals no cards (everyone folded, dealer already exposed)
    // would never settle.
    if (target <= from) {
      if (onSettled) timers.current.push(setTimeout(onSettled, startDelay + settleDelay));
      return;
    }

    for (let n = from; n < target; n++) {
      const at = startDelay + (n - from) * gap;
      timers.current.push(
        setTimeout(() => {
          shownRef.current = n + 1;
          setShown(n + 1);
          onCard?.(n);
        }, at),
      );
    }

    if (onSettled) {
      const last = startDelay + (target - from - 1) * gap;
      timers.current.push(setTimeout(onSettled, last + settleDelay));
    }
  }, []);

  const schedule = useCallback((delay: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, delay));
  }, []);

  return { shown, revealTo, snapTo, schedule, cancel };
}
