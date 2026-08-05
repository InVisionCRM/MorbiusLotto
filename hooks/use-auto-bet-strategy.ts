'use client';

/**
 * useAutoBetStrategy — the serialized autoplay loop that drives a strategy.
 *
 * The games' plain autoplay is deliberately *pipelined*: it fires the next bet
 * without awaiting the last one, which is what makes Dice/Limbo/Plinko feel
 * instant. A strategy cannot run that way — round N's outcome sizes round N+1 —
 * so this loop awaits every result before staking the next one. Games keep
 * their fast path for flat autoplay and use this only when the player has
 * actually configured something (see `isStrategyActive`).
 *
 * The caller owns placing the bet. `placeBet` receives the stake this loop
 * decided on and returns the settled round, or null to stop the run (an error,
 * out of chips, or an unmount).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyRound,
  initialRunState,
  isStrategyActive,
  type AutoBetRunState,
  type AutoBetStopReason,
  type AutoBetStrategy,
  type BetLimits,
  type SettledRound,
} from '@/lib/auto-bet-strategy';

export interface UseAutoBetStrategyOptions {
  strategy: AutoBetStrategy;
  limits: BetLimits;
  /** Place one bet at exactly `stake`. Return the settled round, or null to stop. */
  placeBet: (stake: number) => Promise<SettledRound | null>;
  /** Pause between settled rounds, so a run is watchable rather than a blur. */
  intervalMs?: number;
  /** Fired once when a run ends, for a toast or a status line. */
  onStop?: (reason: AutoBetStopReason, state: AutoBetRunState) => void;
}

export interface AutoBetController {
  running: boolean;
  run: AutoBetRunState;
  lastStop: { reason: AutoBetStopReason; state: AutoBetRunState } | null;
  start: () => void;
  stop: () => void;
  /** True when the configured strategy needs this serialized loop at all. */
  active: boolean;
}

export function useAutoBetStrategy({
  strategy,
  limits,
  placeBet,
  intervalMs = 400,
  onStop,
}: UseAutoBetStrategyOptions): AutoBetController {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<AutoBetRunState>(() => initialRunState(strategy, limits));
  const [lastStop, setLastStop] = useState<AutoBetController['lastStop']>(null);

  // The loop outlives the render that started it, so everything it reads lives
  // in refs — a stale closure here would stake the wrong amount.
  const runningRef = useRef(false);
  const strategyRef = useRef(strategy);
  const limitsRef = useRef(limits);
  const placeBetRef = useRef(placeBet);
  const onStopRef = useRef(onStop);
  const intervalRef = useRef(intervalMs);
  const mounted = useRef(true);
  strategyRef.current = strategy;
  limitsRef.current = limits;
  placeBetRef.current = placeBet;
  onStopRef.current = onStop;
  intervalRef.current = intervalMs;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runningRef.current = false;
    };
  }, []);

  // Keep the displayed opening stake in step with the configured base bet while
  // idle, so the panel shows what pressing Start would actually wager.
  //
  // Callers pass `limits` as an object literal, so this effect re-runs on every
  // render of the game. It must therefore be idempotent: setting fresh state
  // unconditionally would re-render, rebuild the literal, and loop forever
  // ("Maximum update depth exceeded"). Only commit when the value differs.
  useEffect(() => {
    if (runningRef.current) return;
    const opening = initialRunState(strategy, limits);
    setRun((prev) =>
      prev.nextBet === opening.nextBet &&
      prev.betsPlaced === 0 &&
      prev.profit === 0 &&
      prev.capped === opening.capped
        ? prev
        : opening,
    );
  }, [strategy, limits]);

  const finish = useCallback((reason: AutoBetStopReason, state: AutoBetRunState) => {
    runningRef.current = false;
    if (!mounted.current) return;
    setRunning(false);
    setLastStop({ reason, state });
    onStopRef.current?.(reason, state);
  }, []);

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    setRun((s) => {
      if (mounted.current) {
        setLastStop({ reason: 'manual', state: s });
        onStopRef.current?.('manual', s);
      }
      return s;
    });
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setLastStop(null);

    let state = initialRunState(strategyRef.current, limitsRef.current);
    setRun(state);

    void (async () => {
      while (runningRef.current && mounted.current) {
        const settled = await placeBetRef.current(state.nextBet);
        if (!settled) {
          finish('error', state);
          return;
        }
        if (!runningRef.current || !mounted.current) return;

        const stepped = applyRound(strategyRef.current, state, settled, limitsRef.current);
        state = stepped.state;
        setRun(state);

        if (stepped.stop) {
          finish(stepped.stop, state);
          return;
        }
        await new Promise((r) => setTimeout(r, intervalRef.current));
      }
    })();
  }, [finish]);

  return { running, run, lastStop, start, stop, active: isStrategyActive(strategy) };
}
