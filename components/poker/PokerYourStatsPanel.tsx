'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Crown, Trophy, Medal, PencilLine, Plus } from 'lucide-react';
import { AvatarView } from '@/components/avatar';
import { useProfile } from '@/hooks/use-player-profile';
import { usePokerPlayerStats, usePokerPlayerHands, type PokerPlayerStats } from '@/hooks/use-poker-stats';
import { PokerStreakChart } from './PokerStreakChart';
import { PokerChipLedgerModal } from './PokerChipLedgerModal';
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

export function PokerYourStatsPanel({ address, onOpenAllStats }: PokerYourStatsPanelProps) {
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  const { data: stats } = usePokerPlayerStats(address, 'all');
  const { data: hands } = usePokerPlayerHands(address, 200);
  const { data: rankRow } = usePokerPlayerRank(address);
  const { profileDisplayName, avatarConfig } = useProfile();

  const archetype = useMemo(() => archetypeFor(stats ?? undefined), [stats]);

  const totalHands = stats?.total_hands ?? 0;

  const profitLossBn = useMemo(() => {
    try { return BigInt(stats?.profit_loss ?? '0'); } catch { return 0n; }
  }, [stats?.profit_loss]);

  const profitPerHandBn = useMemo(() => {
    if (totalHands === 0) return null;
    return profitLossBn / BigInt(totalHands);
  }, [profitLossBn, totalHands]);

  const tournamentHands = stats?.tournament_hands ?? 0;

  const biggestPotBn = useMemo(() => {
    try { return BigInt(stats?.biggest_pot_won ?? '0'); } catch { return 0n; }
  }, [stats?.biggest_pot_won]);

  const handsList = hands ?? [];

  if (!address) {
    // Don't render at all when wallet is disconnected — the lobby already shows a connect CTA up top.
    return null;
  }

  const shortAddress = `0x${address.slice(2, 6)}…${address.slice(-4)}`;
  const displayName = profileDisplayName?.trim() || shortAddress;

  const handleCustomizeAvatar = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sophie:open_avatar_editor'));
    }
  };

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
          {/* ── Title row · YOUR POKER FACE + big rank ── */}
          <div className="flex items-start justify-between mb-6 sm:mb-7 gap-4">
            <div className="flex items-center gap-2.5 pt-1 min-w-0">
              <div className="w-1 h-7 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500 shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="text-[10px] font-mono tracking-[0.35em] uppercase text-cyan-400 font-bold">YOUR POKER FACE</div>
                <div
                  className="font-medium text-white text-[15px] mt-0.5 truncate"
                  style={{ fontFamily: 'Mitr, sans-serif', letterSpacing: '-0.01em' }}
                >
                  {displayName}
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span>{archetype.emoji} {archetype.name}</span>
                  <span className="italic text-cyan-400 ml-1">{archetype.modifier}</span>
                </div>
              </div>
            </div>
            <RankHeader rank={rankRow?.rank} totalHands={totalHands} />
          </div>

          {/* ── Body · avatar + stats | chart ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-8 items-stretch">
            {/* LEFT · avatar + stat grid */}
            <div className="space-y-4">
              <div className="relative">
                <div
                  className="rounded-2xl p-3 relative overflow-hidden aspect-square"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 20%, rgba(34,211,238,0.20), transparent 55%), radial-gradient(circle at 70% 80%, rgba(168,85,247,0.16), transparent 55%), linear-gradient(160deg, #0b1a2e, #050a14)',
                    boxShadow: '0 0 24px -2px rgba(34,211,238,0.45), 0 0 0 1px rgba(34,211,238,0.35) inset',
                  }}
                >
                  {avatarConfig ? (
                    <AvatarView config={avatarConfig} className="w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" aria-hidden>
                      <span style={{ fontSize: 72 }}>{archetype.emoji}</span>
                    </div>
                  )}
                </div>

                {/* REP badge · placeholder for the upcoming PulseChain token rep feature */}
                <RepBadge />

                {/* Customize avatar button · overhangs the bottom-left */}
                <button
                  type="button"
                  onClick={handleCustomizeAvatar}
                  className="absolute left-[28%] -translate-x-1/2 -bottom-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider text-white whitespace-nowrap hover:scale-105 transition-transform"
                  style={{
                    background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                    boxShadow: '0 8px 22px -6px rgba(6,182,212,0.65), 0 0 0 1px rgba(34,211,238,0.25)',
                  }}
                >
                  <PencilLine size={12} strokeWidth={2.5} />
                  Customize
                </button>
              </div>

              {/* Stat grid · VPIP/PFR/Agg + Hands/Tourney/Biggest */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-3 pt-4">
                <StatCell label="VPIP" value={stats ? `${stats.vpip_pct.toFixed(0)}%` : '—'} accent />
                <StatCell label="PFR" value={stats ? `${stats.pfr_pct.toFixed(0)}%` : '—'} accent />
                <StatCell
                  label="Agg"
                  value={stats?.aggression_factor != null ? stats.aggression_factor.toFixed(1) : '—'}
                  accent
                />
                <StatCell label="Hands" value={totalHands.toLocaleString()} />
                <StatCell label="Tourney" value={tournamentHands.toLocaleString()} />
                <StatCell label="Biggest" value={biggestPotBn > 0n ? formatChips(biggestPotBn) : '—'} />
              </div>
            </div>

            {/* RIGHT · profit/loss chart */}
            <div className="min-w-0">
              <PokerStreakChart
                hands={handsList}
                lifetimeNetChips={profitLossBn}
                showdownWinRate={stats?.showdown_win_rate ?? null}
                profitPerHand={profitPerHandBn}
                bbPer100={stats?.bb_per_100 ?? null}
              />
            </div>
          </div>

          {/* ── Action buttons · all stats + all transactions ── */}
          <div className="mt-6 sm:mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenAllStats}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold text-white transition-transform hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                boxShadow: '0 6px 18px -6px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.18)',
              }}
            >
              View all stats <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setLedgerModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold border border-white/[0.15] text-slate-200 hover:border-cyan-400/40 hover:text-white transition-colors"
            >
              View all transactions <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <style jsx>{`
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

/** Big rank treatment — clean white number for #4+, medal styling for #1/#2/#3. */
function RankHeader({ rank, totalHands }: { rank: number | null | undefined; totalHands: number }) {
  if (totalHands === 0 || rank == null) {
    return (
      <div className="text-right shrink-0">
        <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-500 font-bold">Global rank</div>
        <div
          className="leading-[0.9] mt-1.5 text-slate-500 tabular-nums"
          style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 44, letterSpacing: '-0.04em' }}
        >
          —
        </div>
      </div>
    );
  }
  if (rank === 1) {
    return (
      <div className="text-right shrink-0 relative">
        <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-amber-300/80 font-bold flex items-center justify-end gap-1.5">
          <Crown size={11} strokeWidth={2.5} /> Champion
        </div>
        <div
          className="leading-[0.9] mt-1.5 text-amber-200 tabular-nums"
          style={{
            fontFamily: 'Mitr, sans-serif',
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: '-0.04em',
            textShadow: '0 0 18px rgba(251,191,36,0.55)',
          }}
        >
          #1
        </div>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="text-right shrink-0">
        <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-300/90 font-bold flex items-center justify-end gap-1.5">
          <Medal size={11} strokeWidth={2.5} /> Runner-up
        </div>
        <div
          className="leading-[0.9] mt-1.5 text-slate-100 tabular-nums"
          style={{
            fontFamily: 'Mitr, sans-serif',
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: '-0.04em',
            textShadow: '0 0 14px rgba(226,232,240,0.40)',
          }}
        >
          #2
        </div>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="text-right shrink-0">
        <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-orange-300/90 font-bold flex items-center justify-end gap-1.5">
          <Trophy size={11} strokeWidth={2.5} /> Third
        </div>
        <div
          className="leading-[0.9] mt-1.5 text-orange-200 tabular-nums"
          style={{
            fontFamily: 'Mitr, sans-serif',
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: '-0.04em',
            textShadow: '0 0 14px rgba(251,146,60,0.45)',
          }}
        >
          #3
        </div>
      </div>
    );
  }
  return (
    <div className="text-right shrink-0">
      <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-500 font-bold">Global rank</div>
      <div
        className="leading-[0.9] mt-1.5 text-white tabular-nums"
        style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 52, letterSpacing: '-0.04em' }}
      >
        #{rank}
      </div>
    </div>
  );
}

/**
 * REP badge — bottom-right of the avatar. Empty by default ("REP +"). Clicking
 * opens a PulseChain token search so the player can link a token logo as their
 * "rep". TODO: wire up the token-picker — for now the click is a no-op so the
 * affordance shows up in the UI.
 */
function RepBadge() {
  return (
    <button
      type="button"
      onClick={() => { /* TODO: open PulseChain token search modal */ }}
      className="absolute -bottom-3 -right-3 w-14 h-14 rounded-full flex flex-col items-center justify-center transition-transform hover:scale-110 group z-10"
      style={{
        background: 'radial-gradient(circle at 30% 30%, rgba(8,145,178,0.35), rgba(15,23,42,0.97))',
        border: '2px solid rgba(34,211,238,0.55)',
        boxShadow: '0 0 18px rgba(6,182,212,0.45), 0 0 0 3px #050a14',
      }}
      aria-label="Link a PulseChain token as your rep"
      title="Link a PulseChain token as your rep"
    >
      <span className="font-mono text-[8px] tracking-[0.25em] font-bold text-cyan-300 leading-none">REP</span>
      <Plus size={14} strokeWidth={3} className="text-cyan-300 mt-1 transition-transform group-hover:rotate-90" aria-hidden />
    </button>
  );
}

function StatCell({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.2em] text-slate-500 font-mono font-bold">
        {label}
      </div>
      <div
        className={`mt-0.5 tabular-nums leading-none ${accent ? 'text-cyan-300' : 'text-white'}`}
        style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
    </div>
  );
}
