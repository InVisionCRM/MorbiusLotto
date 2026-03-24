'use client';

import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';

export type TableEffectId = 'beams' | 'none';

const STORAGE_KEY = 'poker-table-effect';
const COLOR_STORAGE_KEY = 'poker-table-felt-color';
const RAIL_COLOR_STORAGE_KEY = 'poker-table-rail-color';

export const TABLE_EFFECT_OPTIONS: { id: TableEffectId; label: string; description: string }[] = [
  { id: 'beams', label: 'Energy Beams', description: 'Animated light beams with color cycling' },
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

/** Preset rail colors — gold is the classic default. */
export const RAIL_COLOR_PRESETS = [
  {
    id: 'gold',
    label: 'Gold',
    swatch: '#d4a82a',
    outerRing: 'linear-gradient(170deg, #d4a82a 0%, #8a6010 30%, #c89828 50%, #8a6010 70%, #d4a82a 100%)',
    outerGlow: 'inset 0 1px 4px rgba(255,230,120,0.35), inset 0 -1px 4px rgba(0,0,0,0.5)',
    cushion: 'linear-gradient(180deg, #1c1508 0%, #0e0c04 50%, #181304 100%)',
    innerRing: 'linear-gradient(170deg, #b08820 0%, #6a4c0c 30%, #a07818 50%, #6a4c0c 70%, #b08820 100%)',
    innerGlow: 'inset 0 1px 3px rgba(255,210,80,0.3)',
  },
  {
    id: 'silver',
    label: 'Silver',
    swatch: '#a0a8b8',
    outerRing: 'linear-gradient(170deg, #b0b8c8 0%, #6a7080 30%, #a0a8b8 50%, #6a7080 70%, #b0b8c8 100%)',
    outerGlow: 'inset 0 1px 4px rgba(200,210,230,0.35), inset 0 -1px 4px rgba(0,0,0,0.5)',
    cushion: 'linear-gradient(180deg, #141618 0%, #0c0e10 50%, #101214 100%)',
    innerRing: 'linear-gradient(170deg, #8890a0 0%, #50586a 30%, #788090 50%, #50586a 70%, #8890a0 100%)',
    innerGlow: 'inset 0 1px 3px rgba(180,190,210,0.3)',
  },
  {
    id: 'rosegold',
    label: 'Rose Gold',
    swatch: '#c27a68',
    outerRing: 'linear-gradient(170deg, #d4917a 0%, #a05840 30%, #c88068 50%, #a05840 70%, #d4917a 100%)',
    outerGlow: 'inset 0 1px 4px rgba(255,180,160,0.35), inset 0 -1px 4px rgba(0,0,0,0.5)',
    cushion: 'linear-gradient(180deg, #1c1210 0%, #0e0a08 50%, #181010 100%)',
    innerRing: 'linear-gradient(170deg, #b06850 0%, #704030 30%, #a06048 50%, #704030 70%, #b06850 100%)',
    innerGlow: 'inset 0 1px 3px rgba(255,160,130,0.3)',
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    swatch: '#2a2e36',
    outerRing: 'linear-gradient(170deg, #3a3e48 0%, #1a1e26 30%, #2e3238 50%, #1a1e26 70%, #3a3e48 100%)',
    outerGlow: 'inset 0 1px 4px rgba(100,110,130,0.25), inset 0 -1px 4px rgba(0,0,0,0.6)',
    cushion: 'linear-gradient(180deg, #0e1014 0%, #080a0c 50%, #0c0e12 100%)',
    innerRing: 'linear-gradient(170deg, #282c34 0%, #14181e 30%, #222630 50%, #14181e 70%, #282c34 100%)',
    innerGlow: 'inset 0 1px 3px rgba(80,90,110,0.25)',
  },
  {
    id: 'bronze',
    label: 'Bronze',
    swatch: '#a07040',
    outerRing: 'linear-gradient(170deg, #b88050 0%, #705028 30%, #a87848 50%, #705028 70%, #b88050 100%)',
    outerGlow: 'inset 0 1px 4px rgba(220,170,100,0.35), inset 0 -1px 4px rgba(0,0,0,0.5)',
    cushion: 'linear-gradient(180deg, #181008 0%, #0c0804 50%, #140e06 100%)',
    innerRing: 'linear-gradient(170deg, #906838 0%, #584020 30%, #886030 50%, #584020 70%, #906838 100%)',
    innerGlow: 'inset 0 1px 3px rgba(200,150,80,0.3)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#2a8a5a',
    outerRing: 'linear-gradient(170deg, #38a870 0%, #1a6040 30%, #309860 50%, #1a6040 70%, #38a870 100%)',
    outerGlow: 'inset 0 1px 4px rgba(100,230,160,0.3), inset 0 -1px 4px rgba(0,0,0,0.5)',
    cushion: 'linear-gradient(180deg, #0a1810 0%, #06100a 50%, #081410 100%)',
    innerRing: 'linear-gradient(170deg, #288050 0%, #145030 30%, #207048 50%, #145030 70%, #288050 100%)',
    innerGlow: 'inset 0 1px 3px rgba(80,200,140,0.3)',
  },
];

// ── Context for shared state between PokerTable and settings modal ────

interface TableEffectState {
  effect: TableEffectId;
  setEffect: (id: TableEffectId) => void;
  feltColor: string;
  setFeltColor: (id: string) => void;
  feltGradient: string;
  railColor: string;
  setRailColor: (id: string) => void;
  railStyle: (typeof RAIL_COLOR_PRESETS)[number];
}

const TableEffectContext = createContext<TableEffectState | null>(null);

export function PokerTableEffectProvider({ children }: { children: React.ReactNode }) {
  const [effect, setEffectState] = useState<TableEffectId>('beams');
  const [feltColor, setFeltColorState] = useState('navy');
  const [railColor, setRailColorState] = useState('gold');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['beams', 'none'].includes(stored)) {
        setEffectState(stored as TableEffectId);
      }
      const storedColor = localStorage.getItem(COLOR_STORAGE_KEY);
      if (storedColor) {
        setFeltColorState(storedColor);
      }
      const storedRail = localStorage.getItem(RAIL_COLOR_STORAGE_KEY);
      if (storedRail) {
        setRailColorState(storedRail);
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

  const setRailColor = useCallback((id: string) => {
    setRailColorState(id);
    try { localStorage.setItem(RAIL_COLOR_STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  const feltGradient = FELT_COLOR_PRESETS.find(p => p.id === feltColor)?.gradient ?? FELT_COLOR_PRESETS[0].gradient;
  const railStyle = RAIL_COLOR_PRESETS.find(p => p.id === railColor) ?? RAIL_COLOR_PRESETS[0];

  return React.createElement(
    TableEffectContext.Provider,
    { value: { effect, setEffect, feltColor, setFeltColor, feltGradient, railColor, setRailColor, railStyle } },
    children,
  );
}

export function usePokerTableEffect(): TableEffectState {
  const ctx = useContext(TableEffectContext);
  if (!ctx) throw new Error('usePokerTableEffect must be used within PokerTableEffectProvider');
  return ctx;
}
