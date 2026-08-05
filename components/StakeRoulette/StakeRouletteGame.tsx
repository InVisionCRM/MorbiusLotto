'use client';

/**
 * StakeRouletteGame — the interactive client for chips Roulette (/roulette2).
 *
 * Deep-Sea Neon (shared arcade2 theme): #050E16 abyss base, #22D3EE cyan
 * accent, gold #FBBF24 wins, classic red/black/green pockets, Chakra Petch +
 * JetBrains Mono via the arcade2 font variables.
 *
 * Layout: 300px control rail (balance, chip value, total, SPIN, undo/clear/
 * rebet) · wheel + recent-numbers + hot/cold panel · full betting felt.
 * Spin flow: bets → POST /spin (instant, atomic, provably fair) → the wheel
 * animates ~4.4s to the server's pocket → settle effects (balance, banner,
 * confetti, history, session chart).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { useBigWin } from '@/contexts/big-win-context';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import RouletteWheel2, { WHEEL_SPIN_MS } from './RouletteWheel2';
import RouletteBoard2, { zoneKey } from './RouletteBoard2';
import { RouletteFairnessModal2 } from './RouletteFairnessModal2';
import { RouletteRulesModal } from './RouletteRulesModal';
import { RouletteInfoTabs2 } from './RouletteInfoTabs2';
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay';
import { roulette2Audio } from './roulette2-audio';
import {
  fetchRoulette2Info,
  fetchRoulette2History,
  fetchRoulette2Recent,
  spinRoulette2,
  pocketColor,
  type Roulette2Bet,
  type Roulette2Info,
  type Roulette2HistorySpin,
  type Roulette2SpinResult,
} from '@/lib/roulette2-client';

const HISTORY_LIMIT = 25;
const CHIP_VALUES = [5, 25, 100, 500] as const;
const RECENT_NUMBERS_LIMIT = 14;

const CHIP_STYLE: Record<number, string> = {
  5: 'bg-red-700',
  25: 'bg-blue-700',
  100: 'bg-green-700',
  500: 'bg-neutral-700',
};

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

interface ResultBanner {
  key: number;
  result: number;
  net: number;
  payout: number;
}

export function StakeRouletteGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<Roulette2Info | null>(null);
  const [bets, setBets] = useState<Record<string, Roulette2Bet>>({});
  const [undoStack, setUndoStack] = useState<Array<{ key: string; amount: number }>>([]);
  const [lastBets, setLastBets] = useState<Record<string, Roulette2Bet> | null>(null);
  const [chipValue, setChipValue] = useState<number>(25);

  const [spinning, setSpinning] = useState(false);
  const [spinSeq, setSpinSeq] = useState(0);
  const [wheelResult, setWheelResult] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const pendingRef = useRef<Roulette2SpinResult | null>(null);
  // Replay: a staged past spin (confirm overlay). replayingRef tells onLanded to
  // skip settlement (no balance/history/session) — it's a pure re-watch.
  const [pendingReplay, setPendingReplay] = useState<Roulette2HistorySpin | null>(null);
  const replayingRef = useRef(false);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  const [recentNumbers, setRecentNumbers] = useState<number[]>([]);
  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<Roulette2HistorySpin[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  // Balance: public read keyed by wallet, then authoritative from spin responses.
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

  useEffect(() => {
    fetchRoulette2Info()
      .then(setInfo)
      .catch(() => {});
    fetchRoulette2Recent(RECENT_NUMBERS_LIMIT)
      .then((spins) => setRecentNumbers(spins.map((s) => s.result)))
      .catch(() => {});
  }, []);

  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchRoulette2History(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  const totalBet = useMemo(
    () => Object.values(bets).reduce((sum, b) => sum + b.amount, 0),
    [bets],
  );
  const zoneCount = Object.keys(bets).length;

  const minBet = info?.minBet ?? 5;
  const maxPerZone = info?.maxBetPerZone ?? 1000;
  const maxTotal = info?.maxTotalBet ?? 5000;
  const maxZones = info?.maxZones ?? 20;

  const placeBet = useCallback(
    (bet: Roulette2Bet) => {
      if (spinning) return;
      setError(null);
      setNoChips(false);
      const key = zoneKey(bet.type, bet.numbers);
      setBets((prev) => {
        const existing = prev[key];
        const stake = Math.max(chipValue, minBet);
        if (!existing && Object.keys(prev).length >= maxZones) {
          setError(`Max ${maxZones} bet zones per spin.`);
          return prev;
        }
        const newAmount = Math.min(maxPerZone, (existing?.amount ?? 0) + stake);
        const added = newAmount - (existing?.amount ?? 0);
        if (added <= 0) {
          setError(`Max ${maxPerZone.toLocaleString()} MORBIUS per zone.`);
          return prev;
        }
        const newTotal = totalBet + added;
        if (newTotal > maxTotal) {
          setError(`Max total bet is ${maxTotal.toLocaleString()} MORBIUS.`);
          return prev;
        }
        if (balance != null && BigInt(newTotal) > balance) {
          setError('Not enough MORBIUS for that bet.');
          setNoChips(true);
          return prev;
        }
        roulette2Audio.init();
        roulette2Audio.playChip();
        setUndoStack((s) => [...s, { key, amount: added }]);
        return { ...prev, [key]: { ...bet, amount: newAmount } };
      });
    },
    [spinning, chipValue, minBet, maxPerZone, maxTotal, maxZones, totalBet, balance],
  );

  const removeZone = useCallback(
    (key: string) => {
      if (spinning) return;
      setBets((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setUndoStack((s) => s.filter((u) => u.key !== key));
    },
    [spinning],
  );

  const undo = useCallback(() => {
    if (spinning) return;
    setUndoStack((s) => {
      const last = s[s.length - 1];
      if (!last) return s;
      setBets((prev) => {
        const existing = prev[last.key];
        if (!existing) return prev;
        const remaining = existing.amount - last.amount;
        const next = { ...prev };
        if (remaining < minBet) delete next[last.key];
        else next[last.key] = { ...existing, amount: remaining };
        return next;
      });
      return s.slice(0, -1);
    });
  }, [spinning, minBet]);

  const clearBets = useCallback(() => {
    if (spinning) return;
    setBets({});
    setUndoStack([]);
  }, [spinning]);

  const rebet = useCallback(() => {
    if (spinning || !lastBets) return;
    const total = Object.values(lastBets).reduce((s, b) => s + b.amount, 0);
    if (balance != null && BigInt(total) > balance) {
      setError('Not enough MORBIUS to repeat the last bets.');
      setNoChips(true);
      return;
    }
    setBets(lastBets);
    setUndoStack([]);
  }, [spinning, lastBets, balance]);

  const spin = useCallback(async () => {
    if (spinning || zoneCount === 0 || !info) return;
    setError(null);
    setNoChips(false);
    setSpinning(true);
    setBanner(null);
    roulette2Audio.init();
    try {
      const res = await spinRoulette2({
        bets: Object.values(bets),
      });
      pendingRef.current = res;
      roulette2Audio.playSpinStart();
      roulette2Audio.startTicks(WHEEL_SPIN_MS);
      setWheelResult(res.result);
      setSpinSeq((s) => s + 1);
    } catch (e) {
      setSpinning(false);
      const msg = (e as Error)?.message ?? '';
      if (/Not enough chips|insufficient/i.test(msg)) {
        setError('Not enough MORBIUS for that wager.');
        setNoChips(true);
      } else if (/401|No session|auth/i.test(msg)) {
        setError('Connect your wallet to play.');
      } else {
        setError(serverDetail(msg) ?? 'Could not complete the spin. Try again.');
      }
    }
  }, [spinning, zoneCount, info, bets]);

  const onLanded = useCallback(() => {
    // Replay landing: just play the sound and unlock — no settlement.
    if (replayingRef.current) {
      replayingRef.current = false;
      roulette2Audio.playLand();
      setSpinning(false);
      return;
    }
    const res = pendingRef.current;
    if (!res) return;
    pendingRef.current = null;

    roulette2Audio.playLand();
    setBalance(BigInt(res.chipBalance));
    setLastResult(res.result);
    setRecentNumbers((prev) => [res.result, ...prev].slice(0, RECENT_NUMBERS_LIMIT));

    const net = res.totalPayout - res.totalBet;
    reportWin({ game: 'Roulette', bet: res.totalBet, payout: res.totalPayout });
    setBanner({ key: Date.now(), result: res.result, net, payout: res.totalPayout });
    setSession((prev) => [...prev, { drop: prev.length + 1, bet: res.totalBet, profit: net }]);
    setHistory((prev) =>
      [
        {
          spinId: res.spinId,
          bets: res.bets,
          totalBet: res.totalBet,
          result: res.result,
          totalPayout: res.totalPayout,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, HISTORY_LIMIT),
    );
    setRefreshKey((k) => k + 1);
    setLastBets(bets);
    setSpinning(false);

    if (net > 0) {
      roulette2Audio.playWin();
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.5 },
        colors: ['#22D3EE', '#FBBF24', '#ffffff'],
      });
    }
  }, [bets, reportWin]);

  // ── Replay a past spin: stage the confirm overlay, then re-spin the wheel to
  // the same result (no server call, no balance/history change). ──
  const handleReplay = useCallback(
    (spin: Roulette2HistorySpin) => {
      if (spinning) return;
      roulette2Audio.init();
      setPendingReplay(spin);
      wheelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [spinning],
  );

  const startReplay = useCallback(() => {
    const spin = pendingReplay;
    if (!spin || spinning) return;
    setPendingReplay(null);
    replayingRef.current = true;
    setSpinning(true);
    setBanner(null);
    roulette2Audio.playSpinStart();
    roulette2Audio.startTicks(WHEEL_SPIN_MS);
    setWheelResult(spin.result);
    setSpinSeq((s) => s + 1);
  }, [pendingReplay, spinning]);

  // Hot / cold numbers from the recent strip.
  const { hot, cold } = useMemo(() => {
    if (recentNumbers.length < 4) return { hot: [] as number[], cold: [] as number[] };
    const freq = new Map<number, number>();
    for (const n of recentNumbers) freq.set(n, (freq.get(n) ?? 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    return {
      hot: sorted.slice(0, 2).map(([n]) => n),
      cold: sorted.slice(-2).map(([n]) => n),
    };
  }, [recentNumbers]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    roulette2Audio.init();
    roulette2Audio.setMute(!muted);
    setMuted(!muted);
  };

  return (
    <div className="mx-auto w-full max-w-7xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ───────── Control rail ───────── */}
        <Card className="arc-panel order-2 h-fit space-y-4 border-0 p-4 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-[#FBBF24]">
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
                className="rounded p-1 text-slate-500 transition-colors hover:text-cyan-300"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Chip value</span>
            <div className="flex items-center gap-2.5">
              {CHIP_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={spinning}
                  onClick={() => setChipValue(v)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-dashed border-white/85 font-mono text-xs font-bold text-white transition-transform hover:scale-105 ${CHIP_STYLE[v]} ${
                    chipValue === v ? 'outline outline-2 outline-offset-2 outline-cyan-400' : ''
                  }`}
                  style={{ boxShadow: '0 3px 8px rgba(0,0,0,.5), inset 0 0 0 4px rgba(0,0,0,.25)' }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-cyan-950 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500">Total bet</span>
              <span className="arc-mono tabular-nums text-slate-200">
                {totalBet.toLocaleString()} MORBIUS
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500">Zones</span>
              <span className="arc-mono tabular-nums text-slate-200">
                {zoneCount} / {maxZones}
              </span>
            </div>
          </div>

          {/* Action button: pinned to a fixed bottom bar on mobile (Spin always
              reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button
            type="button"
            disabled={spinning || zoneCount === 0 || !info}
            onClick={() => void spin()}
            className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50"
          >
            {spinning ? 'Spinning…' : 'Spin'}
          </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={spinning || undoStack.length === 0}
              onClick={undo}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={spinning || zoneCount === 0}
              onClick={clearBets}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={spinning || !lastBets}
              onClick={rebet}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Rebet
            </Button>
          </div>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button
                  type="button"
                  onClick={() => setExchangeOpen(true)}
                  className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline"
                >
                  Deposit MORBIUS
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <button type="button" onClick={() => setRulesOpen(true)} className="transition-colors hover:text-cyan-400">
              Rules
            </button>
            <span className="opacity-40">·</span>
            <button type="button" onClick={() => openVerify(history[0]?.spinId ?? null)} className="transition-colors hover:text-cyan-400">
              Provably Fair{history.length > 0 ? ' · verify last spin' : ''}
            </button>
          </div>
        </Card>

        {/* ───────── Wheel + felt ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card ref={wheelRef} className="arc-panel relative border-0 p-4 sm:p-5">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <div className="w-[190px] shrink-0 sm:w-[220px]">
                <RouletteWheel2
                  result={wheelResult}
                  spinSeq={spinSeq}
                  lastResult={lastResult}
                  onLanded={onLanded}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Recent numbers
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" aria-live="polite">
                    {recentNumbers.length === 0 ? (
                      <span className="text-xs text-slate-500">No spins yet</span>
                    ) : (
                      recentNumbers.map((n, i) => {
                        const c = pocketColor(n);
                        return (
                          <span
                            key={`${n}-${i}`}
                            className={`arc-banner-in flex h-7 w-8 items-center justify-center rounded-md font-mono text-xs font-bold text-white ${
                              c === 'green'
                                ? 'bg-[#15803D]'
                                : c === 'red'
                                  ? 'bg-[#B91C1C]'
                                  : 'bg-[#27272A] ring-1 ring-inset ring-cyan-950'
                            }`}
                          >
                            {n}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="flex gap-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Hot</div>
                    <div className="arc-mono text-base font-semibold text-cyan-300">
                      {hot.length ? hot.join(' · ') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Cold</div>
                    <div className="arc-mono text-base font-semibold text-slate-400">
                      {cold.length ? cold.join(' · ') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Last win
                    </div>
                    <div className="arc-mono text-base font-semibold text-[#FBBF24]">
                      {banner && banner.net > 0 ? `+${banner.net.toLocaleString()}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Result banner */}
            {banner && (
              <div
                key={banner.key}
                className="arc-banner-in pointer-events-none absolute inset-x-0 top-3 z-40 mx-auto w-fit rounded-xl bg-[#050E16]/95 px-5 py-2.5 text-center ring-1 ring-cyan-950 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
              >
                <span
                  className={`arc-display mr-3 text-2xl font-bold ${
                    pocketColor(banner.result) === 'green'
                      ? 'text-[#4ADE80]'
                      : pocketColor(banner.result) === 'red'
                        ? 'text-red-400'
                        : 'text-zinc-200'
                  }`}
                >
                  {banner.result}
                </span>
                <span
                  className={`arc-mono text-lg font-semibold tabular-nums ${
                    banner.net > 0 ? 'text-[#FBBF24]' : 'text-rose-400'
                  }`}
                >
                  {banner.net > 0 ? `+${banner.net.toLocaleString()}` : banner.net.toLocaleString()}{' '}
                  MORBIUS
                </span>
              </div>
            )}
            {pendingReplay && (
              <ReplayConfirmOverlay
                title="Replay spin"
                headline={`#${pendingReplay.result}`}
                sub={`${
                  pendingReplay.totalPayout - pendingReplay.totalBet > 0
                    ? `+${(pendingReplay.totalPayout - pendingReplay.totalBet).toLocaleString()}`
                    : (pendingReplay.totalPayout - pendingReplay.totalBet).toLocaleString()
                } MORBIUS`}
                onPlay={startReplay}
                onCancel={() => setPendingReplay(null)}
              />
            )}
          </Card>

          <Card className="arc-panel border-0 p-3 sm:p-4">
            <RouletteBoard2
              amounts={Object.fromEntries(Object.entries(bets).map(([k, b]) => [k, b.amount]))}
              disabled={spinning}
              winningNumber={banner?.result ?? null}
              onPlace={placeBet}
              onRemove={removeZone}
            />
          </Card>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <RouletteInfoTabs2
          history={history}
          historyLoading={historyLoading}
          onVerify={openVerify}
          onReplay={handleReplay}
          refreshKey={refreshKey}
        />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="roulette2.sessionChart.pos">
        <SessionChart
          gameName="Roulette"
          points={session}
          unitLabel="Spins"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchRoulette2History(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.totalBet, profit: r.totalPayout - r.totalBet }));
          }}
        />
      </FloatingPanel>

      <RouletteRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <RouletteFairnessModal2
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false);
          setVerifyTarget(null);
        }}
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
