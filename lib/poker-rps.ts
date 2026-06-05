/**
 * Client-side RPS constants for the table mini-game (just-for-fun, no stakes).
 * The authoritative resolver + state machine live server-side in
 * server/src/services/poker-rps.ts; this is purely presentational.
 */

export type RpsChoice = 'rock' | 'paper' | 'scissors';

export const RPS_CHOICES: readonly RpsChoice[] = ['rock', 'paper', 'scissors'];

export const RPS_EMOJI: Record<RpsChoice, string> = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️',
};

export const RPS_LABEL: Record<RpsChoice, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
};

export function isRpsChoice(x: unknown): x is RpsChoice {
  return typeof x === 'string' && (RPS_CHOICES as readonly string[]).includes(x);
}

/** Reveal toss animation duration (emoji flings up over the seat then fades). */
export const RPS_REVEAL_FLY_MS = 1500;
