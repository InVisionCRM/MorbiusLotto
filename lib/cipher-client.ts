/**
 * cipher-client.ts — client types + API wrappers for chips Cipher (/cipher).
 *
 * Mastermind code-breaking. Talks to the /api/arcade/cipher/* endpoints — the
 * backend accepts either Telegram initData or the SIWE morb_session cookie, so
 * the web client just relies on apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet, seals the secret code behind a committed
 * hash) → guess (submit a guess, get exact/partial peg feedback) → crack (full
 * code → crack ladder), cashout (bank the secured value for best exact pegs), or
 * a bust on the last guess. `fetchCipherActive` recovers the active round after a
 * refresh. The secret code and server seed are never present in an active-round
 * response — only on settle (guess/cashout) and verify.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type CipherDifficulty = 'easy' | 'medium' | 'hard';

export const CIPHER_DIFFICULTY_ORDER: readonly CipherDifficulty[] = ['easy', 'medium', 'hard'];

export const CIPHER_DIFFICULTY_LABELS: Record<CipherDifficulty, string> = {
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
};

/** Code-peg colours (game tokens, not chrome) — letter for colour-blind clarity. */
export const CIPHER_COLORS: { c: string; l: string }[] = [
  { c: '#22D3EE', l: 'A' },
  { c: '#F59E0B', l: 'B' },
  { c: '#FB7185', l: 'C' },
  { c: '#34D399', l: 'D' },
  { c: '#A78BFA', l: 'E' },
  { c: '#60A5FA', l: 'F' },
];

export interface CipherDifficultyInfo {
  codeLen: number;
  symbols: number;
  maxGuesses: number;
  /** crack[g] = ×100 multiplier for cracking on guess g (1-based); crack[0] unused. */
  crack: number[];
  /** secure[e] = ×100 multiplier banked at best-exact-peg count e; secure[0] = 0. */
  secure: number[];
}

export interface CipherInfo {
  minBet: number;
  maxBet: number;
  houseEdgeBp: number;
  difficulties: Record<CipherDifficulty, CipherDifficultyInfo>;
}

export interface CipherGuessRecord {
  guess: number[];
  exact: number;
  partial: number;
}

export interface CipherActiveRound {
  roundId: string;
  bet: number;
  difficulty: CipherDifficulty;
  codeLen: number;
  symbols: number;
  maxGuesses: number;
  crack: number[];
  secure: number[];
  guesses: CipherGuessRecord[];
  guessCount: number;
  bestExact: number;
  crackNextX100: number;
  securedX100: number;
  serverSeedHash: string;
}

export interface CipherStartResult {
  roundId: string;
  bet: number;
  difficulty: CipherDifficulty;
  codeLen: number;
  symbols: number;
  maxGuesses: number;
  crack: number[];
  secure: number[];
  crackNextX100: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  chipBalance: string;
}

export type CipherGuessResult =
  | {
      /** Guess accepted, round continues. */
      exact: number;
      partial: number;
      guessCount: number;
      bestExact: number;
      cracked: false;
      settled: false;
      guessesRemaining: number;
      crackNextX100: number;
      securedX100: number;
      cashoutPayout: number;
    }
  | {
      /** Full crack — auto-settled as a win at the crack ladder. */
      exact: number;
      partial: number;
      guessCount: number;
      bestExact: number;
      cracked: true;
      settled: true;
      won: true;
      multiplierX100: number;
      payout: number;
      code: number[];
      status: 'settled';
      serverSeed: string;
      chipBalance: string;
    }
  | {
      /** Last guess spent without a crack — bust. */
      exact: number;
      partial: number;
      guessCount: number;
      bestExact: number;
      cracked: false;
      settled: true;
      won: false;
      multiplierX100: 0;
      payout: 0;
      code: number[];
      status: 'settled';
      serverSeed: string;
    };

export interface CipherCashoutResult {
  roundId: string;
  bestExact: number;
  multiplierX100: number;
  payout: number;
  code: number[];
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface CipherHistoryRound {
  roundId: string;
  bet: number;
  difficulty: CipherDifficulty;
  guessCount: number;
  bestExact: number;
  cracked: boolean;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface CipherRecentRound extends CipherHistoryRound {
  wallet: string;
}

export interface CipherLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface CipherVerifyResult {
  roundId: string;
  bet: number;
  difficulty: CipherDifficulty;
  codeLen: number;
  symbols: number;
  maxGuesses: number;
  crack: number[];
  secure: number[];
  code: number[];
  guesses: CipherGuessRecord[];
  guessCount: number;
  bestExact: number;
  cracked: boolean;
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  settledAt: string | null;
  recipe: string;
}

/** Mastermind feedback for a guess against a code (duplicate-correct) — local re-score. */
export function cipherFeedback(
  guess: number[],
  code: number[],
): { exact: number; partial: number } {
  const slots = code.length;
  let exact = 0;
  const codeCount: Record<number, number> = {};
  const guessCount: Record<number, number> = {};
  for (let i = 0; i < slots; i++) {
    if (guess[i] === code[i]) {
      exact++;
    } else {
      codeCount[code[i]] = (codeCount[code[i]] || 0) + 1;
      guessCount[guess[i]] = (guessCount[guess[i]] || 0) + 1;
    }
  }
  let partial = 0;
  for (const k of Object.keys(guessCount)) {
    const key = Number(k);
    if (codeCount[key]) partial += Math.min(codeCount[key], guessCount[key]);
  }
  return { exact, partial };
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchCipherInfo(): Promise<CipherInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/cipher/info`);
  const j = await r.json();
  return j as CipherInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchCipherActive(): Promise<CipherActiveRound | null> {
  const j = await apiFetchJson<{ active: CipherActiveRound | null }>('/api/arcade/cipher/active');
  return j.active ?? null;
}

export async function startCipher(args: {
  bet: number;
  difficulty: CipherDifficulty;
  clientSeed?: string;
}): Promise<CipherStartResult> {
  return apiFetchJson<CipherStartResult>('/api/arcade/cipher/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function guessCipher(roundId: string, guess: number[]): Promise<CipherGuessResult> {
  return apiFetchJson<CipherGuessResult>('/api/arcade/cipher/guess', {
    method: 'POST',
    body: JSON.stringify({ roundId, guess }),
  });
}

export async function cashoutCipher(roundId: string): Promise<CipherCashoutResult> {
  return apiFetchJson<CipherCashoutResult>('/api/arcade/cipher/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchCipherHistory(limit = 25): Promise<CipherHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: CipherHistoryRound[] }>(
    `/api/arcade/cipher/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchCipherRecent(limit = 25): Promise<CipherRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/cipher/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as CipherRecentRound[];
}

export async function fetchCipherLeaderboard(limit = 10): Promise<CipherLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/cipher/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as CipherLeaderboardEntry[];
}

export async function verifyCipher(roundId: string): Promise<CipherVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/cipher/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as CipherVerifyResult;
}
