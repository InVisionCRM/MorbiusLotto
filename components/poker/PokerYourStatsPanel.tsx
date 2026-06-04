'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, ArrowDownCircle, ArrowUpCircle, Crown, Trophy, Medal, PencilLine, Plus, Coins, BarChart3, LayoutDashboard } from 'lucide-react';
import { AvatarView } from '@/components/avatar';
import { useProfile } from '@/hooks/use-player-profile';
import { usePokerPlayerStats, type PokerPlayerStats } from '@/hooks/use-poker-stats';
import { useTokenBalance } from '@/hooks/use-token';
import { PokerChipLedgerModal } from './PokerChipLedgerModal';
import { PokerRepTokenModal } from './PokerRepTokenModal';
import { useRepToken, type PokerRepToken } from '@/hooks/use-poker-rep-token';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';
const PANEL_BG = 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)';
const PRIMARY_BTN_STYLE = {
  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
  boxShadow: '0 4px 16px rgba(6, 182, 212, 0.2), 0 0 0 1px rgba(34, 211, 238, 0.18)',
} as const;
/** Balance figures — clean tabular sans at a sane size. No more giant Mitr clamps. */
const BALANCE_NUMBER_CLASS = 'text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight leading-none';
const TOP_ACTION_BTN_CLASS =
  'inline-flex items-center justify-center gap-2 w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-white/[0.08] bg-slate-900/50 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors';

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
    () => (morbiusBalanceWei != null ? formatMorbiusFloor(morbiusBalanceWei) : '0'),
    [morbiusBalanceWei],
  );
  const walletMorbiusDisplay = useMemo(
    () => formatMorbiusFloor(walletMorbiusWei),
    [walletMorbiusWei],
  );
  const chipsDisplay = useMemo(
    () => (chipBalance != null ? formatChips(chipBalance) : '0'),
    [chipBalance],
  );

  const archetype = useMemo(() => archetypeFor(stats ?? undefined), [stats]);

  const totalHands = stats?.total_hands ?? 0;

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
        className="relative rounded-2xl overflow-hidden border border-cyan-500/20 shadow-lg shadow-cyan-500/5"
        style={{ background: PANEL_BG }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden />

        <div className="relative p-4 sm:p-5">
          {/* ── Header row · avatar + identity | quick actions ── */}
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl p-1 border border-cyan-500/25 bg-[#050a12]">
                {avatarConfig ? (
                  <AvatarView config={avatarConfig} className="w-full h-full rounded-lg overflow-hidden" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg" aria-hidden>
                    <span style={{ fontSize: 34 }}>{archetype.emoji}</span>
                  </div>
                )}
              </div>
              <RepBadge token={repToken} onClick={() => setRepModalOpen(true)} />
            </div>

            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-bold text-white truncate">{displayName}</div>
              <div className="text-xs sm:text-sm text-slate-300 truncate">
                {archetype.emoji} {archetype.name}
                <span className="italic text-cyan-300/90 ml-1">{archetype.modifier}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <RankInline rank={rankRow?.rank} totalHands={totalHands} />
                <button
                  type="button"
                  onClick={handleCustomizeAvatar}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90 border border-cyan-500/25 bg-cyan-500/[0.07] hover:bg-cyan-500/15 transition-colors"
                >
                  <PencilLine size={11} strokeWidth={2.5} />
                  Customize
                </button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="hidden sm:flex flex-col gap-2 shrink-0">
              <button type="button" onClick={onOpenAllStats} className={TOP_ACTION_BTN_CLASS}>
                <BarChart3 size={15} aria-hidden />
                My Stats
              </button>
              <Link href="/creators" className={TOP_ACTION_BTN_CLASS}>
                <LayoutDashboard size={15} aria-hidden />
                Creator
              </Link>
            </div>
          </div>

          {/* ── Balances ── */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] px-3.5 py-3 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center gap-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 uppercase tracking-[0.12em] font-bold">
                <Coins size={13} className="text-cyan-300" />
                Poker chips
              </div>
              <div className={`text-emerald-300 ${BALANCE_NUMBER_CLASS}`} title={chipsDisplay}>
                {chipsDisplay}
              </div>
            </div>

            <WalletBalanceCard
              label="Deposited"
              value={morbiusPlayDisplay}
              unit="play"
              actionLabel="Deposit"
              actionIcon={ArrowDownCircle}
              onAction={onDeposit}
            />
            <WalletBalanceCard
              label="In-wallet"
              value={walletMorbiusDisplay}
              unit="MORBIUS"
              actionLabel="Withdraw"
              actionIcon={ArrowUpCircle}
              onAction={onWithdraw}
            />
          </div>

          {/* ── Footer actions ── */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={onOpenExchange}
              className="col-span-2 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-95"
              style={PRIMARY_BTN_STYLE}
            >
              <Coins size={16} aria-hidden />
              Exchange chips
            </button>
            <button
              type="button"
              onClick={() => setLedgerModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold border border-white/[0.08] bg-slate-900/50 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              Transactions <ArrowRight size={15} strokeWidth={2.5} />
            </button>
            {/* My Stats — phone only (the desktop column above hides on mobile). */}
            <button
              type="button"
              onClick={onOpenAllStats}
              className="sm:hidden inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-slate-900/50 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <BarChart3 size={15} aria-hidden />
              My Stats
            </button>
            <Link
              href="/creators"
              className="hidden sm:inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border border-white/[0.08] bg-slate-900/50 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <LayoutDashboard size={15} aria-hidden />
              Creator
            </Link>
          </div>
        </div>
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

/** Compact global-rank pill shown inline under the player's name. */
function RankInline({ rank, totalHands }: { rank: number | null | undefined; totalHands: number }) {
  const base =
    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold tabular-nums border';

  if (totalHands === 0 || rank == null) {
    return (
      <span className={`${base} border-white/10 bg-white/[0.03] text-slate-400`}>
        <span className="uppercase tracking-wide text-[9px] text-slate-500">Rank</span> —
      </span>
    );
  }
  if (rank === 1) {
    return (
      <span className={`${base} border-amber-400/30 bg-amber-400/10 text-amber-200`}>
        <Crown size={12} strokeWidth={2.5} /> #1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className={`${base} border-slate-300/25 bg-slate-300/10 text-slate-100`}>
        <Medal size={12} strokeWidth={2.5} /> #2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className={`${base} border-orange-400/30 bg-orange-400/10 text-orange-200`}>
        <Trophy size={12} strokeWidth={2.5} /> #3
      </span>
    );
  }
  return (
    <span className={`${base} border-cyan-500/25 bg-cyan-500/[0.07] text-white`}>
      <span className="uppercase tracking-wide text-[9px] text-slate-400">Rank</span> #{rank}
    </span>
  );
}

function MorbiusBadge({ size = 16 }: { size?: number }) {
  return <img src={MORBIUS_LOGO} alt="" className="inline-block object-contain opacity-90" style={{ width: size, height: size }} />;
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
        className="absolute -bottom-3 -right-3 w-12 h-12 rounded-full flex items-center justify-center overflow-hidden transition-transform hover:scale-105 z-10 bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-400/50"
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
          <span className="font-bold text-cyan-200 leading-none text-lg">
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
      className="absolute -bottom-3 -right-3 w-12 h-12 rounded-full flex flex-col items-center justify-center transition-transform hover:scale-105 group z-10 bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-400/50"
      aria-label="Link a PulseChain token as your rep"
      title="Link a PulseChain token as your rep"
    >
      <span className="font-mono text-[8px] tracking-[0.2em] font-bold text-cyan-300 leading-none">REP</span>
      <Plus size={12} strokeWidth={3} className="text-cyan-300 mt-0.5 transition-transform group-hover:rotate-90" aria-hidden />
    </button>
  );
}

function WalletBalanceCard({
  label,
  value,
  unit,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: {
  label: string;
  value: string;
  unit: string;
  actionLabel: string;
  actionIcon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  onAction: () => void;
}) {
  return (
    <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1 px-3.5 py-3 min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 uppercase tracking-[0.12em] font-bold">
          {label}
        </div>
        <div
          className={`inline-flex items-center gap-1.5 text-white min-w-0 ${BALANCE_NUMBER_CLASS}`}
          title={`${value} ${unit}`}
        >
          <MorbiusBadge size={16} />
          <span className="truncate">{value}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-none text-xs sm:text-sm font-semibold text-white transition-all hover:opacity-95"
        style={PRIMARY_BTN_STYLE}
      >
        <ActionIcon size={15} strokeWidth={2.5} />
        {actionLabel}
      </button>
    </div>
  );
}
