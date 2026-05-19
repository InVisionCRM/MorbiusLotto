'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, Crown, Trophy, Medal, PencilLine, Plus } from 'lucide-react';
import { AvatarView } from '@/components/avatar';
import { useProfile } from '@/hooks/use-player-profile';
import { usePokerPlayerStats, usePokerPlayerHands, type PokerPlayerStats } from '@/hooks/use-poker-stats';
import { useTokenBalance } from '@/hooks/use-token';
import { PokerStreakChart } from './PokerStreakChart';
import { PokerChipLedgerModal } from './PokerChipLedgerModal';
import { PokerRepTokenModal } from './PokerRepTokenModal';
import { useRepToken, type PokerRepToken } from '@/hooks/use-poker-rep-token';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

export interface PokerYourStatsPanelProps {
  address: string | null;
  /** Open the existing PokerStatsModal — wired up by the lobby page. */
  onOpenAllStats: () => void;
  /** In-game (server-held) MORBIUS play balance, wei string. */
  morbiusBalanceWei: string | null;
  /** Poker chip balance, chip-count string. */
  chipBalance: string | null;
  /** Open the wallet modal on the deposit tab. */
  onDeposit: () => void;
  /** Open the wallet modal on the withdraw tab. */
  onWithdraw: () => void;
  /** Open the MORBIUS ↔ chips exchange modal. */
  onOpenExchange: () => void;
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

export function PokerYourStatsPanel({
  address,
  onOpenAllStats,
  morbiusBalanceWei,
  chipBalance,
  onDeposit,
  onWithdraw,
  onOpenExchange,
}: PokerYourStatsPanelProps) {
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [repModalOpen, setRepModalOpen] = useState(false);

  const { data: stats } = usePokerPlayerStats(address, 'all');
  // Pull the player's full lifetime hand history so the chart plots the
  // entire P/L journey, not just a recent tail. Server caps at 25k, which
  // safely covers the high-volume players the project has today.
  const { data: hands } = usePokerPlayerHands(address, 25_000);
  const { data: rankRow } = usePokerPlayerRank(address);
  const { profileDisplayName, avatarConfig } = useProfile();
  const { token: repToken, setToken: setRepToken } = useRepToken(address);

  // On-chain MORBIUS balance from the connected wallet. Separate from the
  // server-held "play balance" (morbiusBalanceWei prop) which represents what
  // has already been deposited into the platform.
  const { balance: walletMorbiusWei } = useTokenBalance(
    (address ?? undefined) as `0x${string}` | undefined,
  );

  const morbiusPlayDisplay = useMemo(
    () => (morbiusBalanceWei != null ? formatMorbiusFloor(morbiusBalanceWei) : '—'),
    [morbiusBalanceWei],
  );
  const walletMorbiusDisplay = useMemo(
    () => formatMorbiusFloor(walletMorbiusWei),
    [walletMorbiusWei],
  );
  const chipsDisplay = useMemo(
    () => (chipBalance != null ? formatChips(chipBalance) : '—'),
    [chipBalance],
  );

  const archetype = useMemo(() => archetypeFor(stats ?? undefined), [stats]);

  const totalHands = stats?.total_hands ?? 0;

  const profitLossBn = useMemo(() => {
    try { return BigInt(stats?.profit_loss ?? '0'); } catch { return 0n; }
  }, [stats?.profit_loss]);

  const profitPerHandBn = useMemo(() => {
    if (totalHands === 0) return null;
    return profitLossBn / BigInt(totalHands);
  }, [profitLossBn, totalHands]);

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

                {/* REP badge · linked PulseChain token (or empty placeholder) */}
                <RepBadge token={repToken} onClick={() => setRepModalOpen(true)} />

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

              {/* Balances · MORBIUS play · in-wallet MORBIUS · poker chips */}
              <div className="grid grid-cols-3 gap-2 pt-4">
                <BalanceCell label="MORBIUS" value={morbiusPlayDisplay} unit="play" accent="cyan" />
                <BalanceCell label="In-wallet" value={walletMorbiusDisplay} unit="MORBIUS" />
                <BalanceCell label="Poker chips" value={chipsDisplay} unit="chips" accent="emerald" />
              </div>

              {/* Wallet actions */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={onDeposit}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                    boxShadow: '0 6px 16px -6px rgba(6,182,212,0.5), 0 0 0 1px rgba(34,211,238,0.18)',
                  }}
                >
                  <ArrowDownCircle size={13} strokeWidth={2.5} />
                  Deposit
                </button>
                <button
                  type="button"
                  onClick={onWithdraw}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-slate-200 border border-white/[0.15] hover:border-cyan-400/40 hover:text-white transition-colors"
                >
                  <ArrowUpCircle size={13} strokeWidth={2.5} />
                  Withdraw
                </button>
              </div>

              {/* Exchange — secondary, full-width */}
              <button
                type="button"
                onClick={onOpenExchange}
                className="mt-2 inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg text-[11px] font-semibold text-cyan-300 border border-cyan-500/25 hover:border-cyan-400/55 hover:text-cyan-200 hover:bg-cyan-500/[0.06] transition-colors"
              >
                <ArrowRightLeft size={12} strokeWidth={2.5} />
                Open chip exchange
              </button>
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

      <PokerRepTokenModal
        isOpen={repModalOpen}
        onClose={() => setRepModalOpen(false)}
        currentToken={repToken}
        onSelect={(t) => setRepToken(t)}
        onClear={() => setRepToken(null)}
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
 * REP badge — bottom-right of the avatar. Empty state shows "REP +" inviting
 * the user to link a PulseChain token; once a token is set, the badge shows
 * the token's logo (or its symbol initial as a fallback). Click opens the
 * token-picker modal so the player can change or remove their rep token.
 */
function RepBadge({
  token,
  onClick,
}: {
  token: PokerRepToken | null;
  onClick: () => void;
}) {
  if (token) {
    const symbolInitial = (token.symbol || '?').trim().charAt(0).toUpperCase();
    return (
      <button
        type="button"
        onClick={onClick}
        className="absolute -bottom-3 -right-3 w-14 h-14 rounded-full flex items-center justify-center overflow-hidden transition-transform hover:scale-110 z-10"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(8,145,178,0.18), rgba(15,23,42,0.97))',
          border: '2px solid rgba(34,211,238,0.55)',
          boxShadow: '0 0 18px rgba(6,182,212,0.45), 0 0 0 3px #050a14',
        }}
        aria-label={`Rep token: ${token.symbol}. Click to change.`}
        title={`${token.symbol} · ${token.name}`}
      >
        {token.logoUrl ? (
          <img
            src={token.logoUrl}
            alt=""
            className="w-full h-full object-cover rounded-full"
            draggable={false}
            onError={(e) => {
              // If the logo URL 404s, hide the broken-image icon and let the
              // symbol initial show through as a fallback.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        {!token.logoUrl && (
          <span
            className="font-bold text-cyan-200 leading-none"
            style={{ fontFamily: 'Mitr, sans-serif', fontSize: 20, letterSpacing: '-0.04em' }}
          >
            {symbolInitial}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
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

function BalanceCell({
  label,
  value,
  unit,
  accent = 'neutral',
}: {
  label: string;
  value: string;
  unit: string;
  accent?: 'cyan' | 'emerald' | 'neutral';
}) {
  const valueClass =
    accent === 'cyan' ? 'text-cyan-200'
      : accent === 'emerald' ? 'text-emerald-200'
        : 'text-white';
  const borderClass =
    accent === 'cyan' ? 'border-cyan-500/25'
      : accent === 'emerald' ? 'border-emerald-500/25'
        : 'border-white/[0.08]';
  return (
    <div
      className={`rounded-lg px-2.5 py-2 border ${borderClass}`}
      style={{ background: 'rgba(0,0,0,0.25)' }}
    >
      <div className="text-[8px] uppercase tracking-[0.2em] text-slate-500 font-mono font-bold truncate">
        {label}
      </div>
      <div
        className={`mt-1 tabular-nums leading-none truncate ${valueClass}`}
        style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}
        title={value}
      >
        {value}
      </div>
      <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-500 font-mono truncate">
        {unit}
      </div>
    </div>
  );
}
