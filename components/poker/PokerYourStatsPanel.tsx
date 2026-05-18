'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { usePokerPlayerStats, usePokerPlayerHands, type PokerPlayerStats } from '@/hooks/use-poker-stats';
import { usePokerChipLedger } from '@/hooks/use-poker-chip-ledger';
import { PokerStreakChart } from './PokerStreakChart';
import { PokerChipLedgerModal } from './PokerChipLedgerModal';
import { ledgerDisplay, formatRelativeTime, formatDelta } from '@/lib/poker-chip-ledger-display';
import { formatChips } from '@/lib/format-poker-chips';

export interface PokerYourStatsPanelProps {
  address: string | null;
  /** Open the existing PokerStatsModal — wired up by the lobby page. */
  onOpenAllStats: () => void;
}

interface Archetype {
  emoji: string;
  name: string;
  modifier: string; // "/ tight-aggressive" — italic cyan
}

function archetypeFor(stats: PokerPlayerStats | undefined): Archetype {
  if (!stats || stats.total_hands < 50) {
    return { emoji: '🌱', name: 'Rookie', modifier: '/ building profile' };
  }
  const vpip = stats.vpip_pct ?? 0;
  const agg = stats.aggression_factor ?? 0;
  if (vpip < 10) return { emoji: '🪨', name: 'Nit', modifier: '/ extra tight' };
  const loose = vpip > 28;
  const aggressive = agg >= 3.0;
  if (loose && aggressive) return { emoji: '🌪️', name: 'Maniac', modifier: '/ LAG' };
  if (loose && !aggressive) return { emoji: '🐟', name: 'Fish', modifier: '/ loose-passive' };
  if (!loose && aggressive) return { emoji: '🦈', name: 'Shark', modifier: '/ TAG' };
  return { emoji: '🪨', name: 'Rock', modifier: '/ tight-passive' };
}

type TopPlayersRow = { rank: number; net_chips?: string };
type TopPlayersResponse = { rows?: TopPlayersRow[]; requester?: TopPlayersRow | null };

function usePokerPlayerRank(address: string | null) {
  return useQuery<TopPlayersRow | null>({
    queryKey: ['pokerPlayerRank', address],
    queryFn: async () => {
      if (!address) return null;
      const qs = new URLSearchParams({ category: 'net_chips', limit: '10', address });
      const res = await fetch(`/api/poker/top-players?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch rank');
      const data: TopPlayersResponse = await res.json();
      if (data.requester) return data.requester;
      const inTop = data.rows?.find((r) => r.rank != null);
      return inTop ?? null;
    },
    enabled: !!address,
    refetchInterval: 60_000,
  });
}

function rankTier(rank: number | null | undefined): { label: string; color: string } {
  if (rank == null) return { label: 'Unranked', color: 'text-slate-500 border-slate-500/30' };
  if (rank === 1) return { label: 'Champion', color: 'text-amber-200 border-amber-300/40' };
  if (rank <= 3) return { label: `#${rank} · Top 3`, color: 'text-amber-300 border-amber-400/35' };
  if (rank <= 10) return { label: `#${rank} · Top 10`, color: 'text-amber-300 border-amber-400/30' };
  if (rank <= 50) return { label: `#${rank} · Gold`, color: 'text-amber-300 border-amber-400/30' };
  if (rank <= 200) return { label: `#${rank} · Silver`, color: 'text-slate-200 border-slate-300/35' };
  return { label: `#${rank}`, color: 'text-slate-300 border-slate-400/25' };
}

export function PokerYourStatsPanel({ address, onOpenAllStats }: PokerYourStatsPanelProps) {
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  const { data: stats } = usePokerPlayerStats(address, 'all');
  const { data: hands } = usePokerPlayerHands(address, 200);
  const { data: ledger } = usePokerChipLedger({ address, limit: 5, offset: 0, category: 'all' });
  const { data: rankRow } = usePokerPlayerRank(address);

  const archetype = useMemo(() => archetypeFor(stats ?? undefined), [stats]);

  const tier = rankTier(rankRow?.rank);
  const totalHands = stats?.total_hands ?? 0;

  const totalWonBn = useMemo(() => {
    try { return BigInt(stats?.total_won ?? '0'); } catch { return 0n; }
  }, [stats?.total_won]);

  const profitLossBn = useMemo(() => {
    try { return BigInt(stats?.profit_loss ?? '0'); } catch { return 0n; }
  }, [stats?.profit_loss]);

  const tournamentHands = stats?.tournament_hands ?? 0;

  const handsList = hands ?? [];

  const recent = ledger?.entries ?? [];
  const ledgerTotal = ledger?.total ?? 0;

  if (!address) {
    // Don't render at all when wallet is disconnected — the lobby already shows a connect CTA up top.
    return null;
  }

  return (
    <>
      <section
        className="relative rounded-2xl overflow-hidden border border-cyan-500/25"
        style={{ background: 'linear-gradient(135deg, #0c1929 0%, #050a14 100%)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)' }}
          aria-hidden
        />

        <div className="relative px-5 sm:px-8 py-6 sm:py-7">
          <div className="grid gap-7 sm:gap-8 lg:gap-9 grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr]">
            {/* ── COLUMN 1 · Profile ── */}
            <div className="flex flex-col">
              <div className="flex items-end gap-3 mb-1.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.1))',
                    border: '1px solid rgba(6,182,212,0.4)',
                  }}
                  aria-hidden
                >
                  {archetype.emoji}
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-500 tracking-wider mb-0.5">You're a</div>
                  <div
                    className="text-white leading-none"
                    style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}
                  >
                    {archetype.name}{' '}
                    <span className="italic text-cyan-400" style={{ fontSize: 18 }}>{archetype.modifier}</span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 font-mono mb-5 tracking-wider">
                VPIP <strong className="text-cyan-300">{stats ? `${stats.vpip_pct.toFixed(0)}%` : '—'}</strong>
                {' · '}PFR <strong className="text-cyan-300">{stats ? `${stats.pfr_pct.toFixed(0)}%` : '—'}</strong>
                {' · '}Agg <strong className="text-cyan-300">{stats?.aggression_factor != null ? stats.aggression_factor.toFixed(1) : '—'}</strong>
              </div>

              <div className="flex flex-col gap-2.5 flex-1">
                <StatRow label="Total hands" value={totalHands.toLocaleString()} />
                <StatRow
                  label="Total won"
                  value={`${profitLossBn >= 0n ? '+' : '−'}${formatChips(profitLossBn < 0n ? -profitLossBn : profitLossBn)}`}
                  tone={profitLossBn >= 0n ? 'win' : 'loss'}
                  unit="MORB"
                />
                <StatRow label="Tournament hands" value={tournamentHands.toLocaleString()} />
                <StatRow
                  label="Global rank"
                  rightSlot={
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${tier.color}`}
                      style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(245,158,11,0.04))', border: '1px solid' }}
                    >
                      ★ {tier.label}
                    </span>
                  }
                />
              </div>

              <button
                type="button"
                onClick={onOpenAllStats}
                className="mt-5 inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl text-[13px] font-bold text-white transition-transform hover:scale-[1.01]"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                  boxShadow: '0 6px 18px -6px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.18)',
                }}
              >
                View all stats <ArrowRight size={14} />
              </button>
            </div>

            {/* ── DIVIDER 1 (only on desktop) ── */}
            <div className="hidden lg:block absolute" style={{ left: '27.78%', top: '8%', bottom: '8%', width: 1, background: 'linear-gradient(180deg, transparent, rgba(148,163,184,0.15), transparent)' }} aria-hidden />

            {/* ── COLUMN 2 · Streak chart ── */}
            <div>
              <PokerStreakChart hands={handsList} lifetimeNetChips={profitLossBn} />
            </div>

            {/* ── DIVIDER 2 (only on desktop) ── */}
            <div className="hidden lg:block absolute" style={{ left: '66.67%', top: '8%', bottom: '8%', width: 1, background: 'linear-gradient(180deg, transparent, rgba(148,163,184,0.15), transparent)' }} aria-hidden />

            {/* ── COLUMN 3 · Chip ledger ── */}
            <div className="flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
                    Recent activity
                  </div>
                  <div className="mt-1.5 font-medium text-white text-[15px]" style={{ fontFamily: 'Mitr, sans-serif', letterSpacing: '-0.01em' }}>
                    Chip ledger
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-slate-500 tracking-wider">
                    Last 5 of {ledgerTotal.toLocaleString()} {ledgerTotal === 1 ? 'event' : 'events'}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase text-emerald-300"
                  style={{
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    style={{ boxShadow: '0 0 6px rgba(16,185,129,0.6)', animation: 'morblotto-live-pulse 1.8s ease-in-out infinite' }}
                  />
                  Live
                </span>
              </div>

              <div className="flex-1">
                {recent.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-mono tracking-wider">
                    No chip activity yet.
                  </div>
                ) : (
                  recent.map((entry, idx) => {
                    const d = ledgerDisplay(entry);
                    const { display: deltaText, isCredit } = formatDelta(entry.delta);
                    let balanceAfterDisplay = '—';
                    try { balanceAfterDisplay = formatChips(BigInt(entry.balanceAfter)); } catch { /* ignore */ }
                    return (
                      <div
                        key={entry.id ?? idx}
                        className={`grid grid-cols-[28px_1fr_auto] gap-2.5 py-2.5 items-center ${
                          idx === 0 ? 'pt-0' : ''
                        } ${idx === recent.length - 1 ? '' : 'border-b border-white/[0.06]'}`}
                      >
                        <span
                          className={`inline-flex w-7 h-7 rounded-lg items-center justify-center text-[13px] ${
                            d.tone === 'win' ? 'bg-cyan-500/[0.12] border border-cyan-500/25'
                              : d.tone === 'loss' ? 'bg-rose-500/[0.10] border border-rose-500/20'
                              : d.tone === 'exchange' ? 'bg-violet-500/[0.12] border border-violet-500/25'
                              : d.tone === 'tourney' ? 'bg-amber-500/[0.12] border border-amber-500/25'
                              : 'bg-slate-500/[0.10] border border-slate-500/15'
                          }`}
                          aria-hidden
                        >
                          {d.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[12px] text-white font-medium leading-tight truncate">
                            {d.label}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {d.meta} · {formatRelativeTime(entry.createdAt)}
                          </div>
                        </div>
                        <div className="text-right min-w-[60px]">
                          <div
                            className={`leading-none tabular-nums ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}
                            style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 14 }}
                          >
                            {deltaText}
                          </div>
                          <div className="mt-1 text-[9px] font-mono text-slate-500 tracking-wider">
                            → {balanceAfterDisplay}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-white/[0.1]">
                <button
                  type="button"
                  onClick={() => setLedgerModalOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.15] text-[12px] font-bold text-slate-200 hover:border-cyan-400/40 hover:text-white transition-colors"
                >
                  <span>View all transactions</span>
                  <span className="text-slate-500 font-mono text-[11px]">{ledgerTotal.toLocaleString()}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes morblotto-live-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
      </section>

      <PokerChipLedgerModal
        isOpen={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        address={address}
      />
    </>
  );
}

function StatRow({
  label,
  value,
  rightSlot,
  tone = 'neutral',
  unit,
}: {
  label: string;
  value?: string;
  rightSlot?: React.ReactNode;
  tone?: 'win' | 'loss' | 'neutral';
  unit?: string;
}) {
  const toneClass =
    tone === 'win' ? 'text-emerald-300'
      : tone === 'loss' ? 'text-rose-300'
        : 'text-white';
  return (
    <div className="flex justify-between items-baseline gap-3 pb-2 border-b border-white/[0.06] last:border-b-0">
      <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold whitespace-nowrap">
        {label}
      </span>
      {rightSlot ?? (
        <span
          className={`${toneClass} text-right leading-none tabular-nums`}
          style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 20, letterSpacing: '-0.01em' }}
        >
          {value ?? '—'}
          {unit && <span className="text-[10px] text-slate-500 font-medium ml-1">{unit}</span>}
        </span>
      )}
    </div>
  );
}
