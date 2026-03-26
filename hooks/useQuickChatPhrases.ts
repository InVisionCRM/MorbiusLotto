'use client';

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_QUICKCHAT_PHRASES } from '@/components/poker/quickchat-phrases';

const MAX_PHRASES = 25;

function loadPhrases(storageKey: string, defaults: string[]): string[] {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    const list = parsed.filter((x): x is string => typeof x === 'string');
    return list.length > 0 ? list.slice(0, MAX_PHRASES) : defaults;
  } catch {
    return defaults;
  }
}

/**
 * Persisted QuickChat phrase list.
 * Pass optional `storageKey` and `defaultPhrases` to customise per-game.
 * Returns [phrases, setPhrases]. setPhrases validates (max 25) and writes to localStorage.
 */
export function useQuickChatPhrases(
  storageKey = 'morb_poker_quickchat',
  defaultPhrases: string[] = DEFAULT_QUICKCHAT_PHRASES,
): [string[], (phrases: string[]) => void] {
  const [phrases, setPhrasesState] = useState<string[]>(defaultPhrases);

  useEffect(() => {
    setPhrasesState(loadPhrases(storageKey, defaultPhrases));
  }, [storageKey, defaultPhrases]);

  const setPhrases = useCallback((next: string[]) => {
    const valid = next.filter((x): x is string => typeof x === 'string').slice(0, MAX_PHRASES);
    setPhrasesState(valid);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(valid));
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  return [phrases, setPhrases];
}
