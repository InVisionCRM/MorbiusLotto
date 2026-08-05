/**
 * video-poker-client.ts — client types + API wrappers for chips Video Poker
 * (/video-poker), 9/6 Jacks or Better.
 *
 * Talks to the /api/video-poker/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * Flow: /deal charges the bet and deals 5 cards from a committed deck → the
 * player holds any subset → /draw replaces the rest (from deck[5..9]),
 * evaluates and pays. The whole deck is sealed at deal time, so the draw is
 * locked before holds are chosen. Card indices 0-51:
 *   rank = (idx % 13) + 2   (2..14, 14 = Ace)
 *   suit = floor(idx / 13)  (0 = ♥ 1 = ♦ 2 = ♣ 3 = ♠)
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type VideoPokerVariant =
  | 'jacks_or_better'
  | 'bonus_poker'
  | 'double_bonus'
  | 'double_double_bonus'
  | 'deuces_wild'
  | 'joker_poker';

/**
 * Category keys are open-ended: the bonus paytables split quads into ranked
 * tiers and the wild games add five of a kind, so the client renders whatever
 * `order` + `names` the server sends rather than hardcoding a fixed list.
 */
export type VideoPokerCategory = string;

/** One entry in the variant picker. */
export interface VideoPokerVariantSummary {
  key: VideoPokerVariant;
  name: string;
  blurb: string;
  wild: 'none' | 'deuces' | 'joker';
  rtpBp: number;
}

export interface VideoPokerPaytable {
  minBet: number;
  maxBet: number;
  variant: VideoPokerVariant;
  paytable: Record<string, number>;
  names: Record<string, string>;
  order: VideoPokerCategory[];
  /** 52, or 53 when a Joker is in the deck. */
  deckSize: number;
  wild: 'none' | 'deuces' | 'joker';
  rtpBp: number;
  variants: VideoPokerVariantSummary[];
}

export interface VideoPokerDealResult {
  handId: string;
  dealtHand: number[];
  bet: number;
  variant: VideoPokerVariant;
  serverSeedHash: string;
  chipBalance: string;
}

export interface VideoPokerDrawResult {
  handId: string;
  holds: boolean[];
  finalHand: number[];
  variant: VideoPokerVariant;
  category: VideoPokerCategory;
  categoryName: string;
  multiplier: number;
  payout: number;
  /** True when a wild card was needed to make the hand. */
  usedWild: boolean;
  serverSeed: string;
  clientSeed: string;
  chipBalance: string;
}

export interface VideoPokerVerifyResult {
  handId: string;
  status: string;
  bet: number;
  /** Which paytable the hand was dealt and paid on. */
  variant: VideoPokerVariant;
  variantName: string;
  /** 52, or 53 for Joker Poker. */
  deckSize: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed: string | null;
  deck: number[] | null;
  dealtHand: number[];
  holds: boolean[] | null;
  finalHand: number[] | null;
  resultCategory: VideoPokerCategory | null;
  payout: number | null;
  resolvedAt: string | null;
  recipe: string;
}

// ─────────────────────────── card display helpers ───────────────────────────

const RANK_LABELS: Record<number, string> = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/** Suit order matches the server: 0=♥ 1=♦ 2=♣ 3=♠. */
const SUIT_GLYPHS = ['♥', '♦', '♣', '♠'];

/** The Joker's index in the 53-card Joker Poker deck. */
export const VP_JOKER_INDEX = 52;

/** True for the Joker, which has no rank or suit of its own. */
export function vpIsJoker(idx: number): boolean {
  return idx === VP_JOKER_INDEX;
}

/** Rank 2..14 (14 = Ace). Meaningless for the Joker. */
export function vpCardRank(idx: number): number {
  return (idx % 13) + 2;
}

export function vpCardSuit(idx: number): number {
  return Math.floor(idx / 13);
}

export function vpRankLabel(idx: number): string {
  if (vpIsJoker(idx)) return 'JKR';
  const rank = vpCardRank(idx);
  return RANK_LABELS[rank] ?? String(rank);
}

export function vpSuitGlyph(idx: number): string {
  if (vpIsJoker(idx)) return '★';
  return SUIT_GLYPHS[vpCardSuit(idx)] ?? '?';
}

/** Hearts and diamonds render red; clubs and spades black. The Joker is red. */
export function vpCardIsRed(idx: number): boolean {
  if (vpIsJoker(idx)) return true;
  return vpCardSuit(idx) <= 1;
}

/** Is this card wild under the given variant's rule? */
export function vpIsWild(idx: number, wild: 'none' | 'deuces' | 'joker'): boolean {
  if (wild === 'deuces') return !vpIsJoker(idx) && vpCardRank(idx) === 2;
  if (wild === 'joker') return vpIsJoker(idx);
  return false;
}

/**
 * Apply the player's hold mask to a committed deck — mirror of `applyHolds` on
 * the server. deck[0..4] is the deal; deck[5..9] are the draw replacements,
 * consumed in order for each discarded card. Used by the fairness modal.
 */
export function applyVideoPokerHolds(deck: number[], holds: boolean[]): number[] {
  const dealt = deck.slice(0, 5);
  let nextDraw = 5;
  return dealt.map((card, i) => (holds[i] ? card : deck[nextDraw++]));
}

// ───────────────────────────── API wrappers ─────────────────────────────────

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchVideoPokerPaytable(
  variant?: VideoPokerVariant,
): Promise<VideoPokerPaytable> {
  const qs = variant ? `?variant=${encodeURIComponent(variant)}` : '';
  const r = await fetch(`${apiBase()}/api/video-poker/paytable${qs}`);
  const j = await r.json();
  return j as VideoPokerPaytable;
}

export async function dealVideoPoker(args: {
  bet: number;
  variant?: VideoPokerVariant;
  clientSeed?: string;
}): Promise<VideoPokerDealResult> {
  return apiFetchJson<VideoPokerDealResult>('/api/video-poker/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function drawVideoPoker(args: {
  handId: string;
  holds: boolean[];
}): Promise<VideoPokerDrawResult> {
  return apiFetchJson<VideoPokerDrawResult>('/api/video-poker/draw', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function verifyVideoPoker(handId: string): Promise<VideoPokerVerifyResult> {
  const r = await fetch(`${apiBase()}/api/video-poker/verify/${encodeURIComponent(handId)}`);
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as VideoPokerVerifyResult;
}
