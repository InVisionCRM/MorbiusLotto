/**
 * dicex2-client.ts — client types + API wrappers for chips Dice x2 (/dicex2).
 *
 * Range / "in" dice. Talks to the /api/arcade/dicex2/* endpoints; the backend
 * accepts either Telegram initData or the SIWE morb_session cookie, so the web
 * client just relies on apiFetchJson's cookie handling.
 *
 * Game model: pick a win band [lowX100, highX100) on the 0.00–99.99 scale
 * (e.g. 25.00–75.00 → low 2500, high 7500). The server rolls 0.00–99.99
 * (rollX100); you win when low ≤ roll < high. Win chance = widthX100 / 10000;
 * the multiplier is floor((10000 − houseEdgeBp) × 100 / widthX100), where
 * widthX100 = highX100 − lowX100.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export interface DiceX2Info {
  minBet: number;
  maxBet: number;
  minWidthX100: number;
  maxWidthX100: number;
  scaleMaxX100: number;
  houseEdgeBp: number;
}

export interface DiceX2PlayResult {
  roundId: string;
  bet: number;
  lowX100: number;
  highX100: number;
  widthX100: number;
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

export interface DiceX2HistoryRound {
  roundId: string;
  bet: number;
  lowX100: number;
  highX100: number;
  rollX100: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface DiceX2RecentRoll extends DiceX2HistoryRound {
  wallet: string;
}

export interface DiceX2LeaderboardEntry {
  wallet: string;
  rolls: number;
  wagered: string;
  won: string;
  net: string;
}

export interface DiceX2VerifyResult {
  roundId: string;
  bet: number;
  lowX100: number;
  highX100: number;
  widthX100: number;
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

/** "5000" → "50.00" — the 0.00–99.99 roll/band scale. */
export function formatX100(x100: number): string {
  return (x100 / 100).toFixed(2);
}

/** "2500".."7500" → "25.00 – 75.00" — a band label. */
export function formatBand(lowX100: number, highX100: number): string {
  return `${formatX100(lowX100)} – ${formatX100(highX100)}`;
}

/** Win chance in percent for a band of the given width (×100). */
export function diceX2WinChancePct(widthX100: number): number {
  return widthX100 / 100;
}

/** Client-side preview of the server's multiplier formula. */
export function diceX2MultiplierX100(widthX100: number, houseEdgeBp: number): number {
  if (widthX100 <= 0) return 0;
  return Math.floor(((10000 - houseEdgeBp) * 100) / widthX100);
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchDiceX2Info(): Promise<DiceX2Info> {
  const r = await fetch(`${apiBase()}/api/arcade/dicex2/info`);
  const j = await r.json();
  return j as DiceX2Info;
}

export async function playDiceX2(args: {
  bet: number;
  lowX100: number;
  highX100: number;
}): Promise<DiceX2PlayResult> {
  // Client seed is managed on the persistent seed pair (see arcade-seed-client),
  // not passed per-bet — the server derives the roll from the pre-committed seed.
  return apiFetchJson<DiceX2PlayResult>('/api/arcade/dicex2/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchDiceX2History(limit = 25): Promise<DiceX2HistoryRound[]> {
  const j = await apiFetchJson<{ rounds: DiceX2HistoryRound[] }>(
    `/api/arcade/dicex2/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchDiceX2Recent(limit = 25): Promise<DiceX2RecentRoll[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dicex2/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as DiceX2RecentRoll[];
}

export async function fetchDiceX2Leaderboard(limit = 10): Promise<DiceX2LeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dicex2/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as DiceX2LeaderboardEntry[];
}

export async function verifyDiceX2(roundId: string): Promise<DiceX2VerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/dicex2/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as DiceX2VerifyResult;
}
