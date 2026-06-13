/**
 * arcade-craps.ts — pure math for MORBIUS Arcade: Craps.
 *
 * No database, no Express. Two responsibilities:
 *   1. Derive (die1, die2) from a provably-fair (serverSeed, clientSeed, nonce).
 *   2. Resolve a single throw against the current bets / phase / point and
 *      return the updated state.
 *
 * Mirrors the client engine in hooks/use-craps-engine.ts for parity, but the
 * server's evaluator is authoritative — the client just renders what comes back.
 */

import { ProvablyFairService } from './provably-fair.service';

// ── Types (kept identical to the client lib/craps-types.ts) ─────────────────
export type CrapsPhase = 'COME_OUT' | 'POINT';

export type CrapsBetType =
  | 'PASS'
  | 'DONT_PASS'
  | 'FIELD'
  | 'PLACE_4'
  | 'PLACE_5'
  | 'PLACE_6'
  | 'PLACE_8'
  | 'PLACE_9'
  | 'PLACE_10'
  | 'ANY_7'
  | 'ANY_CRAPS';

export interface CrapsBets {
  [key: string]: number;
}

export interface CrapsRollOutcome {
  die1: number;
  die2: number;
  sum: number;
  phaseBefore: CrapsPhase;
  phaseAfter: CrapsPhase;
  pointBefore: number | null;
  pointAfter: number | null;
  wins: number;
  losses: number;
  isPoint: boolean;
  isSevenOut: boolean;
  betsBefore: CrapsBets;
  betsAfter: CrapsBets;
}

// ── Provably-fair dice derivation ───────────────────────────────────────────
// Both dice for a single throw share the same nonce but come from different
// cursors of the HMAC byte stream — cursor 0 for die1, cursor 4 for die2.
// That gives us 8 independent bytes per throw, more than enough entropy for
// two uniform 1..6 picks. The verifier reproduces this exactly.
export function rollDiceFromSeeds(
  pf: ProvablyFairService,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): [number, number] {
  const b1 = pf.hmacByteStream(serverSeed, clientSeed, nonce, 0);
  const b2 = pf.hmacByteStream(serverSeed, clientSeed, nonce, 4);
  const die1 = Math.floor(pf.bytesToFloat(b1) * 6) + 1;
  const die2 = Math.floor(pf.bytesToFloat(b2) * 6) + 1;
  return [die1, die2];
}

// ── Bet placement validation ────────────────────────────────────────────────
const ALL_BET_TYPES = new Set<CrapsBetType>([
  'PASS', 'DONT_PASS', 'FIELD',
  'PLACE_4', 'PLACE_5', 'PLACE_6', 'PLACE_8', 'PLACE_9', 'PLACE_10',
  'ANY_7', 'ANY_CRAPS',
]);

export function isValidBetType(type: unknown): type is CrapsBetType {
  return typeof type === 'string' && ALL_BET_TYPES.has(type as CrapsBetType);
}

/** True if a bet of this type can be placed right now. */
export function canPlaceBet(type: CrapsBetType, phase: CrapsPhase): boolean {
  // Pass / Don't Pass lock once a point is established.
  if (phase === 'POINT' && (type === 'PASS' || type === 'DONT_PASS')) return false;
  return true;
}

/** True if a bet of this type can be picked up right now. */
export function canClearBet(type: CrapsBetType, phase: CrapsPhase): boolean {
  if (phase === 'POINT' && (type === 'PASS' || type === 'DONT_PASS')) return false;
  return true;
}

// ── Roll evaluator ──────────────────────────────────────────────────────────
// Direct port of the client useCrapsEngine.evaluate. Pure function: takes the
// current state plus a (die1, die2) and returns the full outcome. The route
// layer persists this into arcade_craps_rolls and updates the session row.
export function evaluateRoll(
  die1: number,
  die2: number,
  phase: CrapsPhase,
  point: number | null,
  bets: CrapsBets,
): CrapsRollOutcome {
  const sum = die1 + die2;
  const betsBefore: CrapsBets = { ...bets };
  const next: CrapsBets = { ...bets };

  let winAmount = 0;
  let lossAmount = 0;
  let nextPhase: CrapsPhase = phase;
  let nextPoint: number | null = point;
  let isPoint = false;
  let isSevenOut = false;

  const pay = (bet: CrapsBetType, oddsProfit: number, returnOriginal = true) => {
    const wager = next[bet];
    if (!wager) return;
    const profit = Math.floor(wager * oddsProfit);
    winAmount += profit + (returnOriginal ? wager : 0);
    if (returnOriginal) delete next[bet];
  };

  const collect = (bet: CrapsBetType) => {
    const wager = next[bet];
    if (!wager) return;
    lossAmount += wager;
    delete next[bet];
  };

  // One-roll bets.
  if (sum === 2 || sum === 12) pay('FIELD', 2);
  else if (sum === 3 || sum === 4 || sum === 9 || sum === 10 || sum === 11) pay('FIELD', 1);
  else collect('FIELD');

  if (sum === 7) pay('ANY_7', 4); else collect('ANY_7');
  if (sum === 2 || sum === 3 || sum === 12) pay('ANY_CRAPS', 7); else collect('ANY_CRAPS');

  // Phase-specific Pass Line / Don't Pass / Place bets.
  if (phase === 'COME_OUT') {
    if (sum === 7 || sum === 11) {
      pay('PASS', 1);
      collect('DONT_PASS');
    } else if (sum === 2 || sum === 3) {
      collect('PASS');
      pay('DONT_PASS', 1);
    } else if (sum === 12) {
      collect('PASS');
      // Bar 12: Don't Pass pushes — wager returned, no profit.
      if (next['DONT_PASS']) {
        winAmount += next['DONT_PASS'];
        delete next['DONT_PASS'];
      }
    } else {
      nextPhase = 'POINT';
      nextPoint = sum;
    }
  } else {
    if (sum === point) {
      pay('PASS', 1);
      collect('DONT_PASS');
      nextPhase = 'COME_OUT';
      nextPoint = null;
      isPoint = true;
    } else if (sum === 7) {
      collect('PASS');
      pay('DONT_PASS', 1);
      collect('PLACE_4');
      collect('PLACE_5');
      collect('PLACE_6');
      collect('PLACE_8');
      collect('PLACE_9');
      collect('PLACE_10');
      nextPhase = 'COME_OUT';
      nextPoint = null;
      isSevenOut = true;
    }

    if (sum !== 7) {
      // Place bets stay up; only profit paid.
      if (sum === 4 && next['PLACE_4']) winAmount += Math.floor(next['PLACE_4'] * (9 / 5));
      if (sum === 5 && next['PLACE_5']) winAmount += Math.floor(next['PLACE_5'] * (7 / 5));
      if (sum === 6 && next['PLACE_6']) winAmount += Math.floor(next['PLACE_6'] * (7 / 6));
      if (sum === 8 && next['PLACE_8']) winAmount += Math.floor(next['PLACE_8'] * (7 / 6));
      if (sum === 9 && next['PLACE_9']) winAmount += Math.floor(next['PLACE_9'] * (7 / 5));
      if (sum === 10 && next['PLACE_10']) winAmount += Math.floor(next['PLACE_10'] * (9 / 5));
    }
  }

  return {
    die1, die2, sum,
    phaseBefore: phase, phaseAfter: nextPhase,
    pointBefore: point, pointAfter: nextPoint,
    wins: winAmount, losses: lossAmount,
    isPoint, isSevenOut,
    betsBefore, betsAfter: next,
  };
}
