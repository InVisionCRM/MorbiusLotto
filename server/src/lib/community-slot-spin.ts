/**
 * community-slot-spin.ts — server-authoritative spin execution for community
 * slot machines.
 *
 * One spin = one seed nonce. Every random draw the round needs — reel stops,
 * wild placement, cascade refills, hold/respin redraws, the winMult slam, and
 * the whole bonus round — comes from a single HMAC float stream:
 *
 *   float(i) = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, i*4))
 *
 * fed through the SAME cabinet-math code the builder and the cabinets run
 * (vendor/cabinet-math.js via cabinet-math-runner). Given the revealed seed,
 * anyone can replay the entire round draw for draw — that is the verify story.
 *
 * Bonus rounds are resolved HERE, not in the browser. The client's generic
 * bonus mini-games (free spins / wheel / pick) become scripted playback of the
 * outcome in this result. The wheel weights, pick values, and free-spin count
 * below MUST mirror cabinet-engine.js's bonusWheel/bonusPick/bonusFreeSpins —
 * they are the same game, decided server-side.
 *
 * Amounts are integer credits. payoutOf() returns fractional units-based
 * floats; every credited amount is Math.round()ed at the boundary. The play
 * routes size min bet to the machine's divisor so a real win can never round
 * to zero.
 */

import { ProvablyFairService } from '../services/provably-fair.service';
import { getCabinetMath } from './cabinet-math-runner';

const pf = new ProvablyFairService();

/* Mirrors of the client's generic bonus tables (cabinet-engine.js). */
const WHEEL_MULTS = [2, 3, 4, 5, 8, 10, 15, 25];
const WHEEL_WEIGHTS = [22, 20, 16, 14, 10, 9, 6, 3];
const PICK_VALUES = [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 15];
const PICK_COUNT = 3;
const DEFAULT_FREE_SPINS = 10;

export interface SpinSeed {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface FreeSpinResult {
  res: any;
  pay: number;
}

export type BonusOutcome =
  | { kind: 'freespins'; spins: FreeSpinResult[]; total: number }
  | { kind: 'wheel'; idx: number; mults: number[]; award: number }
  | { kind: 'pick'; picks: number[]; rest: number[]; award: number };

export interface SpinExecution {
  /** The base-game result — exactly the shape cabinet-math's resolveSpin returns. */
  res: any;
  /** Base-game credits (win cap applied to the round total, see payout). */
  basePayout: number;
  bonus: BonusOutcome | null;
  bonusPayout: number;
  /** Total credits returned for the round: min(base + bonus, bet × winCapX). */
  payout: number;
  capped: boolean;
  /** How many floats the whole round consumed — stored for the verify recipe. */
  draws: number;
}

/** Sequential float stream over the round's committed seed. */
export function makeSeedStream(seed: SpinSeed): { rng: () => number; count: () => number } {
  let i = 0;
  return {
    rng: () => pf.bytesToFloat(pf.hmacByteStream(seed.serverSeed, seed.clientSeed, seed.nonce, (i++) * 4)),
    count: () => i,
  };
}

function roundCredits(raw: number): number {
  return raw > 0 ? Math.round(raw) : 0;
}

/**
 * The client triggers a bonus on scatter >= 3 when the def declares a round
 * (settle() in cabinet-engine.js) — the server must agree exactly.
 */
function bonusKindFor(def: any, scatter: number): 'freespins' | 'wheel' | 'pick' | null {
  if (scatter < 3) return null;
  const b = def.bonus;
  if (!b || b.round === 'none' || b.autoTrigger === false) return null;
  return b.round === 'freespins' || b.round === 'wheel' || b.round === 'pick' ? b.round : null;
}

function rollFreeSpins(def: any, strips: string[][], bet: number, rng: () => number): BonusOutcome {
  const M = getCabinetMath();
  const n = Number(def.bonus?.freeSpins) || DEFAULT_FREE_SPINS;
  const spins: FreeSpinResult[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const stops = M.drawStops(rng, strips);
    const grid = M.windowAt(stops, strips, def.rows);
    // Fresh feature state per free spin — mirrors bonusFreeSpins() passing {}.
    const res = M.resolveSpin(def, strips, grid, rng, {});
    const pay = roundCredits(M.payoutOf(def, bet, res));
    total += pay;
    spins.push({ res, pay });
  }
  return { kind: 'freespins', spins, total };
}

function rollWheel(bet: number, rng: () => number): BonusOutcome {
  const totalW = WHEEL_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng() * totalW;
  let idx = 0;
  for (let i = 0; i < WHEEL_WEIGHTS.length; i++) {
    roll -= WHEEL_WEIGHTS[i];
    if (roll <= 0) { idx = i; break; }
  }
  return { kind: 'wheel', idx, mults: WHEEL_MULTS, award: WHEEL_MULTS[idx] * bet };
}

function rollPick(bet: number, rng: () => number): BonusOutcome {
  // Fisher-Yates over the client's value table. The player's clicks then
  // reveal picks[0..2] in order regardless of which chip they touch — the
  // outcome is decided here, the picking is presentation (industry standard).
  const values = PICK_VALUES.slice();
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = values[i]; values[i] = values[j]; values[j] = t;
  }
  const picks = values.slice(0, PICK_COUNT);
  const rest = values.slice(PICK_COUNT);
  const award = picks.reduce((a, b) => a + b, 0) * bet;
  return { kind: 'pick', picks, rest, award };
}

/**
 * Execute one full round. `featureState` is the session's persistent feature
 * object (sticky/walking wilds); resolveSpin mutates it in place and the
 * caller persists it back.
 *
 * `def` must be a private clone — indexSyms stamps `_byId` on it.
 */
export function executeSpin(
  def: any,
  bet: number,
  winCapX: number,
  seed: SpinSeed,
  featureState: Record<string, unknown>,
): SpinExecution {
  const M = getCabinetMath();
  M.indexSyms(def);
  const strips = M.buildStrips(def);
  const { rng, count } = makeSeedStream(seed);

  const stops = M.drawStops(rng, strips);
  const grid = M.windowAt(stops, strips, def.rows);
  const res = M.resolveSpin(def, strips, grid, rng, featureState);
  const basePayout = roundCredits(M.payoutOf(def, bet, res));

  let bonus: BonusOutcome | null = null;
  const kind = bonusKindFor(def, res.scatter);
  if (kind === 'freespins') bonus = rollFreeSpins(def, strips, bet, rng);
  else if (kind === 'wheel') bonus = rollWheel(bet, rng);
  else if (kind === 'pick') bonus = rollPick(bet, rng);
  const bonusPayout = bonus ? (bonus.kind === 'freespins' ? bonus.total : bonus.award) : 0;

  const cap = bet * winCapX;
  const uncapped = basePayout + bonusPayout;
  const payout = Math.min(uncapped, cap);

  return {
    res,
    basePayout,
    bonus,
    bonusPayout,
    payout,
    capped: uncapped > cap,
    draws: count(),
  };
}

/**
 * Per-machine bet sizing. Min bet is the win divisor rounded up to a clean
 * step, so the smallest real win (units × bet ÷ divisor) is always ≥ 1 credit
 * and never rounds to zero: a lines machine divides by its line count, a ways
 * machine by rows^cols, cluster/scatterpays by cols.
 */
export function betStepsFor(def: any): { minBet: number; steps: number[] } {
  const mode = (def.win && def.win.mode) || 'lines';
  let divisor = 5;
  if (mode === 'lines') divisor = (def.lines && def.lines.length) || 1;
  else if (mode === 'ways') { divisor = 1; for (let i = 0; i < def.cols; i++) divisor *= def.rows; }
  else divisor = def.cols || 5;

  // Round the divisor up to 1/2/5×10^k so the steps read like bet buttons.
  const cleanCeil = (n: number): number => {
    if (n <= 1) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(n)));
    for (const m of [1, 2, 5, 10]) {
      if (m * pow >= n) return m * pow;
    }
    return 10 * pow;
  };
  const minBet = Math.max(20, cleanCeil(divisor));

  // Same ratio ladder as the demo's 20/60/140/300/700/1500.
  const ratios = [1, 3, 7, 15, 35, 75];
  return { minBet, steps: ratios.map((r) => minBet * r) };
}

/** Fresh sessions start with 500 minimum bets, mirroring the demo's 10000@20. */
export function startingBalanceFor(def: any): number {
  return betStepsFor(def).minBet * 500;
}
