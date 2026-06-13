// ── Craps types (Phase 1 — client-only engine, ported from craps-high-roller lab) ──
// Phase 2 will mirror these on the server with pfService dice commit/reveal.

export type Phase = 'COME_OUT' | 'POINT';

export type BetType =
  | 'PASS'
  | 'DONT_PASS'
  | 'FIELD'
  | 'PLACE_4'
  | 'PLACE_5'
  | 'PLACE_6'
  | 'PLACE_8'
  | 'PLACE_9'
  | 'PLACE_10'
  | 'ANY_7'
  | 'ANY_CRAPS';

export interface RollResult {
  wins: number;
  lost: number;
  sum: number;
  isPoint?: boolean;
  isSevenOut?: boolean;
}

export interface CrapsState {
  bankroll: number;
  bets: Record<string, number>;
  phase: Phase;
  point: number | null;
  dice: [number, number];
  isRolling: boolean;
  lastResult: RollResult | null;
  rollHistory: number[];
}

/** Starter bankroll for the offline lab. Phase 2 replaces this with a real source. */
export const INITIAL_BANKROLL = 5000;

/** Chip denominations rendered on the rail. */
export const CRAPS_CHIP_LADDER = [1, 5, 25, 100, 1000] as const;
