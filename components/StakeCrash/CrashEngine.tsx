'use client';

/**
 * CrashEngine — invisible game-loop driver for chips Crash (/crash).
 *
 * Ported from the prototype's GameEngine and rewired from local RNG to
 * server rounds:
 *
 *   betting (idle) ── Place Bet ──▶ countdown ──▶ POST /start
 *        ▲                                            │
 *        │                                     flying (rAF curve tick,
 *        │                                      250ms settle poll,
 *        │                                      cashout requests)
 *        │                                            │
 *        └────────── 4s crashed hold ◀── curve reaches revealed crash point
 *
 * Settlement authority is the server: the crash point arrives only when the
 * server settles the round (poll / cashout response), and every payout is the
 * server's number. The rAF loop runs the identical curve formula so what the
 * player sees is what the server pays.
 */

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useCrashStore } from './useCrashStore';
import { useBigWin } from '@/contexts/big-win-context';
import { crashAudio } from './crash-audio';
import { crashMultiplierAtMs } from '@/lib/crash-curve';
import { startCrash, cashoutCrash, fetchCrashRound } from '@/lib/crash-client';

const COUNTDOWN_MS = 3000;
const CRASHED_DURATION_MS = 4000;
const POLL_INTERVAL_MS = 250;

/** "400 Bad Request: Not enough chips." → "Not enough chips." */
function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export interface CrashEngineProps {
  /** Client seed for the next round's provably-fair derivation. */
  clientSeed: string;
  /** Called whenever a round fully completes (history/recent should refresh). */
  onRoundSettled: () => void;
}

export default function CrashEngine({ clientSeed, onRoundSettled }: CrashEngineProps) {
  const {
    phase,
    hasBet,
    countingDown,
    winAmount,
    isMuted,
    hasAudioInitialized,
  } = useCrashStore();
  const { reportWin } = useBigWin();

  const phaseRef = useRef(phase);
  const reqRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cashoutInFlight = useRef(false);
  const settledHandled = useRef(false);
  const clientSeedRef = useRef(clientSeed);
  const onRoundSettledRef = useRef(onRoundSettled);

  useEffect(() => {
    clientSeedRef.current = clientSeed;
    onRoundSettledRef.current = onRoundSettled;
  }, [clientSeed, onRoundSettled]);

  // Sync mute state
  useEffect(() => {
    if (hasAudioInitialized) {
      crashAudio.init();
      crashAudio.setMute(isMuted);
    }
  }, [isMuted, hasAudioInitialized]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Handle win effect (manual or auto cashout). winAmount is the gross payout;
  // both cashout paths funnel through here while still 'flying', so it's the one
  // spot to fire the big-win share card (bet from the live round).
  useEffect(() => {
    if (winAmount && phase === 'flying') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00ff00', '#ffff00'],
      });
      crashAudio.playCashout();
      const s = useCrashStore.getState();
      reportWin({ game: 'Crash', bet: s.round?.bet ?? s.betAmount, payout: winAmount });
    }
  }, [winAmount, phase, reportWin]);

  // ── Launch countdown: armed bet → /start ────────────────────────────────
  useEffect(() => {
    if (!(phase === 'betting' && hasBet && !countingDown)) return;

    const store = useCrashStore.getState();
    store.setCountdown(true, COUNTDOWN_MS / 1000);
    crashAudio.playTransition();

    const startedAt = performance.now();
    const tickId = setInterval(() => {
      const left = Math.max(0, (COUNTDOWN_MS - (performance.now() - startedAt)) / 1000);
      useCrashStore.getState().setCountdown(true, left);
    }, 100);

    const launchId = setTimeout(async () => {
      clearInterval(tickId);
      const s = useCrashStore.getState();
      try {
        const res = await startCrash({
          bet: s.betAmount,
          autoCashoutX100: Math.round(s.autoCashout * 100),
          clientSeed: clientSeedRef.current.trim() || undefined,
        });
        const sNow = useCrashStore.getState();
        sNow.setBalance(BigInt(res.chipBalance));
        sNow.setCountdown(false, 0);
        settledHandled.current = false;
        cashoutInFlight.current = false;
        sNow.startGame({
          roundId: res.roundId,
          bet: res.bet,
          autoCashoutX100: res.autoCashoutX100 ?? Math.round(s.autoCashout * 100),
          serverSeedHash: res.serverSeedHash,
          startedAt: res.startedAt,
          anchorMs: performance.now(),
          crashX100: null,
        });
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        const sNow = useCrashStore.getState();
        sNow.disarmBet();
        sNow.setCountdown(false, 0);
        if (/Not enough chips|insufficient/i.test(msg)) {
          sNow.setError('Not enough MORBIUS for that bet.', true);
        } else if (/401|No session|auth/i.test(msg)) {
          sNow.setError('Connect your wallet to play.');
        } else {
          sNow.setError(serverDetail(msg) ?? 'Could not start the round. Try again.');
        }
      }
    }, COUNTDOWN_MS);

    return () => {
      clearInterval(tickId);
      clearTimeout(launchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasBet]);

  // ── Flight: rAF curve tick + settle poll + cashout handling ─────────────
  useEffect(() => {
    let crashTimeout: ReturnType<typeof setTimeout> | undefined;

    const finishRound = (crashX100: number) => {
      const s = useCrashStore.getState();
      if (phaseRef.current !== 'flying') return;
      s.endGame(crashX100 / 100);
    };

    const doCashout = async () => {
      if (cashoutInFlight.current) return;
      cashoutInFlight.current = true;
      const s = useCrashStore.getState();
      s.clearCashoutRequest();
      const roundId = s.round?.roundId;
      if (!roundId || s.hasCashedOut) return;
      try {
        const res = await cashoutCrash(roundId);
        const sNow = useCrashStore.getState();
        if (res.won) {
          sNow.recordCashout(
            res.payout,
            res.chipBalance != null ? BigInt(res.chipBalance) : null,
          );
        }
        sNow.revealCrashPoint(res.crashX100);
        settledHandled.current = true;
      } catch {
        // Round may have settled in the same instant — the poll will resolve it.
        cashoutInFlight.current = false;
      }
    };

    if (phase === 'flying') {
      crashAudio.playLaunch();
      crashAudio.startDrone();

      const tick = () => {
        if (phaseRef.current !== 'flying') return;
        const s = useCrashStore.getState();
        const round = s.round;
        if (!round) return;

        const elapsedMs = performance.now() - round.anchorMs;
        const mult = crashMultiplierAtMs(elapsedMs);
        const multX100 = Math.floor(mult * 100);

        // Server revealed the crash point — explode exactly there.
        if (round.crashX100 !== null && multX100 >= round.crashX100) {
          s.updateMultiplier(round.crashX100 / 100);
          finishRound(round.crashX100);
          return;
        }

        // Auto-cashout: fire the locked-target cashout the moment the local
        // curve crosses it (the server pays exactly the target).
        if (
          !s.hasCashedOut &&
          !cashoutInFlight.current &&
          multX100 >= round.autoCashoutX100
        ) {
          void doCashout();
        }

        // Manual Cash Out button.
        if (s.cashoutRequested && !s.hasCashedOut && !cashoutInFlight.current) {
          void doCashout();
        }

        s.updateMultiplier(mult);
        crashAudio.updateDrone(mult);
        reqRef.current = requestAnimationFrame(tick);
      };
      reqRef.current = requestAnimationFrame(tick);

      pollRef.current = setInterval(async () => {
        const s = useCrashStore.getState();
        const round = s.round;
        if (!round || phaseRef.current !== 'flying' || settledHandled.current) return;
        try {
          const state = await fetchCrashRound(round.roundId);
          if (state.status === 'settled') {
            settledHandled.current = true;
            const sNow = useCrashStore.getState();
            if (state.won && !sNow.hasCashedOut) {
              // Auto-cashout settled server-side (e.g. brief disconnect).
              sNow.recordCashout(state.payout, null);
            }
            sNow.revealCrashPoint(state.crashX100);
          }
        } catch {
          /* transient poll error — next tick retries */
        }
      }, POLL_INTERVAL_MS);
    } else if (phase === 'crashed') {
      crashAudio.stopDrone();
      crashAudio.playCrash();

      const s = useCrashStore.getState();
      const round = s.round;
      const crashPoint = s.crashPoint;
      const net = s.hasCashedOut && s.winAmount != null
        ? s.winAmount - (round?.bet ?? 0)
        : -(round?.bet ?? 0);

      crashTimeout = setTimeout(() => {
        const sNow = useCrashStore.getState();
        sNow.pushHistory(crashPoint);
        sNow.addSessionRound(net);
        sNow.startBettingPhase();
        onRoundSettledRef.current();
      }, CRASHED_DURATION_MS);
    }

    return () => {
      if (crashTimeout) clearTimeout(crashTimeout);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [phase]);

  return null; // Invisible component
}
