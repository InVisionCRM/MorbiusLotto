/**
 * Shared poker bot policy. Used by the CLI `poker-bot.ts` WebSocket clients and by
 * in-server tournament bot ticks.
 *
 * Preflop: a Chen-formula hand score (card encoding 0=Two … 12=Ace, matching
 * poker-game.service INT_RANKS), tightened as the field grows, with open / 3-bet /
 * call / fold thresholds and a per-bot personality dial.
 *
 * Postflop: Monte Carlo equity of the bot's hole cards + board against N random
 * opponent hands (poker-hand-eval `winners`). The bot value-bets / raises strong
 * equity, calls when equity beats the pot odds (plus a safety margin), folds
 * otherwise, and bluffs at a small personality-driven rate. Bet sizes are a
 * fraction of the pot, not min-raises.
 */
import { winners } from '../services/poker-hand-eval';

/** Parse poker amounts that may be huge (tournament virtual chips in wei-scale) or scientific strings. */
export function pokerAmountToBigInt(v: string | number | bigint | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0n;
    if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) return BigInt(v);
  }
  let s = typeof v === 'number' ? String(v) : String(v).trim();
  if (!s) return 0n;
  const sci = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
  if (sci) {
    const neg = sci[1] === '-';
    const intPart = sci[2];
    const frac = sci[3] ?? '';
    const exp = parseInt(sci[4], 10);
    let digits = intPart + frac;
    const adjust = exp - frac.length;
    if (adjust >= 0) {
      digits += '0'.repeat(adjust);
    } else {
      const keep = digits.length + adjust;
      if (keep <= 0) return 0n;
      digits = digits.slice(0, keep);
    }
    digits = digits.replace(/^0+/, '') || '0';
    return BigInt((neg ? '-' : '') + digits);
  }
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot);
  s = s.replace(/,/g, '').replace(/^([+-]?)\s*/, '$1').replace(/[^0-9+-]/g, '');
  if (!s || s === '-' || s === '+') return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

export interface PokerBotPersonality {
  /** 0 = loose, 1 = very tight. Shifts preflop thresholds. Default 0.5. */
  tightness?: number;
  /** 0 = passive, 1 = very aggressive. Raises more and sizes bigger. Default 0.5. */
  aggression?: number;
  /** Probability of a pure bluff bet/raise when the bot would otherwise check/fold. Default 0.05, max 0.25. */
  bluff?: number;
}

export interface PokerBotDecisionInput {
  street: string;
  pot: string;
  toCall: string;
  /** Minimum legal raise-TO total (server semantics: currentBet + raise increment). */
  minRaise: string;
  myStack: string;
  myHoleCards: number[] | null;
  /** Board cards (0–51). Missing → equity falls back to preflop strength. */
  communityCards?: number[] | null;
  /** Live opponents still in the hand (not folded). Default 1. */
  numOpponents?: number;
  /** Big blind (chips). Used for minimum bet sizing. */
  bigBlind?: string;
  /** Chips this bot already has in front of it on the current street. */
  myBet?: string;
  personality?: PokerBotPersonality | Record<string, unknown> | null;
  /** Monte Carlo iterations (default 500). */
  iterations?: number;
  /** Injectable RNG for tests. */
  rng?: () => number;
}

export interface PokerBotDecision {
  action: string;
  amount?: string;
}

function clamp01(n: unknown, dflt: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(0, Math.min(1, v));
}

export function normalizePersonality(p: unknown): Required<PokerBotPersonality> {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  return {
    tightness: clamp01(o.tightness, 0.5),
    aggression: clamp01(o.aggression, 0.5),
    bluff: Math.min(0.25, clamp01(o.bluff, 0.05)),
  };
}

/**
 * Chen formula score for two hole cards, normalized to [0,1]
 * (AA = 20 → 1.0; 72o ≈ -1 → 0). Encoding: rank index = card % 13 (0 = Two, 12 = Ace).
 */
export function preflopStrength(cards: number[]): number {
  if (!cards || cards.length < 2) return 0.3;
  const r1 = cards[0] % 13;
  const r2 = cards[1] % 13;
  const suited = Math.floor(cards[0] / 13) === Math.floor(cards[1] / 13);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const chenHigh = (r: number): number => {
    if (r === 12) return 10; // A
    if (r === 11) return 8; // K
    if (r === 10) return 7; // Q
    if (r === 9) return 6; // J
    return (r + 2) / 2; // T=5 … 2=1
  };
  let score = chenHigh(hi);
  if (r1 === r2) {
    score = Math.max(5, score * 2);
  } else {
    if (suited) score += 2;
    const gap = hi - lo - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && hi < 10) score += 1; // connected/one-gap below Q
  }
  score = Math.ceil(score);
  return Math.max(0, Math.min(1, (score + 1) / 21));
}

/**
 * Monte Carlo equity (share of pot won, ties split) of `hole` + `board` vs
 * `numOpponents` uniformly random hands. Deterministic when `rng` is seeded.
 */
export function estimateEquity(
  hole: number[],
  board: number[],
  numOpponents: number,
  iterations = 500,
  rng: () => number = Math.random,
): number {
  const opp = Math.max(1, Math.min(9, Math.floor(numOpponents || 1)));
  const known = new Set<number>([...hole, ...board]);
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const needBoard = Math.max(0, 5 - board.length);
  const draw = needBoard + opp * 2;
  if (deck.length < draw) return 0;
  let won = 0;
  for (let it = 0; it < iterations; it++) {
    // partial Fisher–Yates for `draw` cards
    for (let i = 0; i < draw; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    const fullBoard = board.concat(deck.slice(0, needBoard));
    const hands: number[][] = [hole.concat(fullBoard)];
    for (let k = 0; k < opp; k++) {
      const o = needBoard + k * 2;
      hands.push([deck[o], deck[o + 1], ...fullBoard]);
    }
    const w = winners(hands);
    if (w.includes(0)) won += 1 / w.length;
  }
  return won / iterations;
}

/** Pot-odds price in [0,1] without floating huge BigInts. */
function callPriceRatio(toCall: bigint, pot: bigint): number {
  if (toCall <= 0n) return 0;
  const denom = pot + toCall;
  if (denom <= 0n) return 1;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (toCall > max || denom > max) {
    if (toCall >= denom) return 1;
    return Number((toCall * 1000n) / denom) / 1000;
  }
  return Number(toCall) / Number(denom);
}

function fracOf(v: bigint, frac: number): bigint {
  return (v * BigInt(Math.round(frac * 1000))) / 1000n;
}

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function decidePokerBotAction(state: PokerBotDecisionInput): PokerBotDecision {
  const rng = state.rng ?? Math.random;
  const toCall = pokerAmountToBigInt(state.toCall);
  const pot = pokerAmountToBigInt(state.pot);
  const minRaise = pokerAmountToBigInt(state.minRaise);
  const stack = pokerAmountToBigInt(state.myStack);
  const myBet = pokerAmountToBigInt(state.myBet ?? '0');
  const bigBlind = maxBig(pokerAmountToBigInt(state.bigBlind ?? '0'), 1n);
  const canCheck = toCall === 0n;
  const p = normalizePersonality(state.personality);
  const opp = Math.max(1, Math.min(9, Math.floor(Number(state.numOpponents ?? 1)) || 1));
  const hole = (state.myHoleCards ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < 52);
  const board = (state.communityCards ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < 52);

  /** Bet `size` chips (opening bet). Clamped to [bigBlind, stack]; all-in if short. */
  const betOf = (size: bigint): PokerBotDecision => {
    if (stack <= 0n) return canCheck ? { action: 'check' } : { action: 'call' };
    let amt = maxBig(size, bigBlind);
    if (amt > stack) amt = stack;
    return { action: 'bet', amount: amt.toString() };
  };
  /** Raise TO `target` total. Clamped to [minRaise, stack + myBet]. Falls back to call. */
  const raiseTo = (target: bigint): PokerBotDecision => {
    const cap = stack + myBet;
    if (cap <= myBet + toCall) return { action: 'call' }; // can only call (all-in)
    let amt = maxBig(target, minRaise);
    if (amt > cap) amt = cap;
    if (amt <= myBet + toCall) return { action: 'call' };
    return { action: 'raise', amount: amt.toString() };
  };
  const potAfterCall = pot + toCall;
  const aggroSize = 0.5 + 0.35 * p.aggression; // 50%–85% pot

  if (state.street === 'preflop' || board.length < 3) {
    const strength = hole.length === 2 ? preflopStrength(hole) : 0.3;
    // Thresholds rise with field size and tightness.
    // Tuned from a 7-bot dry run: the first cut folded ~90% preflop and blinded out.
    // Chen score → threshold: 0.33 ≈ score 6 (66, A9s, KTs, QJs, JTs …, ~20% of hands
    // at a full table), 0.45 ≈ score 8.5 (TT, AQs, AKo …), 0.6 ≈ JJ+/AKs.
    const fieldAdj = Math.min(0.06, 0.01 * (opp - 1));
    const tightAdj = (p.tightness - 0.5) * 0.12;
    const raiseT = 0.45 + fieldAdj + tightAdj;
    const premiumT = 0.6 + tightAdj / 2;
    const playT = 0.33 + fieldAdj + tightAdj;
    const bb = bigBlind;
    const facingRaise = toCall > bb; // more than just the blind to call

    // Short stack (≤ 10 BB): push/fold instead of bleeding out to the blinds.
    if (stack + myBet <= bb * 10n) {
      if (strength >= playT - 0.06 || (!facingRaise && strength >= playT - 0.12 && rng() < 0.5 + 0.4 * p.aggression)) {
        return raiseTo(stack + myBet);
      }
      return canCheck ? { action: 'check' } : { action: 'fold' };
    }

    if (strength >= premiumT) {
      // 3-bet / open big; jam when short.
      const target = myBet + toCall + fracOf(potAfterCall, 0.9 + 0.3 * p.aggression) + bb * 2n;
      if (stack <= bb * 15n) return raiseTo(stack + myBet);
      return canCheck ? betOf(maxBig(bb * 3n, fracOf(pot, 1))) : raiseTo(target);
    }
    if (strength >= raiseT) {
      if (canCheck) return betOf(bb * 3n);
      if (!facingRaise) return raiseTo(bb * 3n + toCall);
      // facing a raise: call if price is reasonable, otherwise fold
      return toCall <= stack / 8n || callPriceRatio(toCall, pot) < 0.35 ? { action: 'call' } : { action: 'fold' };
    }
    if (strength >= playT) {
      if (canCheck) return rng() < 0.15 * p.aggression ? betOf(bb * 3n) : { action: 'check' };
      if (!facingRaise) return { action: 'call' };
      return toCall <= bb * 3n && toCall <= stack / 15n ? { action: 'call' } : { action: 'fold' };
    }
    if (canCheck) return { action: 'check' };
    if (!facingRaise && rng() < p.bluff) return raiseTo(bb * 3n); // occasional steal
    return { action: 'fold' };
  }

  // ---------------- Postflop: equity-driven ----------------
  const equity = hole.length === 2 ? estimateEquity(hole, board, opp, state.iterations ?? 500, rng) : 0.2;
  const fair = 1 / (opp + 1);
  const valueT = Math.min(0.68, fair * 1.9 + 0.08) + (p.tightness - 0.5) * 0.05;
  const strongT = Math.min(0.85, valueT + 0.18);

  if (canCheck) {
    if (equity >= strongT) return betOf(fracOf(pot, aggroSize + 0.1));
    if (equity >= valueT) return betOf(fracOf(pot, aggroSize));
    if (rng() < p.bluff * (board.length === 5 ? 0.6 : 1)) return betOf(fracOf(pot, 0.6));
    return { action: 'check' };
  }

  const price = callPriceRatio(toCall, pot);
  if (equity >= strongT || (equity >= valueT && rng() < 0.35 + 0.4 * p.aggression)) {
    return raiseTo(myBet + toCall + fracOf(potAfterCall, aggroSize));
  }
  // Call when equity beats price with a margin (opponents who bet are stronger than random).
  const margin = 0.06 + 0.04 * p.tightness;
  if (equity >= price + margin) return { action: 'call' };
  if (rng() < p.bluff * 0.5 && board.length < 5) return raiseTo(myBet + toCall + fracOf(potAfterCall, 0.75));
  return { action: 'fold' };
}
