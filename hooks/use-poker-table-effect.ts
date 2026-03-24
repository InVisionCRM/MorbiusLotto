'use client';

import { useState, useEffect, useCallback } from 'react';

export type TableEffectId = 'beams' | 'boxes' | 'none';

const STORAGE_KEY = 'poker-table-effect';
const COLOR_STORAGE_KEY = 'poker-table-felt-color';

export const TABLE_EFFECT_OPTIONS: { id: TableEffectId; label: string; description: string }[] = [
  { id: 'beams', label: 'Energy Beams', description: 'Animated light beams with color cycling' },
  { id: 'boxes', label: 'Grid Boxes', description: 'Isometric grid with interactive highlights' },
  { id: 'none', label: 'None', description: 'Clean felt, no animation' },
];

/** Preset felt colors — navy is the current default. */
export const FELT_COLOR_PRESETS = [
  { id: 'navy', label: 'Navy', gradient: 'radial-gradient(ellipse at 50% 35%, #1f2e54 0%, #131e3a 45%, #0c1428 75%, #080e1e 100%)' },
  { id: 'emerald', label: 'Emerald', gradient: 'radial-gradient(ellipse at 50% 35%, #1a4a2e 0%, #0f3320 45%, #0a2418 75%, #061810 100%)' },
  { id: 'crimson', label: 'Crimson', gradient: 'radial-gradient(ellipse at 50% 35%, #4a1a1a 0%, #331010 45%, #240a0a 75%, #180606 100%)' },
  { id: 'purple', label: 'Royal', gradient: 'radial-gradient(ellipse at 50% 35%, #2e1a4a 0%, #1e1033 45%, #140a24 75%, #0c0618 100%)' },
  { id: 'slate', label: 'Slate', gradient: 'radial-gradient(ellipse at 50% 35%, #2a2e36 0%, #1c2028 45%, #14171e 75%, #0c0e14 100%)' },
  { id: 'midnight', label: 'Midnight', gradient: 'radial-gradient(ellipse at 50% 35%, #0e1a2e 0%, #080f1c 45%, #050a14 75%, #02060c 100%)' },
];

export function usePokerTableEffect() {
  const [effect, setEffectState] = useState<TableEffectId>('beams');
  const [feltColor, setFeltColorState] = useState('navy');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['beams', 'boxes', 'none'].includes(stored)) {
        setEffectState(stored as TableEffectId);
      }
      const storedColor = localStorage.getItem(COLOR_STORAGE_KEY);
      if (storedColor) {
        setFeltColorState(storedColor);
      }
    } catch { /* SSR or private browsing */ }
  }, []);

  const setEffect = useCallback((id: TableEffectId) => {
    setEffectState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  const setFeltColor = useCallback((id: string) => {
    setFeltColorState(id);
    try { localStorage.setItem(COLOR_STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  const feltGradient = FELT_COLOR_PRESETS.find(p => p.id === feltColor)?.gradient ?? FELT_COLOR_PRESETS[0].gradient;

  return { effect, setEffect, feltColor, setFeltColor, feltGradient };
}
