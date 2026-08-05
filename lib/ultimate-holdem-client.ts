/**
 * ultimate-holdem-client.ts — client types + API wrappers for Ultimate Texas
 * Hold'em (/ultimate-holdem).
 *
 * Multi-street session game: /deal → (check | bet) per street → settle. Talks
 * to /api/arcade/ultimate-holdem/*; the backend accepts either Telegram
 * initData or the SIWE morb_session cookie, so the web client just relies on
 * apiFetchJson's cookie handling.
 *
 * The server only ever sends the board cards the current stage has earned —
 * `board` grows from [] to 3 to 5 as the player checks — so nothing here needs
 * to hide anything.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';
import type { PokerCategory } from '@/lib/playing-cards';

export type UthStage = 'preflop' | 'flop' | 'river' | 'settled';
export type UthAction = 'bet4' | 'bet3' | 'check' | 'bet2' | 'bet1' | 'fold';
export type UthResult = 'win' | 'loss' | 'push' | 'fold';

export interface UthInfo {
  minBet: number;
  maxBet: number;
  blindPay: Record<string, number>;
  tripsPay: Record<string, number>;
  categoryNames: Record<string, string>;
  payingOrder: string[];
  dealerQualify: string;
  houseEdgeAnteBp: number;
  houseEdgeTripsBp: number;
}

export interface UthActiveHand {
  roundId: string;
  ante: number;
  blind: number;
  trips: number;
  play: number;
  playMultiple: number;
  holeCards: number[];
  board: number[];
  stage: UthStage;
  legalActions: UthAction[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface UthDealResult {
  roundId: string;
  ante: number;
  blind: number;
  trips: number;
  holeCards: number[];
  board: number[];
  stage: UthStage;
  legalActions: UthAction[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

/** A check: the street advances, no chips move, the hand continues. */
export interface UthStreetResult {
  roundId: string;
  action: UthAction;
  settled: false;
  stage: UthStage;
  board: number[];
  legalActions: UthAction[];
}

/** A Play bet or a fold: the hand is over and everything is revealed. */
export interface UthSettleResult {
  roundId: string;
  action: UthAction;
  settled: true;
  stage: 'settled';
  folded: boolean;
  ante: number;
  blind: number;
  trips: number;
  play: number;
  playMultiple: number;
  holeCards: number[];
  dealerCards: number[];
  board: number[];
  playerCategory: PokerCategory;
  playerCategoryName: string;
  dealerCategory: PokerCategory;
  dealerCategoryName: string;
  dealerQualified: boolean;
  result: UthResult;
  antePayout: number;
  blindPayout: number;
  playPayout: number;
  tripsPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  winSide: 'player' | 'dealer' | null;
  serverSeed: string;
  chipBalance?: string;
}

export type UthActionResult = UthStreetResult | UthSettleResult;

/**
 * Narrow an /action response to the settled case.
 *
 * The repo compiles with `strict: false`, which switches off the narrowing TS
 * would otherwise do on a `settled: true | false` discriminant — so the union
 * needs an explicit guard rather than a bare `if (!r.settled)`.
 */
export function isUthSettled(r: UthActionResult): r is UthSettleResult {
  return r.settled === true;
}

export interface UthHistoryRound {
  roundId: string;
  ante: number;
  blind: number;
  trips: number;
  play: number;
  playMultiple: number;
  folded: boolean;
  holeCards: number[];
  dealerCards: number[];
  board: number[];
  result: UthResult;
  playerCategory: string | null;
  dealerCategory: string | null;
  dealerQualified: boolean | null;
  antePayout: number;
  blindPayout: number;
  playPayout: number;
  tripsPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  createdAt: string;
}

export interface UthVerifyResult extends UthHistoryRound {
  status: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  settledAt: string | null;
  recipe: string;
}

/** Short, friendly label for a settle result. */
export function uthResultLabel(result: UthResult): string {
  switch (result) {
    case 'win':
      return 'You win';
    case 'loss':
      return 'Dealer wins';
    case 'push':
      return 'Push';
    case 'fold':
      return 'Folded';
    default:
      return result;
  }
}

/** Button copy for an action, given the ante it is priced against. */
export function uthActionLabel(action: UthAction): string {
  switch (action) {
    case 'bet4':
      return 'Bet 4×';
    case 'bet3':
      return 'Bet 3×';
    case 'bet2':
      return 'Bet 2×';
    case 'bet1':
      return 'Bet 1×';
    case 'check':
      return 'Check';
    case 'fold':
      return 'Fold';
    default:
      return action;
  }
}

/** How many chips an action commits at this ante. */
export function uthActionCost(action: UthAction, ante: number): number {
  switch (action) {
    case 'bet4':
      return ante * 4;
    case 'bet3':
      return ante * 3;
    case 'bet2':
      return ante * 2;
    case 'bet1':
      return ante;
    default:
      return 0;
  }
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

// -------------------------------------------------------------------------
// API wrappers
// -------------------------------------------------------------------------

export async function fetchUthInfo(): Promise<UthInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/ultimate-holdem/info`);
  return (await r.json()) as UthInfo;
}

export async function fetchUthActive(): Promise<UthActiveHand | null> {
  const j = await apiFetchJson<{ active: UthActiveHand | null }>(
    '/api/arcade/ultimate-holdem/active',
  );
  return j.active ?? null;
}

export async function dealUth(args: {
  ante: number;
  trips: boolean;
  clientSeed?: string;
}): Promise<UthDealResult> {
  return apiFetchJson<UthDealResult>('/api/arcade/ultimate-holdem/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function actUth(roundId: string, action: UthAction): Promise<UthActionResult> {
  return apiFetchJson<UthActionResult>('/api/arcade/ultimate-holdem/action', {
    method: 'POST',
    body: JSON.stringify({ roundId, action }),
  });
}

export async function fetchUthHistory(limit = 25): Promise<UthHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: UthHistoryRound[] }>(
    `/api/arcade/ultimate-holdem/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function verifyUth(roundId: string): Promise<UthVerifyResult> {
  const r = await fetch(
    `${apiBase()}/api/arcade/ultimate-holdem/verify/${encodeURIComponent(roundId)}`,
  );
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as UthVerifyResult;
}
