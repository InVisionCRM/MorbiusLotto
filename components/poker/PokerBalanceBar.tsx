'use client';

import React, { useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ArrowRightLeft } from 'lucide-react';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { formatChips } from '@/lib/format-poker-chips';
import { usePokerChipLedger } from '@/hooks/use-poker-chip-ledger';

export interface PokerBalanceBarProps {
  address: string | null;
  /** MORBIUS play balance (wei string) from the server. */
  morbiusBalanceWei: string | null;
  /** Poker chip balance (chip count string) from the server. */
  chipBalance: string | null;
  onDeposit: () => void;
  onWithdraw: () => void;
  onOpenExchange: () => void;
}

const HISTOGRAM_LIMIT = 30;

interface HistogramData {
  bars: Array<{ height: number; isLoss: boolean }>;
  netDelta: bigint;
}

/**
 * Distill the chip-ledger into a 30-event bar series and the net delta.
 *
 * Heights are normalized to the chip balance range observed in the window so
 * the chart auto-scales for both whales and rookies. A flat line of mid-height
 * bars shows up for players whose balance has held steady at one value.
 */
function buildHistogram(entries: { delta: string; balanceAfter: string }[]): HistogramData {
  if (entries.length === 0) return { bars: [], netDelta: 0n };
  // Server returns newest-first; reverse to chronological for the chart.
  const ordered = [...entries].reverse();

  const values = ordered.map((e) => {
    try { return BigInt(e.balanceAfter); } catch { return 0n; }
  });
  const max = values.reduce((m, v) => (v > m ? v : m), values[0]);
  const min = values.reduce((m, v) => (v < m ? v : m), values[0]);
  const range = max - min;

  const bars = ordered.map((e, i) => {
    const v = values[i];
    const heightFrac = range === 0n ? 0.65 : Number(((v - min) * 10_000n) / range) / 10_000;
    let isLoss = false;
    try { isLoss = BigInt(e.delta) < 0n; } catch { /* ignore */ }
    return { height: Math.max(0.08, heightFrac), isLoss };
  });

  let netDelta = 0n;
  for (const e of ordered) {
    try { netDelta += BigInt(e.delta); } catch { /* ignore */ }
  }
  return { bars, netDelta };
}

function compactSignedChips(n: bigint): string {
  const abs = n < 0n ? -n : n;
  if (abs === 0n) return '0';
  if (abs < 1_000n) return `${n < 0n ? '−' : '+'}${abs.toString()}`;
  if (abs < 1_000_000n) {
    const k = Number(abs) / 1_000;
    return `${n < 0n ? '−' : '+'}${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  if (abs < 1_000_000_000n) {
    const m = Number(abs) / 1_000_000;
    return `${n < 0n ? '−' : '+'}${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  const b = Number(abs) / 1_000_000_000;
  return `${n < 0n ? '−' : '+'}${b % 1 === 0 ? b : b.toFixed(1)}B`;
}

export function PokerBalanceBar({
  address,
  morbiusBalanceWei,
  chipBalance,
  onDeposit,
  onWithdraw,
  onOpenExchange,
}: PokerBalanceBarProps) {
  const { data: ledger } = usePokerChipLedger({
    address,
    limit: HISTOGRAM_LIMIT,
    offset: 0,
    category: 'all',
  });

  const histogram = useMemo(() => buildHistogram(ledger?.entries ?? []), [ledger?.entries]);

  const morbiusDisplay = morbiusBalanceWei != null ? formatMorbiusFloor(morbiusBalanceWei) : '—';
  const chipsDisplay = chipBalance != null ? formatChips(chipBalance) : '—';

  const netDelta = histogram.netDelta;
  const isPositiveDelta = netDelta >= 0n;
  const deltaDisplay = histogram.bars.length > 0 ? compactSignedChips(netDelta) : null;

  return (
    <section
      className="relative rounded-2xl overflow-hidden border border-cyan-500/25"
      style={{ background: 'linear-gradient(135deg, #0c1929 0%, #050a14 100%)' }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)' }}
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 85% 50%, rgba(6,182,212,0.13), transparent 60%)' }}
        aria-hidden
      />

      <div className="relative grid gap-7 sm:gap-9 grid-cols-1 lg:grid-cols-[1fr_1.45fr] px-5 sm:px-8 py-6 sm:py-7">
        {/* ── Cell 1 · Play balance (MORBIUS) ── */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
            Play balance
          </div>
          <div
            className="mt-2 text-white leading-none truncate"
            style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em' }}
          >
            {morbiusDisplay}
            <span className="text-[12px] font-medium text-slate-500 ml-2 align-top inline-block pt-2 tracking-wider">MORBIUS</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-mono tracking-wider">
            On-chain · withdrawable anytime · 1 chip = 1 MORBIUS
          </div>

          <div className="flex-1" />

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onDeposit}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold text-white transition-transform hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                boxShadow: '0 6px 18px -6px rgba(6,182,212,0.5), 0 0 0 1px rgba(34,211,238,0.18)',
              }}
            >
              <ArrowDownCircle size={15} /> Deposit
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold text-slate-200 transition-colors border border-white/[0.15] hover:border-cyan-400/40 hover:text-white"
            >
              <ArrowUpCircle size={15} /> Withdraw
            </button>
          </div>
        </div>

        {/* ── Cell 2 · Poker chips (with bar histogram) ── */}
        <div className="flex flex-col relative">
          {/* Divider rendered as an absolute sibling so it follows column gap */}
          <div
            className="hidden lg:block absolute"
            style={{
              left: '-1.125rem',
              top: '12%',
              bottom: '12%',
              width: 1,
              background: 'linear-gradient(180deg, transparent, rgba(148,163,184,0.18), transparent)',
            }}
            aria-hidden
          />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
                Poker chips
              </div>
              <div
                className="mt-2 text-white leading-none truncate"
                style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em' }}
              >
                {chipsDisplay}
                <span className="text-[12px] font-medium text-slate-500 ml-2 align-top inline-block pt-2 tracking-wider">CHIPS</span>
              </div>
            </div>
            {deltaDisplay && (
              <div className="text-right shrink-0">
                <div
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-mono font-bold ${
                    isPositiveDelta ? 'text-emerald-300 bg-emerald-500/[0.1]' : 'text-rose-300 bg-rose-500/[0.1]'
                  }`}
                >
                  <span className="text-[9px]">{isPositiveDelta ? '▲' : '▼'}</span>
                  {deltaDisplay}
                </div>
                <div className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
                  Last {histogram.bars.length} events
                </div>
              </div>
            )}
          </div>

          {/* Bar histogram */}
          <div className="mt-5 h-9 flex items-end gap-[2px]">
            {histogram.bars.length === 0
              ? Array.from({ length: HISTOGRAM_LIMIT }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex-1 rounded-[1px] bg-slate-700/30"
                    style={{ height: '12%' }}
                    aria-hidden
                  />
                ))
              : histogram.bars.map((bar, i) => {
                  const isLast = i === histogram.bars.length - 1;
                  const isFaded = i < histogram.bars.length - 18 && histogram.bars.length > 18;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-[1px] transition-colors ${
                        bar.isLoss
                          ? 'bg-rose-400/70'
                          : isLast
                            ? 'bg-cyan-300'
                            : 'bg-cyan-400'
                      } ${isFaded ? 'opacity-40' : ''}`}
                      style={{
                        height: `${(bar.height * 100).toFixed(0)}%`,
                        boxShadow: isLast ? '0 0 8px rgba(103,232,249,0.5)' : undefined,
                      }}
                      aria-hidden
                    />
                  );
                })}
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] font-mono text-slate-500 tracking-wider">
            <span>{histogram.bars.length > 0 ? `${histogram.bars.length} events ago` : 'No chip activity yet'}</span>
            <span className="text-cyan-400 font-semibold">NOW</span>
          </div>

          <div className="flex-1" />

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onOpenExchange}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold text-white transition-transform hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                boxShadow: '0 6px 18px -6px rgba(6,182,212,0.5), 0 0 0 1px rgba(34,211,238,0.18)',
              }}
            >
              <ArrowRightLeft size={15} /> Open exchange
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
