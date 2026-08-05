/**
 * caribbean-stud-client.ts — client types + API wrappers for Caribbean Stud
 * Poker (/caribbean-stud).
 *
 * Two-step session game (deal → call/fold), talking to
 * /api/arcade/caribbean-stud/*. The backend accepts either Telegram initData or
 * the SIWE morb_session cookie, so the web client just relies on apiFetchJson's
 * cookie handling.
 *
 * At /deal the server sends the player's five cards and the dealer's UP CARD
 * only — the other four dealer cards stay sealed until the hand settles.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';
import type { PokerCategory } from '@/lib/playing-cards';

export type CsResult = 'win' | 'loss' | 'push' | 'dealer_no_qualify' | 'fold';

export interface CsInfo {
  minBet: number;
  maxBet: number;
  callPay: Record<string, number>;
  bonusPay: Record<string, number>;
  categoryNames: Record<string, string>;
  payingOrder: string[];
  bonusPayingOrder: string[];
  callMultiple: number;
  dealerQualify: string;
  houseEdgeAnteBp: number;
  houseEdgeBonusBp: number;
}

export interface CsActiveHand {
  roundId: string;
  ante: number;
  bonus: number;
  callBet: number;
  playerCards: number[];
  dealerUpCard: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface CsDealResult {
  roundId: string;
  ante: number;
  bonus: number;
  callBet: number;
  playerCards: number[];
  dealerUpCard: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export interface CsDecisionResult {
  roundId: string;
  action: 'call' | 'fold';
  folded: boolean;
  ante: number;
  bonus: number;
  call: number;
  playerCards: number[];
  dealerCards: number[];
  playerCategory: PokerCategory;
  playerCategoryName: string;
  dealerCategory: PokerCategory;
  dealerCategoryName: string;
  dealerQualified: boolean;
  result: CsResult;
  antePayout: number;
  callPayout: number;
  bonusPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  winSide: 'player' | 'dealer' | null;
  status: string;
  serverSeed: string;
  chipBalance?: string;
}

export interface CsHistoryRound {
  roundId: string;
  ante: number;
  bonus: number;
  call: number;
  playerCards: number[];
  dealerCards: number[];
  result: CsResult;
  playerCategory: string | null;
  dealerCategory: string | null;
  dealerQualified: boolean | null;
  antePayout: number;
  callPayout: number;
  bonusPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  createdAt: string;
}

export interface CsVerifyResult extends CsHistoryRound {
  status: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  settledAt: string | null;
  recipe: string;
}

/** Short, friendly label for a settle result. */
export function csResultLabel(result: CsResult): string {
  switch (result) {
    case 'win':
      return 'You win';
    case 'loss':
      return 'Dealer wins';
    case 'push':
      return 'Push';
    case 'dealer_no_qualify':
      return "Dealer doesn't qualify";
    case 'fold':
      return 'Folded';
    default:
      return result;
  }
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

// -------------------------------------------------------------------------
// API wrappers
// -------------------------------------------------------------------------

export async function fetchCsInfo(): Promise<CsInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/caribbean-stud/info`);
  return (await r.json()) as CsInfo;
}

export async function fetchCsActive(): Promise<CsActiveHand | null> {
  const j = await apiFetchJson<{ active: CsActiveHand | null }>(
    '/api/arcade/caribbean-stud/active',
  );
  return j.active ?? null;
}

export async function dealCs(args: {
  ante: number;
  bonus: boolean;
  clientSeed?: string;
}): Promise<CsDealResult> {
  return apiFetchJson<CsDealResult>('/api/arcade/caribbean-stud/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function decideCs(
  roundId: string,
  action: 'call' | 'fold',
): Promise<CsDecisionResult> {
  return apiFetchJson<CsDecisionResult>('/api/arcade/caribbean-stud/decision', {
    method: 'POST',
    body: JSON.stringify({ roundId, action }),
  });
}

export async function fetchCsHistory(limit = 25): Promise<CsHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: CsHistoryRound[] }>(
    `/api/arcade/caribbean-stud/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function verifyCs(roundId: string): Promise<CsVerifyResult> {
  const r = await fetch(
    `${apiBase()}/api/arcade/caribbean-stud/verify/${encodeURIComponent(roundId)}`,
  );
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as CsVerifyResult;
}
