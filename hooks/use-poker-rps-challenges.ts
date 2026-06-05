'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * "Accept Rock-Paper-Scissors challenges" toggle (default ON), persisted to
 * localStorage. When off, the client silently auto-declines incoming RPS
 * challenges (the challenger sees "not accepting challenges"). Mirrors the
 * localStorage pattern in use-poker-sounds.ts.
 */

const STORAGE_KEY = 'poker:rps-challenges:v1';

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return true; // default on
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function usePokerRpsChallenges() {
  // Default on for SSR; hydrate from localStorage on mount.
  const [enabled, setEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabledState(readEnabled());
    setHydrated(true);
  }, []);

  // Keep multiple tabs / the settings modal in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(readEnabled());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => setEnabled(!readEnabled()), [setEnabled]);

  return { enabled, setEnabled, toggle, hydrated };
}
