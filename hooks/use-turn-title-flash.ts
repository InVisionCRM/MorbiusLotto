'use client';

import { useEffect } from 'react';

interface UseTurnTitleFlashOptions {
  /** Attention frame shown in the tab bar. */
  alertTitle?: string;
  /** The other frame the title alternates with while flashing. */
  restingTitle?: string;
  /** Flip cadence in ms. */
  intervalMs?: number;
}

/**
 * Flash the browser tab title to grab attention when it's the player's turn.
 *
 * Only flashes while the tab is backgrounded (Page Visibility API): there's no
 * point flashing a tab the player is already looking at. The interval stops and
 * the original `document.title` is restored as soon as the player refocuses the
 * tab, the turn ends (`active` flips false), or the component unmounts.
 *
 * @param active  True when it's the local player's turn to act.
 */
export function useTurnTitleFlash(
  active: boolean,
  {
    alertTitle = '⏰ YOUR TURN',
    restingTitle = 'Morbius Poker',
    intervalMs = 1000,
  }: UseTurnTitleFlashOptions = {},
) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Not the player's turn — leave the title untouched.
    if (!active) return;

    // Captured when the turn begins; restored whenever flashing stops so we
    // never clobber whatever title the rest of the app set.
    const originalTitle = document.title;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let showAlert = false;

    const stopFlashing = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startFlashing = () => {
      if (intervalId != null) return; // already flashing
      showAlert = true;
      document.title = alertTitle; // show the alert immediately, don't wait a tick
      intervalId = setInterval(() => {
        showAlert = !showAlert;
        document.title = showAlert ? alertTitle : restingTitle;
      }, intervalMs);
    };

    // Flash only while backgrounded; restore the moment the tab is focused.
    const sync = () => {
      if (document.hidden) {
        startFlashing();
      } else {
        stopFlashing();
        document.title = originalTitle;
      }
    };

    document.addEventListener('visibilitychange', sync);
    sync(); // handle a turn that arrives while the tab is already hidden

    return () => {
      document.removeEventListener('visibilitychange', sync);
      stopFlashing();
      document.title = originalTitle;
    };
  }, [active, alertTitle, restingTitle, intervalMs]);
}
