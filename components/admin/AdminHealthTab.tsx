'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatEther, parseEther } from 'viem';
import { Activity, RefreshCw, CheckCircle, XCircle, Copy, Loader2, Gift, X } from 'lucide-react';
import { Tooltip, Legend, ResponsiveContainer, Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  BLACKJACK_ADDRESS,
  BLACKJACK_LEGACY_ADDRESS,
  BLACKJACK_LEGACY_ADDRESS_2,
  BLACKJACK_LEGACY_ADDRESS_3,
  BLACKJACK_LEGACY_ADDRESS_4,
  BLACKJACK_LEGACY_ADDRESS_5,
  BLACKJACK_LEGACY_ADDRESS_6,
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  BIGWHEEL_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  MORBIUS_STAKING_ADDRESS,
  MORBIUS_LP_STAKING_ADDRESS,
  MERKLE_CLAIM_MORBIUS_ADDRESS,
  MERKLE_CLAIM_LP_ADDRESS,
  MORBIUS_WPLS_V1_PAIR,
  TOURNAMENT_PRIZE_ESCROW_ADDRESS,
  MORBIUS_TOURNAMENT_ADDRESS,
  MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
} from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { KENO_ABI } from '@/lib/keno-abi';
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55';
import { blackjackAbi } from '@/abi/blackjack';
import { ERC20_ABI } from '@/abi/erc20';
import { pulsechain } from '@/lib/chains';
import { toast } from 'sonner';

export interface BlackjackContractReserves {
  contractAddress: string;
  label: string;
  totalMorbiusInContract: string;
  addressesWithReserve: Array<{ address: string; reserve: string }>;
}

export interface AdminHealthData {
  api: string;
  ws: string;
  games: Record<string, { rpc: 'ok' | 'fail'; error?: string }>;
  morbius: Record<string, string>;
  /** Per-contract reserves: current + legacy 1–3 (when configured) */
  blackjackReservesByContract?: BlackjackContractReserves[];
  /** @deprecated Use blackjackReservesByContract */
  blackjackReserves?: {
    totalMorbiusInContract: string;
    addressesWithReserve: Array<{ address: string; reserve: string }>;
  };
  contractAddresses?: Record<string, string>;
  /** Hot wallet used for withdrawals (when HOT_WALLET_PRIVATE_KEY is set) */
  hotWalletAddress?: string;
  hotWalletMorbius?: string;
  hotWalletLowWarning?: boolean;
  /** Treasury / platform fee / distribution addresses and MORBIUS balance */
  treasuryWallets?: Array<{ label: string; address: string; morbiusWei: string }>;
  /** Blackjack all-time deposits and withdrawals (from chain scan) */
  blackjackDeposited?: string;
  blackjackWithdrawn?: string;
  /** Time-bucketed: allTime, 1h, 24h, 7d */
  blackjackTimeframes?: Record<string, { deposited: string; withdrawn: string }>;
}

function formatMorbius(wei: string): string {
  if (wei == null || wei === '') return '0';
  try {
    const n = Number(formatEther(BigInt(wei)));
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return n.toFixed(2);
  } catch {
    return '0';
  }
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    toast.success('Copied to clipboard', { duration: 1500 });
  });
}


function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

// Hot wallet address (withdrawals) — shown even when backend omits it
const HOT_WALLET_ADDRESS = '0x8f6Dc8FD8A5115fdec3CCbE36BE6cf9B28635F2e' as `0x${string}`;

// Treasury / fee / distribution addresses (fallback when backend does not return treasuryWallets)
const TREASURY_WALLET_ADDRESSES = [
  { label: 'Treasury', address: '0x41682815B05fE6b54a6C0f8813bB99423EE0309D' as `0x${string}` },
  { label: 'Platform fee wallet', address: '0x41682815B05fE6b54a6C0f8813bB99423EE0309D' as `0x${string}` },
  { label: 'Distribution recipient', address: '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2' as `0x${string}` },
];

// BigWheel ABI for getGlobalStats + admin (pause/withdraw)
const BIGWHEEL_GET_GLOBAL_STATS_ABI = [
  {
    inputs: [],
    name: 'getGlobalStats',
    outputs: [
      { internalType: 'uint256', name: 'spins', type: 'uint256' },
      { internalType: 'uint256', name: 'volume', type: 'uint256' },
      { internalType: 'uint256', name: 'payouts', type: 'uint256' },
      { internalType: 'uint256', name: 'contractBalance', type: 'uint256' },
      { internalType: 'uint256', name: 'contractReserveBalance', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'paused', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'emergencyPause', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'emergencyUnpause', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'emergencyWithdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

type FundableGameKey = 'plinko' | 'keno' | 'lottery' | 'bigwheel' | 'blackjack';

const FUNDABLE_GAMES: { key: FundableGameKey; label: string; address: `0x${string}`; useFundContract: boolean; useDepositMorbius?: boolean }[] = [
  { key: 'plinko', label: 'Plinko', address: PLINKO_ADDRESS as `0x${string}`, useFundContract: true },
  { key: 'keno', label: 'Keno', address: KENO_ADDRESS as `0x${string}`, useFundContract: true },
  { key: 'lottery', label: 'Lottery (instant)', address: LOTTERY_INSTANT_ADDRESS as `0x${string}`, useFundContract: true },
  { key: 'bigwheel', label: 'Big Wheel', address: BIGWHEEL_ADDRESS as `0x${string}`, useFundContract: false },
  { key: 'blackjack', label: 'Blackjack', address: BLACKJACK_ADDRESS as `0x${string}`, useFundContract: false, useDepositMorbius: true },
];

/** Last N days in YYYY-MM-DD, then formatted for display (e.g. "3/4"). */
function getLast7Days(): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    out.push({ date, label });
  }
  return out;
}

// ── Snapshot types ──────────────────────────────────────────────────────────

interface ContractSnapshot {
  snapshot_date: string;
  game: string;
  total_wagered: string;
  total_payouts: string;
  contract_reserve: string;
}

interface ContractSnapshotHourly {
  snapshot_hour: string;
  game: string;
  total_wagered: string;
  total_payouts: string;
  contract_reserve: string;
}

/** Last 24 hours (hour buckets), label e.g. "0h" … "23h" or "14:00". */
function getLast24Hours(): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(d.getHours() - i, 0, 0, 0);
    const hourKey = d.toISOString().slice(0, 13) + ':00:00.000Z';
    const label = `${d.getHours()}h`;
    out.push({ date: hourKey, label });
  }
  return out;
}

function normalizeHourKey(isoOrPg: string): string {
  const d = new Date(isoOrPg);
  return d.toISOString().slice(0, 13) + ':00:00.000Z';
}

/** Build per-game hourly chart data from hourly snapshots. Reserve = point-in-time; single/dual = deltas. */
function buildGameChartDataHourly(
  hours: { date: string; label: string }[],
  snapshots: ContractSnapshotHourly[],
  game: string,
): {
  single:  { date: string; label: string; value: number }[];
  dual:    { date: string; label: string; wagers: number; payouts: number }[];
  reserve: { date: string; label: string; value: number }[];
} {
  const byHour = new Map<string, ContractSnapshotHourly>();
  for (const s of snapshots) {
    if (s.game === game) byHour.set(normalizeHourKey(s.snapshot_hour), s);
  }

  let prevWagered = 0n;
  let prevPayouts = 0n;

  const single:  { date: string; label: string; value: number }[] = [];
  const dual:   { date: string; label: string; wagers: number; payouts: number }[] = [];
  const reserve: { date: string; label: string; value: number }[] = [];

  for (const hour of hours) {
    const snap = byHour.get(hour.date);
    const curWagered = snap ? BigInt(snap.total_wagered) : prevWagered;
    const curPayouts = snap ? BigInt(snap.total_payouts) : prevPayouts;
    const curReserve = snap ? BigInt(snap.contract_reserve) : 0n;

    const deltaWagered = curWagered > prevWagered ? curWagered - prevWagered : 0n;
    const deltaPayouts = curPayouts > prevPayouts ? curPayouts - prevPayouts : 0n;
    const deltaRevenue = deltaWagered > deltaPayouts ? deltaWagered - deltaPayouts : 0n;

    single.push({ ...hour, value: Number(formatEther(deltaRevenue)) });
    dual.push({ ...hour, wagers: Number(formatEther(deltaWagered)), payouts: Number(formatEther(deltaPayouts)) });
    reserve.push({ ...hour, value: Number(formatEther(curReserve)) });

    prevWagered = curWagered;
    prevPayouts = curPayouts;
  }

  return { single, dual, reserve };
}

/** Build per-game daily chart data from DB snapshots.
 *  Computes day-over-day DELTA of cumulative totals so each bar represents
 *  actual activity on that calendar day, not the running total.
 *  Days with no snapshot carry the previous day's cumulative (delta = 0). */
function buildGameChartData(
  days: { date: string; label: string }[],
  snapshots: ContractSnapshot[],
  game: string,
): {
  single:  { date: string; label: string; value: number }[];
  dual:    { date: string; label: string; wagers: number; payouts: number }[];
  reserve: { date: string; label: string; value: number }[];
} {
  const byDate = new Map<string, ContractSnapshot>();
  for (const s of snapshots) {
    if (s.game === game) byDate.set(s.snapshot_date, s);
  }

  let prevWagered = 0n;
  let prevPayouts = 0n;

  const single:  { date: string; label: string; value: number }[] = [];
  const dual:    { date: string; label: string; wagers: number; payouts: number }[] = [];
  const reserve: { date: string; label: string; value: number }[] = [];

  for (const day of days) {
    const snap = byDate.get(day.date);
    const curWagered = snap ? BigInt(snap.total_wagered) : prevWagered;
    const curPayouts = snap ? BigInt(snap.total_payouts) : prevPayouts;
    const curReserve = snap ? BigInt(snap.contract_reserve) : 0n;

    const deltaWagered = curWagered > prevWagered ? curWagered - prevWagered : 0n;
    const deltaPayouts = curPayouts > prevPayouts ? curPayouts - prevPayouts : 0n;
    const deltaRevenue = deltaWagered > deltaPayouts ? deltaWagered - deltaPayouts : 0n;

    single.push({ ...day, value: Number(formatEther(deltaRevenue)) });
    dual.push({ ...day, wagers: Number(formatEther(deltaWagered)), payouts: Number(formatEther(deltaPayouts)) });
    reserve.push({ ...day, value: Number(formatEther(curReserve)) });

    prevWagered = curWagered;
    prevPayouts = curPayouts;
  }

  return { single, dual, reserve };
}

const CHART_HEIGHT = 140;

/** Single-series daily area chart (Revenue or Reserve). */
function DailySingleChart({
  title,
  data,
  gradientId,
  dataKey,
}: {
  title: string;
  data: { date: string; label: string; value: number }[];
  gradientId: string;
  dataKey: string;
}) {
  if (!data.length) return null;
  return (
    <div
      className="rounded-lg border border-cyan-500/20 p-2"
      style={{
        background: '#000',
        boxShadow: 'inset 0 2px 8px rgba(0, 255, 255, 0.05), 0 0 20px rgba(0, 0, 0, 0.8)',
      }}
    >
      <p className="text-cyan-400 text-[10px] font-semibold mb-1 tracking-wide truncate">{title}</p>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 255, 255, 0.35)" />
              <stop offset="100%" stopColor="rgba(0, 255, 255, 0.02)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 8, fill: 'rgba(0, 255, 255, 0.6)', fontFamily: 'monospace' }}
            stroke="rgba(0, 255, 255, 0.15)"
            axisLine={{ stroke: 'rgba(0, 255, 255, 0.15)' }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            width={32}
            tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v)))}
          />
          <Tooltip
            contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: 8, fontSize: 10 }}
            labelStyle={{ color: 'rgba(34, 211, 238, 0.9)' }}
            formatter={(value: number) => [value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(2)}k` : value.toFixed(2), dataKey]}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="#22d3ee"
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series daily area chart (Payouts vs Wagers). */
function DailyDualChart({
  title,
  data,
  gradientIdWagers,
  gradientIdPayouts,
}: {
  title: string;
  data: { date: string; label: string; wagers: number; payouts: number }[];
  gradientIdWagers: string;
  gradientIdPayouts: string;
}) {
  if (!data.length) return null;
  return (
    <div
      className="rounded-lg border border-cyan-500/20 p-2"
      style={{
        background: '#000',
        boxShadow: 'inset 0 2px 8px rgba(0, 255, 255, 0.05), 0 0 20px rgba(0, 0, 0, 0.8)',
      }}
    >
      <p className="text-cyan-400 text-[10px] font-semibold mb-1 tracking-wide truncate">{title}</p>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
          <defs>
            <linearGradient id={gradientIdWagers} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.4)" />
              <stop offset="100%" stopColor="rgba(34, 211, 238, 0.02)" />
            </linearGradient>
            <linearGradient id={gradientIdPayouts} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 197, 94, 0.35)" />
              <stop offset="100%" stopColor="rgba(34, 197, 94, 0.02)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 8, fill: 'rgba(0, 255, 255, 0.6)', fontFamily: 'monospace' }}
            stroke="rgba(0, 255, 255, 0.15)"
            axisLine={{ stroke: 'rgba(0, 255, 255, 0.15)' }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            width={32}
            tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v)))}
          />
          <Tooltip
            contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: 8, fontSize: 10 }}
            labelStyle={{ color: 'rgba(34, 211, 238, 0.9)' }}
            formatter={(value: number, name: string) => [value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(2)}k` : value.toFixed(2), name === 'wagers' ? 'Wagers' : 'Payouts']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 9 }} formatter={(v) => (v === 'wagers' ? 'Wagers' : 'Payouts')} />
          <Area type="monotone" dataKey="wagers" stroke="#22d3ee" fill={`url(#${gradientIdWagers})`} strokeWidth={1.5} isAnimationActive={false} name="wagers" />
          <Area type="monotone" dataKey="payouts" stroke="#22c55e" fill={`url(#${gradientIdPayouts})`} strokeWidth={1.5} isAnimationActive={false} name="payouts" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const HEALTH_CARD_CLASS = 'rounded-xl border border-slate-700/60 bg-slate-900/70 p-4 flex flex-col gap-3';

/** Single wallet row (hot or treasury) as a small card. */
function WalletCard({ label, address, morbiusWei, lowWarning }: { label: string; address: string; morbiusWei: string; lowWarning?: boolean }) {
  return (
    <div className={HEALTH_CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">{label}</span>
        <button
          type="button"
          onClick={() => copyToClipboard(address)}
          className="font-mono text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1 shrink-0"
          title="Copy address"
        >
          <Copy className="w-3 h-3" />
          {truncateAddress(address, 5, 4)}
        </button>
      </div>
      <div>
        <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">MORBIUS</p>
        <p className="text-xl font-bold text-white tabular-nums leading-none">{formatMorbius(morbiusWei)}</p>
        {lowWarning && <span className="text-amber-400 text-[10px]">Low balance</span>}
      </div>
    </div>
  );
}

/** One fundable game (Plinko, Keno, etc.) as a card: reserve, fund input, Approve/Fund, Pause/Withdraw. */
function FundableGameCard({
  game,
  reserve,
  fundAmount,
  onFundAmountChange,
  onApprove,
  onFund,
  onPause,
  onUnpause,
  onWithdraw,
  isFunding,
  isActioning,
  actionType,
  paused,
  showPauseWithdraw,
}: {
  game: (typeof FUNDABLE_GAMES)[number];
  reserve: string;
  fundAmount: string;
  onFundAmountChange: (v: string) => void;
  onApprove: () => void;
  onFund: () => void;
  onPause: () => void;
  onUnpause: () => void;
  onWithdraw: () => void;
  isFunding: boolean;
  isActioning: boolean;
  actionType: 'pause' | 'unpause' | 'withdraw' | null;
  paused: boolean;
  showPauseWithdraw: boolean;
}) {
  return (
    <div className={HEALTH_CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">{game.label}</span>
        <button
          type="button"
          onClick={() => copyToClipboard(game.address)}
          className="font-mono text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1 shrink-0"
          title="Copy address"
        >
          <Copy className="w-3 h-3" />
          {truncateAddress(game.address, 5, 4)}
        </button>
      </div>
      <div>
        <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">In contract</p>
        <p className="text-2xl font-bold text-white tabular-nums leading-none">{formatMorbius(reserve)}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">MORBIUS</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder="Amount"
          value={fundAmount}
          onChange={(e) => onFundAmountChange(e.target.value)}
          className="h-8 w-24 text-[11px] font-mono bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[10px] border-slate-600 text-slate-300 hover:bg-slate-700"
          onClick={onApprove}
          disabled={isFunding}
        >
          {isFunding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approve'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white"
          onClick={onFund}
          disabled={isFunding}
        >
          {isFunding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fund'}
        </Button>
        {showPauseWithdraw && (
          <>
            {paused ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[10px] border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                onClick={onUnpause}
                disabled={isActioning}
              >
                {isActioning && actionType === 'unpause' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Unpause'}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[10px] border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                onClick={onPause}
                disabled={isActioning}
              >
                {isActioning && actionType === 'pause' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pause'}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-[10px] border-red-500/50 text-red-400 hover:bg-red-500/20"
              onClick={onWithdraw}
              disabled={isActioning || !fundAmount.trim()}
            >
              {isActioning && actionType === 'withdraw' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Withdraw'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Merged card: all Blackjack contracts (current + legacy) in one card with expandable sections. */
function BlackjackContractsMergedCard({ contracts }: { contracts: BlackjackContractReserves[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  if (contracts.length === 0) return null;
  return (
    <div className={HEALTH_CARD_CLASS}>
      <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">Blackjack contracts</p>
      <div className="space-y-3">
        {contracts.map((contract) => {
          const isExpanded = expandedKey === contract.contractAddress;
          return (
            <div key={contract.contractAddress} className="border-b border-slate-700/50 pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wide">{contract.label}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(contract.contractAddress)}
                  className="font-mono text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1"
                  title="Copy address"
                >
                  <Copy className="w-3 h-3" />
                  {truncateAddress(contract.contractAddress, 5, 4)}
                </button>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[10px] text-slate-500">Reserves</span>
                <span className="text-lg font-bold text-white tabular-nums">{formatMorbius(contract.totalMorbiusInContract)} MORBIUS</span>
              </div>
              {contract.addressesWithReserve.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : contract.contractAddress)}
                    className="text-[10px] text-slate-500 hover:text-cyan-300 text-left mt-1"
                  >
                    {contract.addressesWithReserve.length} player{contract.addressesWithReserve.length !== 1 ? 's' : ''} with reserve {isExpanded ? '▲' : '▼'}
                  </button>
                  {isExpanded && (
                    <ul className="space-y-1 text-[10px] font-mono text-slate-400 max-h-28 overflow-y-auto mt-2 pl-1 border-l border-slate-700/50">
                      {contract.addressesWithReserve.map(({ address: addr, reserve }) => (
                        <li key={addr} className="flex justify-between gap-2">
                          <button type="button" onClick={() => copyToClipboard(addr)} className="hover:text-cyan-300 flex items-center gap-1">
                            <Copy className="w-2.5 h-2.5 shrink-0" />
                            {addr.slice(0, 8)}…{addr.slice(-6)}
                          </button>
                          <span className="text-slate-300 tabular-nums shrink-0">{formatMorbius(reserve)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminHealthTab() {
  const { address } = useAccount();
  const [data, setData] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundAmounts, setFundAmounts] = useState<Record<FundableGameKey, string>>({ plinko: '', keno: '', lottery: '', bigwheel: '', blackjack: '' });
  const [fundingGame, setFundingGame] = useState<FundableGameKey | null>(null);
  const [actionGame, setActionGame] = useState<FundableGameKey | null>(null);
  const [actionType, setActionType] = useState<'pause' | 'unpause' | 'withdraw' | null>(null);
  const [snapshots, setSnapshots] = useState<ContractSnapshot[]>([]);
  const [hourlySnapshots, setHourlySnapshots] = useState<ContractSnapshotHourly[]>([]);
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'hourly'>('daily');
  const [bjTimeframe, setBjTimeframe] = useState<'allTime' | '1h' | '24h' | '7d'>('allTime');
  const [rewardsClaimsOpen, setRewardsClaimsOpen] = useState(false);
  const [rewardsClaimsLoading, setRewardsClaimsLoading] = useState(false);
  const [rewardsClaimsData, setRewardsClaimsData] = useState<{
    holderClaims: Array<{ walletAddress: string; rewardAmount: string; claimedAt: string; epochNumber: number }>;
    lpClaims: Array<{ walletAddress: string; rewardAmount: string; claimedAt: string; epochNumber: number }>;
  } | null>(null);
  const [rewardsClaimsError, setRewardsClaimsError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  // On-chain contract reads for movement charts
  const { data: plinkoStats } = useReadContract({
    address: PLINKO_ADDRESS,
    abi: PLINKO_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint, bigint, bigint] | undefined };

  const { data: kenoStats } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint] | undefined };

  const { data: kenoReserve } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getContractReserve',
  }) as { data: bigint | undefined };

  const { data: lotteryCollected } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'totalWagered',
  }) as { data: bigint | undefined };

  const { data: lotteryClaimed } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    functionName: 'totalPayouts',
  }) as { data: bigint | undefined };

  const { data: bigWheelStats } = useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint, bigint, bigint] | undefined };

  const { data: bjTotalPayouts } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalOffChainPayouts',
  }) as { data: bigint | undefined };

  const { data: bjBurnFees } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalBurnFeesCollected',
  }) as { data: bigint | undefined };

  const { data: bjDistFees } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalDistributionFeesCollected',
  }) as { data: bigint | undefined };

  const { data: bjLpFees } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalLpDistributionFeesCollected',
  }) as { data: bigint | undefined };

  const { data: bjPlatformFees } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalPlatformFeesCollected',
  }) as { data: bigint | undefined };

  const { data: bjTotalReserves } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalReserves',
  }) as { data: bigint | undefined };

  const { data: plinkoPaused } = useReadContract({
    address: PLINKO_ADDRESS,
    abi: PLINKO_ABI,
    functionName: 'paused',
  }) as { data: boolean | undefined };

  const { data: kenoPaused } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'paused',
  }) as { data: boolean | undefined };

  const { data: bigWheelPaused } = useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
    functionName: 'paused',
  }) as { data: boolean | undefined };

  const { data: blackjackPaused } = useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'paused',
  }) as { data: boolean | undefined };

  // Client-side MORBIUS balance for treasury addresses (fallback when backend omits treasuryWallets)
  const { data: treasuryBal0 } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [TREASURY_WALLET_ADDRESSES[0].address],
  }) as { data: bigint | undefined };
  const { data: treasuryBal1 } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [TREASURY_WALLET_ADDRESSES[1].address],
  }) as { data: bigint | undefined };
  const { data: treasuryBal2 } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [TREASURY_WALLET_ADDRESSES[2].address],
  }) as { data: bigint | undefined };

  // Hot wallet MORBIUS balance (client-side so row always shows even when backend omits it)
  const { data: hotWalletMorbiusClient } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [HOT_WALLET_ADDRESS],
  }) as { data: bigint | undefined };

  // Hot wallet row: prefer server data; fallback to known address + client-side balance
  const hotWalletDisplay = useMemo((): { address: string; morbiusWei: string; lowWarning?: boolean } | null => {
    if (data?.hotWalletAddress != null) {
      return {
        address: data.hotWalletAddress,
        morbiusWei: data.hotWalletMorbius ?? '0',
        lowWarning: data.hotWalletLowWarning,
      };
    }
    return {
      address: HOT_WALLET_ADDRESS,
      morbiusWei: hotWalletMorbiusClient != null ? String(hotWalletMorbiusClient) : '0',
    };
  }, [data?.hotWalletAddress, data?.hotWalletMorbius, data?.hotWalletLowWarning, hotWalletMorbiusClient]);

  // Prefer server treasuryWallets; fallback to client-side balances so section always shows
  const treasuryWalletsDisplay = useMemo(() => {
    const fromServer = data?.treasuryWallets;
    if (fromServer && fromServer.length > 0) return fromServer;
    return TREASURY_WALLET_ADDRESSES.map((w, i) => {
      const bal = [treasuryBal0, treasuryBal1, treasuryBal2][i];
      return { label: w.label, address: w.address, morbiusWei: bal != null ? String(bal) : '0' };
    });
  }, [data?.treasuryWallets, treasuryBal0, treasuryBal1, treasuryBal2]);

  const plinkoData = plinkoStats ? {
    totalRevenue: plinkoStats[2],
    totalPayouts: plinkoStats[3],
    contractReserve: plinkoStats[4],
  } : null;

  const kenoData = kenoStats ? {
    totalWagered: kenoStats[0],
    totalWon: kenoStats[1],
  } : null;

  const lotteryData = (lotteryCollected != null || lotteryClaimed != null) ? {
    totalCollected: lotteryCollected ?? 0n,
    totalClaimed: lotteryClaimed ?? 0n,
  } : null;

  const bigWheelData = bigWheelStats ? {
    volume: bigWheelStats[1],
    payouts: bigWheelStats[2],
    contractBalance: bigWheelStats[3],
  } : null;

  // Games shown in overview cards (on-chain current totals, same as before)
  const overviewGames = useMemo(() => {
    const games: { key: string; label: string; wagersWei: bigint; payoutsWei: bigint }[] = [];
    if (plinkoData) {
      games.push({ key: 'plinko', label: 'Plinko', wagersWei: plinkoData.totalRevenue + plinkoData.totalPayouts, payoutsWei: plinkoData.totalPayouts });
    }
    if (kenoData) {
      games.push({ key: 'keno', label: 'Keno', wagersWei: kenoData.totalWagered, payoutsWei: kenoData.totalWon });
    }
    if (lotteryData) {
      games.push({ key: 'lottery', label: 'Lottery', wagersWei: lotteryData.totalCollected, payoutsWei: lotteryData.totalClaimed });
    }
    if (bjTotalPayouts != null && bjBurnFees != null && bjDistFees != null && bjLpFees != null && bjPlatformFees != null) {
      const bjRevenue = bjBurnFees + bjDistFees + bjLpFees + bjPlatformFees;
      games.push({ key: 'blackjack', label: 'Blackjack', wagersWei: bjRevenue + bjTotalPayouts, payoutsWei: bjTotalPayouts });
    }
    return games;
  }, [plinkoData, kenoData, lotteryData, bjTotalPayouts, bjBurnFees, bjDistFees, bjLpFees, bjPlatformFees]);

  const CHART_GAMES = useMemo(() => [
    { key: 'plinko', label: 'Plinko' },
    { key: 'keno', label: 'Keno' },
    { key: 'lottery', label: 'Lottery' },
    { key: 'blackjack', label: 'Blackjack' },
    { key: 'bigwheel', label: 'Big Wheel' },
  ], []);

  // Chart data — daily (7 days) or hourly (24h) from DB snapshots
  const chartData = useMemo(() => {
    if (chartGranularity === 'hourly') {
      const hours = getLast24Hours();
      return { games: CHART_GAMES.map((g) => ({ ...g, ...buildGameChartDataHourly(hours, hourlySnapshots, g.key) })) };
    }
    const days = getLast7Days();
    return { games: CHART_GAMES.map((g) => ({ ...g, ...buildGameChartData(days, snapshots, g.key) })) };
  }, [chartGranularity, snapshots, hourlySnapshots, CHART_GAMES]);

  const fetchHealth = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch('/api/admin/health', { headers: { 'x-admin-wallet': address } }),
        fetch('/api/admin/analytics/contract-snapshots?days=7', { headers: { 'x-admin-wallet': address } }),
      ]);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const json = await healthRes.json();
      setData(json);
      if (snapshotRes.ok) {
        const snap = await snapshotRes.json();
        setSnapshots(snap.snapshots ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load health');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Fetch hourly snapshots when viewing hourly charts
  useEffect(() => {
    if (chartGranularity !== 'hourly' || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/analytics/contract-snapshots?granularity=hour&hours=24', {
          headers: { 'x-admin-wallet': address },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setHourlySnapshots(json.snapshots ?? []);
      } catch {
        if (!cancelled) setHourlySnapshots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [chartGranularity, address]);

  const fetchRewardsClaims = useCallback(async () => {
    if (!address) return;
    setRewardsClaimsLoading(true);
    setRewardsClaimsError(null);
    try {
      const res = await fetch('/api/admin/rewards/claims?limit=50', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRewardsClaimsData(json);
    } catch (e) {
      setRewardsClaimsError(e instanceof Error ? e.message : 'Failed to load claims');
      setRewardsClaimsData(null);
    } finally {
      setRewardsClaimsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (rewardsClaimsOpen && address) fetchRewardsClaims();
  }, [rewardsClaimsOpen, address, fetchRewardsClaims]);

  const handleApprove = useCallback(
    async (gameKey: FundableGameKey) => {
      const game = FUNDABLE_GAMES.find((g) => g.key === gameKey);
      if (!game || !address) return;
      setFundingGame(gameKey);
      try {
        await writeContractAsync({
          address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [game.address, MAX_UINT256],
          chain: pulsechain,
          account: address,
          maxPriorityFeePerGas: 40_000n,
        } as any);
        toast.success(`${game.label}: MORBIUS approved`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Approve failed';
        toast.error(msg);
      } finally {
        setFundingGame(null);
      }
    },
    [address, writeContractAsync]
  );

  const handleFund = useCallback(
    async (gameKey: FundableGameKey) => {
      const game = FUNDABLE_GAMES.find((g) => g.key === gameKey);
      const amountStr = fundAmounts[gameKey]?.trim();
      if (!game || !address || !amountStr) {
        toast.error('Enter an amount');
        return;
      }
      let amount: bigint;
      try {
        amount = parseEther(amountStr);
      } catch {
        toast.error('Invalid amount');
        return;
      }
      if (amount <= 0n) {
        toast.error('Amount must be > 0');
        return;
      }
      setFundingGame(gameKey);
      try {
        if (game.useDepositMorbius) {
          await writeContractAsync({
            address: game.address,
            abi: blackjackAbi,
            functionName: 'depositMORBIUS',
            args: [amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else if (game.useFundContract) {
          const abi = gameKey === 'lottery' ? INSTANT_LOTTERY_6OF55_ABI : gameKey === 'plinko' ? PLINKO_ABI : KENO_ABI;
          await writeContractAsync({
            address: game.address,
            abi,
            functionName: 'fundContract',
            args: [amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else {
          await writeContractAsync({
            address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [game.address, amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        }
        toast.success(`${game.label}: funded ${amountStr} MORBIUS`);
        setFundAmounts((prev) => ({ ...prev, [gameKey]: '' }));
        fetchHealth();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Fund failed';
        toast.error(msg);
      } finally {
        setFundingGame(null);
      }
    },
    [address, fundAmounts, writeContractAsync, fetchHealth]
  );

  const isPaused = useCallback((gameKey: FundableGameKey) => {
    if (gameKey === 'plinko') return plinkoPaused === true;
    if (gameKey === 'keno') return kenoPaused === true;
    if (gameKey === 'bigwheel') return bigWheelPaused === true;
    if (gameKey === 'blackjack') return blackjackPaused === true;
    return false;
  }, [plinkoPaused, kenoPaused, bigWheelPaused, blackjackPaused]);

  const hasPauseUnpauseWithdraw = (gameKey: FundableGameKey) =>
    gameKey === 'plinko' || gameKey === 'keno' || gameKey === 'bigwheel' || gameKey === 'blackjack';

  const handlePause = useCallback(
    async (gameKey: FundableGameKey) => {
      if (!hasPauseUnpauseWithdraw(gameKey) || !address) return;
      const game = FUNDABLE_GAMES.find((g) => g.key === gameKey);
      if (!game) return;
      setActionGame(gameKey);
      setActionType('pause');
      try {
        if (gameKey === 'bigwheel') {
          await writeContractAsync({
            address: game.address,
            abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
            functionName: 'emergencyPause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else if (gameKey === 'blackjack') {
          await writeContractAsync({
            address: game.address,
            abi: blackjackAbi,
            functionName: 'pause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else {
          const abi = gameKey === 'plinko' ? PLINKO_ABI : KENO_ABI;
          await writeContractAsync({
            address: game.address,
            abi,
            functionName: 'pause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        }
        toast.success(`${game.label}: paused`);
        fetchHealth();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Pause failed');
      } finally {
        setActionGame(null);
        setActionType(null);
      }
    },
    [address, writeContractAsync, fetchHealth]
  );

  const handleUnpause = useCallback(
    async (gameKey: FundableGameKey) => {
      if (!hasPauseUnpauseWithdraw(gameKey) || !address) return;
      const game = FUNDABLE_GAMES.find((g) => g.key === gameKey);
      if (!game) return;
      setActionGame(gameKey);
      setActionType('unpause');
      try {
        if (gameKey === 'bigwheel') {
          await writeContractAsync({
            address: game.address,
            abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
            functionName: 'emergencyUnpause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else if (gameKey === 'blackjack') {
          await writeContractAsync({
            address: game.address,
            abi: blackjackAbi,
            functionName: 'unpause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else {
          const abi = gameKey === 'plinko' ? PLINKO_ABI : KENO_ABI;
          await writeContractAsync({
            address: game.address,
            abi,
            functionName: 'unpause',
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        }
        toast.success(`${game.label}: unpaused`);
        fetchHealth();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Unpause failed');
      } finally {
        setActionGame(null);
        setActionType(null);
      }
    },
    [address, writeContractAsync, fetchHealth]
  );

  const handleWithdraw = useCallback(
    async (gameKey: FundableGameKey) => {
      if (!hasPauseUnpauseWithdraw(gameKey) || !address) return;
      const game = FUNDABLE_GAMES.find((g) => g.key === gameKey);
      const amountStr = fundAmounts[gameKey]?.trim();
      if (!game || !amountStr) {
        toast.error('Enter an amount to withdraw');
        return;
      }
      let amount: bigint;
      try {
        amount = parseEther(amountStr);
      } catch {
        toast.error('Invalid amount');
        return;
      }
      if (amount <= 0n) {
        toast.error('Amount must be > 0');
        return;
      }
      setActionGame(gameKey);
      setActionType('withdraw');
      try {
        if (gameKey === 'bigwheel') {
          await writeContractAsync({
            address: game.address,
            abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
            functionName: 'emergencyWithdraw',
            args: [amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else if (gameKey === 'blackjack') {
          await writeContractAsync({
            address: game.address,
            abi: blackjackAbi,
            functionName: 'emergencyWithdraw',
            args: [amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        } else {
          const abi = gameKey === 'plinko' ? PLINKO_ABI : KENO_ABI;
          await writeContractAsync({
            address: game.address,
            abi,
            functionName: 'emergencyWithdraw',
            args: [amount],
            chain: pulsechain,
            account: address,
            maxPriorityFeePerGas: 40_000n,
          } as any);
        }
        toast.success(`${game.label}: withdrew ${amountStr} MORBIUS`);
        setFundAmounts((prev) => ({ ...prev, [gameKey]: '' }));
        fetchHealth();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Withdraw failed');
      } finally {
        setActionGame(null);
        setActionType(null);
      }
    },
    [address, fundAmounts, writeContractAsync, fetchHealth]
  );

  // All Blackjack contracts with reserves (current + legacy)
  const blackjackContracts = useMemo(() => {
    if (data?.blackjackReservesByContract && data.blackjackReservesByContract.length > 0) {
      return data.blackjackReservesByContract;
    }
    if (data?.blackjackReserves) {
      return [{
        contractAddress: data.contractAddresses?.blackjack ?? '',
        label: 'Current',
        totalMorbiusInContract: data.blackjackReserves.totalMorbiusInContract,
        addressesWithReserve: data.blackjackReserves.addressesWithReserve,
      }];
    }
    return [];
  }, [data?.blackjackReservesByContract, data?.blackjackReserves, data?.contractAddresses?.blackjack]);


  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load health.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Game health
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRewardsClaimsOpen(true)}
              className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 flex items-center gap-1"
              aria-label="Reward claims"
            >
              <Gift className="w-3.5 h-3.5" />
              <span className="text-[10px]">Reward claims</span>
            </button>
            <button
              type="button"
              onClick={() => fetchHealth()}
              disabled={loading}
              className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3">
          {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}
          {loading && !data && <p className="text-[11px] text-slate-500">Loading…</p>}
          {data && (
            <div className="space-y-3 text-[11px]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 left-align">
              <span className="text-slate-500">API</span>
              <span className={data.api === 'ok' ? 'text-emerald-400' : 'text-red-400'}>{data.api === 'ok' ? <CheckCircle className="w-3.5 h-3.5 inline mr-0.5" /> : <XCircle className="w-3.5 h-3.5 inline mr-0.5" />}{data.api}</span>
              <span className="text-slate-500">WebSocket</span>
              <span className={data.ws === 'up' ? 'text-emerald-400' : 'text-amber-400'}>{data.ws}</span>
            </div>
            <div>
              <p className="text-slate-500 mb-1">RPC / contract</p>
              <div className="flex flex-wrap gap-2">
                {(['blackjack', 'plinko', 'keno', 'lottery'] as const).map((game) => (
                  <span
                    key={game}
                    className={`px-2 py-0.5 rounded capitalize ${data.games[game]?.rpc === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                    title={data.games[game]?.error}
                  >
                    {game}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-2">MORBIUS in contract — fund with MORBIUS</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {hotWalletDisplay != null && (
                  <WalletCard
                    label="Hot wallet"
                    address={hotWalletDisplay.address}
                    morbiusWei={hotWalletDisplay.morbiusWei}
                    lowWarning={hotWalletDisplay.lowWarning}
                  />
                )}
                {treasuryWalletsDisplay.map((w) => (
                  <WalletCard
                    key={w.address + w.label}
                    label={w.label}
                    address={w.address}
                    morbiusWei={w.morbiusWei}
                  />
                ))}
                {FUNDABLE_GAMES.map((game) => {
                  const reserve =
                    game.key === 'bigwheel' && bigWheelData
                      ? String(bigWheelData.contractBalance)
                      : game.key === 'keno' && kenoReserve != null
                        ? String(kenoReserve)
                        : data.morbius[game.key] ?? data.morbius[game.key === 'lottery' ? 'lottery' : game.key === 'blackjack' ? 'blackjack' : game.key] ?? '0';
                  return (
                    <FundableGameCard
                      key={game.key}
                      game={game}
                      reserve={reserve}
                      fundAmount={fundAmounts[game.key] ?? ''}
                      onFundAmountChange={(v) => setFundAmounts((prev) => ({ ...prev, [game.key]: v }))}
                      onApprove={() => handleApprove(game.key)}
                      onFund={() => handleFund(game.key)}
                      onPause={() => handlePause(game.key)}
                      onUnpause={() => handleUnpause(game.key)}
                      onWithdraw={() => handleWithdraw(game.key)}
                      isFunding={fundingGame === game.key}
                      isActioning={actionGame === game.key}
                      actionType={actionType}
                      paused={isPaused(game.key)}
                      showPauseWithdraw={hasPauseUnpauseWithdraw(game.key)}
                    />
                  );
                })}
              </div>
            </div>
            {/* Game overview: each game side-by-side with total wagered vs total won (no Big Wheel) */}
            <div>
              <p className="text-slate-500 mb-2">Game overview — total wagered vs total won</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {overviewGames.map((game) => (
                  <div
                    key={game.key}
                    className="rounded-lg border border-cyan-500/20 p-2.5"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    <p className="text-cyan-400 text-[10px] font-semibold uppercase tracking-wider mb-2 truncate">{game.label}</p>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500">Wagered</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {formatMorbius(String(game.wagersWei))}
                        </span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500">Won</span>
                        <span className="font-mono text-emerald-400/90 tabular-nums">
                          {formatMorbius(String(game.payoutsWei))}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Blackjack deposits vs withdrawals — timeframes: All-time, Hourly, Daily, 7d */}
              {(data.blackjackDeposited != null || data.blackjackWithdrawn != null || data.blackjackTimeframes != null) && (
                <div
                  className="rounded-lg border border-cyan-500/20 p-2.5 mt-2"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">Blackjack — deposits vs withdrawals</p>
                    <div className="flex rounded border border-slate-600 overflow-hidden">
                      {(['allTime', '1h', '24h', '7d'] as const).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setBjTimeframe(tf)}
                          className={`px-2 py-0.5 text-[10px] font-medium ${bjTimeframe === tf ? 'bg-cyan-600/80 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                          {tf === 'allTime' ? 'All-time' : tf === '1h' ? 'Hourly' : tf === '24h' ? 'Daily' : '7d'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const tfData = data.blackjackTimeframes?.[bjTimeframe] ?? {
                      deposited: data.blackjackDeposited ?? '0',
                      withdrawn: data.blackjackWithdrawn ?? '0',
                    };
                    const dep = BigInt(tfData.deposited);
                    const wit = BigInt(tfData.withdrawn);
                    const net = dep - wit;
                    return (
                      <div className="flex flex-wrap gap-6 text-[11px]">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Deposited</span>
                          <span className="font-mono text-slate-200 tabular-nums">{formatMorbius(tfData.deposited)} MORBIUS</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Withdrawn</span>
                          <span className="font-mono text-emerald-400/90 tabular-nums">{formatMorbius(tfData.withdrawn)} MORBIUS</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Net retained</span>
                          <span className={`font-mono tabular-nums ${net >= 0n ? 'text-cyan-300/90' : 'text-red-400'}`}>{net >= 0n ? '' : '-'}{formatMorbius(net >= 0n ? String(net) : String(-net))} MORBIUS</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            {/* MORBIUS contract flow: Reserves first, then Revenue, then Payouts vs Wagers. Toggle Daily / Hourly. */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-slate-500">
                  MORBIUS contract flow — {chartGranularity === 'hourly' ? 'last 24h' : 'daily activity'}
                  {(chartGranularity === 'daily' ? snapshots.length : hourlySnapshots.length) === 0 ? ' (no snapshots yet — populates hourly)' : ''}
                </p>
                <div className="flex rounded border border-slate-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setChartGranularity('daily')}
                    className={`px-2.5 py-1 text-[10px] font-medium ${chartGranularity === 'daily' ? 'bg-cyan-600/80 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartGranularity('hourly')}
                    className={`px-2.5 py-1 text-[10px] font-medium ${chartGranularity === 'hourly' ? 'bg-cyan-600/80 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                  >
                    Hourly
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Reserve ({chartGranularity === 'hourly' ? 'per hour' : 'end-of-day'})</p>
                  {chartData.games.map((game) => (
                    <DailySingleChart
                      key={game.key}
                      title={game.label}
                      data={game.reserve}
                      gradientId={`health-${game.key}-reserve`}
                      dataKey="value"
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Revenue ({chartGranularity === 'hourly' ? 'per hour' : 'daily'})</p>
                  {chartData.games.map((game) => (
                    <DailySingleChart
                      key={game.key}
                      title={game.label}
                      data={game.single}
                      gradientId={`health-${game.key}-revenue`}
                      dataKey="value"
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Payouts vs Wagers ({chartGranularity === 'hourly' ? 'per hour' : 'daily'})</p>
                  {chartData.games.map((game) => (
                    <DailyDualChart
                      key={game.key}
                      title={game.label}
                      data={game.dual}
                      gradientIdWagers={`health-${game.key}-wagers`}
                      gradientIdPayouts={`health-${game.key}-payouts`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-1">Contract addresses (from lib/contracts, click to copy)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {[
                  { key: 'blackjack', label: 'blackjack', address: (BLACKJACK_ADDRESS as string) || '' },
                  { key: 'plinko', label: 'plinko', address: (PLINKO_ADDRESS as string) || '' },
                  { key: 'keno', label: 'keno', address: (KENO_ADDRESS as string) || '' },
                  { key: 'lottery', label: 'lottery (instant 6-of-55)', address: (LOTTERY_INSTANT_ADDRESS as string) || '' },
                  { key: 'bigwheel', label: 'bigwheel', address: (BIGWHEEL_ADDRESS as string) || '' },
                  ...(BLACKJACK_LEGACY_ADDRESS
                      ? [{
                          key: 'blackjack-legacy-1',
                          label: 'blackjack legacy 1',
                          address: BLACKJACK_LEGACY_ADDRESS,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_2
                      ? [{
                          key: 'blackjack-legacy-2',
                          label: 'blackjack legacy 2',
                          address: BLACKJACK_LEGACY_ADDRESS_2,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_3
                      ? [{
                          key: 'blackjack-legacy-3',
                          label: 'blackjack legacy 3',
                          address: BLACKJACK_LEGACY_ADDRESS_3,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_4
                      ? [{
                          key: 'blackjack-legacy-4',
                          label: 'blackjack legacy 4',
                          address: BLACKJACK_LEGACY_ADDRESS_4,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_5
                      ? [{
                          key: 'blackjack-legacy-5',
                          label: 'blackjack legacy 5',
                          address: BLACKJACK_LEGACY_ADDRESS_5,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_6
                      ? [{
                          key: 'blackjack-legacy-6',
                          label: 'blackjack legacy 6',
                          address: BLACKJACK_LEGACY_ADDRESS_6,
                        }]
                      : []),
                  { key: 'morbius-token', label: 'MORBIUS token', address: (MORBIUS_TOKEN_ADDRESS as string) || '' },
                  ...(MORBIUS_STAKING_ADDRESS ? [{ key: 'morbius-staking', label: 'MORBIUS staking', address: MORBIUS_STAKING_ADDRESS as string }] : []),
                  ...(MORBIUS_LP_STAKING_ADDRESS ? [{ key: 'morbius-lp-staking', label: 'MORBIUS LP staking', address: MORBIUS_LP_STAKING_ADDRESS as string }] : []),
                  ...(MERKLE_CLAIM_MORBIUS_ADDRESS ? [{ key: 'merkle-claim-morbius', label: 'Merkle claim (holders)', address: MERKLE_CLAIM_MORBIUS_ADDRESS as string }] : []),
                  ...(MERKLE_CLAIM_LP_ADDRESS ? [{ key: 'merkle-claim-lp', label: 'Merkle claim (LP)', address: MERKLE_CLAIM_LP_ADDRESS as string }] : []),
                  ...(MORBIUS_WPLS_V1_PAIR ? [{ key: 'morbius-wpls-pair', label: 'MORBIUS/WPLS pair', address: MORBIUS_WPLS_V1_PAIR as string }] : []),
                  ...(TOURNAMENT_PRIZE_ESCROW_ADDRESS ? [{ key: 'tournament-escrow', label: 'Tournament prize escrow', address: TOURNAMENT_PRIZE_ESCROW_ADDRESS as string }] : []),
                  ...(MORBIUS_TOURNAMENT_ADDRESS ? [{ key: 'morbius-tournament', label: 'MORBIUS tournament', address: MORBIUS_TOURNAMENT_ADDRESS as string }] : []),
                  ...(MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS ? [{ key: 'holder-distributor', label: 'Holder distributor', address: MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS as string }] : []),
                ].map((entry) => {
                  if (!entry.address) return null;
                  return (
                    <div key={entry.key} className="flex items-center gap-2 flex-wrap">
                      <span className="capitalize text-slate-400 w-32 shrink-0">{entry.label}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(entry.address)}
                        className="font-mono text-[10px] text-cyan-300/90 hover:text-cyan-200 break-all text-left bg-slate-800/80 px-2 py-1 rounded border border-slate-600 hover:border-cyan-500/40 flex items-center gap-1.5 max-w-full"
                        title="Copy full address"
                      >
                        <Copy className="w-3 h-3 shrink-0" />
                        {entry.address}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              {blackjackContracts.length === 0 ? (
                <p className="text-slate-500 text-xs">No Blackjack contract data.</p>
              ) : (
                <BlackjackContractsMergedCard contracts={blackjackContracts} />
              )}
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Reward claims modal */}
      {rewardsClaimsOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setRewardsClaimsOpen(false)}
        >
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-600/20 to-blue-600/20">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Gift className="w-4 h-4 text-cyan-400" />
                Holder & LP reward claims
              </h2>
              <button
                type="button"
                onClick={() => setRewardsClaimsOpen(false)}
                className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {rewardsClaimsLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              )}
              {rewardsClaimsError && (
                <p className="text-sm text-red-400">{rewardsClaimsError}</p>
              )}
              {!rewardsClaimsLoading && rewardsClaimsData && (
                <>
                  <div
                    className="rounded-lg border border-slate-600 overflow-hidden"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    <p className="text-cyan-400/90 text-[10px] font-semibold uppercase tracking-wider px-3 py-2 border-b border-slate-600">
                      Holder rewards (Merkle claim)
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      {rewardsClaimsData.holderClaims.length === 0 ? (
                        <p className="text-slate-500 text-[11px] px-3 py-4">No holder claims yet.</p>
                      ) : (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-700">
                              <th className="text-left py-2 px-3">Wallet</th>
                              <th className="text-right py-2 px-3">Amount</th>
                              <th className="text-center py-2 px-3">Epoch</th>
                              <th className="text-left py-2 px-3">Claimed at</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rewardsClaimsData.holderClaims.map((c, i) => (
                              <tr key={`h-${i}-${c.walletAddress}-${c.claimedAt}`} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                                <td className="py-1.5 px-3">
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(c.walletAddress)}
                                    className="font-mono text-cyan-300/90 hover:text-cyan-200 flex items-center gap-1"
                                    title="Copy"
                                  >
                                    <Copy className="w-3 h-3 shrink-0" />
                                    {truncateAddress(c.walletAddress, 8, 6)}
                                  </button>
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono text-slate-300">
                                  {formatMorbius(c.rewardAmount)} MORBIUS
                                </td>
                                <td className="py-1.5 px-3 text-center text-slate-400">{c.epochNumber}</td>
                                <td className="py-1.5 px-3 text-slate-400">
                                  {new Date(c.claimedAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border border-slate-600 overflow-hidden"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    <p className="text-cyan-400/90 text-[10px] font-semibold uppercase tracking-wider px-3 py-2 border-b border-slate-600">
                      LP rewards (Merkle LP claim)
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      {rewardsClaimsData.lpClaims.length === 0 ? (
                        <p className="text-slate-500 text-[11px] px-3 py-4">No LP claims yet.</p>
                      ) : (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-700">
                              <th className="text-left py-2 px-3">Wallet</th>
                              <th className="text-right py-2 px-3">Amount</th>
                              <th className="text-center py-2 px-3">Epoch</th>
                              <th className="text-left py-2 px-3">Claimed at</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rewardsClaimsData.lpClaims.map((c, i) => (
                              <tr key={`lp-${i}-${c.walletAddress}-${c.claimedAt}`} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                                <td className="py-1.5 px-3">
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(c.walletAddress)}
                                    className="font-mono text-cyan-300/90 hover:text-cyan-200 flex items-center gap-1"
                                    title="Copy"
                                  >
                                    <Copy className="w-3 h-3 shrink-0" />
                                    {truncateAddress(c.walletAddress, 8, 6)}
                                  </button>
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono text-slate-300">
                                  {formatMorbius(c.rewardAmount)} MORBIUS
                                </td>
                                <td className="py-1.5 px-3 text-center text-slate-400">{c.epochNumber}</td>
                                <td className="py-1.5 px-3 text-slate-400">
                                  {new Date(c.claimedAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
