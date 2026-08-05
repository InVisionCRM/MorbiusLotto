/**
 * table-card-backs.ts — the backs a player can put on the felt.
 *
 * Pure CSS so a back costs nothing to load and scales with the card. Each one
 * is a background stack plus an optional glyph, applied by TableCard.
 *
 * The choice is remembered across games and reloads under one key: someone who
 * picked a back at a blackjack table expects to see it at Caribbean Stud too.
 */

const BACK_KEY = 'morb_table_card_back';

export interface TableCardBack {
  id: string;
  label: string;
  /** CSS background shorthand for the card face-down. */
  background: string;
  /** Inset ring + drop shadow. */
  boxShadow: string;
  /** Centre glyph, or null for a pattern-only back. */
  glyph: string | null;
  glyphColor: string;
}

export const TABLE_CARD_BACKS: TableCardBack[] = [
  {
    id: 'abyss',
    label: 'Abyss',
    background: 'linear-gradient(135deg,#0c2a38,#06121b)',
    boxShadow: 'inset 0 0 0 1px rgba(34,211,238,.3),0 3px 8px -3px rgba(0,0,0,.6)',
    glyph: '✦',
    glyphColor: '#67e8f9',
  },
  {
    id: 'lattice',
    label: 'Lattice',
    // Two crossed gradients make a woven diamond grid — the classic card back,
    // without an image.
    background:
      'repeating-linear-gradient(45deg,rgba(34,211,238,.16) 0 3px,transparent 3px 8px),' +
      'repeating-linear-gradient(-45deg,rgba(34,211,238,.16) 0 3px,transparent 3px 8px),' +
      'linear-gradient(160deg,#0e2c3c,#071620)',
    boxShadow: 'inset 0 0 0 1px rgba(34,211,238,.35),0 3px 8px -3px rgba(0,0,0,.6)',
    glyph: null,
    glyphColor: '#67e8f9',
  },
  {
    id: 'crimson',
    label: 'Crimson',
    background:
      'repeating-linear-gradient(45deg,rgba(255,255,255,.07) 0 4px,transparent 4px 9px),' +
      'linear-gradient(150deg,#5b1220,#2a0810)',
    boxShadow: 'inset 0 0 0 1px rgba(251,113,133,.45),0 3px 8px -3px rgba(0,0,0,.6)',
    glyph: '❖',
    glyphColor: '#fda4af',
  },
  {
    id: 'gold',
    label: 'High Roller',
    background:
      'repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 2px,transparent 2px 7px),' +
      'linear-gradient(150deg,#4a3410,#1c1206)',
    boxShadow: 'inset 0 0 0 1px rgba(251,191,36,.5),0 3px 8px -3px rgba(0,0,0,.6)',
    glyph: '✵',
    glyphColor: '#fcd34d',
  },
  {
    id: 'void',
    label: 'Void',
    background: 'linear-gradient(135deg,#1b1b23,#0a0a0e)',
    boxShadow: 'inset 0 0 0 1px rgba(148,163,184,.35),0 3px 8px -3px rgba(0,0,0,.6)',
    glyph: '◆',
    glyphColor: '#94a3b8',
  },
];

export const DEFAULT_CARD_BACK = TABLE_CARD_BACKS[0];

export function cardBackById(id: string | null | undefined): TableCardBack {
  return TABLE_CARD_BACKS.find((b) => b.id === id) ?? DEFAULT_CARD_BACK;
}

export function loadCardBack(): TableCardBack {
  if (typeof window === 'undefined') return DEFAULT_CARD_BACK;
  try {
    return cardBackById(window.localStorage.getItem(BACK_KEY));
  } catch {
    return DEFAULT_CARD_BACK;
  }
}

export function saveCardBack(id: string): void {
  try {
    window.localStorage.setItem(BACK_KEY, id);
  } catch {
    /* preference just won't survive the reload */
  }
}
