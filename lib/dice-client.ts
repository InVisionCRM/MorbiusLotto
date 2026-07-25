/**
 * dice-client.ts — client types + API wrappers for chips Dice (/dice2).
 *
 * Talks to the same /api/arcade/dice/* endpoints as the Telegram Mini App —
 * the backend accepts either Telegram initData or the SIWE morb_session
 * cookie, so the web client just relies on apiFetchJson's cookie handling.
 *
 * Game model: pick a target (×100, i.e. 50.00 → 5000); the server rolls
 * 0.00–99.99 (rollX100). You win when roll < target; the multiplier is
 * floor((10000 − houseEdgeBp) × 100 / targetX100).
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export interface DiceInfo {
  minBet: number;
  maxBet: number;
  minTargetX100: number;
  maxTargetX100: number;
  houseEdgeBp: number;
}

export interface DicePlayResult {
  roundId: string;
  bet: number;
  targetX100: number;
  rollX100: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  /** Sequential nonce this roll consumed under the active seed commitment.
   *  Optional: present on a live /play response, omitted on a synthetic replay. */
  nonce?: number;
  chipBalance: string;
}

export interface DiceHistoryRound {
  roundId: string;
  bet: number;
  targetX100: number;
  rollX100: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface DiceRecentRoll extends DiceHistoryRound {
  wallet: string;
}

export interface DiceLeaderboardEntry {
  wallet: string;
  rolls: number;
  wagered: string;
  won: string;
  net: string;
}

export interface DiceVerifyResult {
  roundId: string;
  bet: number;
  targetX100: number;
  rollX100: number;
  multiplierX100: number;
  recomputedMultiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  /** null until the round's seed pair has been rotated (revealed). */
  serverSeed: string | null;
  seedRevealed: boolean;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  recipe: string;
}

/** "5000" → "50.00" — the 0.00–99.99 roll/target scale. */
export function formatX100(x100: number): string {
  return (x100 / 100).toFixed(2);
}

/** Win chance in percent for a roll-under target. */
export function diceWinChancePct(targetX100: number): number {
  return targetX100 / 100;
}

/** Client-side preview of the server's multiplier formula. */
export function diceMultiplierX100(targetX100: number, houseEdgeBp: number): number {
  if (targetX100 <= 0) return 0;
  return Math.floor(((10000 - houseEdgeBp) * 100) / targetX100);
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchDiceInfo(): Promise<DiceInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/dice/info`);
  const j = await r.json();
  return j as DiceInfo;
}

export async function playDice(args: {
  bet: number;
  targetX100: number;
}): Promise<DicePlayResult> {
  // Client seed is managed on the persistent seed pair (see arcade-seed-client),
  // not passed per-bet — the server derives the roll from the pre-committed seed.
  return apiFetchJson<DicePlayResult>('/api/arcade/dice/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchDiceHistory(limit = 25): Promise<DiceHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: DiceHistoryRound[] }>(
    `/api/arcade/dice/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchDiceRecent(limit = 25): Promise<DiceRecentRoll[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dice/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as DiceRecentRoll[];
}

export async function fetchDiceLeaderboard(limit = 10): Promise<DiceLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dice/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as DiceLeaderboardEntry[];
}

export async function verifyDice(roundId: string): Promise<DiceVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/dice/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as DiceVerifyResult;
}
