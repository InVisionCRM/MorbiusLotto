'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  BLIND_INTERVAL_MINUTES_MAX,
  BLIND_INTERVAL_MINUTES_MIN,
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type BlindIntervalMinutes,
  type CreatePokerTournamentParams,
  type CustomTokenBuyInMeta,
  type CustomTokenEscrowFunding,
  type PokerBlindIncreaseMode,
} from '@/hooks/use-poker-tournament';
import { formatChips } from '@/lib/format-poker-chips';
import { POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL } from '@/lib/poker-table-logo-constants';
import { isAdminWallet } from '@/lib/admin';
import {
  buildPrizePercents,
  findPokerPrizePresetMeta,
  POKER_PRIZE_PRESET_LIST,
  type PokerPrizePresetId,
} from '@/lib/poker-tournament-prize-presets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { MorbGradientButton, MorbSecondaryButton } from '@/components/ui/morb-card';
import { IconShare } from '@tabler/icons-react';
import type { PieLabelRenderProps } from 'recharts';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { PokerTournamentSharePanel } from '@/components/poker/tournament/PokerTournamentSharePanel';
import { PokerTournamentShareModal } from '@/components/poker/tournament/PokerTournamentShareModal';
import { formatShareScheduleLine } from '@/lib/poker-share-snapshot';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Prc20TokenPicker, type SelectedPrc20Token } from '@/components/shared/Prc20TokenPicker';
import { getWplsShortfall, WPLS_DEPOSIT_ABI } from '@/lib/ensure-wpls-balance';
import { useTokenPriceUsd } from '@/hooks/use-token-price-usd';
import { formatUnits, parseUnits } from 'viem';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useWriteContract, usePublicClient, useAccount } from 'wagmi';
import { ERC20_ABI } from '@/abi/erc20';
import { tournamentPrizeEscrowV6Abi } from '@/abi/tournament-prize-escrow-v6';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS, WPLS_TOKEN_ADDRESS } from '@/lib/contracts';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import {
  CREATOR_FEE_MIN,
  CREATOR_FEE_MAX,
  CREATOR_FEE_DEFAULT,
  PLATFORM_FEE_BUYIN_PERCENT,
  clampCreatorFeePercent,
} from '@/lib/tournament-types';
import {
  defaultScheduledFields,
  localYyyyMmDd,
  openDateOrTimePicker,
  parseLocalDateTime,
} from '@/lib/poker-tournament-schedule';

/** Where the freeroll guarantee comes from. Mirrors server `GuaranteedPrizePoolSource`. */
type PrizeSource = 'chips' | 'platform_promo' | 'custom_token';

/** Buy-in tournaments: off-chain chips vs per-seat PRC-20 via escrow (`custom_token_buyin`). */
type BuyInPrizeSource = 'chips' | 'custom_token_buyin';

/** Whole off-chain poker chips (integer string). */
function parsePositiveWholeChips(val: string): bigint {
  const cleaned = val.replace(/[,\s]/g, '').split('.')[0] ?? '';
  if (!cleaned || !/^\d+$/.test(cleaned)) return 0n;
  try {
    return BigInt(cleaned);
  } catch {
    return 0n;
  }
}

const STARTING_STACK_PRESETS = [
  { value: '1000', label: '1,000' },
  { value: '2500', label: '2,500' },
  { value: '5555', label: '5,555' },
  { value: '10000', label: '10,000' },
] as const;

const BLIND_INCREASE_MODE_OPTIONS: ReadonlyArray<{
  id: PokerBlindIncreaseMode;
  title: string;
  bullets: readonly string[];
}> = [
  {
    id: 'knockout',
    title: 'After each knockout',
    bullets: [
      'Trigger: blinds bump only when someone loses all their chips and leaves.',
      'Timing: not tied to minutes or hand count—slow play stays at low blinds longer.',
      'Feel: easy early rounds; pressure ramps up as the table gets shorter-handed.',
    ],
  },
  {
    id: 'by_hand',
    title: 'Every N hands',
    bullets: [
      'Trigger: blinds bump after a set number of finished hands, not after bust-outs.',
      'Timing: real minutes vary with how long each hand takes; the ladder uses fewer hands per level later on.',
      'Feel: predictable escalation—even if nobody busts, antes and minimum bets still climb.',
    ],
  },
  {
    id: 'by_time',
    title: 'Wall-clock timer',
    bullets: [
      'Trigger: blinds bump every X minutes of real time, no matter how many hands run.',
      'Timing: wall-clock is strict—few hands in that window still means the same blind jump.',
      'Feel: great when you want a known pace; chip pressure does not wait for action.',
    ],
  },
];

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

/** e.g. 4–10 when all are plain `nth` → "4–10th"; otherwise "4th–12th". Single → `finishOrdinal`. */
function finishOrdinalRange(fromRank: number, toRank: number): string {
  if (fromRank === toRank) return finishOrdinal(fromRank);
  for (let r = fromRank; r <= toRank; r++) {
    if (finishOrdinal(r) !== `${r}th`) {
      return `${finishOrdinal(fromRank)}\u2013${finishOrdinal(toRank)}`;
    }
  }
  return `${fromRank}\u2013${toRank}th`;
}

type PrizeSplitLegendRow =
  | { kind: 'paid'; index: number; pct: number }
  | { kind: 'unpaidRun'; fromRank: number; toRank: number };

function buildPrizeSplitLegendRows(percents: number[]): PrizeSplitLegendRow[] {
  const out: PrizeSplitLegendRow[] = [];
  let i = 0;
  while (i < percents.length) {
    const pct = percents[i];
    if (pct > 0) {
      out.push({ kind: 'paid', index: i, pct });
      i += 1;
      continue;
    }
    const start = i;
    while (i < percents.length && percents[i] === 0) i += 1;
    const fromRank = start + 1;
    const toRank = i;
    out.push({ kind: 'unpaidRun', fromRank, toRank });
  }
  return out;
}

const PRIZE_PIE_COLORS = [
  '#22d3ee',
  '#fbbf24',
  '#a78bfa',
  '#34d399',
  '#38bdf8',
  '#f472b6',
  '#94a3b8',
  '#64748b',
  '#475569',
  '#334155',
] as const;

/** Outer-ring colors for the "where the buy-in goes" breakdown. Kept distinct from the */
/* prize-position palette so the eye lands on the prize pool first. */
const FEE_RING_COLORS = {
  platform: '#64748b', // slate-500 — neutral, this is "to the house"
  creator:  '#f97316', // orange-500 — warm accent, this is "to you (creator)"
  pool:     '#0ea5e9', // sky-500   — anchors the prize pool back to the cyan prize pie
} as const;

const PRIZE_PIE_LABEL_RADIAN = Math.PI / 180;

/** Pool used to show per-rank prize amounts in the creator preview (chips or escrowed ERC-20). */
type PrizeSplitPoolPreview =
  | { kind: 'chips'; poolChips: bigint; approximate: boolean }
  | { kind: 'erc20'; poolWei: bigint; decimals: number; symbol: string };

function trimTokenAmountDisplay(s: string): string {
  if (!s.includes('.')) return s;
  const t = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return t || '0';
}

function formatPrizeSplitRowAmount(preview: PrizeSplitPoolPreview | null, pct: number): string | null {
  if (pct <= 0 || preview == null) return null;
  const p = BigInt(pct);
  if (preview.kind === 'chips') {
    const share = (preview.poolChips * p) / 100n;
    const n = share.toLocaleString('en-US');
    return preview.approximate ? `~${n} chips` : `${n} chips`;
  }
  const share = (preview.poolWei * p) / 100n;
  const body = trimTokenAmountDisplay(formatUnits(share, preview.decimals));
  return `${body} ${preview.symbol}`;
}

/** Recharts pie sector labels: finish + % inside the annulus, subtle outline for legibility. */
function renderPrizePieLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle = 0, middleRadius, innerRadius, outerRadius, name, value } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number') return null;
  let r: number | undefined =
    typeof middleRadius === 'number' && Number.isFinite(middleRadius) ? middleRadius : undefined;
  if (r == null) {
    const ir = typeof innerRadius === 'number' ? innerRadius : Number(innerRadius);
    const or = typeof outerRadius === 'number' ? outerRadius : Number(outerRadius);
    if (!Number.isFinite(ir) || !Number.isFinite(or)) return null;
    r = ir + (or - ir) * 0.5;
  }
  const v = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(v)) return null;
  const nm = name != null ? String(name) : '';
  const ma = typeof midAngle === 'number' ? midAngle : Number(midAngle) || 0;
  const x = cx + r * Math.cos(-ma * PRIZE_PIE_LABEL_RADIAN);
  const y = cy + r * Math.sin(-ma * PRIZE_PIE_LABEL_RADIAN);
  const compact = v < 16;
  const textStyle: React.CSSProperties = {
    fontWeight: 700,
    paintOrder: 'stroke',
    stroke: 'rgba(0,0,0,0.35)',
    strokeWidth: compact ? 1.6 : 2,
    strokeLinejoin: 'round',
  };
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="rgba(248,250,252,0.98)">
      <tspan x={x} dy={compact ? '-0.38em' : '-0.42em'} style={{ ...textStyle, fontSize: compact ? 9 : 10 }}>
        {nm}
      </tspan>
      <tspan x={x} dy={compact ? '0.95em' : '1.08em'} style={{ ...textStyle, fontSize: compact ? 10 : 12 }} letterSpacing="0.02em">
        {v}%
      </tspan>
    </text>
  );
}

function PrizeSplit3DPie({
  percents,
  poolPreview,
  platformFeePercent,
  creatorFeePercent,
}: {
  percents: number[];
  /** When set, legend rows show estimated payout for that share of the pool. */
  poolPreview: PrizeSplitPoolPreview | null;
  /** Platform cut taken off the top of each buy-in. Omit for freerolls / chip-only flows that show no fee ring. */
  platformFeePercent?: number;
  /** Creator's chosen cut (0–15). Omit/0 for freerolls. */
  creatorFeePercent?: number;
}) {
  const uid = React.useId().replace(/:/g, '');
  const chartSlices = useMemo(
    () =>
      percents
        .map((value, i) => ({
          name: finishOrdinal(i + 1),
          value: value > 0 ? value : 0,
          index: i,
        }))
        .filter((d) => d.value > 0),
    [percents],
  );

  const legendRows = useMemo(() => buildPrizeSplitLegendRows(percents), [percents]);

  // Outer-ring data: present the same Platform/Your-fee/To-winners math that the slider card
  // shows, but as a visual ring around the prize pie. Sums to 100% of the buy-in by construction.
  // Skipped entirely when caller passes no fee props (freeroll, chip-only previews, etc).
  const feeRing = useMemo(() => {
    if (platformFeePercent == null && creatorFeePercent == null) return null;
    const platform = Math.max(0, Math.min(100, Number(platformFeePercent ?? 0)));
    const creator = Math.max(0, Math.min(100, Number(creatorFeePercent ?? 0)));
    const pool = Math.max(0, 100 - platform - creator);
    if (platform + creator === 0) return null; // no fees → nothing to add
    return [
      { name: 'Prize pool', value: pool, key: 'pool' as const, color: FEE_RING_COLORS.pool },
      { name: 'Your fee', value: creator, key: 'creator' as const, color: FEE_RING_COLORS.creator },
      { name: 'Platform fee', value: platform, key: 'platform' as const, color: FEE_RING_COLORS.platform },
    ].filter((s) => s.value > 0);
  }, [platformFeePercent, creatorFeePercent]);

  if (chartSlices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">No paid positions in this split.</p>
    );
  }

  // When the fee ring is shown the inner pie shrinks so both rings fit cleanly without overlapping
  // labels. Without the fee ring the inner pie keeps its previous radius for back-compat with the
  // freeroll layout (which deliberately doesn't render fees).
  const showFeeRing = feeRing != null && feeRing.length > 0;
  const innerR = showFeeRing ? '28%' : '34%';
  const innerOuterR = showFeeRing ? '62%' : '78%';
  const ringInnerR = '68%';
  const ringOuterR = '86%';

  return (
    <div className="flex flex-col items-center gap-5 py-5 px-3 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative w-full max-w-[280px] shrink-0" style={{ height: 220 }}>
        <div className="relative z-[1] h-full w-full overflow-visible pointer-events-none [&_.recharts-wrapper]:!overflow-visible [&_path]:pointer-events-none [&_text]:pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <defs>
                {chartSlices.map((d, i) => (
                  <radialGradient key={d.index} id={`${uid}-pg-${d.index}`} cx="32%" cy="28%" r="92%">
                    <stop offset="0%" stopColor={PRIZE_PIE_COLORS[i % PRIZE_PIE_COLORS.length]} stopOpacity={1} />
                    <stop
                      offset="100%"
                      stopColor={PRIZE_PIE_COLORS[i % PRIZE_PIE_COLORS.length]}
                      stopOpacity={0.5}
                    />
                  </radialGradient>
                ))}
                {showFeeRing
                  ? feeRing.map((s) => (
                      <radialGradient key={`fee-${s.key}`} id={`${uid}-fee-${s.key}`} cx="32%" cy="28%" r="92%">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.45} />
                      </radialGradient>
                    ))
                  : null}
              </defs>
              {/* Outer ring: where the buy-in goes (platform / creator / prize pool). */}
              {showFeeRing ? (
                <Pie
                  data={feeRing}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={ringInnerR}
                  outerRadius={ringOuterR}
                  paddingAngle={1.5}
                  cornerRadius={0}
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth={1}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {feeRing.map((s) => (
                    <Cell key={s.key} fill={`url(#${uid}-fee-${s.key})`} />
                  ))}
                </Pie>
              ) : null}
              {/* Inner pie: how the prize pool is split among finishers. */}
              <Pie
                data={chartSlices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                startAngle={90}
                endAngle={-270}
                innerRadius={innerR}
                outerRadius={innerOuterR}
                paddingAngle={2}
                cornerRadius={0}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={1.5}
                label={renderPrizePieLabel}
                labelLine={false}
                isAnimationActive={false}
              >
                {chartSlices.map((d, i) => (
                  <Cell key={d.index} fill={`url(#${uid}-pg-${d.index})`} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2 sm:max-w-[220px]">
        {showFeeRing ? (
          <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 mb-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/45 mb-1.5">Where the buy-in goes</div>
            <div className="space-y-1 text-[11px]">
              {feeRing.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm ring-1 ring-black/10"
                      style={{ background: s.color }}
                    />
                    <span className={s.key === 'pool' ? 'text-emerald-200/90 font-medium' : 'text-white/75'}>{s.name}</span>
                  </div>
                  <span className="font-mono tabular-nums text-white/85">{s.value}%</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] text-white/40">
              Inner pie below shows how the prize pool is split among finishers.
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2.5 text-xs sm:justify-start">
          {legendRows.map((row) => {
            if (row.kind === 'paid') {
              const { index: i, pct } = row;
              const amountLine = formatPrizeSplitRowAmount(poolPreview, pct);
              return (
                <div
                  key={`paid-${i}`}
                  className={`flex min-w-[6.75rem] max-w-[11rem] gap-2 text-slate-100`}
                >
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-black/10"
                    style={{ background: PRIZE_PIE_COLORS[i % PRIZE_PIE_COLORS.length] }}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="font-medium tabular-nums">{finishOrdinal(i + 1)}</span>
                      <span className="tabular-nums text-cyan-200/90">{pct}%</span>
                    </div>
                    {amountLine ? (
                      <span className="text-[10px] leading-snug text-white/55 tabular-nums break-all">{amountLine}</span>
                    ) : null}
                  </div>
                </div>
              );
            }
            const label = finishOrdinalRange(row.fromRank, row.toRank);
            return (
              <div
                key={`unpaid-${row.fromRank}-${row.toRank}`}
                className="flex min-w-[6.75rem] max-w-[11rem] gap-2 text-slate-600"
              >
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-black/10"
                  style={{ background: 'rgba(71,85,105,0.55)' }}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-medium tabular-nums">{label}</span>
                    <span className="tabular-nums text-cyan-200/50">0%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {poolPreview === null && percents.some((p) => p > 0) ? (
          <p className="text-center text-[10px] leading-snug text-white/40 sm:text-left">
            Set buy-in and max seats, or a guaranteed pool / custom token amount, to preview payout amounts.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// `parseLocalDateTime` + `openDateOrTimePicker` now live in `lib/poker-tournament-schedule.ts`
// so the MTT wizard and the classic creator stay in lockstep on date handling + picker UX.

/** Inline USD-value preview for the custom-token amount input. Hidden until the picker resolves a token. */
function CustomTokenUsdHint({ token, amount }: { token: SelectedPrc20Token | null; amount: string }) {
  const priceUsd = useTokenPriceUsd(token?.address ?? null);
  if (!token || !amount.trim() || priceUsd == null) return null;
  let parsed: number;
  try {
    parsed = Number(amount.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
  } catch {
    return null;
  }
  const usd = parsed * priceUsd;
  const fmt =
    usd >= 1
      ? `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : usd >= 0.01
        ? `$${usd.toFixed(2)}`
        : `$${usd.toFixed(4)}`;
  return <p className="text-[11px] text-cyan-200/80 mt-1">≈ {fmt} USD</p>;
}

export interface PokerTournamentCreatorProps {
  creatorAddress?: string;
  onClose: () => void;
  onCreate: (
    params: CreatePokerTournamentParams,
    opts: { addBots: number },
  ) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
  /**
   * `'modal'` (default): renders inside a Radix `<Dialog>` overlay. Used by the lobby.
   * `'page'`: renders on a full-bleed gradient page surface for the dedicated
   *   `/poker/tournaments/create` route. The page itself scrolls; no Dialog wrapper.
   */
  variant?: 'modal' | 'page';
}

/**
 * Conditional wrapper: Radix Dialog in modal mode, full-bleed page surface in page mode.
 * The visual style of the inner card is unchanged — only the outer chrome differs.
 */
function CreatorShell({
  variant,
  modal = true,
  onClose,
  srTitle,
  srDescription,
  children,
}: {
  variant: 'modal' | 'page';
  modal?: boolean;
  onClose: () => void;
  srTitle: string;
  srDescription: string;
  children: React.ReactNode;
}) {
  if (variant === 'page') {
    return (
      <div
        className="relative min-h-screen w-full"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(6,182,212,0.10), transparent 60%), linear-gradient(180deg, #050a14 0%, #020409 100%)',
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-start justify-center px-4 py-6 sm:py-10">
          {children}
        </div>
      </div>
    );
  }
  return (
    <Dialog modal={modal} defaultOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-0 z-50 flex flex-col items-center justify-center border-0 bg-transparent p-4 shadow-none outline-none',
            'overflow-y-auto scroll-smooth overscroll-y-contain',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{srTitle}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{srDescription}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/** Morb-style slate panel — shared by tab bar, FAQ, and tournament name field. */
/* Flat, no embossed inset shadows. Matches EscrowBuyInJoinPanel's slate-900/60 + white/10 ring. */
const POKER_BASICS_FAQ_PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '1rem',
};

const TAB_BAR =
  'relative z-[1] grid h-auto min-h-10 w-full grid-cols-2 gap-1 border-0 bg-transparent p-1 shadow-none sm:grid-cols-4 text-white/70';
const TAB_TRIGGER =
  'inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-lg px-2 py-2 text-center text-[11px] font-medium leading-snug whitespace-normal text-white/65 data-[state=active]:text-white data-[state=active]:bg-gradient-to-br data-[state=active]:from-cyan-600/35 data-[state=active]:to-blue-600/25 data-[state=active]:border data-[state=active]:border-cyan-500/35 data-[state=active]:shadow-sm sm:text-xs sm:px-3';

const BLIND_ROLODEX_ROW_PX = 40;

const PLAYER_COUNT_OPTIONS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** MTT-mode picker options. Tight at the low end, then ladder up to keep the dropdown short. */
const MTT_FIELD_SIZE_OPTIONS: readonly number[] = [12, 18, 24, 30, 36, 45, 54, 63, 72, 81, 90, 100];

/** Seats per table when running an MTT. Standard live poker = 9; 6-max = popular online. */
const MTT_SEATS_PER_TABLE_OPTIONS: readonly number[] = [6, 7, 8, 9, 10];

const STARTING_STACK_SELECT_VALUES: readonly number[] = STARTING_STACK_PRESETS.map((p) => parseInt(p.value, 10));

function snapToNearestInList(n: number, list: readonly number[]): number {
  if (list.length === 0) return n;
  let best = list[0];
  let bestAbs = Math.abs(best - n);
  for (let i = 1; i < list.length; i++) {
    const v = list[i];
    const d = Math.abs(v - n);
    if (d < bestAbs || (d === bestAbs && v > best)) {
      best = v;
      bestAbs = d;
    }
  }
  return best;
}

type PokerCreatorFaqEntry = { q: string; a: React.ReactNode };

function PokerTournamentTabFaqPanel({
  idPrefix,
  entries,
}: {
  idPrefix: string;
  entries: readonly PokerCreatorFaqEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="relative w-full py-4 mt-4" style={POKER_BASICS_FAQ_PANEL_STYLE}>
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)] rounded-[1rem] pointer-events-none"
        aria-hidden
      />
      <h2 className="text-lg font-bold text-cyan-300/95 mb-3 px-4 relative">FAQ</h2>
      <Accordion type="single" collapsible className="w-full relative px-2 sm:px-3">
        {entries.map((faq, i) => (
          <AccordionItem key={`${idPrefix}-item-${i}`} value={`${idPrefix}-faq-${i}`} className="border-cyan-500/20 text-left">
            <AccordionTrigger className="text-white/90 hover:text-cyan-300 py-3 text-sm font-medium [&[data-state=open]>svg]:rotate-180 px-2">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-white/80 text-sm pb-3 px-2">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

const POKER_CREATOR_TYPE_FAQ: readonly PokerCreatorFaqEntry[] = [
  {
    q: 'What is the difference between Freeroll and Buy-in?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        <span className="text-cyan-200/90 font-medium">Freeroll:</span> you fund the prize (chips, platform promo, or a custom token on-chain). Players join free.{' '}
        <span className="text-cyan-200/90 font-medium">Buy-in:</span> each player pays tournament chips to enter; the pool comes from those entries (MORBIUS-backed); the creator does not post the pool.
      </p>
    ),
  },
  {
    q: 'Why does a name step appear after I pick a model?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        So you confirm funding type first, then set the public name in one place. After you tap Proceed, the rest of the tabs unlock so you can finish blinds, prizes, and schedule.
      </p>
    ),
  },
  {
    q: 'What does a private tournament do?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        Optional PIN (4–12 digits) is required to join. Use it for invite-only tables. You set it here on the Type tab; you can change it later on this tab before you publish.
      </p>
    ),
  },
  {
    q: 'What are custom PRC-20 prizes?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        For freerolls only: instead of off-chain chips, you can pick any PulseChain token and deposit the prize on-chain when you publish (approve, then deposit). Prize splits on the Prizes tab apply to
        that token amount.
      </p>
    ),
  },
  {
    q: 'What happens when I click Review and create?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        After you finish all tabs, Review and create opens a summary. Most tournaments publish with one confirmation. Custom-token freerolls need approve and deposit wallet steps before the server
        creates the event.
      </p>
    ),
  },
];

const POKER_CREATOR_SCHEDULE_FAQ: readonly PokerCreatorFaqEntry[] = [
  {
    q: 'What time zone is the start time?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        {`The date and clock pickers use your browser's local time zone. What you see is what players in your region expect; communicate UTC or local time in your community if players are global.`}
      </p>
    ),
  },
  {
    q: 'What happens if my tournament does not get the minimum player count? Do I or already registered players lose our funds?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        No. When the scheduled start time is reached, if registered players are still below your minimum, the event is cancelled automatically. Anyone who paid a buy-in is refunded to their poker chip
        balance; guaranteed chip pools go back per house rules. Custom-token freerolls use the on-chain cancel path so deposits can be reclaimed—nobody keeps buy-ins because the table never opened.
      </p>
    ),
  },
  {
    q: 'What is a scheduled Sit & Go?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        A Sit & Go starts when enough players are ready—here, it is tied to the calendar time you set. Players can register beforehand; at the scheduled moment the table can open if the minimum seats
        are filled (see Basics FAQ if the minimum is not met).
      </p>
    ),
  },
  {
    q: 'Can I change the start time later?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        No, after you publish a tournament, the scheduled time is locked. You would have to cancel and recreate the tournament with your new time.
      </p>
    ),
  },
];

const POKER_CREATOR_RULES_FAQ: readonly PokerCreatorFaqEntry[] = [
  {
    q: 'What do the three blind increase modes mean?',
    a: (
      <div className="space-y-2 text-white/80 text-sm leading-relaxed">
        <p>
          <span className="text-cyan-200/90 font-medium">After each knockout:</span> blinds jump when someone busts out—slow play stays at low blinds longer.
        </p>
        <p>
          <span className="text-cyan-200/90 font-medium">Every N hands:</span> levels advance after a fixed number of completed hands (shown in the ladder), not on wall-clock minutes alone.
        </p>
        <p>
          <span className="text-cyan-200/90 font-medium">Wall-clock timer:</span> each level lasts your chosen minutes of real time, then blinds bump regardless of how many hands finished.
        </p>
      </div>
    ),
  },
  {
    q: 'What is time per blind level?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        Only used when you choose wall-clock timer mode. Pick how many minutes each level lasts ({BLIND_INTERVAL_MINUTES_MIN}–{BLIND_INTERVAL_MINUTES_MAX}); the rolodex sets that interval for the whole
        ladder.
      </p>
    ),
  },
  {
    q: 'Does the blind schedule table match the live tournament?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        The table previews the default ladder (small/big blinds per level, and hands-per-level when in hand-based mode). In-game timing still follows the mode you selected—this is the structure
        players will climb through.
      </p>
    ),
  },
];

const POKER_CREATOR_PRIZES_FAQ: readonly PokerCreatorFaqEntry[] = [
  {
    q: 'Why do prize presets always total 100%?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        Paid finishing positions must split the whole pool. Presets assign a percentage to each paid spot; zeros mean unpaid ranks. The ladder length follows your maximum player count on the Basics
        tab.
      </p>
    ),
  },
  {
    q: 'What does the pie chart estimate?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        It is a preview from your current buy-in or guaranteed pool (or custom token amount for that path) and seat count. Final payouts still follow tournament results and house rules at settlement.
      </p>
    ),
  },
  {
    q: 'How does max players affect prizes?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        The preset is applied up to your max seats (2–10). If you lower max players, the percent rows shrink accordingly so the chart always matches how many seats can cash.
      </p>
    ),
  },
];

const POKER_CREATOR_STAFF_FAQ: readonly PokerCreatorFaqEntry[] = [
  {
    q: 'Who can use auto-join bots?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        This option is staff-only and never shown to regular players. It exists so admins can seed empty seats with server-controlled bots after creation for testing or demos.
      </p>
    ),
  },
  {
    q: 'When do bots join?',
    a: (
      <p className="text-white/80 text-sm leading-relaxed">
        After the tournament is created successfully, up to the count you enter here can auto-join to fill vacant seats. It does not replace real players who have already registered.
      </p>
    ),
  },
];

function PokerTournamentBasicsFaqSection({
  isFreeroll,
  usesCustomTokenEscrowPool,
  usesCustomTokenBuyIn,
}: {
  isFreeroll: boolean;
  usesCustomTokenEscrowPool: boolean;
  usesCustomTokenBuyIn: boolean;
}) {
  const poolOrBuy = usesCustomTokenEscrowPool
    ? {
        q: 'Where does the prize money come from for a custom-token freeroll?',
        a: (
          <p className="text-white/80 text-sm leading-relaxed">
            You choose a PulseChain token and total amount, then approve and deposit into the on-chain prize escrow when you publish. The split you pick on the Prizes tab applies to that token pool,
            not off-chain poker chips.
          </p>
        ),
      }
    : usesCustomTokenBuyIn
      ? {
          q: 'How does a custom-token buy-in work?',
          a: (
            <p className="text-white/80 text-sm leading-relaxed">
              You pick the token and the buy-in amount per seat here — nothing is collected from you when you publish. Each player approves and deposits that token into the on-chain prize escrow when they
              register. Refunds if the tournament does not run are handled by the server and the escrow contract.
            </p>
          ),
        }
      : isFreeroll
        ? {
            q: 'What is the guaranteed prize pool?',
            a: (
              <p className="text-white/80 text-sm leading-relaxed">
                For chip or platform-promo freerolls, this is the total off-chain tournament chips you commit as the prize. Players join for free; nobody pays a buy-in. If you use custom tokens instead,
                you set the pool on-chain (see the question about custom-token freerolls).
              </p>
            ),
          }
        : {
            q: 'What is buy-in per player?',
            a: (
              <p className="text-white/80 text-sm leading-relaxed">
                Each seat costs this many tournament chips to enter. One tournament chip equals one MORBIUS for chip buy-in tournaments. Players buy or convert chips in the lobby before joining. The prize
                pool grows from those buy-ins (after fees where applicable); the creator does not fund the pool.
              </p>
            ),
          };

  const faqs: PokerCreatorFaqEntry[] = [
    {
      q: 'What is the difference between minimum and maximum players?',
      a: (
        <div className="space-y-2 text-white/80 text-sm leading-relaxed">
          <p>
            <span className="text-cyan-200/90 font-medium">Minimum</span> is how many registered or joined players must be present before the table can start at the scheduled time. If that bar is not
            met, the Sit & Go is cancelled and buy-ins or posted pool chips are refunded.
          </p>
          <p>
            <span className="text-cyan-200/90 font-medium">Maximum</span> is the hard cap on seats at the table (2–10). Prize ladders and previews use this headcount.
          </p>
        </div>
      ),
    },
    poolOrBuy,
    {
      q: 'What is starting stack?',
      a: (
        <p className="text-white/80 text-sm leading-relaxed">
          Every player begins the tournament with this many tournament chips in front of them at the table. It does not change the prize pool size by itself—it changes how deep the game feels. Higher
          stacks usually mean longer play before blinds create pressure.
        </p>
      ),
    },
    {
      q: 'What if we do not get enough players by the start time?',
      a: (
        <p className="text-white/80 text-sm leading-relaxed">
          The tournament needs at least the minimum number of players when the clock hits your scheduled start. If not, it is cancelled and players (and you, where applicable) get refunds for buy-ins
          or posted pool chips. Plan a realistic minimum for your community size.
        </p>
      ),
    },
  ];

  return <PokerTournamentTabFaqPanel idPrefix="basics" entries={faqs} />;
}

const selectTriggerBasicsClass =
  'w-full h-11 rounded-xl bg-gray-950/60 border border-cyan-500/20 px-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 [&>span]:line-clamp-1';

/** Scroll-snap “rolodex” for 1–60 minutes (by-time blind interval). */
function BlindIntervalRolodex({
  value,
  onChange,
}: {
  value: BlindIntervalMinutes;
  onChange: (m: BlindIntervalMinutes) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<number>(value);
  const minutes = useMemo(
    () => Array.from({ length: BLIND_INTERVAL_MINUTES_MAX }, (_, i) => BLIND_INTERVAL_MINUTES_MIN + i),
    [],
  );

  const scrollToMinute = useCallback((m: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const pad = (el.clientHeight - BLIND_ROLODEX_ROW_PX) / 2;
    const top = pad + (m - 0.5) * BLIND_ROLODEX_ROW_PX - el.clientHeight / 2;
    el.scrollTop = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pad = (el.clientHeight - BLIND_ROLODEX_ROW_PX) / 2;
    const top = pad + (value - 0.5) * BLIND_ROLODEX_ROW_PX - el.clientHeight / 2;
    el.scrollTop = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    lastEmitted.current = value;
    // Intentionally once per mount — scroll-driven updates only go through onScroll / nudge.
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pad = (el.clientHeight - BLIND_ROLODEX_ROW_PX) / 2;
    const center = el.scrollTop + el.clientHeight / 2;
    const idx = Math.round((center - pad) / BLIND_ROLODEX_ROW_PX - 0.5);
    const m = Math.min(BLIND_INTERVAL_MINUTES_MAX, Math.max(BLIND_INTERVAL_MINUTES_MIN, idx + 1));
    if (m !== lastEmitted.current) {
      lastEmitted.current = m;
      onChange(m);
    }
  }, [onChange]);

  const nudge = useCallback(
    (delta: number) => {
      const m = Math.min(
        BLIND_INTERVAL_MINUTES_MAX,
        Math.max(BLIND_INTERVAL_MINUTES_MIN, lastEmitted.current + delta),
      );
      scrollToMinute(m);
      lastEmitted.current = m;
      onChange(m);
    },
    [onChange, scrollToMinute],
  );

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex shrink-0 flex-col justify-center gap-1">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Decrease by one minute"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-slate-900/60 text-cyan-200 transition-colors hover:bg-cyan-500/15 hover:text-white"
        >
          <span className="text-lg leading-none" aria-hidden>
            −
          </span>
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Increase by one minute"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-slate-900/60 text-cyan-200 transition-colors hover:bg-cyan-500/15 hover:text-white"
        >
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
        </button>
      </div>
      <div className="relative min-w-0 flex-1">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 border-y border-cyan-500/35 bg-cyan-500/[0.08]"
          aria-hidden
        />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              nudge(-1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              nudge(1);
            } else if (e.key === 'PageUp') {
              e.preventDefault();
              nudge(-5);
            } else if (e.key === 'PageDown') {
              e.preventDefault();
              nudge(5);
            }
          }}
          className="relative z-0 h-[200px] overflow-y-auto overflow-x-hidden rounded-xl border border-cyan-500/25 bg-slate-900/60 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 [scrollbar-color:rgba(34,211,238,0.35)_transparent] [scrollbar-width:thin]"
          style={{
            scrollSnapType: 'y proximity',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
          }}
        >
          <div style={{ paddingTop: 80, paddingBottom: 80 }}>
            {minutes.map((m) => {
              const active = m === value;
              return (
                <button
                  key={m}
                  type="button"
                  style={{ height: BLIND_ROLODEX_ROW_PX, scrollSnapAlign: 'center' }}
                  onClick={() => {
                    scrollToMinute(m);
                    lastEmitted.current = m;
                    onChange(m);
                  }}
                  className={`flex w-full shrink-0 items-center justify-center text-sm font-semibold uppercase tracking-wide transition-colors ${
                    active ? 'text-cyan-200' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <span className="tabular-nums">{m}</span>
                  <span className="ml-1 text-[11px] font-medium opacity-80">min</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PokerTournamentCreator({ creatorAddress, onClose, onCreate, variant = 'modal' }: PokerTournamentCreatorProps) {
  const isAdmin = isAdminWallet(creatorAddress);
  const [name, setName] = useState('My Tournament');
  /** `null` until the user picks freeroll vs buy-in on the Type tab. */
  const [fundingKind, setFundingKind] = useState<'freeroll' | 'buyin' | null>(null);
  const isFreeroll = fundingKind === 'freeroll';
  /** After name + Proceed, other tabs unlock and Basics shows table settings. */
  const [tournamentSetupComplete, setTournamentSetupComplete] = useState(false);
  const [nameGateOpen, setNameGateOpen] = useState(false);
  /**
   * Where the freeroll prize comes from. Only meaningful when `isFreeroll === true`.
   *  - `chips`: creator's poker chip wallet is debited (default)
   *  - `platform_promo`: admin-only, debits the promo wallet
   *  - `custom_token`: any PRC-20 deposited into the on-chain escrow contract
   */
  const [prizeSource, setPrizeSource] = useState<PrizeSource>('chips');
  const [selectedToken, setSelectedToken] = useState<SelectedPrc20Token | null>(null);
  const [customTokenAmount, setCustomTokenAmount] = useState('');
  const [buyIn, setBuyIn] = useState('1000');
  /** When `fundingKind === 'buyin'`: poker chips vs custom PRC-20 paid into escrow per seat at join time. */
  const [buyInPrizeSource, setBuyInPrizeSource] = useState<BuyInPrizeSource>('chips');
  const [buyInTokenHumanAmount, setBuyInTokenHumanAmount] = useState('');
  const [guaranteedPool, setGuaranteedPool] = useState('5000');
  const [startingStack, setStartingStack] = useState<string>('10000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('10');
  /**
   * Tournament format. `sng` = single table (legacy, cap 10 players).
   * `mtt` = multi-table — lifts maxPlayers cap, exposes seatsPerTable, and the server
   * spins up `ceil(playerCount / seatsPerTable)` poker_tables on activation and
   * consolidates them as players bust.
   */
  const [tournamentFormat, setTournamentFormat] = useState<'sng' | 'mtt'>('sng');
  /** MTT only: seats per physical table (4–10). Default 9 = standard live poker. */
  const [seatsPerTable, setSeatsPerTable] = useState<number>(9);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  /**
   * Creator-chosen cut from the prize pool (integer 0–15). Default 2 matches pre-feature behavior.
   * Freerolls store the value but the server overrides payouts to 0% since the creator funded the pool.
   *
   * Mirrored into a ref so `buildCreateParams` reads the latest committed slider value even if a
   * batched render / stale closure window opens between "Review & create" and "Publish tournament".
   * The bug we hit before this guard: slider visually moved to 15% but the persisted row was 2%.
   */
  const [creatorFeePercent, setCreatorFeePercent] = useState<number>(CREATOR_FEE_DEFAULT);
  const creatorFeePercentRef = useRef<number>(CREATOR_FEE_DEFAULT);
  useEffect(() => {
    creatorFeePercentRef.current = creatorFeePercent;
  }, [creatorFeePercent]);
  const [botsToAdd, setBotsToAdd] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Two-step on-chain funding for custom-token freerolls.
  // 'idle' is the pre-funding state; 'approving'/'depositing' are mid-tx; 'approved' allows step 2;
  // 'creating' calls the server; 'failed' shows the reclaim button.
  const [fundingStep, setFundingStep] = useState<'idle' | 'wrapping' | 'wrapped' | 'approving' | 'approved' | 'depositing' | 'deposited' | 'creating' | 'failed'>('idle');
  /** Wei needed to wrap from native PLS → WPLS for the prize pool. null = not yet known; 0n = no wrap needed. */
  const [wrapShortfall, setWrapShortfall] = useState<bigint | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  /**
   * Stable across the entire funding flow: we generate the UUID once when the user
   * starts approve/deposit so that the bytes32 escrow key matches what we later send
   * to the server. Re-rolling on each click would orphan funded escrows.
   */
  const [fundingTournamentId, setFundingTournamentId] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address: connectedAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [activeTab, setActiveTab] = useState('type');
  const initialSchedule = useMemo(() => defaultScheduledFields(), []);
  const [scheduledDate, setScheduledDate] = useState(initialSchedule.date);
  const [scheduledTime, setScheduledTime] = useState(initialSchedule.time);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [blindIncreaseMode, setBlindIncreaseMode] = useState<PokerBlindIncreaseMode>('knockout');
  const [blindIntervalMinutes, setBlindIntervalMinutes] = useState<BlindIntervalMinutes>(15);
  const [prizePresetId, setPrizePresetId] = useState<PokerPrizePresetId>('podium_classic');
  const [created, setCreated] = useState<{ tournamentId: string; pinCode?: string | null } | null>(null);
  const [postCreateShareOpen, setPostCreateShareOpen] = useState(false);

  const confettiRef = useRef<ConfettiRef>(null);
  const scheduleSectionRef = useRef<HTMLDivElement>(null);
  const scheduleDateInputRef = useRef<HTMLInputElement>(null);
  const scheduleTimeInputRef = useRef<HTMLInputElement>(null);

  const minScheduleDate = useMemo(() => localYyyyMmDd(new Date()), []);

  useEffect(() => {
    if (!isFreeroll) setPrizeSource('chips');
  }, [isFreeroll]);

  useEffect(() => {
    if (isFreeroll) {
      setBuyInPrizeSource('chips');
      setBuyInTokenHumanAmount('');
    }
  }, [isFreeroll]);

  useEffect(() => {
    // Non-admins cannot select platform_promo; reset if they somehow ended up there.
    if (prizeSource === 'platform_promo' && !isAdmin) setPrizeSource('chips');
  }, [prizeSource, isAdmin]);

  useEffect(() => {
    if (!isAdmin) setBotsToAdd(0);
  }, [isAdmin]);

  useEffect(() => {
    const fallback = parseInt(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value, 10);
    const raw = parseInt(startingStack, 10) || fallback;
    const s = snapToNearestInList(raw, STARTING_STACK_SELECT_VALUES);
    if (String(s) !== startingStack) setStartingStack(String(s));
  }, [startingStack]);

  /** Custom-token amount in smallest unit (wei). 0n if invalid / not yet entered. */
  const customTokenAmountWei = useMemo<bigint>(() => {
    if (prizeSource !== 'custom_token' || !selectedToken || !customTokenAmount.trim()) return 0n;
    try {
      const dec = Math.min(18, Math.max(1, selectedToken.decimals));
      return parseUnits(customTokenAmount.trim(), dec);
    } catch {
      return 0n;
    }
  }, [prizeSource, selectedToken, customTokenAmount]);

  // Preflight WPLS shortfall for the custom-token freeroll prize pool.
  // Surfaced as a separate "Wrap PLS" button so the wrap → approve chain doesn't
  // run on the same gesture (mobile wallets dismiss the second popup otherwise).
  useEffect(() => {
    const isWplsPool =
      prizeSource === 'custom_token'
      && !!selectedToken
      && selectedToken.address.toLowerCase() === WPLS_TOKEN_ADDRESS.toLowerCase()
      && customTokenAmountWei > 0n;
    if (!isWplsPool || !publicClient || !connectedAddress) {
      setWrapShortfall(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sf = await getWplsShortfall({
          publicClient,
          owner: connectedAddress,
          requiredWei: customTokenAmountWei,
        });
        if (!cancelled) setWrapShortfall(sf);
      } catch {
        if (!cancelled) setWrapShortfall(0n);
      }
    })();
    return () => { cancelled = true; };
  }, [prizeSource, selectedToken, customTokenAmountWei, publicClient, connectedAddress]);

  const buyInTokenWei = useMemo<bigint>(() => {
    if (buyInPrizeSource !== 'custom_token_buyin' || !selectedToken || !buyInTokenHumanAmount.trim()) return 0n;
    try {
      const dec = Math.min(18, Math.max(1, selectedToken.decimals));
      return parseUnits(buyInTokenHumanAmount.trim(), dec);
    } catch {
      return 0n;
    }
  }, [buyInPrizeSource, selectedToken, buyInTokenHumanAmount]);

  /** Hard cap on tournament size in MTT mode. Practical bound to keep DB/WS load sensible. */
  const MTT_MAX_PLAYERS = 100;

  /**
   * Slots receiving prize money. Always capped at 10 — MTTs pay only top-10 regardless of
   * field size (matches `buildPrizePercents` and the server validator). For SNG this equals
   * the actual max table size.
   */
  const prizeSlotCount = useMemo(() => {
    const minP = Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2));
    const rawMax = parseInt(maxPlayers, 10);
    const maxPClamp = tournamentFormat === 'mtt' ? MTT_MAX_PLAYERS : 10;
    const maxP = Math.max(
      minP,
      Math.max(2, Math.min(maxPClamp, Number.isFinite(rawMax) ? rawMax : 10)),
    );
    // Prize slots themselves are capped at 10; MTT field can be larger.
    return Math.min(10, maxP);
  }, [minPlayers, maxPlayers, tournamentFormat]);

  /** Tournament field size (registrations cap). Diverges from prizeSlotCount only in MTT mode. */
  const effectiveMaxPlayers = useMemo(() => {
    const minP = Math.max(2, parseInt(minPlayers, 10) || 2);
    const rawMax = parseInt(maxPlayers, 10);
    const cap = tournamentFormat === 'mtt' ? MTT_MAX_PLAYERS : 10;
    return Math.max(minP, Math.max(2, Math.min(cap, Number.isFinite(rawMax) ? rawMax : 10)));
  }, [minPlayers, maxPlayers, tournamentFormat]);

  /** MTT only: how many tables the server will spin up given the field cap + seatsPerTable. */
  const projectedTableCount = useMemo(() => {
    if (tournamentFormat !== 'mtt') return 1;
    return Math.max(1, Math.ceil(effectiveMaxPlayers / seatsPerTable));
  }, [tournamentFormat, effectiveMaxPlayers, seatsPerTable]);

  const prizePercents = useMemo(
    () => buildPrizePercents(prizePresetId, prizeSlotCount),
    [prizePresetId, prizeSlotCount],
  );

  const prizeSum = prizePercents.reduce((a, b) => a + b, 0);

  /** Prize pool basis for the split preview: full-table buy-ins, chip guarantee, or custom token deposit. */
  const prizeSplitPoolPreview = useMemo((): PrizeSplitPoolPreview | null => {
    if (isFreeroll) {
      if (prizeSource === 'custom_token') {
        if (!selectedToken || customTokenAmountWei <= 0n) return null;
        const dec = Math.min(18, Math.max(0, Number.isFinite(selectedToken.decimals) ? selectedToken.decimals : 18));
        return {
          kind: 'erc20',
          poolWei: customTokenAmountWei,
          decimals: dec,
          symbol: selectedToken.symbol?.trim() || 'Token',
        };
      }
      const g = parsePositiveWholeChips(guaranteedPool);
      if (g <= 0n) return null;
      return { kind: 'chips', poolChips: g, approximate: false };
    }
    if (buyInPrizeSource === 'custom_token_buyin') {
      if (!selectedToken || buyInTokenWei <= 0n) return null;
      const dec = Math.min(18, Math.max(0, Number.isFinite(selectedToken.decimals) ? selectedToken.decimals : 18));
      return {
        kind: 'erc20',
        poolWei: buyInTokenWei * BigInt(prizeSlotCount),
        decimals: dec,
        symbol: selectedToken.symbol?.trim() || 'Token',
      };
    }
    const buy = parsePositiveWholeChips(buyIn);
    if (buy <= 0n) return null;
    return {
      kind: 'chips',
      poolChips: buy * BigInt(prizeSlotCount),
      approximate: true,
    };
  }, [isFreeroll, prizeSource, selectedToken, customTokenAmountWei, guaranteedPool, buyIn, prizeSlotCount, buyInPrizeSource, buyInTokenWei]);

  const level1Blinds = POKER_TOURNAMENT_DEFAULT_CONFIG.blindSchedule[0];
  const blindScheduleLadder = POKER_TOURNAMENT_DEFAULT_CONFIG.blindSchedule;
  const startingStackPreview = Math.max(
    100,
    parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
  );

  const schedulePreview = useMemo(() => {
    const local = parseLocalDateTime(scheduledDate, scheduledTime);
    if (!local) return null;
    return {
      weekday: format(local, 'EEEE'),
      dayLine: format(local, 'MMMM d, yyyy'),
      timeLine: format(local, 'h:mm a'),
    };
  }, [scheduledDate, scheduledTime]);

  useEffect(() => {
    if (!created) return;
    const id = window.setTimeout(() => {
      confettiRef.current?.fire({
        particleCount: 110,
        spread: 78,
        origin: { y: 0.55, x: 0.5 },
        ticks: 220,
        scalar: 1.05,
      });
      window.setTimeout(() => {
        confettiRef.current?.fire({
          particleCount: 60,
          spread: 100,
          origin: { x: 0.25, y: 0.65 },
          ticks: 180,
        });
        confettiRef.current?.fire({
          particleCount: 60,
          spread: 100,
          origin: { x: 0.75, y: 0.65 },
          ticks: 180,
        });
      }, 180);
    }, 80);
    return () => window.clearTimeout(id);
  }, [created]);

  const validateSchedule = (): string | null => {
    if (!scheduledDate.trim()) return 'Pick a start date.';
    const local = parseLocalDateTime(scheduledDate, scheduledTime);
    if (!local) return 'Pick a valid date and time.';
    if (local.getTime() < Date.now() + 60_000) return 'Start must be at least 1 minute from now.';
    return null;
  };

  /** Builds the params object for the server. Returns null if a precondition fails (e.g. invalid schedule). */
  const buildCreateParams = (
    extras: { customTokenEscrow?: CustomTokenEscrowFunding } = {},
  ): { params: CreatePokerTournamentParams; addBots: number } | null => {
    if (!name.trim() || !fundingKind) return null;
    const buyChips = isFreeroll ? 0n : parsePositiveWholeChips(buyIn);
    const guaranteeChips = isFreeroll && prizeSource !== 'custom_token' ? parsePositiveWholeChips(guaranteedPool) : 0n;
    if (!isFreeroll) {
      if (buyInPrizeSource === 'chips' && buyChips <= 0n) return null;
      if (buyInPrizeSource === 'custom_token_buyin' && (buyInTokenWei <= 0n || !selectedToken)) return null;
    }
    if (isFreeroll && prizeSource !== 'custom_token' && guaranteeChips <= 0n) return null;
    const pinDigits = privatePin.replace(/\D/g, '').slice(0, 12);
    const pinForCreate = isPrivate && pinDigits.length >= 4 ? pinDigits : undefined;

    const err = validateSchedule();
    setScheduleError(err);
    if (err) return null;

    const local = parseLocalDateTime(scheduledDate, scheduledTime)!;
    const scheduledStartAt = local.toISOString();

    let sourceField: {
      guaranteedPrizePoolSource?: 'platform_promo' | 'custom_token' | 'custom_token_buyin';
    } = {};
    let customTokenBuyInField: { customTokenBuyIn?: CustomTokenBuyInMeta } = {};
    if (isFreeroll) {
      if (prizeSource === 'platform_promo') sourceField = { guaranteedPrizePoolSource: 'platform_promo' };
      else if (prizeSource === 'custom_token') sourceField = { guaranteedPrizePoolSource: 'custom_token' };
    } else if (buyInPrizeSource === 'custom_token_buyin') {
      sourceField = { guaranteedPrizePoolSource: 'custom_token_buyin' };
      if (selectedToken) {
        customTokenBuyInField = {
          customTokenBuyIn: {
            tokenAddress: selectedToken.address,
            decimals: selectedToken.decimals,
            symbol: selectedToken.symbol,
            name: selectedToken.name,
          },
        };
      }
    }

    const buyInAmountStr = !isFreeroll
      ? buyInPrizeSource === 'custom_token_buyin'
        ? buyInTokenWei.toString()
        : buyChips.toString()
      : '0';
    return {
      params: {
        name: name.trim(),
        buyInAmount: buyInAmountStr,
        ...(isFreeroll && prizeSource !== 'custom_token'
          ? { guaranteedPrizePool: guaranteeChips.toString() }
          : {}),
        ...sourceField,
        ...customTokenBuyInField,
        ...(extras.customTokenEscrow ? { customTokenEscrow: extras.customTokenEscrow } : {}),
        prizeDistributionType: 'custom',
        prizePercentages: [...prizePercents],
        config: {
          ...POKER_TOURNAMENT_DEFAULT_CONFIG,
          startingStack: Math.max(
            100,
            parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
          ),
          minPlayers: Math.max(2, parseInt(minPlayers, 10) || 2),
          // MTT: maxPlayers may exceed 10 (the field cap), while prize slots stay at prizeSlotCount (≤10).
          // SNG: maxPlayers === prizeSlotCount, same as legacy.
          maxPlayers: effectiveMaxPlayers,
          blindIncreaseMode,
          ...(blindIncreaseMode === 'by_time' ? { blindIntervalMinutes } : {}),
          ...(tournamentFormat === 'mtt' ? { seatsPerTable } : {}),
        },
        isPrivate,
        ...(pinForCreate ? { pinCode: pinForCreate } : {}),
        scheduledStartAt,
        // Read via ref so we always pick up the latest slider position, even if React batched a
        // render between the slider's onChange and the click that opened the confirm modal.
        creatorFeePercent: clampCreatorFeePercent(creatorFeePercentRef.current),
      },
      addBots: isAdmin ? Math.max(0, Math.min(10, Math.floor(botsToAdd))) : 0,
    };
  };

  /** Chip / platform-promo path (no on-chain interaction). Identical to legacy behavior. */
  const handleCreate = async () => {
    const built = buildCreateParams();
    if (!built) return;
    setIsSubmitting(true);
    try {
      const result = await onCreate(built.params, { addBots: built.addBots });
      if (result?.tournamentId) {
        setCreated(result);
        setShowConfirm(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Custom-token funding flow (two wallet popups, then server create) ----

  /**
   * Step 0 (PLS only): wrap native PLS → WPLS for the shortfall. Surfaced as its
   * own button so the next approve popup gets a fresh user gesture (mobile wallets
   * dismiss popups when the gesture has decayed across an awaited receipt).
   */
  const handleWrapPls = async () => {
    if (!selectedToken || !publicClient || !connectedAddress) return;
    if (wrapShortfall == null || wrapShortfall <= 0n) return;
    setFundingError(null);
    setFundingStep('wrapping');
    try {
      const nativeBalance = await publicClient.getBalance({ address: connectedAddress });
      if (nativeBalance < wrapShortfall) {
        throw new Error(
          `Need ${wrapShortfall.toString()} more PLS to wrap, but wallet only has ${nativeBalance.toString()}.`,
        );
      }
      const hash = await writeContractAsync({
        address: WPLS_TOKEN_ADDRESS as `0x${string}`,
        abi: WPLS_DEPOSIT_ABI,
        functionName: 'deposit',
        value: wrapShortfall,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setWrapShortfall(0n);
      setFundingStep('wrapped');
    } catch (err) {
      setFundingError((err as Error).message ?? 'Wrap PLS failed');
      setFundingStep('idle');
    }
  };

  /**
   * Step 1: ERC20 approve. Must be triggered by a fresh user gesture so the wallet
   * popup actually appears (browser user-activation requirement).
   */
  const handleApproveCustomToken = async () => {
    if (!selectedToken || customTokenAmountWei <= 0n) return;
    setFundingError(null);
    // Fresh UUID per funding session — kept stable across approve/deposit/server-create/reclaim.
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      setFundingError('Your browser is missing crypto.randomUUID; please update to a modern browser.');
      return;
    }

    // Balance pre-flight at approve time: approving more than you own succeeds at the ERC20
    // level (allowances aren't bounded by balance), but the deposit step would then fail.
    // Catch it here so the user doesn't burn gas on a doomed approval.
    if (publicClient && connectedAddress) {
      try {
        const balance = (await publicClient.readContract({
          address: selectedToken.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [connectedAddress],
        })) as bigint;
        if (balance < customTokenAmountWei) {
          const dec = Math.min(18, Math.max(1, selectedToken.decimals));
          const have = (Number(balance) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 });
          const need = (Number(customTokenAmountWei) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 });
          setFundingError(
            `Insufficient ${selectedToken.symbol} balance. You have ${have} but need ${need}. ` +
            `Get more ${selectedToken.symbol} into this wallet, then retry.`,
          );
          return;
        }
      } catch (preErr) {
        // Non-fatal: if the read failed (RPC issue), let the user try anyway. The deposit
        // step has its own pre-flight + receipt check.
        console.warn('approve pre-flight balance read failed', preErr);
      }
    }

    const uuid = crypto.randomUUID();
    setFundingTournamentId(uuid);
    setFundingStep('approving');
    try {
      const hash = await writeContractAsync({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TOURNAMENT_PRIZE_ESCROW_ADDRESS, customTokenAmountWei],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setFundingStep('approved');
    } catch (err) {
      setFundingError((err as Error).message ?? 'Approval failed');
      setFundingStep('idle');
      setFundingTournamentId(null);
    }
  };

  /**
   * Step 2: deposit to escrow. Separate click so wallet popup is permitted again
   * (user gesture is consumed by the prior await).
   */
  const handleDepositCustomToken = async () => {
    if (!selectedToken || !fundingTournamentId || customTokenAmountWei <= 0n) return;
    setFundingError(null);
    setFundingStep('depositing');
    try {
      const bytes32Id = tournamentIdToBytes32(fundingTournamentId);

      // Pre-flight checks — catch the obvious failure modes BEFORE opening the wallet.
      // The contract reverts inside transferFrom for either of these, with no human-readable
      // reason in the receipt. Checking up front saves a wasted tx + gas + a confusing error.
      if (publicClient && connectedAddress) {
        try {
          const [balance, allowance, escrowPool] = await Promise.all([
            publicClient.readContract({
              address: selectedToken.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [connectedAddress],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: selectedToken.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [connectedAddress, TOURNAMENT_PRIZE_ESCROW_ADDRESS],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
              abi: tournamentPrizeEscrowV6Abi,
              functionName: 'getPool',
              args: [bytes32Id],
            }) as Promise<readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean]>,
          ]);
          if (balance < customTokenAmountWei) {
            const dec = Math.min(18, Math.max(1, selectedToken.decimals));
            const have = (Number(balance) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 });
            const need = (Number(customTokenAmountWei) / 10 ** dec).toLocaleString(undefined, { maximumFractionDigits: 4 });
            throw new Error(
              `Insufficient ${selectedToken.symbol} balance. You have ${have} but need ${need}. ` +
              `Get more ${selectedToken.symbol} into this wallet, then retry.`,
            );
          }
          if (allowance < customTokenAmountWei) {
            // Should not happen — step 1 should have approved this exact amount. Defensive.
            throw new Error(
              `Token allowance is too low (${allowance.toString()} < ${customTokenAmountWei.toString()}). ` +
              `Cancel and retry the create flow to re-approve.`,
            );
          }
          // bytes32 already occupied: pool token != 0x0 → contract will revert with "Already deposited".
          if (escrowPool[0] !== '0x0000000000000000000000000000000000000000') {
            throw new Error(
              `This tournament id has already been used on-chain (depositor: ${escrowPool[1]}). ` +
              `Hard-refresh the page to generate a fresh id and retry.`,
            );
          }
        } catch (preflightErr) {
          // Re-throw to the outer catch — UI lands in 'approved' so user can fix and retry the deposit step.
          throw preflightErr;
        }
      }

      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'depositPrizePool',
        args: [bytes32Id, selectedToken.address as `0x${string}`, customTokenAmountWei],
      });
      // Wait for the receipt AND verify it succeeded — `waitForTransactionReceipt`
      // resolves on a reverted tx too (status: 'reverted'). The pre-flight above catches
      // the common cases, but tokens can revert mid-tx for other reasons (rebase/fee-on-transfer/paused),
      // so we still validate the receipt before claiming success to the server.
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          throw new Error(
            `Deposit transaction reverted on-chain (tx: ${hash}). ` +
            `Possible causes: token has fee-on-transfer/rebase logic the escrow doesn't support, ` +
            `the token is paused, or your wallet was blacklisted by the token contract.`,
          );
        }
      }
      setDepositTxHash(hash);
      setFundingStep('deposited');
      // Fire the server create immediately — no wallet popup needed.
      await runServerCreateAfterDeposit(fundingTournamentId, hash);
    } catch (err) {
      setFundingError((err as Error).message ?? 'Deposit failed');
      setFundingStep('approved'); // allow retry of the deposit
    }
  };

  const runServerCreateAfterDeposit = async (uuid: string, txHash: string) => {
    if (!selectedToken) return;
    setFundingStep('creating');
    const built = buildCreateParams({
      customTokenEscrow: {
        tournamentId: uuid,
        txHash,
        tokenAddress: selectedToken.address,
        amount: customTokenAmountWei.toString(),
        decimals: selectedToken.decimals,
        symbol: selectedToken.symbol,
        name: selectedToken.name,
      },
    });
    if (!built) {
      setFundingError('Could not assemble tournament params (form changed?)');
      setFundingStep('failed');
      return;
    }
    try {
      const result = await onCreate(built.params, { addBots: built.addBots });
      if (result?.tournamentId) {
        setCreated(result);
        setShowConfirm(false);
        setFundingStep('idle');
      } else {
        setFundingError('Server did not return a tournament id');
        setFundingStep('failed');
      }
    } catch (err) {
      setFundingError((err as Error).message ?? 'Server create failed');
      setFundingStep('failed');
    }
  };

  /**
   * The user's funds are stuck in the escrow because the server rejected the create.
   * `creatorReclaim` returns the deposit; the contract enforces that only the depositor can call it.
   */
  const handleReclaimDeposit = async () => {
    if (!fundingTournamentId) return;
    setFundingError(null);
    try {
      const bytes32Id = tournamentIdToBytes32(fundingTournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'creatorReclaim',
        args: [bytes32Id],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      // Reset funding state — user can start over.
      setFundingStep('idle');
      setFundingTournamentId(null);
      setDepositTxHash(null);
      setShowConfirm(false);
    } catch (err) {
      setFundingError((err as Error).message ?? 'Reclaim failed');
    }
  };

  const fieldClass =
    'w-full rounded-xl bg-gray-950/60 border border-cyan-500/20 px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20';
  /** Native date/time controls often ignore `text-center`; WebKit needs the edit wrapper flex-centered. */
  const schedulePickerFieldClass = `${fieldClass} text-center [color-scheme:dark] [&::-webkit-datetime-edit]:text-center [&::-webkit-datetime-edit-fields-wrapper]:flex [&::-webkit-datetime-edit-fields-wrapper]:justify-center`;
  const labelClass = 'text-xs font-medium text-white/60 mb-1.5 block';

  const prizePresetLabel = findPokerPrizePresetMeta(prizePresetId)?.label ?? prizePresetId;

  const shareOverlaySnapshot = useMemo(() => {
    const local = parseLocalDateTime(scheduledDate, scheduledTime);
    const scheduleLine = local ? formatShareScheduleLine(local) : 'Start time: set on Start time tab';

    let shareTokenSymbol: string | null = null;
    let shareTokenLogoUrl: string | null = null;
    if (isFreeroll) {
      if (prizeSource === 'custom_token') {
        if (selectedToken) {
          shareTokenSymbol = selectedToken.symbol?.trim() || 'Token';
          shareTokenLogoUrl = selectedToken.logoUrl;
        }
      } else {
        shareTokenSymbol = 'MORBIUS';
        shareTokenLogoUrl = POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL;
      }
    } else if (buyInPrizeSource === 'custom_token_buyin') {
      if (selectedToken) {
        shareTokenSymbol = selectedToken.symbol?.trim() || 'Token';
        shareTokenLogoUrl = selectedToken.logoUrl;
      }
    } else {
      shareTokenSymbol = 'MORBIUS';
      shareTokenLogoUrl = POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL;
    }

    const pctCompact = prizePercents
      .filter((p) => p > 0)
      .map((p) => `${p}%`)
      .join(' · ');
    const payoutLine = pctCompact ? `${prizePresetLabel} · ${pctCompact}` : prizePresetLabel;

    let prizeLine = 'Set prize on Basics / Prizes';
    if (isFreeroll) {
      if (prizeSource === 'custom_token') {
        if (selectedToken && customTokenAmountWei > 0n) {
          const sym = selectedToken.symbol?.trim() || 'Token';
          const dec = Math.min(18, Math.max(0, Number.isFinite(selectedToken.decimals) ? selectedToken.decimals : 18));
          const amtHuman = formatUnits(customTokenAmountWei, dec);
          const num = Number(amtHuman);
          const shown =
            Number.isFinite(num) && amtHuman.includes('.')
              ? num.toLocaleString('en-US', { maximumFractionDigits: 8 })
              : amtHuman;
          prizeLine = `${shown} ${sym}`;
        } else {
          prizeLine = 'Custom token prize (Basics)';
        }
      } else {
        const g = parsePositiveWholeChips(guaranteedPool);
        prizeLine =
          g > 0n
            ? `${formatChips(g)} MORBIUS${prizeSource === 'platform_promo' ? ' · promo' : ''}`
            : 'Guaranteed MORBIUS (Basics)';
      }
    } else if (buyInPrizeSource === 'custom_token_buyin') {
      if (selectedToken && buyInTokenWei > 0n) {
        const sym = selectedToken.symbol?.trim() || 'Token';
        const dec = Math.min(18, Math.max(0, Number.isFinite(selectedToken.decimals) ? selectedToken.decimals : 18));
        const amtHuman = formatUnits(buyInTokenWei, dec);
        const num = Number(amtHuman);
        const perSeat =
          Number.isFinite(num) && amtHuman.includes('.')
            ? num.toLocaleString('en-US', { maximumFractionDigits: 8 })
            : amtHuman;
        prizeLine = `${perSeat} ${sym}/seat · up to ${prizeSlotCount} seats`;
      } else {
        prizeLine = 'Custom token buy-in (Basics)';
      }
    } else {
      const buy = parsePositiveWholeChips(buyIn);
      const pool = buy * BigInt(prizeSlotCount);
      prizeLine =
        buy > 0n
          ? `${formatChips(pool)} MORBIUS max · ${formatChips(buy)} MORBIUS × ${prizeSlotCount} seats`
          : 'Buy-in (Basics)';
    }

    return { scheduleLine, prizeLine, payoutLine, shareTokenSymbol, shareTokenLogoUrl };
  }, [
    scheduledDate,
    scheduledTime,
    prizePercents,
    prizePresetLabel,
    isFreeroll,
    prizeSource,
    selectedToken,
    customTokenAmountWei,
    guaranteedPool,
    buyIn,
    prizeSlotCount,
    buyInPrizeSource,
    buyInTokenWei,
  ]);

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <Confetti
          ref={confettiRef}
          manualstart
          className="pointer-events-none fixed inset-0 z-[51] h-full w-full"
        />
        <div
          className="relative z-[52] w-full max-w-md rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 overflow-hidden shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]"
        >
          <div
            className="absolute inset-x-0 top-0 z-0 h-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
            }}
          />
          <div className="relative text-center space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Tournament created</h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Your Sit & Go is scheduled. You can track it anytime from your creator dashboard.
            </p>
            {created.pinCode && (
              <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                Private PIN: <span className="font-mono font-semibold tracking-wider">{created.pinCode}</span>
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Link
                href="/creators"
                className="flex-1 text-center rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity"
              >
                Open creator dashboard
              </Link>
              <button
                type="button"
                onClick={() => setPostCreateShareOpen(true)}
                className="flex-1 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 transition-colors inline-flex items-center justify-center gap-2"
              >
                <IconShare className="h-4 w-4" aria-hidden />
                Share image
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        <PokerTournamentShareModal
          open={postCreateShareOpen}
          onClose={() => setPostCreateShareOpen(false)}
          tournamentName={name}
          isFreeroll={isFreeroll}
          scheduleLine={shareOverlaySnapshot.scheduleLine}
          prizeLine={shareOverlaySnapshot.prizeLine}
          payoutLine={shareOverlaySnapshot.payoutLine}
          shareTokenSymbol={shareOverlaySnapshot.shareTokenSymbol}
          shareTokenLogoUrl={shareOverlaySnapshot.shareTokenLogoUrl}
        />
      </div>
    );
  }

  if (!creatorAddress) {
    return (
      <CreatorShell
        variant={variant}
        modal={false}
        onClose={onClose}
        srTitle="Connect your wallet"
        srDescription="Connect a wallet to create a poker tournament."
      >
            <div
              className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 overflow-hidden shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]"
            >
              <div
                className="absolute inset-x-0 top-0 z-0 h-40 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
                }}
              />
              <div className="relative flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-white tracking-tight pr-2">Connect your wallet</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="relative text-sm text-white/70 leading-relaxed mb-4">
                Creating a tournament requires a connected wallet so you are recorded as the host and can sign on-chain buy-in or prize steps when needed.
              </p>
              <button
                type="button"
                onClick={() => openConnectModal?.()}
                className="relative w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity"
              >
                Connect wallet
              </button>
            </div>
      </CreatorShell>
    );
  }

  const createDisabled =
    isSubmitting
    || !tournamentSetupComplete
    || fundingKind == null
    || !name.trim()
    || prizeSum !== 100
    || prizePercents.length !== prizeSlotCount
    || (!isFreeroll && buyInPrizeSource === 'chips' && parsePositiveWholeChips(buyIn) <= 0n)
    || (!isFreeroll && buyInPrizeSource === 'custom_token_buyin' && (!selectedToken || buyInTokenWei <= 0n))
    || (isFreeroll && prizeSource === 'chips' && parsePositiveWholeChips(guaranteedPool) <= 0n)
    || (isFreeroll && prizeSource === 'platform_promo' && parsePositiveWholeChips(guaranteedPool) <= 0n)
    || (isFreeroll && prizeSource === 'custom_token' && (!selectedToken || customTokenAmountWei <= 0n));

  const pickFreeroll = () => {
    if (tournamentSetupComplete) {
      setFundingKind('freeroll');
      return;
    }
    setFundingKind('freeroll');
    setNameGateOpen(true);
  };

  const pickBuyIn = () => {
    if (tournamentSetupComplete) {
      setFundingKind('buyin');
      setSelectedToken(null);
      setCustomTokenAmount('');
      setBuyInTokenHumanAmount('');
      setBuyInPrizeSource('chips');
      setPrizeSource('chips');
      return;
    }
    setFundingKind('buyin');
    setSelectedToken(null);
    setCustomTokenAmount('');
    setBuyInTokenHumanAmount('');
    setBuyInPrizeSource('chips');
    setNameGateOpen(true);
  };

  return (
    <CreatorShell
      variant={variant}
      onClose={onClose}
      srTitle="Create a poker tournament"
      srDescription="Configure a scheduled Sit and Go: funding, blinds, prizes, and start time."
    >
      <div
        className={cn(
          'relative w-full max-w-xl flex flex-col rounded-2xl border border-cyan-500/30 bg-slate-950 overflow-hidden shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]',
          // In modal mode the panel is height-bound so the inner area scrolls inside it;
          // in page mode the panel grows naturally and the page itself scrolls.
          variant === 'modal' && 'max-h-[92vh]',
        )}
      >
        {/* Animated beams — matches EscrowBuyInJoinPanel theme. Low opacity so the dense tab content stays readable. */}
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40">
          <BackgroundBeams palette={{ primary: '#3B82F6', accent: '#A855F7', tail: '#EC4899' }} />
        </div>
        {/* Soft cyan/violet top glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
          }}
        />
        <div className="relative shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-cyan-500/20">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Create a poker tournament</h2>
            <p className="text-[11px] text-white/45 mt-0.5">Sit & Go · scheduled start · you host the table size and prizes</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('share')}
              disabled={!tournamentSetupComplete}
              className="rounded-lg p-1.5 text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-500/15 transition-colors disabled:pointer-events-none disabled:opacity-35 disabled:hover:bg-transparent"
              aria-label="Share tournament image"
              title={tournamentSetupComplete ? 'Open Share tab' : 'Finish Type tab setup to share'}
            >
              <IconShare className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto scroll-smooth overscroll-y-contain px-5 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="relative w-full overflow-hidden" style={POKER_BASICS_FAQ_PANEL_STYLE}>
              <div
                className="pointer-events-none absolute inset-0 rounded-[1rem] bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)]"
                aria-hidden
              />
              <TabsList className={cn('w-full', TAB_BAR)}>
                <TabsTrigger value="type" className={TAB_TRIGGER}>
                  Type
                </TabsTrigger>
                <TabsTrigger value="basics" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                  Basics
                </TabsTrigger>
                <TabsTrigger value="schedule" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                  Start time
                </TabsTrigger>
                <TabsTrigger value="rules" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                  Blinds
                </TabsTrigger>
                <TabsTrigger value="prizes" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                  Prizes
                </TabsTrigger>
                <TabsTrigger value="share" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                  Share
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="staff" disabled={!tournamentSetupComplete} className={TAB_TRIGGER}>
                    Staff
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="type" className="mt-4 space-y-4 outline-none">
              <p className="text-center text-sm text-white/70 leading-relaxed">
                Choose how this Sit & Go is funded. You will name the tournament next, then configure players, chips, and schedule on the Basics tab and beyond.
              </p>
              <div className="space-y-2">
                <p className="w-full text-center font-jost text-base font-bold uppercase tracking-[0.12em] text-white/95 sm:text-lg">
                  Pick one
                </p>
                <div
                  className="grid min-h-[11.5rem] grid-cols-2 items-stretch gap-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 sm:min-h-[12.5rem]"
                  role="group"
                  aria-label="Tournament funding type"
                >
                  <button
                    type="button"
                    onClick={pickFreeroll}
                    aria-pressed={fundingKind === 'freeroll'}
                    className={`relative h-full min-h-0 min-w-0 overflow-hidden border-r border-cyan-500/20 p-0 text-center transition-[box-shadow,filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 focus-visible:ring-inset ${
                      fundingKind === 'freeroll'
                        ? 'shadow-[inset_0_0_0_2px_rgba(6,182,212,0.45)]'
                        : 'hover:brightness-110'
                    }`}
                  >
                    <span className="sr-only">
                      Freeroll: creator funds the prize pool; users play free; any PRC-20 or MORBIUS.
                    </span>
                    <img
                      src="/images/poker-freeroll-type-promo.png"
                      alt=""
                      width={600}
                      height={400}
                      decoding="async"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none"
                    />
                    {fundingKind === 'freeroll' ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cyan-500/[0.12]"
                      />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={pickBuyIn}
                    aria-pressed={fundingKind === 'buyin'}
                    className={`relative h-full min-h-0 min-w-0 overflow-hidden p-0 text-center transition-[box-shadow,filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 focus-visible:ring-inset ${
                      fundingKind === 'buyin'
                        ? 'shadow-[inset_0_0_0_2px_rgba(6,182,212,0.45)]'
                        : 'hover:brightness-110'
                    }`}
                  >
                    <span className="sr-only">
                      Buy-in: creator rake; user buy-ins fund the prize pool; creator earns 2% of the prize pool; MORBIUS
                      only today; PRC-20 support coming soon.
                    </span>
                    <img
                      src="/images/poker-buyin-type-promo.png"
                      alt=""
                      width={600}
                      height={400}
                      decoding="async"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none"
                    />
                    {fundingKind === 'buyin' ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cyan-500/[0.12]"
                      />
                    ) : null}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => {
                    setIsPrivate(e.target.checked);
                    if (!e.target.checked) setPrivatePin('');
                  }}
                  className="rounded border-white/20 bg-gray-900"
                />
                <span className="text-sm text-white/90">Private tournament (PIN required to join)</span>
              </label>

              {isPrivate && (
                <div>
                  <label className={labelClass}>Room PIN</label>
                  <input
                    type="text"
                    value={privatePin}
                    onChange={(e) => setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="4–12 digits"
                    className={fieldClass}
                  />
                </div>
              )}

              {tournamentSetupComplete ? (
                <div>
                  <label
                    htmlFor="poker-tourney-name-type"
                    className="mb-1.5 block text-center font-jost text-sm font-bold text-white/95 sm:text-base"
                  >
                    Tournament name
                  </label>
                  <div className="relative w-full overflow-hidden" style={POKER_BASICS_FAQ_PANEL_STYLE}>
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[1rem] bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)]"
                      aria-hidden
                    />
                    <input
                      id="poker-tourney-name-type"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={cn(
                        'relative z-[1] w-full min-h-[52px] border-0 bg-transparent px-4 py-4 text-center font-jost text-lg font-semibold tracking-tight text-white placeholder:text-white/30',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 focus-visible:ring-inset',
                        'sm:min-h-[60px] sm:px-5 sm:py-[1.125rem] sm:text-2xl',
                      )}
                      maxLength={40}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-center text-[11px] text-white/45">
                  After you pick a model, a short step asks for the tournament name before the other tabs unlock.
                </p>
              )}
              <PokerTournamentTabFaqPanel idPrefix="type" entries={POKER_CREATOR_TYPE_FAQ} />
            </TabsContent>

            <TabsContent value="basics" className="mt-4 space-y-4 outline-none">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200/90">{name.trim() || '—'}</p>
                <p className="text-[10px] text-white/50 mt-0.5">
                  {isFreeroll ? 'Freeroll' : 'Buy-in'}
                  {isPrivate ? ' · private (PIN)' : ''} · edit name and privacy on the Type tab
                </p>
              </div>

              {isFreeroll && (
                <div className="space-y-3">
                  <label className={labelClass}>Prize source</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPrizeSource('chips')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'chips' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                    >
                      Poker chips
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setPrizeSource('platform_promo')}
                        className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'platform_promo' ? 'bg-amber-600/30 border-amber-500/50 text-amber-100' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                      >
                        Platform promo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrizeSource('custom_token')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'custom_token' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'} ${!isAdmin ? 'col-span-2' : ''}`}
                    >
                      Custom PRC-20 token
                    </button>
                  </div>
                  {prizeSource === 'custom_token' && (
                    <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-slate-900/60 p-3">
                      <p className="text-[11px] leading-relaxed text-white/70">
                        Pick any PulseChain token. You will approve and deposit the prize amount on-chain when you publish — two wallet popups, then the tournament is created.
                      </p>
                      <Prc20TokenPicker value={selectedToken} onChange={setSelectedToken} />
                      <div>
                        <label className={labelClass}>Prize amount (total pool)</label>
                        <input
                          type="text"
                          value={customTokenAmount}
                          onChange={(e) => setCustomTokenAmount(e.target.value)}
                          placeholder={selectedToken ? `Amount in ${selectedToken.symbol}` : 'Pick a token first'}
                          disabled={!selectedToken}
                          className={`${fieldClass} disabled:opacity-50`}
                        />
                        <CustomTokenUsdHint token={selectedToken} amount={customTokenAmount} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isFreeroll && (
                <div className="space-y-3">
                  <label className={labelClass}>Buy-in currency</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBuyInPrizeSource('chips')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${buyInPrizeSource === 'chips' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                    >
                      Poker chips
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuyInPrizeSource('custom_token_buyin')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${buyInPrizeSource === 'custom_token_buyin' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                    >
                      Custom PRC-20
                    </button>
                  </div>
                  {buyInPrizeSource === 'custom_token_buyin' && (
                    <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-slate-900/60 p-3">
                      <p className="text-[11px] leading-relaxed text-white/70">
                        Pick the token and buy-in per seat. Players pay into the prize escrow when they join — you are not charged when you publish this tournament.
                      </p>
                      <Prc20TokenPicker value={selectedToken} onChange={setSelectedToken} />
                      <div>
                        <label className={labelClass}>Buy-in per player</label>
                        <input
                          type="text"
                          value={buyInTokenHumanAmount}
                          onChange={(e) => setBuyInTokenHumanAmount(e.target.value)}
                          placeholder={selectedToken ? `Amount in ${selectedToken.symbol}` : 'Pick a token first'}
                          disabled={!selectedToken}
                          className={`${fieldClass} disabled:opacity-50`}
                        />
                        <CustomTokenUsdHint token={selectedToken} amount={buyInTokenHumanAmount} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-1 space-y-2">
                <label className={labelClass}>Format</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTournamentFormat('sng');
                      // Clamp maxPlayers back into SNG range when toggling.
                      const cur = parseInt(maxPlayers, 10);
                      if (!Number.isFinite(cur) || cur > 10) setMaxPlayers('10');
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${tournamentFormat === 'sng' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                  >
                    Single table (SNG)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTournamentFormat('mtt');
                      // Snap maxPlayers up to first MTT option if currently in SNG range.
                      const cur = parseInt(maxPlayers, 10);
                      if (!Number.isFinite(cur) || cur <= 10) setMaxPlayers(String(MTT_FIELD_SIZE_OPTIONS[0]));
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${tournamentFormat === 'mtt' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                  >
                    Multi-table (MTT)
                  </button>
                </div>
                {tournamentFormat === 'mtt' && (
                  <p className="text-[11px] leading-relaxed text-white/60">
                    {projectedTableCount} {projectedTableCount === 1 ? 'table' : 'tables'} of up to {seatsPerTable} seats. Tables consolidate to a final table at {Math.min(seatsPerTable, 9)} players. Top {prizeSlotCount} ranks paid.
                  </p>
                )}
              </div>

              {tournamentFormat === 'mtt' && (
                <div className="flex min-w-0 flex-col">
                  <label htmlFor="poker-mtt-seats-per-table" className={labelClass}>
                    Seats per table
                  </label>
                  <Select
                    value={String(seatsPerTable)}
                    onValueChange={(v) => {
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n)) setSeatsPerTable(Math.max(4, Math.min(10, n)));
                    }}
                  >
                    <SelectTrigger id="poker-mtt-seats-per-table" className={selectTriggerBasicsClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                      {MTT_SEATS_PER_TABLE_OPTIONS.map((n) => (
                        <SelectItem
                          key={n}
                          value={String(n)}
                          textValue={`${n}-max`}
                          className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                        >
                          {n}-max
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="flex min-w-0 flex-col">
                  <label htmlFor="poker-basics-min-players" className={labelClass}>
                    Min players
                  </label>
                  <Select
                    value={String(Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2)))}
                    onValueChange={(v) => {
                      const n = parseInt(v, 10);
                      setMinPlayers(String(n));
                      const mx = parseInt(maxPlayers, 10);
                      if (!Number.isFinite(mx) || mx < n) setMaxPlayers(String(n));
                    }}
                  >
                    <SelectTrigger id="poker-basics-min-players" className={selectTriggerBasicsClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                      {PLAYER_COUNT_OPTIONS.map((n) => (
                        <SelectItem
                          key={n}
                          value={String(n)}
                          textValue={`${n} players`}
                          className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                        >
                          {n} players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col">
                  <label htmlFor="poker-basics-max-players" className={labelClass}>
                    {tournamentFormat === 'mtt' ? 'Field cap' : 'Max players'}
                  </label>
                  <Select
                    value={String(effectiveMaxPlayers)}
                    onValueChange={(v) => {
                      const n = parseInt(v, 10);
                      setMaxPlayers(String(n));
                      const mn = parseInt(minPlayers, 10);
                      if (!Number.isFinite(mn) || mn > n) setMinPlayers(String(Math.min(n, 10)));
                    }}
                  >
                    <SelectTrigger id="poker-basics-max-players" className={selectTriggerBasicsClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                      {(tournamentFormat === 'mtt' ? MTT_FIELD_SIZE_OPTIONS : PLAYER_COUNT_OPTIONS).map((n) => (
                        <SelectItem
                          key={n}
                          value={String(n)}
                          textValue={`${n} players`}
                          className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                        >
                          {n} players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(isFreeroll ? prizeSource !== 'custom_token' : buyInPrizeSource === 'chips') && (
                  <div className="flex min-w-0 flex-col">
                    <label htmlFor="poker-basics-pool-buyin" className={labelClass}>
                      {isFreeroll ? 'Guaranteed prize pool' : 'Buy-in per player'}
                    </label>
                    <input
                      id="poker-basics-pool-buyin"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={isFreeroll ? guaranteedPool : buyIn}
                      placeholder={isFreeroll ? 'e.g. 5000' : 'e.g. 1000'}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        if (isFreeroll) setGuaranteedPool(digits);
                        else setBuyIn(digits);
                      }}
                      className={fieldClass}
                    />
                    <p className="mt-1 text-[10px] text-white/40">
                      Any whole number of chips. No cap.
                    </p>
                  </div>
                )}
                <div
                  className={cn(
                    'flex min-w-0 flex-col',
                    (isFreeroll && prizeSource === 'custom_token')
                    || (!isFreeroll && buyInPrizeSource === 'custom_token_buyin')
                      ? 'col-span-2'
                      : '',
                  )}
                >
                  <label htmlFor="poker-basics-starting-stack" className={labelClass}>
                    Starting stack
                  </label>
                  <Select
                    value={String(
                      snapToNearestInList(
                        Math.max(
                          100,
                          parseInt(startingStack, 10) ||
                            parseInt(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value, 10),
                        ),
                        STARTING_STACK_SELECT_VALUES,
                      ),
                    )}
                    onValueChange={(v) => setStartingStack(v)}
                  >
                    <SelectTrigger id="poker-basics-starting-stack" className={selectTriggerBasicsClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                      {STARTING_STACK_SELECT_VALUES.map((n) => (
                        <SelectItem
                          key={n}
                          value={String(n)}
                          textValue={`${n.toLocaleString()} chips`}
                          className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                        >
                          {n.toLocaleString()} chips
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <PokerTournamentBasicsFaqSection
                isFreeroll={isFreeroll}
                usesCustomTokenEscrowPool={isFreeroll && prizeSource === 'custom_token'}
                usesCustomTokenBuyIn={!isFreeroll && buyInPrizeSource === 'custom_token_buyin'}
              />
            </TabsContent>

            <TabsContent value="schedule" className="mt-4 space-y-4 outline-none">
              <div ref={scheduleSectionRef} className="flex flex-col items-center space-y-4 scroll-mt-6">
                <p className="w-full text-center text-xs font-semibold uppercase tracking-wide text-white/55">
                  When the table opens
                </p>
                {schedulePreview && (
                  <div className="relative mx-auto w-full max-w-md space-y-1 rounded-2xl border border-cyan-500/25 bg-slate-900/60 px-5 py-5 text-center shadow-[0_0_30px_-20px_rgba(34,211,238,0.5)]">
                    <div className="absolute inset-0 rounded-2xl pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.15),transparent_65%)]" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/90">Starts</p>
                    <p className="text-lg font-semibold text-white">{schedulePreview.weekday}</p>
                    <p className="text-sm text-white/70">{schedulePreview.dayLine}</p>
                    <p className="text-3xl font-bold tabular-nums text-white tracking-tight pt-1">{schedulePreview.timeLine}</p>
                    <p className="text-[11px] text-white/40 pt-2">Your local time · any minute</p>
                  </div>
                )}

                <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-4">
                  <div
                    className="min-w-0 cursor-pointer flex flex-col items-center"
                    onClick={() => openDateOrTimePicker(scheduleDateInputRef.current)}
                  >
                    <label htmlFor="poker-tourney-schedule-date" className={`${labelClass} w-full text-center`}>
                      Calendar date
                    </label>
                    <input
                      ref={scheduleDateInputRef}
                      id="poker-tourney-schedule-date"
                      type="date"
                      value={scheduledDate}
                      min={minScheduleDate}
                      onChange={(e) => {
                        setScheduledDate(e.target.value);
                        setScheduleError(null);
                      }}
                      className={schedulePickerFieldClass}
                    />
                  </div>
                  <div
                    className="min-w-0 cursor-pointer flex flex-col items-center"
                    onClick={() => openDateOrTimePicker(scheduleTimeInputRef.current)}
                  >
                    <label htmlFor="poker-tourney-schedule-time" className={`${labelClass} w-full text-center`}>
                      Clock time
                    </label>
                    <input
                      ref={scheduleTimeInputRef}
                      id="poker-tourney-schedule-time"
                      type="time"
                      step={60}
                      value={scheduledTime.length >= 5 ? scheduledTime.slice(0, 5) : scheduledTime}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) setScheduledTime(v.slice(0, 5));
                        setScheduleError(null);
                      }}
                      className={schedulePickerFieldClass}
                    />
                    <p className="mt-1.5 text-center text-[11px] text-white/40">Pick any hour and minute (local).</p>
                  </div>
                </div>
                {scheduleError && <p className="w-full text-center text-xs text-red-400">{scheduleError}</p>}
              </div>
              <PokerTournamentTabFaqPanel idPrefix="schedule" entries={POKER_CREATOR_SCHEDULE_FAQ} />
            </TabsContent>

            <TabsContent value="rules" className="mt-4 space-y-5 outline-none">
              <div className="flex flex-col items-center">
                <label className={`${labelClass} w-full text-center`}>How blinds increase</label>
                <div
                  className="mx-auto mt-1.5 grid w-full max-w-2xl grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label="How blinds increase"
                >
                  {BLIND_INCREASE_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={blindIncreaseMode === opt.id}
                      onClick={() => setBlindIncreaseMode(opt.id)}
                      className={`flex min-h-0 min-w-0 flex-col items-center rounded-lg border px-2 py-2.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 sm:px-2.5 sm:py-3 ${
                        blindIncreaseMode === opt.id
                          ? 'border-cyan-500/50 bg-cyan-600/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : 'border-white/10 bg-black/30 text-white/65 hover:border-white/20 hover:text-white/90'
                      }`}
                    >
                      <span className="text-[11px] font-semibold leading-tight text-white sm:text-xs">{opt.title}</span>
                      <ul className="m-0 mt-1.5 w-full max-w-[12.5rem] list-none space-y-1 p-0 text-left sm:max-w-[14rem]">
                        {opt.bullets.map((line, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-[9px] leading-snug text-white/70 sm:text-[10px]"
                          >
                            <span className="mt-[0.2em] shrink-0 font-bold text-cyan-400/90" aria-hidden>
                              •
                            </span>
                            <span className="min-w-0">{line}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
                {blindIncreaseMode === 'by_time' && (
                  <div className="mx-auto mt-3 flex w-full max-w-md flex-col items-center text-center">
                    <label className={`${labelClass} w-full text-center`}>Time per blind level</label>
                    <div className="w-full">
                      <BlindIntervalRolodex value={blindIntervalMinutes} onChange={setBlindIntervalMinutes} />
                    </div>
                    <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-white/45">
                      Scroll the list or use ± to pick {BLIND_INTERVAL_MINUTES_MIN}–{BLIND_INTERVAL_MINUTES_MAX} minutes (default
                      15). Each level lasts that long, then the next blind level begins on the timer.
                    </p>
                  </div>
                )}
                <div className="mx-auto mt-3 w-full max-w-2xl space-y-2">
                  <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">
                    Blind schedule
                  </p>
                  <p className="text-center text-[11px] leading-snug text-white/50 px-1">
                    {blindIncreaseMode === 'knockout' &&
                      'Blinds move to the next row when a player is eliminated (not on a fixed timer or hand count).'}
                    {blindIncreaseMode === 'by_hand' &&
                      'After each level, blinds stay fixed for the number of completed hands in the last column, then jump to the next row.'}
                    {blindIncreaseMode === 'by_time' &&
                      `Each level lasts ${blindIntervalMinutes} minutes of real time, then blinds bump to the next row regardless of hands played.`}
                  </p>
                  <div className="rounded-lg overflow-hidden border border-white/10 bg-slate-900/60 text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-white/50 border-b border-white/10">
                          <th className="py-2 px-2 font-medium">Level</th>
                          <th className="py-2 px-2 font-medium">Small</th>
                          <th className="py-2 px-2 font-medium">Big</th>
                          {blindIncreaseMode === 'by_hand' && (
                            <th className="py-2 px-2 font-medium">Hands / level</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {blindScheduleLadder.map((row) => (
                          <tr key={row.level} className="border-b border-white/5 last:border-0">
                            <td className="py-1.5 px-2 tabular-nums">{row.level}</td>
                            <td className="py-1.5 px-2 tabular-nums">{formatChips(row.smallBlind)}</td>
                            <td className="py-1.5 px-2 tabular-nums">{formatChips(row.bigBlind)}</td>
                            {blindIncreaseMode === 'by_hand' && (
                              <td className="py-1.5 px-2 tabular-nums text-white/85">
                                {row.handsPerLevel >= 900 ? 'Until next bump' : row.handsPerLevel}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <PokerTournamentTabFaqPanel idPrefix="rules" entries={POKER_CREATOR_RULES_FAQ} />
            </TabsContent>

            <TabsContent value="prizes" className="mt-4 space-y-4 outline-none">
              {/*
                Creator fee slider. Buy-in tournaments only — freerolls already pay the creator
                via the prize pool they funded, so the server overrides their fee to 0% at payout.
              */}
              {!isFreeroll && (() => {
                const pct = clampCreatorFeePercent(creatorFeePercent);
                const totalFee = pct + PLATFORM_FEE_BUYIN_PERCENT;
                const toWinners = Math.max(0, 100 - totalFee);
                return (
                  <div className="rounded-xl border border-cyan-500/25 bg-black/30 p-4 space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor="poker-creator-fee" className={labelClass}>
                        Your cut per buy-in
                      </label>
                      <span className="font-mono tabular-nums text-cyan-300 text-lg font-bold">
                        {pct}%
                      </span>
                    </div>
                    <input
                      id="poker-creator-fee"
                      type="range"
                      min={CREATOR_FEE_MIN}
                      max={CREATOR_FEE_MAX}
                      step={1}
                      value={pct}
                      onChange={(e) => setCreatorFeePercent(clampCreatorFeePercent(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                      aria-label={`Creator fee percent (${CREATOR_FEE_MIN}–${CREATOR_FEE_MAX})`}
                    />
                    <div className="flex justify-between text-[10px] text-white/45 font-mono tabular-nums">
                      <span>{CREATOR_FEE_MIN}%</span>
                      <span>{CREATOR_FEE_MAX}%</span>
                    </div>
                    <div className="rounded-md bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-white/70 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Platform fee</span>
                        <span className="font-mono tabular-nums text-white/85">{PLATFORM_FEE_BUYIN_PERCENT}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Your fee</span>
                        <span className="font-mono tabular-nums text-cyan-300">{pct}%</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-1 mt-1 font-semibold">
                        <span className="text-white/90">To winners</span>
                        <span className="font-mono tabular-nums text-emerald-300">{toWinners}%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-white/40">
                      Deducted from the total prize pool before payouts. Players see this in the lobby before they join.
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className={labelClass}>Prize split preset</label>
                <Select value={prizePresetId} onValueChange={(v) => setPrizePresetId(v as PokerPrizePresetId)}>
                  <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                    {POKER_PRIZE_PRESET_LIST.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        textValue={`${p.label} ${p.shortDescription}`}
                        className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                      >
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-[10px] text-white/45">{p.shortDescription}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-white/45 mt-1.5">
                  Percents apply to paid finishing positions for up to {prizeSlotCount} seats. Presets always total 100%.
                </p>
              </div>

              <div className="rounded-xl overflow-visible border border-white/10 bg-slate-900/60">
                <PrizeSplit3DPie
                  percents={prizePercents}
                  poolPreview={prizeSplitPoolPreview}
                  // Only attach the fee ring for buy-in tournaments — freerolls override creator
                  // fee to 0% at payout (creator funded the pool themselves) so showing a fee ring
                  // there would be misleading.
                  platformFeePercent={!isFreeroll ? PLATFORM_FEE_BUYIN_PERCENT : undefined}
                  creatorFeePercent={!isFreeroll ? clampCreatorFeePercent(creatorFeePercent) : undefined}
                />
              </div>
              <PokerTournamentTabFaqPanel idPrefix="prizes" entries={POKER_CREATOR_PRIZES_FAQ} />
            </TabsContent>

            <TabsContent value="share" className="mt-4 space-y-4 outline-none">
              <PokerTournamentSharePanel
                tournamentName={name}
                isFreeroll={isFreeroll}
                scheduleLine={shareOverlaySnapshot.scheduleLine}
                prizeLine={shareOverlaySnapshot.prizeLine}
                payoutLine={shareOverlaySnapshot.payoutLine}
                shareTokenSymbol={shareOverlaySnapshot.shareTokenSymbol}
                shareTokenLogoUrl={shareOverlaySnapshot.shareTokenLogoUrl}
              />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="staff" className="mt-4 space-y-5 outline-none">
                <div>
                  <label className={labelClass}>Auto-join bot count (after create)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={botsToAdd}
                    onChange={(e) => setBotsToAdd(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                    className={fieldClass}
                  />
                  <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                    Staff only: server bots fill empty seats once the tournament exists. Players never see this option.
                  </p>
                </div>
                <PokerTournamentTabFaqPanel idPrefix="staff" entries={POKER_CREATOR_STAFF_FAQ} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="relative shrink-0 flex gap-3 px-5 py-4 border-t border-cyan-500/20 bg-slate-950/60 backdrop-blur-sm">
          <MorbSecondaryButton
            type="button"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </MorbSecondaryButton>
          <MorbGradientButton
            type="button"
            onClick={() => {
              const e = validateSchedule();
              setScheduleError(e);
              if (e) {
                setActiveTab('schedule');
                window.setTimeout(() => {
                  scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 0);
              } else setShowConfirm(true);
            }}
            disabled={createDisabled}
            loading={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? 'Creating…' : 'Review & create'}
          </MorbGradientButton>
        </div>

        {nameGateOpen ? (
          <div
            className="absolute inset-0 z-[70] flex items-center justify-center p-5 bg-black/75 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="poker-tourney-name-gate-title"
          >
            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 p-5 shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]">
              <div
                className="absolute inset-x-0 top-0 z-0 h-32 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
                }}
              />
              <div className="relative space-y-4">
                <div>
                  <h3 id="poker-tourney-name-gate-title" className="text-base font-bold text-white text-center tracking-tight">
                    Name your tournament
                  </h3>
                  <p className="mt-1 text-center text-[11px] text-white/55">
                    {fundingKind === 'freeroll' ? 'Freeroll — you fund the prize pool.' : 'Buy-in — pool comes from player entries (MORBIUS).'}
                  </p>
                </div>
                <div>
                  <label htmlFor="poker-tourney-name-gate-input" className={`${labelClass} text-center`}>
                    Tournament name
                  </label>
                  <input
                    id="poker-tourney-name-gate-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`${fieldClass} text-center`}
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNameGateOpen(false);
                      if (!tournamentSetupComplete) setFundingKind(null);
                    }}
                    className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!name.trim()}
                    onClick={() => {
                      if (!name.trim()) return;
                      setNameGateOpen(false);
                      setTournamentSetupComplete(true);
                      setActiveTab('basics');
                    }}
                    className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showConfirm && (() => {
        const local = parseLocalDateTime(scheduledDate, scheduledTime);
        const scheduleDisplay = local
          ? local.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '—';
        const topSplit = prizePercents
          .map((p, i) => (p > 0 ? `${finishOrdinal(i + 1)} ${p}%` : null))
          .filter(Boolean)
          .slice(0, 5)
          .join(', ');

        // Custom-token path: dedicated two-step funder card. Wallet pops twice (approve, deposit),
        // then server is called automatically. On server failure, user can reclaim the deposit.
        if (isFreeroll && prizeSource === 'custom_token') {
          return (
            <CustomTokenFunderCard
              token={selectedToken}
              amount={customTokenAmount}
              amountWei={customTokenAmountWei}
              tournamentName={name || '—'}
              scheduleDisplay={scheduleDisplay}
              prizeSplitPreview={topSplit || '—'}
              fundingStep={fundingStep}
              fundingError={fundingError}
              wrapShortfall={wrapShortfall}
              onWrap={() => void handleWrapPls()}
              onApprove={() => void handleApproveCustomToken()}
              onDeposit={() => void handleDepositCustomToken()}
              onReclaim={() => void handleReclaimDeposit()}
              onCancel={() => {
                if (fundingStep === 'idle') setShowConfirm(false);
              }}
              canCancel={fundingStep === 'idle'}
            />
          );
        }

        const prizeRow = isFreeroll
          ? {
              label: 'Guaranteed pool',
              value: `${guaranteedPool} chips${prizeSource === 'platform_promo' ? ' · platform-funded' : ''}`,
              accent: 'yellow' as const,
            }
          : buyInPrizeSource === 'custom_token_buyin' && selectedToken && buyInTokenWei > 0n
            ? {
                label: 'Buy-in',
                value: `${formatUnits(buyInTokenWei, Math.min(18, Math.max(1, selectedToken.decimals)))} ${selectedToken.symbol?.trim() || 'Token'} per player (on-chain)`,
                accent: 'yellow' as const,
              }
            : { label: 'Buy-in', value: `${buyIn} chips`, accent: 'yellow' as const };

        return (
          <ConfirmActionCard
            title="Create poker SNG"
            subtitle="Double-check before you publish"
            rows={[
              { label: 'Name', value: name || '—', accent: 'white' },
              prizeRow,
              { label: 'Starting stack', value: `${startingStackPreview.toLocaleString()} chips`, accent: 'green' },
              { label: 'Opening blinds', value: `${level1Blinds.smallBlind} / ${level1Blinds.bigBlind}`, accent: 'cyan' },
              { label: 'Players', value: `${minPlayers}–${maxPlayers}`, accent: 'white' },
              { label: 'Prize preset', value: prizePresetLabel, accent: 'cyan' },
              { label: 'Split preview', value: topSplit || '—', accent: 'white' },
              // Surface the creator fee here so it's visible BEFORE publish — the value the user sees here is
              // exactly what the server will receive (read from the same ref in buildCreateParams).
              ...(!isFreeroll
                ? [{
                    label: 'Your fee',
                    value: `${clampCreatorFeePercent(creatorFeePercentRef.current)}% of each buy-in`,
                    accent: 'cyan' as const,
                  }]
                : []),
              { label: 'Starts', value: scheduleDisplay, accent: 'white' },
              { label: 'Private', value: isPrivate ? 'Yes (PIN required)' : 'No', accent: 'white' },
              ...(isAdmin && botsToAdd > 0
                ? [{ label: 'Staff bots', value: String(botsToAdd), accent: 'yellow' as const }]
                : []),
            ]}
            onBack={() => setShowConfirm(false)}
            onConfirm={() => {
              void handleCreate();
            }}
            confirmLabel="Publish tournament"
            isLoading={isSubmitting}
          />
        );
      })()}
    </CreatorShell>
  );
}

/** Two-step funder for custom-token freerolls: approve → deposit → (server creates) → done/failed. */
function CustomTokenFunderCard({
  token,
  amount,
  amountWei,
  tournamentName,
  scheduleDisplay,
  prizeSplitPreview,
  fundingStep,
  fundingError,
  wrapShortfall,
  onWrap,
  onApprove,
  onDeposit,
  onReclaim,
  onCancel,
  canCancel,
}: {
  token: SelectedPrc20Token | null;
  amount: string;
  amountWei: bigint;
  tournamentName: string;
  scheduleDisplay: string;
  prizeSplitPreview: string;
  fundingStep: 'idle' | 'wrapping' | 'wrapped' | 'approving' | 'approved' | 'depositing' | 'deposited' | 'creating' | 'failed';
  fundingError: string | null;
  /** Wei needed to wrap PLS → WPLS. null = unknown / not WPLS. >0 = surface a wrap step. */
  wrapShortfall: bigint | null;
  onWrap: () => void;
  onApprove: () => void;
  onDeposit: () => void;
  onReclaim: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const wrapNeeded =
    wrapShortfall != null
    && wrapShortfall > 0n
    && fundingStep !== 'wrapped'
    && fundingStep !== 'approving'
    && fundingStep !== 'approved'
    && fundingStep !== 'depositing'
    && fundingStep !== 'deposited'
    && fundingStep !== 'creating';
  if (!token || amountWei <= 0n) return null;

  type StepKey = 'wrap' | 'approve' | 'deposit' | 'create';
  type StepState = 'pending' | 'active' | 'complete' | 'failed';

  const wrapState: StepState =
    fundingStep === 'wrapping' ? 'active'
      : fundingStep === 'wrapped' || (wrapShortfall === 0n && fundingStep !== 'idle') ? 'complete'
        : 'pending';
  const approveState: StepState =
    fundingStep === 'idle' || fundingStep === 'wrapping' || fundingStep === 'wrapped' ? 'pending'
      : fundingStep === 'approving' ? 'active'
        : 'complete';
  const depositState: StepState =
    fundingStep === 'idle' || fundingStep === 'wrapping' || fundingStep === 'wrapped' || fundingStep === 'approving' ? 'pending'
      : fundingStep === 'approved' ? 'pending'
        : fundingStep === 'depositing' ? 'active'
          : fundingStep === 'deposited' || fundingStep === 'creating' ? 'complete'
            : fundingStep === 'failed' ? 'complete'
              : 'pending';
  const createState: StepState =
    fundingStep === 'creating' ? 'active'
      : fundingStep === 'failed' ? 'failed'
        : fundingStep === 'idle' || fundingStep === 'wrapping' || fundingStep === 'wrapped' || fundingStep === 'approving' || fundingStep === 'approved' || fundingStep === 'depositing' ? 'pending'
          : 'complete';

  // Step list — mirror EscrowBuyInJoinPanel's numbered-circle + connector tracker.
  const includeWrap = wrapNeeded || fundingStep === 'wrapping' || fundingStep === 'wrapped';
  const steps: Array<{ key: StepKey; label: string; state: StepState }> = [
    ...(includeWrap ? [{ key: 'wrap' as const, label: 'Wrap PLS', state: wrapState }] : []),
    { key: 'approve', label: 'Approve', state: approveState },
    { key: 'deposit', label: 'Deposit', state: depositState },
    { key: 'create', label: 'Create', state: createState },
  ];

  const symbolBadge = (token.symbol ?? '?').slice(0, 4).toUpperCase();
  const initial = symbolBadge.charAt(0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]">
        {/* Animated beams + soft top glow — matches the join panel */}
        <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
          <BackgroundBeams palette={{ primary: '#3B82F6', accent: '#A855F7', tail: '#EC4899' }} />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
          }}
        />

        <div className="relative z-10 p-5 space-y-5">
          {/* Token spotlight */}
          <div className="flex flex-col items-center text-center pt-2">
            <div className="relative">
              <div
                className="absolute -inset-3 rounded-full blur-2xl opacity-70"
                style={{
                  background:
                    'conic-gradient(from 0deg, #18CCFC, #6344F5, #AE48FF, #18CCFC)',
                }}
              />
              <div className="relative h-20 w-20 rounded-full ring-2 ring-cyan-400/60 bg-slate-900 overflow-hidden flex items-center justify-center">
                <span className="text-2xl font-extrabold tracking-tight text-white/90">{initial}</span>
              </div>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Fund prize pool</div>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="font-mono tabular-nums text-3xl font-bold text-white">{amount}</span>
              <span className="text-sm font-semibold text-cyan-200/90">{token.symbol}</span>
            </div>
            <p className="mt-2 text-[11px] text-white/55 max-w-[28ch]">
              {wrapNeeded
                ? 'Three wallet popups — wrap PLS, approve, then deposit. Each step needs its own tap.'
                : 'Two wallet popups — approve, then deposit. Tournament is created automatically once the deposit confirms.'}
            </p>
          </div>

          {/* Tournament details */}
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-[11px] text-slate-300 space-y-1">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Tournament</span><span className="text-white font-medium truncate">{tournamentName}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Token</span><span className="text-cyan-200">{token.symbol}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Starts</span><span className="text-white">{scheduleDisplay}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Split</span><span className="text-white truncate">{prizeSplitPreview}</span></div>
          </div>

          {/* Step tracker — numbered circles with connector lines (matches join panel) */}
          <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-3">
            <div className="flex items-center justify-between">
              {steps.map((s, i) => {
                const isLast = i === steps.length - 1;
                const circleBase = 'relative h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all';
                const circleCls =
                  s.state === 'complete'
                    ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                    : s.state === 'active'
                      ? 'bg-cyan-500 text-white shadow-[0_0_14px_rgba(34,211,238,0.7)]'
                      : s.state === 'failed'
                        ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.6)]'
                        : 'bg-slate-800 text-slate-500 ring-1 ring-white/10';
                const labelCls =
                  s.state === 'complete'
                    ? 'text-emerald-300'
                    : s.state === 'active'
                      ? 'text-cyan-200'
                      : s.state === 'failed'
                        ? 'text-red-300'
                        : 'text-slate-500';
                const connectorCls =
                  s.state === 'complete' || s.state === 'active' ? 'bg-cyan-400/60' : 'bg-white/10';
                return (
                  <React.Fragment key={s.key}>
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className={`${circleBase} ${circleCls}`}>
                        {s.state === 'active' ? (
                          <span className="absolute inset-0 rounded-full animate-ping bg-cyan-400/40" />
                        ) : null}
                        <span className="relative">
                          {s.state === 'complete' ? '✓' : s.state === 'failed' ? '×' : i + 1}
                        </span>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider truncate max-w-full px-1 ${labelCls}`}>
                        {s.label}
                      </span>
                    </div>
                    {!isLast ? (
                      <span className={`h-px flex-1 mx-1 transition-colors ${connectorCls}`} />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {fundingError ? (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2 break-words">
              {fundingError}
            </p>
          ) : null}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {wrapNeeded && fundingStep !== 'wrapping' && (
              <MorbGradientButton type="button" onClick={onWrap} className="w-full">
                Wrap PLS
              </MorbGradientButton>
            )}
            {fundingStep === 'wrapping' && (
              <MorbGradientButton type="button" disabled loading className="w-full">
                Wrapping PLS…
              </MorbGradientButton>
            )}
            {(fundingStep === 'idle' || fundingStep === 'wrapped') && !wrapNeeded && (
              <MorbGradientButton type="button" onClick={onApprove} className="w-full">
                Approve {token.symbol}
              </MorbGradientButton>
            )}
            {fundingStep === 'approving' && (
              <MorbGradientButton type="button" disabled loading className="w-full">
                Waiting for approval…
              </MorbGradientButton>
            )}
            {fundingStep === 'approved' && (
              <MorbGradientButton type="button" onClick={onDeposit} className="w-full">
                Deposit & create
              </MorbGradientButton>
            )}
            {fundingStep === 'depositing' && (
              <MorbGradientButton type="button" disabled loading className="w-full">
                Depositing on-chain…
              </MorbGradientButton>
            )}
            {(fundingStep === 'deposited' || fundingStep === 'creating') && (
              <MorbGradientButton type="button" disabled loading className="w-full">
                Creating tournament…
              </MorbGradientButton>
            )}
            {fundingStep === 'failed' && (
              <button
                type="button"
                onClick={onReclaim}
                className="relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/40"
              >
                Reclaim deposit
              </button>
            )}
            <MorbSecondaryButton
              type="button"
              onClick={onCancel}
              disabled={!canCancel}
              className="w-full"
            >
              {canCancel ? 'Back' : 'Funding in progress…'}
            </MorbSecondaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
