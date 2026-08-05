/**
 * blackjack-variants-client.ts — client types + API wrappers for the blackjack
 * variants: Spanish 21, Double Exposure, Pontoon and Free Bet.
 *
 * One module for four games. Everything that differs between them arrives in
 * `BjVariantRules` from GET /info, so the felt renders whatever the server will
 * actually enforce rather than hardcoding a second copy of the rules that could
 * drift out of step with the one that pays.
 *
 * Cards are the shared 0..51 encoding, but note the OFFSET is different from
 * the poker games in this repo: blackjack counts rank = (idx % 13) + 1, so 1 is
 * an Ace and 11/12/13 are J/Q/K.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type BjVariant = 'spanish21' | 'double_exposure' | 'pontoon' | 'free_bet';
export type BjAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type BjHandOutcome =
  | 'win'
  | 'loss'
  | 'push'
  | 'blackjack'
  | 'bust'
  | 'surrender'
  | 'five_card_trick'
  | 'bonus_21';

export interface BjBonusPay {
  fiveCard21: number;
  sixCard21: number;
  sevenCard21: number;
  sequenceMixed: number;
  sequenceSuited: number;
  sequenceSpades: number;
}

export interface BjVariantRules {
  key: BjVariant;
  name: string;
  blurb: string;
  deckSize: number;
  removedRanks: number[];
  hitsSoft17: boolean;
  dealerExposed: boolean;
  dealerFullyHidden: boolean;
  naturalPays: number;
  dealerWinsTies: boolean;
  player21AlwaysWins: boolean;
  naturalBeatsNatural: boolean;
  pushOnDealerTotal: number | null;
  surrender: boolean;
  minStand: number;
  doubleOn: number[] | null;
  doubleAnyCards: boolean;
  freeDoubleOn: number[];
  freeSplit: boolean;
  fiveCardTrick: number | null;
  bonuses: BjBonusPay | null;
  maxSplits: number;
  highlights: string[];
}

export interface BjInfo {
  minBet: number;
  maxBet: number;
  rules: BjVariantRules;
  singleDeck: boolean;
  variants: Array<{ key: BjVariant; name: string; blurb: string }>;
}

export interface BjHandView {
  cards: number[];
  bet: number;
  /** Chips the HOUSE put up on this hand (Free Bet). Never paid out as stake. */
  freeBet: number;
  total: number;
  soft: boolean;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  surrendered: boolean;
  busted: boolean;
  isNatural: boolean;
}

export interface BjHandResult {
  outcome: BjHandOutcome;
  staked: number;
  freeStaked: number;
  payout: number;
  multiplier: number;
  total: number;
  bonus: number;
}

/** The live shape of a round mid-play. */
export interface BjRoundLive {
  settled: false;
  hands: BjHandView[];
  activeHand: number | null;
  legalActions: BjAction[];
  freeDouble?: boolean;
  freeSplit?: boolean;
  dealerCards: number[];
  committed: number;
  splitCount?: number;
  chipBalance?: string;
}

/** The shape once the dealer has played and everything is paid. */
export interface BjRoundSettled {
  settled: true;
  hands: BjHandView[];
  activeHand: null;
  legalActions: [];
  dealerCards: number[];
  results: BjHandResult[];
  dealerTotal: number;
  dealerBusted: boolean;
  totalPayout: number;
  committed: number;
  won: boolean;
  serverSeed: string;
  chipBalance?: string;
}

export type BjDealResult = { roundId: string; variant: BjVariant; bet: number; serverSeedHash: string; clientSeed: string; nonce: number } & (
  | BjRoundLive
  | BjRoundSettled
);

export type BjActionResult = { roundId: string; action: BjAction; variant: BjVariant } & (
  | BjRoundLive
  | BjRoundSettled
);

export interface BjActiveRound {
  roundId: string;
  variant: BjVariant;
  bet: number;
  committed: number;
  hands: BjHandView[];
  activeHand: number | null;
  splitCount: number;
  dealerCards: number[];
  legalActions: BjAction[];
  freeDouble: boolean;
  freeSplit: boolean;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface BjHistoryRound {
  roundId: string;
  variant: BjVariant;
  bet: number;
  committed: number;
  hands: BjHandView[];
  dealerCards: number[];
  results: BjHandResult[] | null;
  totalPayout: number;
  dealerTotal: number | null;
  won: boolean;
  createdAt: string;
}

export interface BjVerifyResult extends BjHistoryRound {
  variantName: string;
  deck: number[];
  deckCursor: number;
  status: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  removedRanks: number[];
  settledAt: string | null;
  recipe: string;
}

/**
 * Narrow a deal/action response to the settled case.
 *
 * The repo compiles with `strict: false`, which switches off the narrowing TS
 * would otherwise do on a `settled: true | false` discriminant — so the union
 * needs an explicit guard rather than a bare `if (r.settled)`.
 */
export function isBjSettled<T extends { settled: boolean }>(
  r: T,
): r is T & BjRoundSettled {
  return r.settled === true;
}

// ─────────────────────────── card + label helpers ───────────────────────────

const RANK_LABEL: Record<number, string> = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
};

/** Card index 0..51 → rank 1..13 (1 = Ace, 11/12/13 = J/Q/K). */
export function bjCardRank(idx: number): number {
  return (idx % 13) + 1;
}

export function bjCardRankLabel(idx: number): string {
  const r = bjCardRank(idx);
  return RANK_LABEL[r] ?? String(r);
}

/** Player-facing name for a settled hand outcome. */
export function bjOutcomeLabel(outcome: BjHandOutcome, rules?: BjVariantRules | null): string {
  switch (outcome) {
    case 'blackjack':
      // Pontoon calls it a Pontoon, and the felt should use the table's word.
      return rules?.key === 'pontoon' ? 'Pontoon' : 'Blackjack';
    case 'five_card_trick':
      return 'Five-card trick';
    case 'bonus_21':
      return 'Bonus 21';
    case 'win':
      return 'Win';
    case 'loss':
      return 'Loss';
    case 'push':
      return 'Push';
    case 'bust':
      return 'Bust';
    case 'surrender':
      return 'Surrendered';
    default:
      return outcome;
  }
}

/**
 * Button copy for an action. Pontoon uses its own century-old vocabulary —
 * twist, stick, buy — and using blackjack's words on a Pontoon table would be
 * wrong in the way that makes a game feel fake.
 */
export function bjActionLabel(action: BjAction, rules?: BjVariantRules | null): string {
  const pontoon = rules?.key === 'pontoon';
  switch (action) {
    case 'hit':
      return pontoon ? 'Twist' : 'Hit';
    case 'stand':
      return pontoon ? 'Stick' : 'Stand';
    case 'double':
      return pontoon ? 'Buy' : 'Double';
    case 'split':
      return 'Split';
    case 'surrender':
      return 'Surrender';
    default:
      return action;
  }
}

/** "3:2", "2:1", "even money" — how a natural pays at this table. */
export function bjNaturalLabel(rules: BjVariantRules | null): string {
  if (!rules) return '—';
  if (rules.naturalPays === 1) return 'even money';
  if (rules.naturalPays === 1.5) return '3:2';
  if (rules.naturalPays === 2) return '2:1';
  return `${rules.naturalPays}:1`;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

// ───────────────────────────── API wrappers ─────────────────────────────────

export async function fetchBjInfo(variant: BjVariant): Promise<BjInfo> {
  const r = await fetch(
    `${apiBase()}/api/arcade/blackjack-variants/info?variant=${encodeURIComponent(variant)}`,
  );
  return (await r.json()) as BjInfo;
}

export async function fetchBjActive(variant: BjVariant): Promise<BjActiveRound | null> {
  const j = await apiFetchJson<{ active: BjActiveRound | null }>(
    `/api/arcade/blackjack-variants/active?variant=${encodeURIComponent(variant)}`,
  );
  return j.active ?? null;
}

export async function dealBj(args: {
  variant: BjVariant;
  bet: number;
  clientSeed?: string;
}): Promise<BjDealResult> {
  return apiFetchJson<BjDealResult>('/api/arcade/blackjack-variants/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function actBj(roundId: string, action: BjAction): Promise<BjActionResult> {
  return apiFetchJson<BjActionResult>('/api/arcade/blackjack-variants/action', {
    method: 'POST',
    body: JSON.stringify({ roundId, action }),
  });
}

export async function fetchBjHistory(variant: BjVariant, limit = 25): Promise<BjHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: BjHistoryRound[] }>(
    `/api/arcade/blackjack-variants/history?variant=${encodeURIComponent(variant)}&limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function verifyBj(roundId: string): Promise<BjVerifyResult> {
  const r = await fetch(
    `${apiBase()}/api/arcade/blackjack-variants/verify/${encodeURIComponent(roundId)}`,
  );
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as BjVerifyResult;
}
