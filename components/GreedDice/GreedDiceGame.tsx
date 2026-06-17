'use client';

/**
 * GreedDiceGame — the interactive client for chips Greed Dice (/greed-dice).
 *
 * Faithful port of public/greed-dice-lab.html into the arcade2 family. Deep-Sea
 * Neon: #050E16 abyss, cyan #22D3EE scoring dice + chrome, amber wins, rose
 * farkles. Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Stateful turn (like Chicken/Towers): /start debits the bet, seals the seed and
 * rolls the starting dice → /roll banks the auto-scoring dice and rerolls the
 * rest (a non-scoring roll farkles; clearing every die is hot dice) → /bank cashes
 * out floor(bet × multiplier). On mount we resume the active turn via /active so a
 * refresh never strands a bet.
 *
 * Layout mirrors the arcade2 family: a 300px control rail (balance, volatility,
 * bet + ½/2×/Max, Roll / Bank, provably fair) beside the felt board (HUD +
 * dice + status + kept tray). All die faces come from the server's sealed seed
 * stream — the client only animates a brief flicker before showing the real roll.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { GreedDie, type GreedDieState } from './GreedDie';
import { GreedDiceInfoTabs } from './GreedDiceInfoTabs';
import { GreedDiceFairnessModal } from './GreedDiceFairnessModal';
import { greedDiceAudio } from './greed-dice-audio';
import {
  fetchGreedDiceInfo,
  fetchGreedDiceActive,
  startGreedDice,
  rollGreedDice,
  bankGreedDice,
  fetchGreedDiceHistory,
  formatMultiplier,
  GREED_DICE_VOLATILITY_ORDER,
  GREED_DICE_VOLATILITY_LABELS,
  GREED_DICE_VOLATILITY_META,
  type GreedDiceActiveRound,
  type GreedDiceVolatility,
  type GreedDiceInfo,
  type GreedDiceHistoryRound,
} from '@/lib/greed-dice-client';

const HISTORY_LIMIT = 25;
const FLICKER_FRAMES = 5;
const FLICKER_INTERVAL_MS = 70;

type Phase = 'idle' | 'starting' | 'active' | 'rolling' | 'banking' | 'busted' | 'cashed';

interface RoundState {
  roundId: string;
  bet: number;
  volatility: GreedDiceVolatility;
  diceCount: number;
  points: number;
  multiplierX100: number;
  remaining: number;
}

/** A rendered roll: faces + which indices scored (cyan) vs dead (dimmed). */
interface BoardRoll {
  dice: number[];
  kept: number[];
}

interface RoundResult {
  won: boolean;
  payout: number;
  multiplierX100: number;
  points: number;
}

const DEFAULT_DICE_COUNT: Record<GreedDiceVolatility, number> = { five: 5, six: 6, seven: 7 };

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function GreedDiceGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<GreedDiceInfo | null>(null);
  const [bet, setBet] = useState<number>(500);
  const [volatility, setVolatility] = useState<GreedDiceVolatility>('six');
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);

  // Board render state.
  const [board, setBoard] = useState<BoardRoll | null>(null);
  const [flickerDice, setFlickerDice] = useState<number[] | null>(null);
  const [keptCount, setKeptCount] = useState(0);
  const [statusText, setStatusText] = useState<{ text: string; kind: 'normal' | 'hot' | 'bust' | 'gain'; gain?: number } | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<GreedDiceHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  const flickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (flickerRef.current) clearInterval(flickerRef.current); }, []);

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

  const minBet = info?.minBet ?? 100;
  const maxBet = info?.maxBet ?? 100000;

  useEffect(() => {
    fetchGreedDiceInfo()
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
      .then((ok) => (ok ? fetchGreedDiceHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume an in-progress turn after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchGreedDiceActive() : null))
      .then((active: GreedDiceActiveRound | null) => {
        if (cancelled || !active) return;
        setRound({
          roundId: active.roundId,
          bet: active.bet,
          volatility: active.volatility,
          diceCount: active.diceCount,
          points: active.points,
          multiplierX100: active.multiplierX100,
          remaining: active.remaining,
        });
        setVolatility(active.volatility);
        setBet(active.bet);
        setKeptCount(active.diceCount - active.remaining);
        if (active.lastRoll) {
          setBoard({ dice: active.lastRoll.dice, kept: active.lastRoll.kept });
        }
        setStatusText({
          text: `${active.remaining} dice left · roll or bank`,
          kind: 'normal',
        });
        setResult(null);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  // `betting` = the inputs (volatility/bet) are editable. The single-button
  // layout is shown when betting OR during the opening roll (`starting`); the
  // two-button Roll/Bank layout is shown for an in-progress turn.
  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  const showBetLayout = betting || phase === 'starting';
  const boardVolatility = round?.volatility ?? volatility;
  const diceCount = round?.diceCount ?? info?.volatilities[boardVolatility]?.n ?? DEFAULT_DICE_COUNT[boardVolatility];
  const points = round?.points ?? 0;
  const multiplierX100 = round?.multiplierX100 ?? 0;
  const cashoutValue = round ? Math.floor((round.bet * multiplierX100) / 100) : 0;
  const canBank = phase === 'active' && points > 0;

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
    (h: GreedDiceHistoryRound) => {
      setHistory((prev) => [h, ...prev].slice(0, HISTORY_LIMIT));
    },
    [],
  );

  const winFx = useCallback(() => {
    greedDiceAudio.playBank();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.5 },
      colors: ['#22D3EE', '#FCD34D', '#ffffff'],
    });
  }, []);

  /**
   * Animate a brief flicker of random faces, then reveal the real roll and run
   * `onReveal`. The flicker is purely cosmetic — the dice come from the server.
   */
  const flickerThenReveal = useCallback(
    (count: number, onReveal: () => void) => {
      if (flickerRef.current) clearInterval(flickerRef.current);
      let frame = 0;
      const tick = () => {
        setFlickerDice(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)));
        frame += 1;
        if (frame >= FLICKER_FRAMES) {
          if (flickerRef.current) clearInterval(flickerRef.current);
          flickerRef.current = null;
          setFlickerDice(null);
          onReveal();
        }
      };
      tick();
      flickerRef.current = setInterval(tick, FLICKER_INTERVAL_MS);
    },
    [],
  );

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
    setBoard(null);
    setKeptCount(0);
    setStatusText(null);
    setPhase('starting');
    greedDiceAudio.init();
    const startCount = info.volatilities[volatility]?.n ?? DEFAULT_DICE_COUNT[volatility];
    try {
      const r = await startGreedDice({ bet: stake, volatility, clientSeed: clientSeed.trim() || undefined });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      greedDiceAudio.playRoll();
      flickerThenReveal(startCount, () => {
        setBoard({ dice: r.dice, kept: r.kept });
        if (r.farkle) {
          setStatusText({ text: 'Farkle — no scoring dice', kind: 'bust' });
          greedDiceAudio.playBust();
          setRound({ roundId: r.roundId, bet: r.bet, volatility: r.volatility, diceCount: r.diceCount, points: 0, multiplierX100: 0, remaining: 0 });
          setResult({ won: false, payout: 0, multiplierX100: 0, points: 0 });
          setPhase('busted');
          settleHistory({ roundId: r.roundId, bet: r.bet, volatility: r.volatility, diceCount: r.diceCount, points: 0, multiplierX100: 0, rolls: 1, won: false, payout: 0, createdAt: new Date().toISOString() });
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: r.bet, profit: -r.bet }]);
          return;
        }
        greedDiceAudio.playScore(r.rollPoints);
        if (r.hot) {
          greedDiceAudio.playHot();
          setKeptCount(0);
          setStatusText({ text: `Hot dice! all ${r.dice.length} score — roll the full set`, kind: 'hot' });
        } else {
          setKeptCount(r.kept.length);
          setStatusText({ text: `${r.remaining} dice left`, kind: 'gain', gain: r.rollPoints });
        }
        setRound({ roundId: r.roundId, bet: r.bet, volatility: r.volatility, diceCount: r.diceCount, points: r.points, multiplierX100: r.multiplierX100, remaining: r.remaining });
        setPhase('active');
      });
    } catch (e) {
      setFlickerDice(null);
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, volatility, balance, clientSeed, clampBet, flickerThenReveal, handleErr, settleHistory, winFx]);

  const doRoll = useCallback(async () => {
    if (!round || phase !== 'active') return;
    const cur = round;
    setPhase('rolling');
    setError(null);
    greedDiceAudio.init();
    greedDiceAudio.playRoll();
    try {
      const r = await rollGreedDice(cur.roundId);
      flickerThenReveal(cur.remaining, () => {
        if (r.farkle === true) {
          setBoard({ dice: r.dice, kept: [] });
          setStatusText({ text: 'Farkle — no scoring dice', kind: 'bust' });
          greedDiceAudio.playBust();
          setResult({ won: false, payout: 0, multiplierX100: cur.multiplierX100, points: cur.points });
          setPhase('busted');
          settleHistory({ roundId: cur.roundId, bet: cur.bet, volatility: cur.volatility, diceCount: cur.diceCount, points: 0, multiplierX100: 0, rolls: 0, won: false, payout: 0, createdAt: new Date().toISOString() });
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: cur.bet, profit: -cur.bet }]);
          return;
        }
        const ok = r; // narrowed: scored, turn continues
        setBoard({ dice: ok.dice, kept: ok.kept });
        greedDiceAudio.playScore(ok.rollPoints);
        if (ok.hot) {
          greedDiceAudio.playHot();
          setKeptCount(0);
          setStatusText({ text: `Hot dice! all ${ok.dice.length} score — roll the full set`, kind: 'hot' });
        } else {
          setKeptCount((k) => k + ok.kept.length);
          setStatusText({ text: `${ok.remaining} dice left`, kind: 'gain', gain: ok.rollPoints });
        }
        setRound((prev) => (prev ? { ...prev, points: ok.points, multiplierX100: ok.multiplierX100, remaining: ok.remaining } : prev));
        setPhase('active');
      });
    } catch (e) {
      setFlickerDice(null);
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, flickerThenReveal, handleErr, settleHistory]);

  const doBank = useCallback(async () => {
    if (!round || phase !== 'active' || round.points <= 0) return;
    const cur = round;
    setPhase('banking');
    setError(null);
    try {
      const r = await bankGreedDice(cur.roundId);
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setRound((prev) => (prev ? { ...prev, points: r.points, multiplierX100: r.multiplierX100 } : prev));
      setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, points: r.points });
      setStatusText(null);
      setPhase('cashed');
      winFx();
      settleHistory({ roundId: cur.roundId, bet: cur.bet, volatility: cur.volatility, diceCount: cur.diceCount, points: r.points, multiplierX100: r.multiplierX100, rolls: 0, won: true, payout: r.payout, createdAt: new Date().toISOString() });
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: cur.bet, profit: r.payout - cur.bet }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, handleErr, settleHistory, winFx]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setBoard(null);
    setFlickerDice(null);
    setKeptCount(0);
    setStatusText(null);
    setError(null);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    greedDiceAudio.init();
    greedDiceAudio.setMute(!muted);
    setMuted(!muted);
  };

  // ─── Board dice to render ───────────────────────────────────────────────
  // While flickering, show the flicker faces (all 'roll'). Otherwise show the
  // last revealed roll (scored cyan, others dimmed). Before any roll, show a
  // neutral resting set sized to the volatility.
  let renderDice: { value: number; state: GreedDieState }[];
  if (flickerDice) {
    renderDice = flickerDice.map((v) => ({ value: v, state: 'roll' as const }));
  } else if (board) {
    const keptSet = new Set(board.kept);
    renderDice = board.dice.map((v, i) => ({
      value: v,
      state: (keptSet.has(i) ? 'score' : 'dead') as GreedDieState,
    }));
  } else {
    renderDice = Array.from({ length: diceCount }, (_, i) => ({
      value: ((i * 2) % 6) + 1,
      state: 'dead' as const,
    }));
  }

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

          {/* Volatility — dice in play */}
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Dice in play</span>
            <div className="grid grid-cols-3 gap-2">
              {GREED_DICE_VOLATILITY_ORDER.map((v) => {
                const active = boardVolatility === v;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!betting}
                    onClick={() => setVolatility(v)}
                    className={[
                      'flex flex-col items-center rounded-md border py-1.5 text-xs transition-colors disabled:opacity-50',
                      active
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300'
                        : 'border-cyan-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300',
                    ].join(' ')}
                  >
                    <span className="arc-display font-semibold uppercase tracking-wider">
                      {GREED_DICE_VOLATILITY_LABELS[v]}
                    </span>
                    <span className="arc-mono text-[10px] text-slate-500">{GREED_DICE_VOLATILITY_META[v]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bet */}
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
                <span className="text-xs uppercase tracking-wide text-slate-500">Points</span>
                <span className="arc-mono tabular-nums text-cyan-300">{points.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Multiplier</span>
                <span className="arc-mono tabular-nums text-cyan-300">{points > 0 ? formatMultiplier(multiplierX100) : '0×'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Cash out</span>
                <span className="arc-mono tabular-nums text-amber-300">{points > 0 ? cashoutValue.toLocaleString() : '—'}</span>
              </div>
            </div>
          )}

          {showBetLayout ? (
            <Button
              type="button"
              disabled={phase === 'starting' || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'starting' ? 'Rolling…' : phase === 'idle' ? 'Place bet & roll' : 'Play again'}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                disabled={phase !== 'active'}
                onClick={() => void doRoll()}
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'rolling' ? 'Rolling…' : `Roll ${round?.remaining ?? 0} dice`}
              </Button>
              <Button
                type="button"
                disabled={!canBank}
                onClick={() => void doBank()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                <span>{phase === 'banking' ? 'Banking…' : 'Bank'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {canBank ? `${cashoutValue.toLocaleString()} MORBIUS` : '—'}
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

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative overflow-hidden border-0 bg-[#06101a] p-0 ring-1 ring-inset ring-cyan-950/70">
            {/* HUD */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Points</div>
                <div className="arc-mono mt-0.5 text-[clamp(17px,4.5vw,23px)] font-bold text-cyan-300">{points.toLocaleString()}</div>
              </div>
              <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Multiplier</div>
                <div className={`arc-mono mt-0.5 text-[clamp(17px,4.5vw,23px)] font-bold ${points > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                  {points > 0 ? formatMultiplier(multiplierX100) : '0×'}
                </div>
              </div>
              <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Cash out</div>
                <div className="arc-mono mt-0.5 text-[clamp(17px,4.5vw,23px)] font-bold text-white">
                  {points > 0 ? cashoutValue.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            {/* Felt */}
            <div
              className="relative flex min-h-[clamp(210px,40vw,260px)] flex-col items-center justify-center gap-3.5 px-3.5 py-5"
              style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(34,211,238,0.06), transparent 70%)' }}
            >
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2.5">
                {renderDice.map((d, i) => (
                  <GreedDie key={i} value={d.value} state={d.state} />
                ))}
              </div>

              {/* Status line */}
              <div className="min-h-[18px] text-center text-[13px]">
                {statusText ? (
                  statusText.kind === 'hot' ? (
                    <span className="font-semibold uppercase tracking-wide text-amber-300">{statusText.text}</span>
                  ) : statusText.kind === 'bust' ? (
                    <span className="font-semibold uppercase tracking-wide text-rose-400">{statusText.text}</span>
                  ) : statusText.kind === 'gain' ? (
                    <span className="text-slate-400">
                      <span className="arc-mono font-semibold text-cyan-300">+{statusText.gain}</span> banked · {statusText.text}
                    </span>
                  ) : (
                    <span className="text-slate-400">{statusText.text}</span>
                  )
                ) : phase === 'idle' || phase === 'starting' ? (
                  <span className="text-slate-400">Pick your dice and roll in</span>
                ) : null}
              </div>

              {/* Kept tray */}
              <div className="flex min-h-[14px] flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: keptCount }, (_, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-[4px] bg-cyan-400/15 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
                  />
                ))}
              </div>

              {/* Result banner */}
              {result && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={`arc-banner-in rounded-2xl px-7 py-4 text-center ${
                      result.won
                        ? 'border border-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                        : 'border border-rose-500/40'
                    }`}
                    style={{
                      background: result.won
                        ? 'radial-gradient(ellipse at center, rgba(245,158,11,0.22), rgba(4,12,19,0.55))'
                        : 'radial-gradient(ellipse at center, rgba(251,113,133,0.16), rgba(4,12,19,0.6))',
                    }}
                  >
                    <div className={`text-[12px] uppercase tracking-[0.22em] ${result.won ? 'text-amber-300' : 'text-rose-400'}`}>
                      {result.won ? `${result.points} pts · ${formatMultiplier(result.multiplierX100)}` : 'Farkle — turn lost'}
                    </div>
                    <div className="arc-mono mt-1 text-[clamp(26px,8vw,40px)] font-bold text-white">
                      {result.won
                        ? `+${(result.payout - (round?.bet ?? 0)).toLocaleString()} MORBIUS`
                        : `−${(round?.bet ?? 0).toLocaleString()} MORBIUS`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {!betting && !result && (
            <p className="arc-mono text-center text-xs text-slate-500">
              Roll the leftover dice for more, or bank what you have — a no-score roll farkles the whole turn.
            </p>
          )}
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Rounds" />
        </div>
        <GreedDiceInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="greedDice.sessionChart.pos">
          <SessionChart points={session} unitLabel="Rounds" bare />
        </FloatingPanel>
      </div>

      <GreedDiceFairnessModal
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
