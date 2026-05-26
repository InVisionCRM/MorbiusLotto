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
  boxShadow: '0 8px 32px rgba(6, 182, 212, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.2)',
} as const;
/** Matches the giant step counter in PokerOnboardingChecklist — scaled per card width. */
const MITR_BALANCE_NUMBER_BASE = {
  fontFamily: '"Mitr", sans-serif',
  fontWeight: 700,
  lineHeight: 0.85,
  letterSpacing: '0.04em',
} as const;
const MITR_CHIPS_NUMBER_STYLE = {
  ...MITR_BALANCE_NUMBER_BASE,
  fontSize: 'clamp(40px, 11vw, 100px)',
} as const;
const MITR_WALLET_NUMBER_STYLE = {
  ...MITR_BALANCE_NUMBER_BASE,
  fontSize: 'clamp(32px, 8vw, 84px)',
} as const;
const TOP_ACTION_BTN_CLASS =
  'inline-flex items-center justify-center gap-2 sm:gap-2.5 w-full sm:w-auto sm:min-w-[180px] px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl text-sm sm:text-base font-semibold border border-white/[0.08] bg-slate-900/40 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors';

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
        className="relative rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-lg shadow-cyan-500/5"
        style={{ background: PANEL_BG }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" aria-hidden />

        <div className="relative px-4 py-5 sm:px-8 sm:py-8">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:gap-4 mb-4 sm:mb-6">
            <button type="button" onClick={onOpenAllStats} className={TOP_ACTION_BTN_CLASS}>
              <BarChart3 size={18} aria-hidden />
              My Stats
            </button>
            <Link href="/creators" className={TOP_ACTION_BTN_CLASS}>
              <LayoutDashboard size={18} aria-hidden />
              Creator Dashboard
            </Link>
          </div>

          {/* ── Body · profile sidebar | wallet hero cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)] gap-4 lg:gap-6 lg:items-stretch">
            {/* LEFT · profile card */}
            <div className="relative rounded-xl bg-slate-900/60 border border-white/[0.06] w-full lg:max-w-none flex flex-col overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 flex flex-col flex-1 min-h-0">
                <div className="relative">
                  <div className="rounded-xl p-2 relative aspect-square border border-cyan-500/25 bg-[#050a12]">
                    {avatarConfig ? (
                      <AvatarView config={avatarConfig} className="w-full h-full rounded-lg overflow-hidden" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg" aria-hidden>
                        <span style={{ fontSize: 64 }}>{archetype.emoji}</span>
                      </div>
                    )}
                  </div>
                  <RepBadge token={repToken} onClick={() => setRepModalOpen(true)} />

                  <button
                    type="button"
                    onClick={handleCustomizeAvatar}
                    className="absolute left-[28%] -translate-x-1/2 -bottom-3 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white whitespace-nowrap hover:scale-105 transition-transform z-20"
                    style={{
                      background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                      boxShadow: '0 8px 22px -6px rgba(6,182,212,0.65), 0 0 0 1px rgba(34,211,238,0.25)',
                    }}
                  >
                    <PencilLine size={10} strokeWidth={2.5} />
                    Customize
                  </button>
                </div>

                <div className="mt-6 text-base font-bold text-white truncate text-center w-full">
                  {displayName}
                </div>
                <div className="mt-1 text-sm text-slate-300 text-center w-full">
                  {archetype.emoji} {archetype.name}
                  <span className="italic text-cyan-300/90 ml-1">{archetype.modifier}</span>
                </div>

                <div className="flex items-center justify-center py-4 sm:py-6 w-full lg:flex-1 lg:min-h-0">
                  <RankProfileDisplay rank={rankRow?.rank} totalHands={totalHands} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLedgerModalOpen(true)}
                className="inline-flex w-full min-h-[64px] sm:min-h-[96px] items-center justify-center gap-2 sm:gap-3 rounded-none border-0 border-t border-white/[0.08] text-sm sm:text-lg font-bold text-slate-200 hover:bg-white/[0.04] hover:text-white transition-colors"
              >
                View all transactions <ArrowRight size={18} strokeWidth={2.5} className="sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* RIGHT · wallet stack — tall centered cards */}
            <div className="min-w-0 flex flex-col gap-4 h-full">
              <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] px-3 py-5 sm:px-4 sm:py-8 flex flex-col items-center justify-center text-center min-h-[112px] sm:min-h-[168px]">
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                  <Coins size={14} className="text-cyan-300" />
                  <span className="uppercase tracking-[0.16em] font-bold">Poker chips</span>
                </div>
                <div
                  className="text-emerald-300 tabular-nums"
                  style={MITR_CHIPS_NUMBER_STYLE}
                  title={chipsDisplay}
                >
                  {chipsDisplay}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-1 min-h-0">
                <WalletBalanceCard
                  label="Deposited morbius"
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

              <button
                type="button"
                onClick={onOpenExchange}
                className="inline-flex items-center justify-center gap-2 w-full min-h-[56px] sm:min-h-[88px] rounded-xl text-sm sm:text-base font-bold text-white transition-all hover:scale-[1.01]"
                style={PRIMARY_BTN_STYLE}
              >
                <Coins size={18} aria-hidden />
                Open chip exchange
              </button>
            </div>
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

/** Global rank block — shown below the player archetype in the profile sidebar. */
function RankProfileDisplay({ rank, totalHands }: { rank: number | null | undefined; totalHands: number }) {
  const labelClass = 'text-[10px] uppercase tracking-[0.2em] font-bold text-center text-slate-500';

  if (totalHands === 0 || rank == null) {
    return (
      <div className="text-center w-full">
        <div className={labelClass}>Global rank</div>
        <div className="mt-2 text-slate-500 font-mono tabular-nums text-3xl font-bold">—</div>
      </div>
    );
  }
  if (rank === 1) {
    return (
      <div className="text-center w-full">
        <div className={`${labelClass} text-amber-300/90 flex items-center justify-center gap-1.5`}>
          <Crown size={11} strokeWidth={2.5} /> Champion
        </div>
        <div className="mt-2 text-amber-200 font-mono tabular-nums text-3xl font-bold">#1</div>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="text-center w-full">
        <div className={`${labelClass} text-slate-300 flex items-center justify-center gap-1.5`}>
          <Medal size={11} strokeWidth={2.5} /> Runner-up
        </div>
        <div className="mt-2 text-slate-100 font-mono tabular-nums text-3xl font-bold">#2</div>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="text-center w-full">
        <div className={`${labelClass} text-orange-300/90 flex items-center justify-center gap-1.5`}>
          <Trophy size={11} strokeWidth={2.5} /> Third
        </div>
        <div className="mt-2 text-orange-200 font-mono tabular-nums text-3xl font-bold">#3</div>
      </div>
    );
  }
  return (
    <div className="text-center w-full">
      <div className={labelClass}>Global rank</div>
      <div className="mt-2 text-white font-mono tabular-nums text-3xl font-bold">#{rank}</div>
    </div>
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
    <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] overflow-hidden flex flex-col min-h-[200px] sm:min-h-[260px] h-full">
      <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0 px-2 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4 w-full">
        <div className="text-xs text-slate-400 uppercase tracking-[0.12em] font-bold w-full">
          {label}
        </div>
        <div
          className="mt-3 inline-flex items-center justify-center gap-2.5 text-white tabular-nums w-full min-w-0"
          style={MITR_WALLET_NUMBER_STYLE}
          title={`${value} ${unit}`}
        >
          <MorbiusBadge size={24} />
          <span className="truncate">{value}</span>
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-500 font-bold">
          {unit}
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center justify-center gap-2 w-full py-4 sm:py-6 rounded-none text-xs sm:text-sm font-bold text-white transition-all hover:opacity-95"
        style={PRIMARY_BTN_STYLE}
      >
        <ActionIcon size={16} strokeWidth={2.5} />
        {actionLabel}
      </button>
    </div>
  );
}
