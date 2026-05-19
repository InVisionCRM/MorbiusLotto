'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Crown, Trophy, Medal, Sparkles, type LucideIcon } from 'lucide-react';
import { usePokerPlayerStats, usePokerPlayerHands, type PokerPlayerStats } from '@/hooks/use-poker-stats';
import { usePokerChipLedger } from '@/hooks/use-poker-chip-ledger';
import { PokerStreakChart } from './PokerStreakChart';
import { PokerChipLedgerModal } from './PokerChipLedgerModal';
import { LedgerDirectionIcon } from './LedgerDirectionIcon';
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

type TierKey = 'champion' | 'top3' | 'top10' | 'gold' | 'silver' | 'bronze' | 'unranked';

interface TierConfig {
  tier: TierKey;
  label: string;
  rankText: string;
  icon: LucideIcon;
  iconColor: string;
  iconBgCss: string;
  iconBorderCss: string;
  textColor: string;
  borderColorCss: string;
  bgFromCss: string;
  bgToCss: string;
  glowColorCss: string;
  barGradientCss: string;
  barGlowCss: string;
  progress: number | null;
  progressText: string | null;
  nextLabel: string | null;
  sublabel: string | null;
}

function pluralRanks(n: number) {
  return `${n} rank${n === 1 ? '' : 's'}`;
}

function tierFor(rank: number | null | undefined, totalHands: number): TierConfig {
  if (totalHands === 0 || rank == null) {
    return {
      tier: 'unranked',
      label: 'Unranked',
      rankText: '—',
      icon: Sparkles,
      iconColor: 'text-slate-400',
      iconBgCss: 'linear-gradient(135deg, rgba(148,163,184,0.14), rgba(100,116,139,0.06))',
      iconBorderCss: 'rgba(148,163,184,0.28)',
      textColor: 'text-slate-300',
      borderColorCss: 'rgba(148,163,184,0.18)',
      bgFromCss: 'rgba(30,41,59,0.45)',
      bgToCss: 'rgba(15,23,42,0.25)',
      glowColorCss: 'rgba(148,163,184,0.10)',
      barGradientCss: '',
      barGlowCss: '',
      progress: null,
      progressText: null,
      nextLabel: null,
      sublabel: totalHands === 0
        ? 'Play your first hand to enter the leaderboard'
        : 'Climb the leaderboard to earn a tier',
    };
  }
  if (rank === 1) {
    return {
      tier: 'champion',
      label: 'Champion',
      rankText: '#1',
      icon: Crown,
      iconColor: 'text-amber-200',
      iconBgCss: 'linear-gradient(135deg, rgba(251,191,36,0.28), rgba(245,158,11,0.10))',
      iconBorderCss: 'rgba(251,191,36,0.55)',
      textColor: 'text-amber-200',
      borderColorCss: 'rgba(251,191,36,0.40)',
      bgFromCss: 'rgba(120,53,15,0.40)',
      bgToCss: 'rgba(15,23,42,0.20)',
      glowColorCss: 'rgba(251,191,36,0.28)',
      barGradientCss: '',
      barGlowCss: '',
      progress: null,
      progressText: null,
      nextLabel: null,
      sublabel: 'Untouchable — best of all time',
    };
  }
  if (rank <= 3) {
    return {
      tier: 'top3',
      label: 'Top 3',
      rankText: `#${rank}`,
      icon: Trophy,
      iconColor: 'text-amber-300',
      iconBgCss: 'linear-gradient(135deg, rgba(251,191,36,0.20), rgba(245,158,11,0.08))',
      iconBorderCss: 'rgba(251,191,36,0.45)',
      textColor: 'text-amber-300',
      borderColorCss: 'rgba(251,191,36,0.32)',
      bgFromCss: 'rgba(120,53,15,0.25)',
      bgToCss: 'rgba(15,23,42,0.25)',
      glowColorCss: 'rgba(251,191,36,0.20)',
      barGradientCss: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
      barGlowCss: '0 0 8px rgba(251,191,36,0.45)',
      progress: (3 - rank) / 2,
      progressText: `${pluralRanks(rank - 1)} from #1`,
      nextLabel: 'Champion',
      sublabel: null,
    };
  }
  if (rank <= 10) {
    return {
      tier: 'top10',
      label: 'Top 10',
      rankText: `#${rank}`,
      icon: Trophy,
      iconColor: 'text-amber-300',
      iconBgCss: 'linear-gradient(135deg, rgba(251,191,36,0.16), rgba(245,158,11,0.06))',
      iconBorderCss: 'rgba(251,191,36,0.38)',
      textColor: 'text-amber-300',
      borderColorCss: 'rgba(251,191,36,0.26)',
      bgFromCss: 'rgba(120,53,15,0.18)',
      bgToCss: 'rgba(15,23,42,0.30)',
      glowColorCss: 'rgba(251,191,36,0.16)',
      barGradientCss: 'linear-gradient(90deg, #fcd34d, #fbbf24)',
      barGlowCss: '0 0 6px rgba(251,191,36,0.35)',
      progress: (10 - rank) / 7,
      progressText: `${pluralRanks(rank - 3)} from Top 3`,
      nextLabel: 'Top 3',
      sublabel: null,
    };
  }
  if (rank <= 50) {
    return {
      tier: 'gold',
      label: 'Gold',
      rankText: `#${rank}`,
      icon: Medal,
      iconColor: 'text-amber-300',
      iconBgCss: 'linear-gradient(135deg, rgba(251,191,36,0.14), rgba(245,158,11,0.05))',
      iconBorderCss: 'rgba(251,191,36,0.32)',
      textColor: 'text-amber-300',
      borderColorCss: 'rgba(251,191,36,0.22)',
      bgFromCss: 'rgba(120,53,15,0.14)',
      bgToCss: 'rgba(15,23,42,0.30)',
      glowColorCss: 'rgba(251,191,36,0.13)',
      barGradientCss: 'linear-gradient(90deg, #fde68a, #fcd34d)',
      barGlowCss: '0 0 5px rgba(252,211,77,0.30)',
      progress: (50 - rank) / 40,
      progressText: `${pluralRanks(rank - 10)} from Top 10`,
      nextLabel: 'Top 10',
      sublabel: null,
    };
  }
  if (rank <= 200) {
    return {
      tier: 'silver',
      label: 'Silver',
      rankText: `#${rank}`,
      icon: Medal,
      iconColor: 'text-slate-200',
      iconBgCss: 'linear-gradient(135deg, rgba(226,232,240,0.14), rgba(148,163,184,0.05))',
      iconBorderCss: 'rgba(226,232,240,0.32)',
      textColor: 'text-slate-200',
      borderColorCss: 'rgba(203,213,225,0.22)',
      bgFromCss: 'rgba(51,65,85,0.35)',
      bgToCss: 'rgba(15,23,42,0.30)',
      glowColorCss: 'rgba(203,213,225,0.12)',
      barGradientCss: 'linear-gradient(90deg, #f1f5f9, #cbd5e1)',
      barGlowCss: '0 0 5px rgba(226,232,240,0.22)',
      progress: (200 - rank) / 150,
      progressText: `${pluralRanks(rank - 50)} from Gold`,
      nextLabel: 'Gold',
      sublabel: null,
    };
  }
  // Bronze (#201+) — unbounded, so use a soft curve toward Silver.
  const ranksToSilver = rank - 200;
  const softProgress = Math.max(0.04, Math.min(0.40, 50 / ranksToSilver));
  return {
    tier: 'bronze',
    label: 'Bronze',
    rankText: `#${rank}`,
    icon: Medal,
    iconColor: 'text-orange-300',
    iconBgCss: 'linear-gradient(135deg, rgba(251,146,60,0.12), rgba(234,88,12,0.04))',
    iconBorderCss: 'rgba(251,146,60,0.32)',
    textColor: 'text-orange-300',
    borderColorCss: 'rgba(251,146,60,0.22)',
    bgFromCss: 'rgba(120,53,15,0.12)',
    bgToCss: 'rgba(15,23,42,0.30)',
    glowColorCss: 'rgba(251,146,60,0.12)',
    barGradientCss: 'linear-gradient(90deg, #fdba74, #fb923c)',
    barGlowCss: '0 0 4px rgba(251,146,60,0.28)',
    progress: softProgress,
    progressText: `${pluralRanks(ranksToSilver)} from Silver`,
    nextLabel: 'Silver',
    sublabel: null,
  };
}

export function PokerYourStatsPanel({ address, onOpenAllStats }: PokerYourStatsPanelProps) {
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  const { data: stats } = usePokerPlayerStats(address, 'all');
  const { data: hands } = usePokerPlayerHands(address, 200);
  const { data: ledger } = usePokerChipLedger({ address, limit: 5, offset: 0, category: 'all' });
  const { data: rankRow } = usePokerPlayerRank(address);

  const archetype = useMemo(() => archetypeFor(stats ?? undefined), [stats]);

  const totalHands = stats?.total_hands ?? 0;
  const tier = useMemo(() => tierFor(rankRow?.rank, totalHands), [rankRow?.rank, totalHands]);

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

              <div className="flex flex-col gap-2.5">
                <StatRow label="Total hands" value={totalHands.toLocaleString()} />
                <StatRow
                  label="Total won"
                  value={`${profitLossBn >= 0n ? '+' : '−'}${formatChips(profitLossBn < 0n ? -profitLossBn : profitLossBn)}`}
                  tone={profitLossBn >= 0n ? 'win' : 'loss'}
                  unit="MORB"
                />
                <StatRow label="Tournament hands" value={tournamentHands.toLocaleString()} />
              </div>

              <div className="mt-4 flex-1">
                <GlobalRankCard tier={tier} />
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
                        className={`grid grid-cols-[44px_1fr_auto] gap-3 py-3 items-center ${
                          idx === 0 ? 'pt-0' : ''
                        } ${idx === recent.length - 1 ? '' : 'border-b border-white/[0.05]'}`}
                      >
                        <LedgerDirectionIcon direction={d.direction} size="md" />
                        <div className="min-w-0">
                          <div className="text-[13px] text-white font-medium leading-tight truncate">
                            {d.label}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            <span className="text-slate-400">{d.meta}</span>
                            <span className="mx-1.5 text-slate-700">·</span>
                            <span>{formatRelativeTime(entry.createdAt)}</span>
                          </div>
                        </div>
                        <div className="text-right min-w-[64px]">
                          <div
                            className={`leading-none tabular-nums ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}
                            style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}
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
          @keyframes morblotto-rank-sparkle {
            0%, 100% { opacity: 0.25; transform: scale(0.85) rotate(0deg); }
            50% { opacity: 1; transform: scale(1.15) rotate(20deg); }
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

function GlobalRankCard({ tier }: { tier: TierConfig }) {
  const Icon = tier.icon;
  const isChampion = tier.tier === 'champion';
  const isUnranked = tier.tier === 'unranked';
  const showProgress = tier.progress != null && tier.progressText && tier.nextLabel;

  return (
    <div
      className="relative rounded-xl border overflow-hidden p-4"
      style={{
        borderColor: tier.borderColorCss,
        background: `linear-gradient(135deg, ${tier.bgFromCss} 0%, ${tier.bgToCss} 100%)`,
      }}
    >
      <div
        className="absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl pointer-events-none"
        style={{ background: tier.glowColorCss }}
        aria-hidden
      />
      {isChampion && (
        <>
          <Sparkles
            size={11}
            className="absolute top-2 right-2 text-amber-300/70 pointer-events-none"
            style={{ animation: 'morblotto-rank-sparkle 2.4s ease-in-out infinite' }}
            aria-hidden
          />
          <Sparkles
            size={9}
            className="absolute top-5 right-7 text-amber-200/50 pointer-events-none"
            style={{ animation: 'morblotto-rank-sparkle 2.4s ease-in-out infinite 0.6s' }}
            aria-hidden
          />
        </>
      )}

      <div className="relative flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: tier.iconBgCss, border: `1px solid ${tier.iconBorderCss}` }}
          aria-hidden
        >
          <Icon size={20} className={tier.iconColor} strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-[0.28em] font-bold text-slate-400 mb-1">
            Global rank
          </div>
          <div className="flex items-baseline gap-2 leading-none">
            <span
              className="text-white"
              style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em' }}
            >
              {tier.rankText}
            </span>
            <span
              className={`text-[10px] font-bold tracking-[0.18em] uppercase ${tier.textColor}`}
            >
              {tier.label}
            </span>
          </div>
        </div>
      </div>

      {showProgress && (
        <div className="relative">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-mono text-slate-400 tracking-wide">
              {tier.progressText}
            </span>
            <span className="text-[10px] font-mono text-slate-300 tracking-wide">
              → {tier.nextLabel}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(3, (tier.progress ?? 0) * 100)}%`,
                background: tier.barGradientCss,
                boxShadow: tier.barGlowCss,
              }}
            />
          </div>
        </div>
      )}
      {(isChampion || isUnranked) && tier.sublabel && (
        <div
          className={`relative text-[10px] font-mono tracking-wide flex items-center gap-1.5 ${
            isChampion ? 'text-amber-300/90' : 'text-slate-400'
          }`}
        >
          {isChampion && <Crown size={11} className="shrink-0" aria-hidden />}
          <span>{tier.sublabel}</span>
        </div>
      )}
    </div>
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
