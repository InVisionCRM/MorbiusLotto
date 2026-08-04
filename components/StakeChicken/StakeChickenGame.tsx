'use client';

/**
 * StakeChickenGame — the interactive client for chips Chicken (/chicken).
 *
 * Deep-Sea Neon: #050E16 abyss base, cyan #22D3EE safe lanes, rose bumpers,
 * amber win amounts. Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Stateful crossing (like Towers/Mines): /start debits the bet and seals every
 * lane behind a committed hash → each /step crosses the next lane (safe
 * advances, a bumper busts) → /cashout banks floor(bet × multiplier) after any
 * cleared lane; clearing every lane auto-settles. On mount we resume the active
 * round via /active so a refresh never strands a bet.
 *
 * Layout mirrors the arcade2 family: a 300px control rail (balance, difficulty,
 * bet + ½/2×/Max, Deal / Cash out, provably fair) beside the road board. The
 * road's next lane is the clickable surface — tap it to step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { useBigWin } from '@/contexts/big-win-context';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { ArcadeFairnessStrip } from '@/components/shared/ArcadeFairnessStrip';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay';
import { ChickenRoad } from './ChickenRoad';
import { ChickenInfoTabs } from './ChickenInfoTabs';
import { ChickenFairnessModal } from './ChickenFairnessModal';
import { chickenAudio } from './chicken-audio';
import {
  fetchChickenInfo,
  fetchChickenActive,
  startChicken,
  stepChicken,
  cashoutChicken,
  fetchChickenHistory,
  formatMultiplier,
  CHICKEN_DIFFICULTY_ORDER,
  CHICKEN_DIFFICULTY_LABELS,
  type ChickenActiveRound,
  type ChickenDifficulty,
  type ChickenInfo,
  type ChickenHistoryRound,
} from '@/lib/chicken-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'starting' | 'active' | 'stepping' | 'cashing' | 'busted' | 'cashed';

interface RoundResult {
  won: boolean;
  payout: number;
  multiplierX100: number;
  serverSeed: string;
}

const FLAT_LADDER = Array(21).fill(100);

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function StakeChickenGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<ChickenInfo | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [difficulty, setDifficulty] = useState<ChickenDifficulty>('easy');
  const [round, setRound] = useState<ChickenActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);
  const [bumperLanes, setBumperLanes] = useState<number[] | null>(null);
  const [bustLane, setBustLane] = useState<number | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<ChickenHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Replay: a staged past round (confirm overlay) + the round currently being
  // re-watched. A replay is a pure re-render of the settled road — it never
  // calls the server, moves the balance, reports a win, or writes history.
  const [pendingReplay, setPendingReplay] = useState<ChickenHistoryRound | null>(null);
  const [replayRound, setReplayRound] = useState<ChickenHistoryRound | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null);
  const [balance, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (chainBalance != null) {
      try {
        setBalance(BigInt(chainBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
    } else if (!address) {
      setBalance(null);
    }
  }, [chainBalance, address]);

  const minBet = info?.minBet ?? 10;
  const maxBet = info?.maxBet ?? 2000;

  useEffect(() => {
    fetchChickenInfo()
      .then((i) => {
        setInfo(i);
        setBet((b) => Math.min(Math.max(b, i.minBet), i.maxBet));
      })
      .catch(() => {});
  }, []);

  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchChickenHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume an in-progress crossing after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchChickenActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setDifficulty(active.difficulty);
        setBet(active.bet);
        setBumperLanes(null);
        setBustLane(null);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  // While a replay is showing there is no active `round`; the board reads from
  // `replayRound` instead so it re-renders that settled crossing.
  const boardDifficulty = round?.difficulty ?? replayRound?.difficulty ?? difficulty;
  const diffInfo = info?.difficulties[boardDifficulty] ?? null;
  const lanesTotal = round?.lanes ?? diffInfo?.lanes ?? 20;
  const ladder = round?.ladder ?? diffInfo?.ladder ?? FLAT_LADDER;
  const currentLane = round?.lane ?? replayRound?.lane ?? 0;
  const multiplierX100 = round?.multiplierX100 ?? replayRound?.multiplierX100 ?? 100;
  const resultBet = round?.bet ?? replayRound?.bet ?? 0;
  const lanesRemaining = lanesTotal - currentLane;
  const cashoutValue = round ? Math.floor((round.bet * multiplierX100) / 100) : 0;
  const canCash = phase === 'active' && currentLane > 0;

  const clampBet = useCallback(
    (v: number) => {
      const cap = balance != null ? Math.min(maxBet, Number(balance)) : maxBet;
      return Math.max(minBet, Math.min(cap, Math.floor(v) || minBet));
    },
    [balance, maxBet, minBet],
  );

  const handleErr = useCallback((e: unknown) => {
    const msg = (e as Error)?.message ?? '';
    if (/Not enough chips|insufficient/i.test(msg)) {
      setError('Not enough MORBIUS for that wager.');
      setNoChips(true);
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  const settleHistory = useCallback(
    (
      roundId: string,
      betAmount: number,
      diff: ChickenDifficulty,
      lane: number,
      multX100: number,
      won: boolean,
      payout: number,
      bumperLanes: number[],
    ) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            difficulty: diff,
            lane,
            bumperLanes,
            multiplierX100: multX100,
            won,
            payout,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
    },
    [],
  );

  const winFx = useCallback(() => {
    chickenAudio.playWin();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.5 },
      colors: ['#22D3EE', '#FCD34D', '#ffffff'],
    });
  }, []);

  const startRound = useCallback(async () => {
    if (!betting || !info) return;
    const stake = clampBet(bet);
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough MORBIUS for that wager.');
      setNoChips(true);
      return;
    }
    setError(null);
    setNoChips(false);
    setResult(null);
    setReplayRound(null);
    setPendingReplay(null);
    setBumperLanes(null);
    setBustLane(null);
    setPhase('starting');
    chickenAudio.init();
    try {
      const r = await startChicken({ bet: stake, difficulty, clientSeed: clientSeed.trim() || undefined });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        difficulty: r.difficulty,
        lane: 0,
        multiplierX100: 100,
        serverSeedHash: r.serverSeedHash,
        lanes: r.lanes,
        ladder: r.ladder,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('active');
      chickenAudio.playTick();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, difficulty, balance, clientSeed, clampBet, handleErr]);

  const doStep = useCallback(async () => {
    if (!round || phase !== 'active') return;
    setPhase('stepping');
    setError(null);
    chickenAudio.init();
    chickenAudio.playTick();
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    try {
      const r = await stepChicken(roundId);
      if (r.safe && !r.settled) {
        setRound((prev) => (prev ? { ...prev, lane: r.lane, multiplierX100: r.multiplierX100 } : prev));
        chickenAudio.playSafe(r.lane);
        setPhase('active');
      } else if (r.safe && r.settled) {
        // Full crossing — auto-settled win.
        setRound((prev) => (prev ? { ...prev, lane: r.lane, multiplierX100: r.multiplierX100 } : prev));
        setBumperLanes(r.bumperLanes);
        setBustLane(null);
        setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
        setPhase('cashed');
        winFx();
        reportWin({ game: 'Chicken', bet: betAmount, payout: r.payout });
        settleHistory(roundId, betAmount, diff, r.lane, r.multiplierX100, true, r.payout, r.bumperLanes);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
      } else {
        // Bumper — bust.
        setBumperLanes(r.bumperLanes);
        setBustLane(r.lane);
        setResult({ won: false, payout: 0, multiplierX100: round.multiplierX100, serverSeed: r.serverSeed });
        setPhase('busted');
        chickenAudio.playBust();
        settleHistory(roundId, betAmount, diff, r.lane, round.multiplierX100, false, 0, r.bumperLanes);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
      }
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, winFx, handleErr, reportWin]);

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || round.lane === 0) return;
    setPhase('cashing');
    setError(null);
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    try {
      const r = await cashoutChicken(roundId);
      setRound((prev) => (prev ? { ...prev, lane: r.lane, multiplierX100: r.multiplierX100 } : prev));
      setBumperLanes(r.bumperLanes);
      setBustLane(null);
      setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('cashed');
      winFx();
      reportWin({ game: 'Chicken', bet: betAmount, payout: r.payout });
      settleHistory(roundId, betAmount, diff, r.lane, r.multiplierX100, true, r.payout, r.bumperLanes);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, winFx, handleErr, reportWin]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setReplayRound(null);
    setBumperLanes(null);
    setBustLane(null);
    setError(null);
    setPhase('idle');
  }, []);

  // ── Replay a past crossing: stage the confirm overlay, then re-render the
  // settled road (bumpers revealed, chicken parked at the cashed lane). A pure
  // re-watch — no server call, no balance / reportWin / history / session. ──
  const handleReplay = useCallback(
    (r: ChickenHistoryRound) => {
      if (!betting) return; // never interrupt a live crossing
      chickenAudio.init();
      setPendingReplay(r);
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [betting],
  );

  const startReplay = useCallback(() => {
    const r = pendingReplay;
    if (!r) return;
    setPendingReplay(null);
    setError(null);
    setNoChips(false);
    setRound(null);
    setDifficulty(r.difficulty);
    const crossedAll = r.won && r.lane >= (info?.difficulties[r.difficulty]?.lanes ?? r.lane);
    setBumperLanes(r.bumperLanes ?? []);
    // A cashout parks the chicken at the cashed lane (no splat); a full crossing
    // sends it to the finish. Only a bust sets bustLane.
    setBustLane(r.won ? null : r.lane);
    setReplayRound(r);
    setResult({ won: r.won, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: '' });
    setPhase(r.won ? 'cashed' : 'busted');
    if (r.won) {
      if (crossedAll) winFx();
      else chickenAudio.playWin();
    } else {
      chickenAudio.playBust();
    }
  }, [pendingReplay, info, winFx]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    chickenAudio.init();
    chickenAudio.setMute(!muted);
    setMuted(!muted);
  };

  return (
    <div className="mx-auto w-full max-w-7xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ───────── Control rail ───────── */}
        <Card className="order-2 h-fit space-y-4 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-amber-300">
                {balance != null ? `${formatChips(balance)} MORBIUS` : '—'}
              </span>
              <button
                type="button"
                onClick={() => setExchangeOpen(true)}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Difficulty</span>
            <div className="grid grid-cols-3 gap-2">
              {CHICKEN_DIFFICULTY_ORDER.map((d) => {
                const di = info?.difficulties[d];
                const active = boardDifficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!betting}
                    onClick={() => setDifficulty(d)}
                    className={[
                      'flex flex-col items-center rounded-md border py-1.5 text-xs transition-colors disabled:opacity-50',
                      active
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300'
                        : 'border-cyan-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300',
                    ].join(' ')}
                  >
                    <span className="arc-display font-semibold uppercase tracking-wider">
                      {CHICKEN_DIFFICULTY_LABELS[d]}
                    </span>
                    {di && <span className="arc-mono text-[10px] text-slate-500">{di.lanes} lanes</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Bet</span>
              <span className="text-[11px] text-slate-600">
                {minBet.toLocaleString()}–{maxBet.toLocaleString()}
              </span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={bet}
              disabled={!betting}
              min={minBet}
              max={maxBet}
              onChange={(e) => setBet(Number(e.target.value))}
              onBlur={() => setBet((b) => clampBet(b))}
              className="arc-mono w-full rounded-md border border-cyan-950 bg-[#081420] px-3 py-2 text-sm tabular-nums text-slate-100 outline-none focus:border-cyan-500/60 disabled:opacity-50"
            />
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">½</Button>
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet((b) => clampBet(b * 2))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">2×</Button>
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet(clampBet(maxBet))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">Max</Button>
            </div>
          </div>

          {round && !betting && (
            <div className="space-y-1 border-t border-cyan-950/70 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Multiplier</span>
                <span className="arc-mono tabular-nums text-cyan-300">{formatMultiplier(multiplierX100)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Cash out</span>
                <span className="arc-mono tabular-nums text-amber-300">{cashoutValue.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Action buttons: pinned to a fixed bottom bar on mobile (Deal/Step/Cash out always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {betting ? (
            <Button
              type="button"
              disabled={phase === 'starting' || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'starting' ? 'Sealing…' : 'Deal'}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                disabled={phase !== 'active'}
                onClick={() => void doStep()}
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'stepping' ? 'Crossing…' : 'Step ▸'}
              </Button>
              <Button
                type="button"
                disabled={!canCash || phase === 'cashing'}
                onClick={() => void doCashout()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                <span>{phase === 'cashing' ? 'Cashing…' : 'Cash out'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {canCash ? `${cashoutValue.toLocaleString()} MORBIUS` : 'take 1 step first'}
                </span>
              </Button>
            </div>
          )}
          </div>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button type="button" onClick={() => setExchangeOpen(true)} className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  Deposit MORBIUS
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => openVerify(history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 ? ' · verify last round' : ''}
          </button>
        </Card>

        {/* ───────── Road ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card ref={boardRef} className="relative border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 sm:p-6">
            <ChickenRoad
              lanes={lanesTotal}
              currentLane={currentLane}
              ladder={ladder}
              bumperLanes={bumperLanes}
              bustLane={bustLane}
              disabled={phase !== 'active'}
              onStep={() => void doStep()}
            />

            <div className="mt-3 text-center" aria-live="polite">
              {result ? (
                <div className="arc-banner-in">
                  {result.won ? (
                    <>
                      <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)] sm:text-3xl">
                        {currentLane >= lanesTotal ? 'Crossed' : 'Cashed out'} {formatMultiplier(result.multiplierX100)}
                      </div>
                      <div className="arc-mono mt-1 text-sm tabular-nums text-amber-300">
                        +{(result.payout - resultBet).toLocaleString()} MORBIUS
                      </div>
                    </>
                  ) : (
                    <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)] sm:text-3xl">
                      Splat · −{resultBet.toLocaleString()} MORBIUS
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={playAgain}
                    className="arc-display mt-3 bg-cyan-500/15 text-sm font-bold uppercase tracking-widest text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
                  >
                    Play again
                  </Button>
                </div>
              ) : phase === 'active' || phase === 'stepping' ? (
                <p className="arc-mono text-xs text-slate-500">
                  Lane {currentLane + 1} of {lanesTotal} · {lanesRemaining} to the curb · Step ▸ to cross, cash out anytime
                </p>
              ) : (
                <p className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Pick a difficulty · deal to cross
                </p>
              )}
            </div>

            {pendingReplay && (
              <ReplayConfirmOverlay
                title="Replay crossing"
                headline={formatMultiplier(pendingReplay.multiplierX100)}
                sub={`${
                  pendingReplay.payout - pendingReplay.bet > 0
                    ? `+${(pendingReplay.payout - pendingReplay.bet).toLocaleString()}`
                    : (pendingReplay.payout - pendingReplay.bet).toLocaleString()
                } MORBIUS`}
                onPlay={startReplay}
                onCancel={() => setPendingReplay(null)}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Always-visible fairness bar — active seed pair + commitment. */}
      <ArcadeFairnessStrip onOpenPanel={() => setFairnessOpen(true)} />

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <ChickenInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          onReplay={handleReplay}
          info={info}
        />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="chicken.sessionChart.pos">
        <SessionChart
          gameName="Chicken"
          points={session}
          unitLabel="Rounds"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchChickenHistory(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }));
          }}
        />
      </FloatingPanel>

      <ChickenFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false);
          setVerifyTarget(null);
        }}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        requestVerifyId={verifyTarget}
      />

      <GameWalletModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        defaultTab="deposit"
        balanceLabel="MORBIUS"
        onBalanceSync={async () => { await refetchBalance(); }}
      />
    </div>
  );
}
