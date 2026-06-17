'use client';

/**
 * StakeTowersGame — the interactive client for chips Towers (/towers).
 *
 * Deep-Sea Neon: #050E16 abyss base, cyan #22D3EE safe tiles, rose busts,
 * amber win amounts. Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Stateful climb (like Mines/Hi-Lo): /start debits the bet and seals all 8
 * bombs behind a committed hash → each /pick reveals one tile on the current
 * floor (safe climbs, bomb busts) → /cashout banks floor(bet × multiplier)
 * after any completed floor; clearing all 8 floors auto-settles. On mount we
 * resume the active round via /active so a refresh never strands a bet.
 *
 * Layout: 300px control rail (balance, difficulty, bet + ½/2×/Max, Deal /
 * Cash out, provably fair) · the tower board with its per-floor multipliers.
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
import { TowersBoard } from './TowersBoard';
import { TowersInfoTabs } from './TowersInfoTabs';
import { TowersFairnessModal } from './TowersFairnessModal';
import { towersAudio } from './towers-audio';
import {
  fetchTowersInfo,
  fetchTowersActive,
  startTowers,
  pickTowers,
  cashoutTowers,
  fetchTowersHistory,
  formatMultiplier,
  TOWERS_FLOORS,
  TOWERS_DIFFICULTY_ORDER,
  TOWERS_DIFFICULTY_LABELS,
  type TowersActiveRound,
  type TowersDifficulty,
  type TowersInfo,
  type TowersHistoryRound,
} from '@/lib/towers-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'starting' | 'active' | 'picking' | 'cashing' | 'busted' | 'cashed';

interface RoundResult {
  won: boolean;
  payout: number;
  multiplierX100: number;
  serverSeed: string;
}

const FLAT_LADDER = Array(TOWERS_FLOORS + 1).fill(100);

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function StakeTowersGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<TowersInfo | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [difficulty, setDifficulty] = useState<TowersDifficulty>('easy');
  const [round, setRound] = useState<TowersActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);
  const [bombPositions, setBombPositions] = useState<number[] | null>(null);
  const [bustFloor, setBustFloor] = useState<number | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<TowersHistoryRound[]>([]);
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
    fetchTowersInfo()
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
      .then((ok) => (ok ? fetchTowersHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume an in-progress climb after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchTowersActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setDifficulty(active.difficulty);
        setBet(active.bet);
        setBombPositions(null);
        setBustFloor(null);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  const boardDifficulty = round?.difficulty ?? difficulty;
  const diffInfo = info?.difficulties[boardDifficulty] ?? null;
  const tiles = diffInfo?.tiles ?? 4;
  const ladder = round?.ladder ?? diffInfo?.ladder ?? FLAT_LADDER;
  const currentFloor = round?.floor ?? 0;
  const picks = round?.picks ?? [];
  const multiplierX100 = round?.multiplierX100 ?? 100;
  const floorsRemaining = TOWERS_FLOORS - currentFloor;
  const cashoutValue = round ? Math.floor((round.bet * multiplierX100) / 100) : 0;
  const canCash = phase === 'active' && currentFloor > 0;

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
    (roundId: string, betAmount: number, diff: TowersDifficulty, floor: number, multX100: number, won: boolean, payout: number) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            difficulty: diff,
            floor,
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
    towersAudio.playWin();
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
    setBombPositions(null);
    setBustFloor(null);
    setPhase('starting');
    towersAudio.init();
    try {
      const r = await startTowers({ bet: stake, difficulty, clientSeed: clientSeed.trim() || undefined });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        difficulty: r.difficulty,
        floor: 0,
        picks: [],
        multiplierX100: 100,
        serverSeedHash: r.serverSeedHash,
        ladder: r.ladder,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('active');
      towersAudio.playTick();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, difficulty, balance, clientSeed, clampBet, handleErr]);

  const doPick = useCallback(
    async (tile: number) => {
      if (!round || phase !== 'active') return;
      setPhase('picking');
      setError(null);
      towersAudio.init();
      towersAudio.playTick();
      const betAmount = round.bet;
      const roundId = round.roundId;
      const diff = round.difficulty;
      try {
        const r = await pickTowers(roundId, tile);
        if (r.safe && !r.settled) {
          setRound((prev) =>
            prev ? { ...prev, floor: r.floor, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
          );
          towersAudio.playSafe(r.floor);
          setPhase('active');
        } else if (r.safe && r.settled) {
          // Full climb — auto-settled win.
          setRound((prev) =>
            prev ? { ...prev, floor: TOWERS_FLOORS, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
          );
          setBombPositions(r.bombPositions);
          setBustFloor(null);
          setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
          setPhase('cashed');
          winFx();
          settleHistory(roundId, betAmount, diff, TOWERS_FLOORS, r.multiplierX100, true, r.payout);
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
        } else {
          // Bomb.
          setRound((prev) => (prev ? { ...prev, picks: r.picks } : prev));
          setBombPositions(r.bombPositions);
          setBustFloor(r.floor);
          setResult({ won: false, payout: 0, multiplierX100: round.multiplierX100, serverSeed: r.serverSeed });
          setPhase('busted');
          towersAudio.playBust();
          settleHistory(roundId, betAmount, diff, r.floor, round.multiplierX100, false, 0);
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
        }
      } catch (e) {
        setPhase('active');
        handleErr(e);
      }
    },
    [round, phase, settleHistory, winFx, handleErr],
  );

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || round.floor === 0) return;
    setPhase('cashing');
    setError(null);
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    try {
      const r = await cashoutTowers(roundId);
      setRound((prev) =>
        prev ? { ...prev, floor: r.floor, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
      );
      setBombPositions(r.bombPositions);
      setBustFloor(null);
      setResult({ won: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('cashed');
      winFx();
      settleHistory(roundId, betAmount, diff, r.floor, r.multiplierX100, true, r.payout);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, winFx, handleErr]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setBombPositions(null);
    setBustFloor(null);
    setError(null);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    towersAudio.init();
    towersAudio.setMute(!muted);
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
            <span className="text-xs uppercase tracking-wide text-slate-500">Difficulty</span>
            <div className="grid grid-cols-3 gap-2">
              {TOWERS_DIFFICULTY_ORDER.map((d) => {
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
                      {TOWERS_DIFFICULTY_LABELS[d]}
                    </span>
                    {di && <span className="arc-mono text-[10px] text-slate-500">{di.tiles} tiles</span>}
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

          {betting ? (
            <Button
              type="button"
              disabled={phase === 'starting' || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'starting' ? 'Building…' : 'Deal'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canCash || phase === 'cashing'}
              onClick={() => void doCashout()}
              className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
            >
              {phase === 'cashing' ? 'Cashing…' : `Cash out ${cashoutValue.toLocaleString()}`}
            </Button>
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
            onClick={() => openVerify(round?.roundId ?? history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 || round ? ' · verify this round' : ''}
          </button>
        </Card>

        {/* ───────── Tower ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 sm:p-6">
            <TowersBoard
              tiles={tiles}
              floors={TOWERS_FLOORS}
              currentFloor={currentFloor}
              picks={picks}
              ladder={ladder}
              bombPositions={bombPositions}
              bustFloor={bustFloor}
              disabled={phase !== 'active'}
              onPick={(tile) => void doPick(tile)}
            />

            <div className="mt-3 text-center" aria-live="polite">
              {result ? (
                <div className="arc-banner-in">
                  {result.won ? (
                    <>
                      <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)] sm:text-3xl">
                        {currentFloor >= TOWERS_FLOORS ? 'Tower cleared' : 'Cashed out'} {formatMultiplier(result.multiplierX100)}
                      </div>
                      <div className="arc-mono mt-1 text-sm tabular-nums text-amber-300">
                        +{(result.payout - (round?.bet ?? 0)).toLocaleString()} MORBIUS
                      </div>
                    </>
                  ) : (
                    <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)] sm:text-3xl">
                      Bust · −{(round?.bet ?? 0).toLocaleString()} MORBIUS
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
              ) : phase === 'active' ? (
                <p className="arc-mono text-xs text-slate-500">
                  Floor {currentFloor + 1} of {TOWERS_FLOORS} · {floorsRemaining} to the top · pick a safe tile
                </p>
              ) : (
                <p className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Pick a difficulty · deal to climb
                </p>
              )}
            </div>
          </Card>

          {/* Mobile-only deal / cash-out button — visible below the tower so
              players on small screens don't need to scroll to the control rail. */}
          <div className="lg:hidden">
            {betting ? (
              <Button
                type="button"
                disabled={phase === 'starting' || !info}
                onClick={() => void startRound()}
                className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'starting' ? 'Building…' : 'Deal'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canCash || phase === 'cashing'}
                onClick={() => void doCashout()}
                className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                {phase === 'cashing' ? 'Cashing…' : `Cash out ${cashoutValue.toLocaleString()}`}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Rounds" />
        </div>
        <TowersInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="towers.sessionChart.pos">
          <SessionChart points={session} unitLabel="Rounds" bare />
        </FloatingPanel>
      </div>

      <TowersFairnessModal
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
