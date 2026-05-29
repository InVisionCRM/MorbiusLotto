'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther } from 'viem';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import GlobalMainNav from '@/components/shared/GlobalMainNav';

const apiBase = (): string => {
  const v = process.env.NEXT_PUBLIC_API_URL;
  return v && v.trim() !== '' ? v.trim() : '';
};

interface Segment {
  index: number;
  value: string;
  label: string;
  weight: number;
  prize_wei: string;
  free_spins: number;
}

interface SpinResult {
  spinId: string;
  segmentIndex: number;
  segment: { value: string; label: string };
  prizeWei: string;
  freeSpins: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  spinsAvailable: number;
}

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  NO_WIN: '#1e293b',
  JACKPOT: '#7c3aed',
  '2X': '#0d9488',
  '3X': '#dc2626',
  '5X': '#d97706',
  '10X': '#db2777',
  '20X': '#0891b2',
  FREE_SPIN: '#4f46e5',
};

const SEGMENT_TEXT_COLORS: Record<string, string> = {
  NO_WIN: '#94a3b8',
};

const SPIN_DURATION_MS = 5200;
const SPIN_FULL_REVOLUTIONS = 7;

function colorFor(value: string): string {
  return SEGMENT_COLORS[value] ?? '#334155';
}
function textColorFor(value: string): string {
  return SEGMENT_TEXT_COLORS[value] ?? '#f8fafc';
}
function formatMorbius(wei: string | bigint): string {
  try {
    const eth = formatEther(typeof wei === 'string' ? BigInt(wei) : wei);
    const n = Number(eth);
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return '0';
  }
}
function reasonLabel(r: string): string {
  return ({
    wager_volume_blackjack: 'Blackjack wager',
    wager_volume_blackjack_multi: 'Multi-BJ wager',
    wager_volume_poker: 'Poker wager',
    tournament_entry: 'Tournament entry',
    tournament_cancel_refund: 'Tournament cancelled',
    daily_first_game: 'Daily first play',
    loss_streak_pity: 'Bad luck bonus',
    wheel_spin: 'Wheel spin',
    free_spin_reward: 'Free spin from wheel',
    manual_grant: 'Granted',
  } as Record<string, string>)[r] ?? r;
}

export default function WheelClient() {
  const { address, isConnected } = useAccount();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [spinsAvailable, setSpinsAvailable] = useState(0);
  const [pendingSpinId, setPendingSpinId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  useEffect(() => {
    fetch(`${apiBase()}/api/wheel/segments`)
      .then((r) => r.json())
      .then((d) => setSegments(Array.isArray(d.segments) ? d.segments : []))
      .catch(() => setError('Could not load wheel'));
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!isConnected) return;
    try {
      const r = await fetch(`${apiBase()}/api/wheel/balance`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setSpinsAvailable(d.spinsAvailable ?? 0);
    } catch {}
  }, [isConnected]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance, address]);

  const refreshLedger = useCallback(async () => {
    if (!isConnected) return;
    try {
      const r = await fetch(`${apiBase()}/api/wheel/ledger?limit=30`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setLedger(Array.isArray(d.entries) ? d.entries : []);
    } catch {}
  }, [isConnected]);

  const ensureCommit = useCallback(async (): Promise<string> => {
    if (pendingSpinId) return pendingSpinId;
    const r = await fetch(`${apiBase()}/api/wheel/commit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Commit failed');
    const d = await r.json();
    setPendingSpinId(d.spinId);
    return d.spinId as string;
  }, [pendingSpinId]);

  const handleSpin = useCallback(async () => {
    if (isSpinning || !isConnected) return;
    if (spinsAvailable < 1) {
      setError('No spins available — earn more by playing blackjack, multi-BJ, poker, or entering a tournament.');
      return;
    }
    setError(null);
    setIsSpinning(true);
    setShowResult(false);
    try {
      const spinId = await ensureCommit();
      const r = await fetch(`${apiBase()}/api/wheel/spin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spinId }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'NO_SPINS') setError('No spins available.');
        else if (d.code === 'ALREADY_SETTLED') setError('Commitment expired — refresh.');
        else setError(d.error ?? 'Spin failed');
        setIsSpinning(false);
        setPendingSpinId(null);
        return;
      }

      const n = Math.max(1, segments.length);
      const segDeg = 360 / n;
      const centerAngle = d.segmentIndex * segDeg + segDeg / 2;
      const targetAngle = (360 - centerAngle + 360) % 360;
      const base = Math.ceil(rotation / 360) * 360;
      const finalRotation = base + SPIN_FULL_REVOLUTIONS * 360 + targetAngle;
      setRotation(finalRotation);

      settleTimer.current = setTimeout(() => {
        setLastResult(d as SpinResult);
        setShowResult(true);
        setSpinsAvailable(d.spinsAvailable ?? 0);
        setPendingSpinId(null);
        setIsSpinning(false);
        if (showLedger) refreshLedger();
      }, SPIN_DURATION_MS);
    } catch (e) {
      setError((e as Error).message);
      setIsSpinning(false);
      setPendingSpinId(null);
    }
  }, [isSpinning, isConnected, spinsAvailable, ensureCommit, segments.length, rotation, showLedger, refreshLedger]);

  const conicBg = useMemo(() => {
    if (segments.length === 0) return 'conic-gradient(#1e293b, #0f172a)';
    const segDeg = 360 / segments.length;
    const parts = segments.map((s, i) => {
      const start = (i * segDeg).toFixed(3);
      const end = ((i + 1) * segDeg).toFixed(3);
      return `${colorFor(s.value)} ${start}deg ${end}deg`;
    });
    return `conic-gradient(from -${(segDeg / 2).toFixed(3)}deg, ${parts.join(', ')})`;
  }, [segments]);

  return (
    <GlobalMainNav>
      <main className="relative flex flex-col items-center justify-start w-full min-h-[100dvh] bg-[#030712] text-slate-50 overflow-x-hidden select-none px-4 py-6 sm:py-10">
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] sm:w-[520px] h-[300px] sm:h-[520px] bg-gradient-to-tr from-fuchsia-600/30 via-pink-500/20 to-cyan-500/30 rounded-full blur-[100px] sm:blur-[140px] opacity-60" />
        <Sparkles className="absolute top-[15%] right-[12%] w-7 h-7 text-fuchsia-400/70 animate-pulse" />
        <Sparkles className="absolute bottom-[28%] left-[10%] w-5 h-5 text-cyan-400/70 animate-pulse" />

        <h1
          className="relative text-3xl sm:text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-fuchsia-400 via-pink-300 to-cyan-300 tracking-wider mb-4 sm:mb-8 z-10 text-center uppercase"
          style={{ filter: 'drop-shadow(0 0 22px rgba(236, 72, 153, 0.5))' }}
        >
          Daily Wish
        </h1>

        <div className="z-10 flex items-center gap-4 mb-6 sm:mb-10">
          <div className="px-4 py-2 rounded-full bg-slate-900/80 border border-slate-800 text-sm text-slate-300">
            Spins: <span className="font-bold text-amber-300">{spinsAvailable}</span>
          </div>
          {isConnected ? (
            <button
              onClick={() => {
                setShowLedger((s) => !s);
                if (!showLedger) refreshLedger();
              }}
              className="px-4 py-2 rounded-full bg-slate-900/80 border border-slate-800 text-sm text-slate-300 hover:text-white"
            >
              History
            </button>
          ) : (
            <ConnectButton showBalance={false} />
          )}
        </div>

        <div className="relative w-full max-w-[320px] sm:max-w-[440px] md:max-w-[500px] aspect-square z-10">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-500 p-[6px] shadow-[0_30px_60px_-20px_rgba(217,119,6,0.55)]">
            <div className="absolute inset-[6px] rounded-full bg-slate-950 p-[3px]">
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{
                  background: conicBg,
                  transform: `rotate(${rotation}deg)`,
                  transition: isSpinning
                    ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
                    : 'none',
                }}
              >
                {segments.map((s, i) => {
                  const segDeg = 360 / Math.max(1, segments.length);
                  return (
                    <div
                      key={s.index}
                      className="absolute inset-0 pointer-events-none"
                      style={{ transform: `rotate(${i * segDeg}deg)` }}
                    >
                      <div
                        className="absolute left-1/2 -translate-x-1/2 top-[7%] text-[10px] sm:text-xs font-extrabold uppercase tracking-wide whitespace-nowrap text-center"
                        style={{
                          color: textColorFor(s.value),
                          textShadow: '0 1px 2px rgba(0,0,0,0.65)',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pointer */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
            <div
              className="w-0 h-0"
              style={{
                borderLeft: '14px solid transparent',
                borderRight: '14px solid transparent',
                borderTop: '24px solid #fbbf24',
                filter: 'drop-shadow(0 4px 10px rgba(251, 191, 36, 0.8))',
              }}
            />
          </div>

          {/* Center spin button */}
          <button
            onClick={handleSpin}
            disabled={isSpinning || !isConnected || spinsAvailable < 1}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-600 border-4 border-amber-300 shadow-[0_0_30px_rgba(236,72,153,0.6)] active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Spin"
          >
            {isSpinning ? (
              <RefreshCw className="w-7 h-7 sm:w-10 sm:h-10 text-white animate-spin" />
            ) : (
              <span className="text-white font-black text-sm sm:text-lg tracking-widest">SPIN</span>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-6 max-w-md text-center text-sm text-rose-300 bg-rose-950/50 border border-rose-900 rounded-md px-4 py-2 z-10">
            {error}
          </div>
        )}

        <p className="mt-8 text-center text-xs sm:text-sm text-slate-400 max-w-md z-10">
          Earn spins by playing <span className="text-amber-300">Blackjack</span>,{' '}
          <span className="text-amber-300">Blackjack Multi</span>, and{' '}
          <span className="text-amber-300">Poker</span> — or by entering tournaments. Spins never expire.
        </p>
      </main>

      {/* Result modal */}
      {showResult && lastResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
          <div className="relative max-w-md w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <button
              onClick={() => setShowResult(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Result</div>
            <div className="text-3xl sm:text-4xl font-black text-amber-300 mb-2">
              {lastResult.segment.label}
            </div>
            {BigInt(lastResult.prizeWei) > 0n && (
              <div className="text-2xl sm:text-3xl font-bold text-emerald-300 mb-2">
                +{formatMorbius(lastResult.prizeWei)} MORBIUS
              </div>
            )}
            {lastResult.freeSpins > 0 && (
              <div className="text-lg font-semibold text-fuchsia-300 mb-2">
                +{lastResult.freeSpins} free spin
              </div>
            )}
            {BigInt(lastResult.prizeWei) === 0n && lastResult.freeSpins === 0 && (
              <div className="text-base text-slate-400 mb-2">No prize this time — try again!</div>
            )}
            <div className="text-xs text-slate-500 mt-4 mb-4">
              Spins remaining: {lastResult.spinsAvailable}
            </div>
            <a
              href={`${apiBase()}/api/wheel/verify/${lastResult.spinId}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              Verify outcome (provably fair)
            </a>
            <div className="mt-5 flex gap-2 justify-center">
              <button
                onClick={() => setShowResult(false)}
                className="px-5 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
              >
                Close
              </button>
              {spinsAvailable > 0 && (
                <button
                  onClick={() => {
                    setShowResult(false);
                    setTimeout(() => handleSpin(), 100);
                  }}
                  className="px-5 py-2 rounded-md bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white text-sm font-semibold"
                >
                  Spin again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ledger drawer */}
      {showLedger && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4">
          <div className="relative max-w-lg w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowLedger(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-amber-300 mb-3">Spin History</h3>
            {ledger.length === 0 ? (
              <div className="text-sm text-slate-500">No spin activity yet.</div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {ledger.map((e) => (
                  <li key={e.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-200">{reasonLabel(e.reason)}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(e.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className={`font-bold tabular-nums ${e.delta > 0 ? 'text-emerald-300' : e.delta < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                      {e.delta > 0 ? '+' : ''}
                      {e.delta}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </GlobalMainNav>
  );
}
