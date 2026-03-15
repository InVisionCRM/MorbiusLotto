'use client';

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_QUICKCHAT_PHRASES } from '@/components/poker/quickchat-phrases';

const STORAGE_KEY = 'morb_poker_quickchat';
const MAX_PHRASES = 25;

function loadPhrases(): string[] {
  if (typeof window === 'undefined') return DEFAULT_QUICKCHAT_PHRASES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICKCHAT_PHRASES;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_QUICKCHAT_PHRASES;
    const list = parsed.filter((x): x is string => typeof x === 'string');
    return list.length > 0 ? list.slice(0, MAX_PHRASES) : DEFAULT_QUICKCHAT_PHRASES;
  } catch {
    return DEFAULT_QUICKCHAT_PHRASES;
  }
}

/**
 * Persisted QuickChat phrase list for the poker seat picker.
 * Returns [phrases, setPhrases]. setPhrases validates (max 25) and writes to localStorage.
 */
export function useQuickChatPhrases(): [string[], (phrases: string[]) => void] {
  const [phrases, setPhrasesState] = useState<string[]>(DEFAULT_QUICKCHAT_PHRASES);

  useEffect(() => {
    setPhrasesState(loadPhrases());
  }, []);

  const setPhrases = useCallback((next: string[]) => {
    const valid = next.filter((x): x is string => typeof x === 'string').slice(0, MAX_PHRASES);
    setPhrasesState(valid);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch {
        // ignore
      }
    }
  }, []);

  return [phrases, setPhrases];
}
