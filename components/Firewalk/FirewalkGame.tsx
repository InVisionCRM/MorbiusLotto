'use client';

/**
 * FirewalkGame — the interactive client for chips Firewalk (/firewalk).
 *
 * Faithful port of public/firewalk-lab.html into the arcade2 React stack: a
 * crumbling-stone crossing over the coals with a choose-your-pace twist (hop 1 /
 * leap 2 / bound 3). Deep-Sea Neon — #050E16 abyss base, cyan #22D3EE safe
 * stones, ember/amber coals + win amounts, rose burns. Chakra Petch + JetBrains
 * Mono via the arcade2 fonts.
 *
 * Stateful crossing (like Chicken/Towers): /start debits the bet and seals every
 * stone behind a committed hash → each /step takes the chosen pace (every stone
 * in the leap must be solid; a crumble anywhere busts) → /cashout banks
 * floor(bet × multiplier) after any crossed stone; clearing every stone
 * auto-settles. On mount we resume the active round via /active so a refresh
 * never strands a bet.
 *
 * Layout mirrors the arcade2 family: a 300px control rail (balance, heat, bet +
 * ½/2×/Max, pace selector, Step / Cash out, provably fair) beside the coals
 * board. The next stone is the clickable surface — tap it to step.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { FirewalkRoad } from './FirewalkRoad';
import { FirewalkInfoTabs } from './FirewalkInfoTabs';
import { FirewalkFairnessModal } from './FirewalkFairnessModal';
import { firewalkAudio } from './firewalk-audio';
import {
  fetchFirewalkInfo,
  fetchFirewalkActive,
  startFirewalk,
  stepFirewalk,
  cashoutFirewalk,
  fetchFirewalkHistory,
  formatMultiplier,
  FIREWALK_HEAT_ORDER,
  FIREWALK_HEAT_LABELS,
  FIREWALK_PACE_LABELS,
  type FirewalkActiveRound,
  type FirewalkHeat,
  type FirewalkPace,
  type FirewalkInfo,
  type FirewalkHistoryRound,
} from '@/lib/firewalk-client';

const HISTORY_LIMIT = 25;
const PACES: readonly FirewalkPace[] = [1, 2, 3];

type Phase = 'idle' | 'starting' | 'active' | 'stepping' | 'cashing' | 'busted' | 'cashed';

interface RoundResult {
  won: boolean;
  payout: number;
  multiplierX100: number;
  serverSeed: string;
}

const FLAT_LADDER = Array(15).fill(100);

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function FirewalkGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<FirewalkInfo | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [heat, setHeat] = useState<FirewalkHeat>('low');
  const [pace, setPace] = useState<FirewalkPace>(1);
  const [round, setRound] = useState<FirewalkActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);
  const [crumbleStones, setCrumbleStones] = useState<number[] | null>(null);
  const [bustStone, setBustStone] = useState<number | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<FirewalkHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    fetchFirewalkInfo()
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
      .then((ok) => (ok ? fetchFirewalkHistory(HISTORY_LIMIT) : []))
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
      .then((ok) => (ok ? fetchFirewalkActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setHeat(active.heat);
        setBet(active.bet);
        setCrumbleStones(null);
        setBustStone(null);
        setPace(1);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  // `isPhase` reads the phase opaquely (TS can't narrow through a function call),
  // so the JSX comparisons below (phase === 'starting', 'cashing', etc.) aren't
  // flagged as dead by flow-narrowing inside the `betting` ternary — they're all
  // reachable runtime states.
  const isPhase = useCallback((p: Phase) => phase === p, [phase]);
  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  const starting = isPhase('starting');
  const cashing = isPhase('cashing');
  const boardHeat = round?.heat ?? heat;
  const heatInfo = info?.heats[boardHeat] ?? null;
  const stonesTotal = round?.stones ?? heatInfo?.stones ?? 14;
  const ladder = round?.ladder ?? heatInfo?.ladder ?? FLAT_LADDER;
  const currentPos = round?.position ?? 0;
  const multiplierX100 = round?.multiplierX100 ?? 100;
  const stonesRemaining = stonesTotal - currentPos;
  const cashoutValue = round ? Math.floor((round.bet * multiplierX100) / 100) : 0;
  const canCash = phase === 'active' && currentPos > 0;

  // Pace the player can actually take (capped so it never overshoots the row).
  const maxPace = Math.max(1, Math.min(3, stonesTotal - currentPos)) as FirewalkPace;
  const effectivePace = (Math.min(pace, maxPace) as FirewalkPace) || 1;
  const leapEnd = Math.min(currentPos + effectivePace, stonesTotal);

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
      h: FirewalkHeat,
      position: number,
      multX100: number,
      won: boolean,
      payout: number,
    ) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            heat: h,
            position,
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
    firewalkAudio.playWin();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.5 },
      colors: ['#22D3EE', '#FCD34D', '#FB923C', '#ffffff'],
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
    setCrumbleStones(null);
    setBustStone(null);
    setPace(1);
    setPhase('starting');
    firewalkAudio.init();
    try {
      const r = await startFirewalk({ bet: stake, heat, clientSeed: clientSeed.trim() || undefined });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        heat: r.heat,
        position: 0,
        multiplierX100: 100,
        serverSeedHash: r.serverSeedHash,
        stones: r.stones,
        ladder: r.ladder,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('active');
      firewalkAudio.playHop();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, heat, balance, clientSeed, clampBet, handleErr]);

  const doStep = useCallback(async () => {
    if (!round || phase !== 'active') return;
    const usePace = Math.max(1, Math.min(effectivePace, round.stones - round.position)) as FirewalkPace;
    setPhase('stepping');
    setError(null);
    firewalkAudio.init();
    firewalkAudio.playHop();
    const betAmount = round.bet;
    const roundId = round.roundId;
    const h = round.heat;
    const priorMult = round.multiplierX100;
    try {
      const r = await stepFirewalk(roundId, usePace);
      if (r.kind === 'advance') {
        // Safe step, crossing continues.
        setRound((prev) => (prev ? { ...prev, position: r.position, multiplierX100: r.multiplierX100 } : prev));
        firewalkAudio.playSafe(r.position);
        setPhase('active');
      } else if (r.kind === 'cleared') {
        // Full crossing — auto-settled win.
        setRound((prev) => (prev ? { ...prev, position: r.position, multiplierX100: r.multiplierX100 } : prev));
        setCrumbleStones(r.crumbleStones);
        setBustStone(null);
        setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
        setPhase('cashed');
        winFx();
        settleHistory(roundId, betAmount, h, r.position, r.multiplierX100, true, r.payout);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
      } else {
        // Crumble — bust. r.position is the stone that gave way; the walker keeps
        // its prior multiplier (it never banked the leap).
        setCrumbleStones(r.crumbleStones);
        setBustStone(r.position);
        setResult({ won: false, payout: 0, multiplierX100: priorMult, serverSeed: r.serverSeed });
        setPhase('busted');
        firewalkAudio.playBurn();
        settleHistory(roundId, betAmount, h, r.position, priorMult, false, 0);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
      }
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, effectivePace, settleHistory, winFx, handleErr]);

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || round.position === 0) return;
    setPhase('cashing');
    setError(null);
    const betAmount = round.bet;
    const roundId = round.roundId;
    const h = round.heat;
    try {
      const r = await cashoutFirewalk(roundId);
      setRound((prev) => (prev ? { ...prev, position: r.position, multiplierX100: r.multiplierX100 } : prev));
      setCrumbleStones(r.crumbleStones);
      setBustStone(null);
      setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('cashed');
      winFx();
      settleHistory(roundId, betAmount, h, r.position, r.multiplierX100, true, r.payout);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, winFx, handleErr]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setCrumbleStones(null);
    setBustStone(null);
    setError(null);
    setPace(1);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    firewalkAudio.init();
    firewalkAudio.setMute(!muted);
    setMuted(!muted);
  };

  return (
    <div className="mx-auto w-full max-w-7xl">
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
            <span className="text-xs uppercase tracking-wide text-slate-500">Heat</span>
            <div className="grid grid-cols-3 gap-2">
              {FIREWALK_HEAT_ORDER.map((h) => {
                const hi = info?.heats[h];
                const crumblePct = hi ? Math.round(((hi.outcomes - hi.safe) / hi.outcomes) * 100) : null;
                const active = boardHeat === h;
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={!betting}
                    onClick={() => setHeat(h)}
                    className={[
                      'flex flex-col items-center rounded-md border py-1.5 text-xs transition-colors disabled:opacity-50',
                      active
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300'
                        : 'border-cyan-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300',
                    ].join(' ')}
                  >
                    <span className="arc-display font-semibold uppercase tracking-wider">
                      {FIREWALK_HEAT_LABELS[h]}
                    </span>
                    {crumblePct != null && (
                      <span className="arc-mono text-[10px] text-slate-500">{crumblePct}% crumble</span>
                    )}
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

          {/* Pace selector — only while actively crossing. */}
          {phase === 'active' && (
            <div className="space-y-1.5">
              <span className="text-xs uppercase tracking-wide text-slate-500">Pace</span>
              <div className="grid grid-cols-3 gap-2">
                {PACES.map((k) => {
                  const reachable = currentPos + k <= stonesTotal;
                  const to = Math.min(currentPos + k, stonesTotal);
                  const toMult = ladder[to] ?? 100;
                  const selected = effectivePace === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!reachable}
                      onClick={() => setPace(k)}
                      className={[
                        'flex flex-col items-center rounded-md border py-1.5 text-xs transition-colors disabled:opacity-40',
                        selected
                          ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300'
                          : 'border-cyan-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300',
                      ].join(' ')}
                    >
                      <span className="arc-display font-semibold">{FIREWALK_PACE_LABELS[k]}</span>
                      <span className="arc-mono text-[10px] text-slate-500">→ {formatMultiplier(toMult)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {betting ? (
            <Button
              type="button"
              disabled={starting || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {starting ? 'Sealing…' : 'Place bet & step on'}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                disabled={phase !== 'active'}
                onClick={() => void doStep()}
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'stepping'
                  ? 'Crossing…'
                  : `${FIREWALK_PACE_LABELS[effectivePace].split(' ')[0]} ${effectivePace} ▸`}
              </Button>
              <Button
                type="button"
                disabled={!canCash || cashing}
                onClick={() => void doCashout()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                <span>{phase === 'cashing' ? 'Cashing…' : 'Cash out'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {canCash ? `${cashoutValue.toLocaleString()} MORBIUS` : 'walk first'}
                </span>
              </Button>
            </div>
          )}

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

        {/* ───────── Coals board ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 sm:p-6">
            {/* HUD strip */}
            <div className="mb-3 grid grid-cols-3 overflow-hidden rounded-lg ring-1 ring-inset ring-cyan-950/70">
              <div className="bg-[#040C13] px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Multiplier</div>
                <div className={`arc-mono mt-0.5 text-lg font-bold tabular-nums sm:text-xl ${currentPos > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                  {formatMultiplier(multiplierX100)}
                </div>
              </div>
              <div className="bg-[#040C13] px-3 py-2.5 text-center ring-1 ring-inset ring-cyan-950/70">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Stones</div>
                <div className="arc-mono mt-0.5 text-lg font-bold tabular-nums text-cyan-300 sm:text-xl">
                  {currentPos} / {stonesTotal}
                </div>
              </div>
              <div className="bg-[#040C13] px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Cash out</div>
                <div className="arc-mono mt-0.5 text-lg font-bold tabular-nums text-white sm:text-xl">
                  {canCash ? cashoutValue.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            <FirewalkRoad
              stones={stonesTotal}
              position={currentPos}
              ladder={ladder}
              pace={effectivePace}
              crumbleStones={crumbleStones}
              bustStone={bustStone}
              disabled={phase !== 'active'}
              onStep={() => void doStep()}
            />

            <div className="mt-3 text-center" aria-live="polite">
              {result ? (
                <div className="arc-banner-in">
                  {result.won ? (
                    <>
                      <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)] sm:text-3xl">
                        {currentPos >= stonesTotal ? 'Crossed the coals!' : 'Cashed out'} {formatMultiplier(result.multiplierX100)}
                      </div>
                      <div className="arc-mono mt-1 text-sm tabular-nums text-amber-300">
                        +{(result.payout - (round?.bet ?? 0)).toLocaleString()} MORBIUS
                      </div>
                    </>
                  ) : (
                    <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)] sm:text-3xl">
                      The stone crumbled · −{(round?.bet ?? 0).toLocaleString()} MORBIUS
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={playAgain}
                    className="arc-display mt-3 bg-cyan-500/15 text-sm font-bold uppercase tracking-widest text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
                  >
                    Walk again
                  </Button>
                </div>
              ) : phase === 'active' || phase === 'stepping' ? (
                <p className="arc-mono text-xs text-slate-500">
                  Stone {currentPos + 1} of {stonesTotal} · {stonesRemaining} to safety · choose your pace, cash out anytime
                </p>
              ) : (
                <p className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Pick your heat · step onto the coals
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Rounds" />
        </div>
        <FirewalkInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="firewalk.sessionChart.pos">
          <SessionChart points={session} unitLabel="Rounds" bare />
        </FloatingPanel>
      </div>

      <FirewalkFairnessModal
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
