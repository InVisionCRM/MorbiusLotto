/**
 * Auto-bet strategy — the pure math behind Stake-style autoplay.
 *
 * A strategy answers two questions after every settled round: what should the
 * next stake be, and should the run stop? Expressing it as data (rather than
 * named systems like "martingale") means one config covers martingale,
 * reverse-martingale/paroli, d'Alembert and flat betting — the player just
 * picks what happens on a win and on a loss.
 *
 * Deliberately free of React and of any game client so it can be reasoned
 * about — and tested — on its own. `applyRound` is a pure function of
 * (strategy, state, round): same inputs, same outputs, no clocks or randomness.
 */

/** What happens to the stake after a round goes your way (or doesn't). */
export type BetAdjust =
  | { kind: 'reset' }
  | { kind: 'increase'; pct: number };

export interface AutoBetStrategy {
  /** The stake a run starts from, and returns to on a reset. */
  baseBet: number;
  onWin: BetAdjust;
  onLoss: BetAdjust;
  /** Stop once cumulative profit reaches this. 0 = off. */
  stopOnProfit: number;
  /** Stop once cumulative loss reaches this (positive number). 0 = off. */
  stopOnLoss: number;
  /** Never stake above this. 0 = off (the game's own max still applies). */
  maxBet: number;
  /** How many bets to place; null runs until stopped. */
  bets: number | null;
}

export interface AutoBetRunState {
  /** Stake the next round will use. */
  nextBet: number;
  /** Rounds settled so far in this run. */
  betsPlaced: number;
  /** Cumulative payout − bet across the run. */
  profit: number;
  /** True when the last adjustment was clipped by a cap. */
  capped: boolean;
}

export type AutoBetStopReason = 'profit' | 'loss' | 'count' | 'error' | 'manual';

export interface BetLimits {
  min: number;
  max: number;
}

/** A settled round: what was staked, and what came back (0 on a loss). */
export interface SettledRound {
  bet: number;
  payout: number;
}

export const NO_ADJUST: BetAdjust = { kind: 'reset' };

export function defaultStrategy(baseBet: number): AutoBetStrategy {
  return {
    baseBet,
    onWin: { kind: 'reset' },
    onLoss: { kind: 'reset' },
    stopOnProfit: 0,
    stopOnLoss: 0,
    maxBet: 0,
    bets: null,
  };
}

/**
 * Whether this strategy actually decides anything. A run with flat betting and
 * no stop conditions can keep the games' fast pipelined autoplay path; anything
 * else has to serialize, because round N's outcome sizes round N+1.
 */
export function isStrategyActive(s: AutoBetStrategy): boolean {
  return (
    (s.onWin.kind === 'increase' && s.onWin.pct > 0) ||
    (s.onLoss.kind === 'increase' && s.onLoss.pct > 0) ||
    s.stopOnProfit > 0 ||
    s.stopOnLoss > 0
  );
}

const clampStake = (stake: number, strategy: AutoBetStrategy, limits: BetLimits) => {
  const ceiling = strategy.maxBet > 0 ? Math.min(strategy.maxBet, limits.max) : limits.max;
  const clamped = Math.min(Math.max(Math.round(stake), limits.min), Math.max(ceiling, limits.min));
  return { stake: clamped, capped: Math.round(stake) > clamped };
};

/** The stake a run opens with. */
export function openingBet(strategy: AutoBetStrategy, limits: BetLimits): number {
  return clampStake(strategy.baseBet, strategy, limits).stake;
}

export function initialRunState(strategy: AutoBetStrategy, limits: BetLimits): AutoBetRunState {
  return { nextBet: openingBet(strategy, limits), betsPlaced: 0, profit: 0, capped: false };
}

/**
 * Fold one settled round into the run: size the next stake, tally the profit,
 * and decide whether to stop.
 *
 * A push (payout === bet) counts as neither a win nor a loss — the stake is
 * left alone, which is what a player expects when nothing happened.
 */
export function applyRound(
  strategy: AutoBetStrategy,
  state: AutoBetRunState,
  round: SettledRound,
  limits: BetLimits,
): { state: AutoBetRunState; stop: AutoBetStopReason | null } {
  const delta = round.payout - round.bet;
  const profit = state.profit + delta;
  const betsPlaced = state.betsPlaced + 1;

  const adjust = delta > 0 ? strategy.onWin : delta < 0 ? strategy.onLoss : null;
  let rawNext = round.bet;
  if (adjust?.kind === 'reset') rawNext = strategy.baseBet;
  else if (adjust?.kind === 'increase') rawNext = round.bet * (1 + adjust.pct / 100);

  const { stake: nextBet, capped } = clampStake(rawNext, strategy, limits);
  const next: AutoBetRunState = { nextBet, betsPlaced, profit, capped };

  // Stop checks run after the round is banked, so the round that crosses the
  // threshold still counts — stopping before paying it out would lose money
  // the player already won.
  let stop: AutoBetStopReason | null = null;
  if (strategy.stopOnProfit > 0 && profit >= strategy.stopOnProfit) stop = 'profit';
  else if (strategy.stopOnLoss > 0 && -profit >= strategy.stopOnLoss) stop = 'loss';
  else if (strategy.bets != null && betsPlaced >= strategy.bets) stop = 'count';

  return { state: next, stop };
}

/** Player-facing sentence for why a run ended. */
export function stopReasonLabel(reason: AutoBetStopReason, profit: number): string {
  const amount = Math.abs(Math.round(profit)).toLocaleString();
  switch (reason) {
    case 'profit':
      return `Stopped — hit your profit target (+${amount})`;
    case 'loss':
      return `Stopped — hit your loss limit (−${amount})`;
    case 'count':
      return `Finished all bets (${profit >= 0 ? '+' : '−'}${amount})`;
    case 'error':
      return 'Stopped — a bet could not be placed';
    case 'manual':
      return `Stopped (${profit >= 0 ? '+' : '−'}${amount})`;
  }
}
