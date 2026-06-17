'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Coins, Droplets, ArrowDownToLine, Spade, Loader2, Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { useHolderChipRewards, type ChipRewardCohort } from '@/hooks/use-holder-chip-rewards';
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal';
import { MORBIUS_TOKEN_ADDRESS, WPLS_TOKEN_ADDRESS } from '@/lib/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Cohort-driven theme tokens — match the existing /claim page emerald/purple
// design system. One component, two visual configurations.
// ─────────────────────────────────────────────────────────────────────────────

interface CohortTheme {
  eyebrow: string;
  feePill: string;
  bannerIcon: typeof Coins;
  bannerText: string;
  cardBg: string;
  card: string;
  pulse: string;
  pillBg: string;
  accent: string;
  accentValue: string;
  tile: string;
  historyBox: string;
  bar: string;
  btnPrimary: string;
  btnGhost: string;
  shimmer: string;
  secondary: { label: string; icon: typeof Coins; href: string; external: boolean };
}

// Matches existing PULSEX_ADD_LIQUIDITY_URL in app/claim/page.tsx (WPLS/MORBIUS V1 pair)
const PULSEX_ADD_LP_URL =
  `https://app.pulsex.com/add/v1/${WPLS_TOKEN_ADDRESS}/${MORBIUS_TOKEN_ADDRESS}`;

const THEME: Record<ChipRewardCohort, CohortTheme> = {
  morbius: {
    eyebrow: 'Holder Rewards · auto-credit',
    feePill: '1.25% of payouts',
    bannerIcon: Coins,
    bannerText: 'MORBIUS lands in your play balance automatically. No claim tx, no gas.',
    cardBg: 'bg-[#0a1410]/90',
    card: 'border-emerald-500/25',
    pulse: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,1)]',
    pillBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    accent: 'text-emerald-300',
    accentValue: 'text-emerald-400',
    tile: 'border-emerald-500/15',
    historyBox: 'border-emerald-500/15',
    bar: 'from-emerald-500 to-emerald-300',
    btnPrimary:
      'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-900/40',
    btnGhost: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30',
    shimmer: 'via-emerald-500/10',
    secondary: { label: 'Play with MORBIUS', icon: Spade, href: '/poker', external: false },
  },
  lp: {
    eyebrow: 'LP Claim · auto-credit',
    feePill: '1.5% of payouts',
    bannerIcon: Droplets,
    bannerText: 'Hold MORBIUS LP — your balance is credited, weighted by the MORBIUS value inside your position.',
    cardBg: 'bg-[#100a1a]/90',
    card: 'border-purple-500/25',
    pulse: 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,1)]',
    pillBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    accent: 'text-purple-300',
    accentValue: 'text-purple-400',
    tile: 'border-purple-500/15',
    historyBox: 'border-purple-500/15',
    bar: 'from-purple-500 to-purple-300',
    btnPrimary:
      'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-lg shadow-purple-900/40',
    btnGhost: 'border-purple-500/30 text-purple-300 hover:bg-purple-950/30',
    shimmer: 'via-purple-500/10',
    secondary: { label: 'Add liquidity', icon: Droplets, href: PULSEX_ADD_LP_URL, external: true },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const E18 = 10n ** 18n;

function fmtChips(chipsStr: string): string {
  const n = Number(chipsStr);
  if (!Number.isFinite(n)) return '0';
  return Math.floor(n).toLocaleString();
}

function fmtMorbiusShort(weiStr: string): string {
  try {
    const n = Number(BigInt(weiStr) / E18);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  } catch {
    return '0';
  }
}

function fmtPoolSharePct(basisWei: string, totalBasisWei: string): string {
  try {
    const b = BigInt(basisWei);
    const t = BigInt(totalBasisWei);
    if (t === 0n) return '—';
    const bps = (b * 10_000n) / t; // basis points
    return `${(Number(bps) / 100).toFixed(2)}%`;
  } catch {
    return '—';
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return fmtDate(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

export interface HolderChipCreditsPanelProps {
  cohort: ChipRewardCohort;
}

export function HolderChipCreditsPanel({ cohort }: HolderChipCreditsPanelProps) {
  const { address } = useAccount();
  const { data, isLoading, error, refetch } = useHolderChipRewards(address);
  const [showExchange, setShowExchange] = useState(false);

  const theme = THEME[cohort];
  const cohortData = data[cohort];
  const lastCredit = cohortData.history[0];
  const BannerIcon = theme.bannerIcon;
  const SecondaryIcon = theme.secondary.icon;

  const onCashOut = () => setShowExchange(true);
  const onSecondary = () => {
    const href = theme.secondary.href;
    if (theme.secondary.external) window.open(href, '_blank', 'noopener,noreferrer');
    else window.location.assign(href);
  };

  // ── Empty/connect state ─────────────────────────────────────────────
  if (!address) {
    return (
      <div className={`relative rounded-2xl border ${theme.card} ${theme.cardBg} backdrop-blur-sm p-5 overflow-hidden`}>
        <ShimmerBar tone={theme.shimmer} />
        <PanelHeader theme={theme} />
        <div className="text-center py-8 px-3">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-black/30 border ${theme.tile} mb-3`}>
            <Sparkles className={`w-5 h-5 ${theme.accent}`} aria-hidden="true" />
          </div>
          <p className="text-sm text-white/80 font-poppins mb-1">Connect a wallet to see your credit history.</p>
          <p className="text-xs text-white/40 font-poppins">
            {cohort === 'morbius'
              ? 'MORBIUS holders ≥ 1,000 tokens qualify automatically each epoch.'
              : 'Any wallet holding MORBIUS LP qualifies — weighted by MORBIUS value in your position.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`relative rounded-2xl border ${theme.card} ${theme.cardBg} backdrop-blur-sm p-5`}>
        <PanelHeader theme={theme} />
        <div className="text-center py-6">
          <p className="text-sm text-red-300/80 font-poppins mb-3">{error}</p>
          <button onClick={refetch} className={`px-4 py-2 text-xs font-poppins font-semibold rounded-lg border ${theme.btnGhost}`}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main state ──────────────────────────────────────────────────────
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={`relative rounded-2xl border ${theme.card} ${theme.cardBg} backdrop-blur-sm p-5 overflow-hidden`}
      >
        <ShimmerBar tone={theme.shimmer} />
        <PanelHeader theme={theme} />

        {/* Auto-credit info banner */}
        <div className="flex items-center gap-2 rounded-lg bg-black/25 border border-dashed border-white/10 px-3 py-2.5 mb-3.5">
          <BannerIcon className={`w-4 h-4 shrink-0 ${theme.accent}`} aria-hidden="true" />
          <p className="text-[11px] text-white/55 font-poppins leading-tight">{theme.bannerText}</p>
        </div>

        {/* Hero tiles */}
        <div className="grid grid-cols-3 gap-2.5 mb-3.5">
          <div className={`rounded-xl bg-black/30 border ${theme.tile} px-3.5 py-3`}>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-poppins font-semibold mb-1">
              Lifetime MORBIUS
            </div>
            <div className={`text-[22px] font-bold leading-none font-poppins ${theme.accentValue}`}>
              {isLoading ? <Skeleton w={80} /> : fmtChips(cohortData.lifetimeChips)}
            </div>
            <div className={`text-[10px] mt-1 font-poppins ${theme.accent} opacity-70`}>
              {cohortData.epochs} epoch{cohortData.epochs === 1 ? '' : 's'}
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`} style={{ width: `${Math.min(100, cohortData.epochs * 4)}%` }} />
            </div>
          </div>

          <div className={`rounded-xl bg-black/30 border ${theme.tile} px-3.5 py-3`}>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-poppins font-semibold mb-1">Last credit</div>
            <div className="text-[22px] font-bold text-white leading-none font-poppins">
              {isLoading ? <Skeleton w={60} /> : lastCredit ? fmtChips(lastCredit.chips_credited) : '—'}
            </div>
            <div className="text-[10px] text-white/45 mt-1 font-poppins">
              {lastCredit ? `Epoch #${lastCredit.epoch_number} · ${relativeFromNow(lastCredit.credited_at)}` : 'No credits yet'}
            </div>
          </div>

          <div className={`rounded-xl bg-black/30 border ${theme.tile} px-3.5 py-3`}>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-poppins font-semibold mb-1">Pool share</div>
            <div className="text-[22px] font-bold text-white leading-none font-poppins">
              {isLoading ? <Skeleton w={56} /> : lastCredit ? fmtPoolSharePct(lastCredit.basis_wei, lastCredit.total_basis_wei) : '—'}
            </div>
            <div className="text-[10px] text-white/45 mt-1 font-poppins">
              {lastCredit ? `${fmtMorbiusShort(lastCredit.basis_wei)} MORBIUS` : 'at last snapshot'}
            </div>
          </div>
        </div>

        {/* History table */}
        <HistoryTable
          rows={cohortData.history.slice(0, 4)}
          theme={theme}
          isLoading={isLoading}
          cohort={cohort}
        />

        {/* CTAs */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onCashOut}
            disabled={!address}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all font-poppins ${theme.btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Cash out MORBIUS
          </button>
          <button
            onClick={onSecondary}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all font-poppins border bg-transparent ${theme.btnGhost}`}
          >
            <SecondaryIcon className="w-4 h-4" />
            {theme.secondary.label}
            {theme.secondary.external && <ExternalLink className="w-3 h-3" />}
          </button>
        </div>

        <p className="text-[10px] text-white/30 text-center mt-3 font-poppins">
          {cohort === 'morbius'
            ? 'Min hold 1,000 MORBIUS · Snapshot weekly · Receipts on Pulsescan'
            : 'Supported pairs: MORBIUS/WPLS, /HEX, /UFO, /LBRTY + · Receipts on Pulsescan'}
        </p>
      </motion.div>

      <PokerChipExchangeModal
        isOpen={showExchange}
        onClose={() => setShowExchange(false)}
        walletAddress={address ?? null}
        onExchangeComplete={refetch}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function PanelHeader({ theme }: { theme: CohortTheme }) {
  return (
    <div className="relative flex items-center justify-between mb-3.5">
      <div className="flex items-center gap-2">
        <motion.div
          className={`w-1.5 h-1.5 rounded-full ${theme.pulse}`}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/65 font-poppins font-semibold">
          {theme.eyebrow}
        </span>
      </div>
      <span className={`text-[9px] uppercase tracking-wider font-poppins font-semibold px-2.5 py-1 rounded-full border ${theme.pillBg}`}>
        {theme.feePill}
      </span>
    </div>
  );
}

function ShimmerBar({ tone }: { tone: string }) {
  return (
    <motion.div
      aria-hidden="true"
      className={`absolute inset-0 bg-gradient-to-r from-transparent ${tone} to-transparent pointer-events-none`}
      animate={{ x: ['-100%', '200%'] }}
      transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
    />
  );
}

function Skeleton({ w }: { w: number }) {
  return (
    <span
      className="inline-block align-middle rounded bg-white/10"
      style={{ width: w, height: 18, animation: 'pulse 1.6s ease-in-out infinite' }}
    />
  );
}

interface HistoryTableProps {
  rows: ReturnType<typeof useHolderChipRewards>['data']['morbius']['history'];
  theme: CohortTheme;
  isLoading: boolean;
  cohort: ChipRewardCohort;
}

function HistoryTable({ rows, theme, isLoading, cohort }: HistoryTableProps) {
  const basisLabel = cohort === 'morbius' ? 'MORBIUS' : 'LP value';

  if (!isLoading && rows.length === 0) {
    return (
      <div className={`rounded-xl bg-black/25 border ${theme.historyBox} mb-3.5 py-5 text-center`}>
        <p className="text-xs text-white/40 font-poppins">No credits yet. Next snapshot will add your first row here.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-black/25 border ${theme.historyBox} mb-3.5 overflow-hidden`}>
      <div className="grid grid-cols-[56px_1fr_88px_88px_60px] px-3.5 py-2 border-b border-white/5 text-[9px] uppercase tracking-wider text-white/30 font-poppins font-semibold">
        <span>Epoch</span><span>Date</span>
        <span className="text-right">MORBIUS</span>
        <span className="text-right">{basisLabel}</span>
        <span className="text-right">Share</span>
      </div>
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3.5 py-2.5 border-b border-white/5 last:border-b-0">
              <Skeleton w={300} />
            </div>
          ))
        : rows.map((row) => (
            <div
              key={row.epoch_id}
              className="grid grid-cols-[56px_1fr_88px_88px_60px] px-3.5 py-2.5 border-b border-white/5 last:border-b-0 items-center text-[12px] font-poppins"
            >
              <span className="font-semibold text-white/55">#{row.epoch_number}</span>
              <span className="text-white/50 text-[11px]">{fmtDate(row.credited_at)}</span>
              <span className={`text-right font-bold ${theme.accentValue} tabular-nums`}>+{fmtChips(row.chips_credited)}</span>
              <span className="text-right text-white/55 tabular-nums">{fmtMorbiusShort(row.basis_wei)}</span>
              <span className="text-right text-white/35 tabular-nums">{fmtPoolSharePct(row.basis_wei, row.total_basis_wei)}</span>
            </div>
          ))}
    </div>
  );
}
