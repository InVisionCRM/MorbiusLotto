/**
 * Poker UI themes. Add new themes here; components use CSS variables so only
 * this file and optional theme-specific classes need to change.
 */

import type { CSSProperties } from 'react';

export type PokerThemeId = 'classic' | 'cyberpunk';

export const POKER_THEME_IDS: PokerThemeId[] = ['classic', 'cyberpunk'];

/** CSS variable names used by poker components. */
export const POKER_THEME_VARS = {
  bg: '--poker-bg',
  bgElevated: '--poker-bg-elevated',
  accent: '--poker-accent',
  accentMuted: '--poker-accent-muted',
  danger: '--poker-danger',
  dangerMuted: '--poker-danger-muted',
  tableBg: '--poker-table-bg',
  tableBorder: '--poker-table-border',
  tableInner: '--poker-table-inner',
  cardBg: '--poker-card-bg',
  cardBorder: '--poker-card-border',
  text: '--poker-text',
  textMuted: '--poker-text-muted',
  panelBg: '--poker-panel-bg',
  panelBorder: '--poker-panel-border',
  chip: '--poker-chip',
  fontMono: '--poker-font-mono',
  tracking: '--poker-tracking',
} as const;

export type PokerThemeVars = Record<string, string>;

export const POKER_THEMES: Record<PokerThemeId, PokerThemeVars> = {
  classic: {
    [POKER_THEME_VARS.bg]: 'rgb(2 6 23)',
    [POKER_THEME_VARS.bgElevated]: 'rgba(15, 23, 42, 0.4)',
    [POKER_THEME_VARS.accent]: 'rgb(34 211 238)',
    [POKER_THEME_VARS.accentMuted]: 'rgba(34, 211, 238, 0.5)',
    [POKER_THEME_VARS.danger]: 'rgb(239 68 68)',
    [POKER_THEME_VARS.dangerMuted]: 'rgba(239, 68, 68, 0.5)',
    [POKER_THEME_VARS.tableBg]: 'linear-gradient(160deg, #0d5c2e 0%, #0a4d26 50%, #083d1e 100%)',
    [POKER_THEME_VARS.tableBorder]: 'rgba(0,0,0,0.5)',
    [POKER_THEME_VARS.tableInner]: 'rgba(0,0,0,0.2)',
    [POKER_THEME_VARS.cardBg]: 'rgba(15, 23, 42, 0.35)',
    [POKER_THEME_VARS.cardBorder]: 'rgba(255,255,255,0.1)',
    [POKER_THEME_VARS.text]: 'rgb(241 245 249)',
    [POKER_THEME_VARS.textMuted]: 'rgb(148 163 184)',
    [POKER_THEME_VARS.panelBg]: 'rgba(15, 23, 42, 0.55)',
    [POKER_THEME_VARS.panelBorder]: 'rgba(34, 211, 238, 0.25)',
    [POKER_THEME_VARS.chip]: 'rgb(253 224 71)',
    [POKER_THEME_VARS.fontMono]: '0',
    [POKER_THEME_VARS.tracking]: '0',
  },
  cyberpunk: {
    [POKER_THEME_VARS.bg]: '#050505',
    [POKER_THEME_VARS.bgElevated]: 'rgba(10, 15, 20, 0.8)',
    [POKER_THEME_VARS.accent]: '#00ffaa',
    [POKER_THEME_VARS.accentMuted]: 'rgba(0, 255, 170, 0.5)',
    [POKER_THEME_VARS.danger]: '#ff0055',
    [POKER_THEME_VARS.dangerMuted]: 'rgba(255, 0, 85, 0.5)',
    [POKER_THEME_VARS.tableBg]: 'rgba(10, 15, 20, 0.8)',
    [POKER_THEME_VARS.tableBorder]: '#00ffaa',
    [POKER_THEME_VARS.tableInner]: 'rgba(0, 255, 170, 0.3)',
    [POKER_THEME_VARS.cardBg]: '#050505',
    [POKER_THEME_VARS.cardBorder]: '#00ffaa',
    [POKER_THEME_VARS.text]: '#ffffff',
    [POKER_THEME_VARS.textMuted]: 'rgba(255,255,255,0.6)',
    [POKER_THEME_VARS.panelBg]: '#050505',
    [POKER_THEME_VARS.panelBorder]: 'rgba(0, 255, 170, 0.3)',
    [POKER_THEME_VARS.chip]: '#00ffaa',
    [POKER_THEME_VARS.fontMono]: '1',
    [POKER_THEME_VARS.tracking]: '0.2em',
  },
};

export const DEFAULT_POKER_THEME: PokerThemeId = 'cyberpunk';

/** Returns inline style object to set CSS variables on a wrapper. */
export function getPokerThemeVars(themeId: PokerThemeId): CSSProperties {
  const vars = POKER_THEMES[themeId];
  const style: CSSProperties = {};
  for (const [key, value] of Object.entries(vars)) {
    (style as Record<string, string>)[key] = value;
  }
  return style;
}
