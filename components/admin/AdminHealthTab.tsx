'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatEther, parseEther } from 'viem';
import { Activity, RefreshCw, CheckCircle, XCircle, Copy, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
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
  void navigator.clipboard.writeText(text);
}

// Colors for pie chart segments
const PIE_COLORS = [
  'rgba(34, 211, 238, 0.8)',   // cyan
  'rgba(139, 92, 246, 0.8)',   // violet
  'rgba(59, 130, 246, 0.8)',   // blue
  'rgba(16, 185, 129, 0.8)',   // emerald
  'rgba(251, 146, 60, 0.8)',   // orange
  'rgba(236, 72, 153, 0.8)',   // pink
  'rgba(168, 85, 247, 0.8)',   // purple
  'rgba(34, 197, 94, 0.8)',    // green
];

function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

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

/** Build daily chart data: one value per day (current total repeated for chain games; no history). */
function buildDailySingleSeries(
  days: { date: string; label: string }[],
  valueWei: bigint
): { date: string; label: string; value: number }[] {
  const v = Number(formatEther(valueWei));
  return days.map((d) => ({ ...d, value: v }));
}

/** Build daily chart data: two series (wagers, payouts) per day. */
function buildDailyDualSeries(
  days: { date: string; label: string }[],
  wagersWei: bigint,
  payoutsWei: bigint
): { date: string; label: string; wagers: number; payouts: number }[] {
  const w = Number(formatEther(wagersWei));
  const p = Number(formatEther(payoutsWei));
  return days.map((d) => ({ ...d, wagers: w, payouts: p }));
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

export default function AdminHealthTab() {
  const { address } = useAccount();
  const [data, setData] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundAmounts, setFundAmounts] = useState<Record<FundableGameKey, string>>({ plinko: '', keno: '', lottery: '', bigwheel: '', blackjack: '' });
  const [fundingGame, setFundingGame] = useState<FundableGameKey | null>(null);
  const [actionGame, setActionGame] = useState<FundableGameKey | null>(null);
  const [actionType, setActionType] = useState<'pause' | 'unpause' | 'withdraw' | null>(null);
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

  const contractFlowSeries = useMemo(() => {
    const days = getLast7Days();
    const games: { key: string; label: string; revenueWei: bigint; wagersWei: bigint; payoutsWei: bigint; reserveWei: bigint }[] = [];
    if (plinkoData) {
      games.push({
        key: 'plinko',
        label: 'Plinko',
        revenueWei: plinkoData.totalRevenue,
        wagersWei: plinkoData.totalRevenue + plinkoData.totalPayouts,
        payoutsWei: plinkoData.totalPayouts,
        reserveWei: plinkoData.contractReserve,
      });
    }
    if (kenoData && kenoReserve != null) {
      games.push({
        key: 'keno',
        label: 'Keno',
        revenueWei: kenoData.totalWagered - kenoData.totalWon,
        wagersWei: kenoData.totalWagered,
        payoutsWei: kenoData.totalWon,
        reserveWei: kenoReserve,
      });
    }
    if (lotteryData) {
      games.push({
        key: 'lottery',
        label: 'Lottery',
        revenueWei: lotteryData.totalCollected - lotteryData.totalClaimed,
        wagersWei: lotteryData.totalCollected,
        payoutsWei: lotteryData.totalClaimed,
        reserveWei: BigInt(data?.morbius?.lottery ?? '0'),
      });
    }
    if (bigWheelData) {
      games.push({
        key: 'bigwheel',
        label: 'Big Wheel',
        revenueWei: bigWheelData.volume - bigWheelData.payouts,
        wagersWei: bigWheelData.volume,
        payoutsWei: bigWheelData.payouts,
        reserveWei: bigWheelData.contractBalance,
      });
    }
    if (bjTotalPayouts != null && bjBurnFees != null && bjDistFees != null && bjLpFees != null && bjPlatformFees != null) {
      const bjRevenue = bjBurnFees + bjDistFees + bjLpFees + bjPlatformFees;
      games.push({
        key: 'blackjack',
        label: 'Blackjack',
        revenueWei: bjRevenue,
        wagersWei: bjRevenue + bjTotalPayouts,
        payoutsWei: bjTotalPayouts,
        reserveWei: bjTotalReserves ?? 0n,
      });
    }
    return { days, games };
  }, [plinkoData, kenoData, kenoReserve, lotteryData, bigWheelData, data?.morbius?.lottery, bjTotalPayouts, bjBurnFees, bjDistFees, bjLpFees, bjPlatformFees, bjTotalReserves]);

  const fetchHealth = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/health', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
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

  // Pie chart for first contract with reserves (or current)
  const pieChartData = useMemo(() => {
    const first = blackjackContracts[0]?.addressesWithReserve;
    if (!first?.length) return [];
    return first.map(({ address, reserve }) => ({
      name: truncateAddress(address),
      value: Number(formatEther(BigInt(reserve))),
      address,
      reserve: formatMorbius(reserve),
    }));
  }, [blackjackContracts]);

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
          <button
            type="button"
            onClick={() => fetchHealth()}
            disabled={loading}
            className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
              <p className="text-slate-500 mb-1">MORBIUS in contract — fund with MORBIUS</p>
              <div className="space-y-2">
                {FUNDABLE_GAMES.map((game) => {
                  const reserve =
                    game.key === 'bigwheel' && bigWheelData
                      ? String(bigWheelData.contractBalance)
                      : game.key === 'keno' && kenoReserve != null
                        ? String(kenoReserve)
                        : data.morbius[game.key] ?? data.morbius[game.key === 'lottery' ? 'lottery' : game.key === 'blackjack' ? 'blackjack' : game.key] ?? '0';
                  const isFunding = fundingGame === game.key;
                  const isActioning = actionGame === game.key;
                  const paused = isPaused(game.key);
                  const showPauseWithdraw = hasPauseUnpauseWithdraw(game.key);
                  return (
                    <div key={game.key} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-700/50 last:border-0">
                      <span className="capitalize text-slate-300 w-24 shrink-0">{game.label}</span>
                      <span className="font-mono text-cyan-300/90 text-[11px] w-20 shrink-0">{formatMorbius(reserve)} MORBIUS</span>
                      <Input
                        type="text"
                        placeholder="Amount"
                        value={fundAmounts[game.key]}
                        onChange={(e) => setFundAmounts((prev) => ({ ...prev, [game.key]: e.target.value }))}
                        className="h-8 w-24 text-[11px] font-mono bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-[10px] border-slate-600 text-slate-300 hover:bg-slate-700"
                        onClick={() => handleApprove(game.key)}
                        disabled={isFunding}
                      >
                        {isFunding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approve'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white"
                        onClick={() => handleFund(game.key)}
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
                              onClick={() => handleUnpause(game.key)}
                              disabled={isActioning}
                            >
                              {actionGame === game.key && actionType === 'unpause' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Unpause'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-[10px] border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                              onClick={() => handlePause(game.key)}
                              disabled={isActioning}
                            >
                              {actionGame === game.key && actionType === 'pause' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pause'}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-[10px] border-red-500/50 text-red-400 hover:bg-red-500/20"
                            onClick={() => handleWithdraw(game.key)}
                            disabled={isActioning || !fundAmounts[game.key]?.trim()}
                          >
                            {actionGame === game.key && actionType === 'withdraw' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Withdraw'}
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* MORBIUS contract flow: 3 columns (Revenue | Payouts vs Wagers | Reserve), one chart per game per column, daily x-axis */}
            <div>
              <p className="text-slate-500 mb-2">MORBIUS contract flow (daily)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Revenue</p>
                  {contractFlowSeries.games.map((game) => (
                    <DailySingleChart
                      key={game.key}
                      title={game.label}
                      data={buildDailySingleSeries(contractFlowSeries.days, game.revenueWei)}
                      gradientId={`health-${game.key}-revenue`}
                      dataKey="value"
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Payouts vs Wagers</p>
                  {contractFlowSeries.games.map((game) => (
                    <DailyDualChart
                      key={game.key}
                      title={game.label}
                      data={buildDailyDualSeries(contractFlowSeries.days, game.wagersWei, game.payoutsWei)}
                      gradientIdWagers={`health-${game.key}-wagers`}
                      gradientIdPayouts={`health-${game.key}-payouts`}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-cyan-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1">Reserve</p>
                  {contractFlowSeries.games.map((game) => (
                    <DailySingleChart
                      key={game.key}
                      title={game.label}
                      data={buildDailySingleSeries(contractFlowSeries.days, game.reserveWei)}
                      gradientId={`health-${game.key}-reserve`}
                      dataKey="value"
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
              <p className="text-slate-500 mb-1">Blackjack: all contracts — addresses with reserve &gt; 0</p>
              {blackjackContracts.length === 0 ? (
                <p className="text-slate-500 text-[10px]">No contract data.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {blackjackContracts.map((contract) => (
                    <div key={contract.contractAddress} className="rounded border border-slate-700/50 p-3 bg-slate-800/30 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-cyan-400 text-[11px]">{contract.label}</span>
                        <span className="text-slate-400 text-[10px]">
                          Total: {formatMorbius(contract.totalMorbiusInContract)} MORBIUS
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(contract.contractAddress)}
                          className="font-mono text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1"
                          title="Copy contract address"
                        >
                          <Copy className="w-3 h-3" />
                          {truncateAddress(contract.contractAddress, 8, 6)}
                        </button>
                      </div>
                      {contract.addressesWithReserve.length === 0 ? (
                        <p className="text-slate-500 text-[10px]">No addresses with reserve in sample.</p>
                      ) : (
                        <>
                          {contract.label === 'Current' && pieChartData.length > 0 && (
                            <div className="mb-2">
                              <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                  <Pie
                                    data={pieChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                                    outerRadius={70}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {pieChartData.map((_, index) => (
                                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    formatter={(value: number, name: string, props: any) => [
                                      `${props.payload.reserve} MORBIUS`,
                                      props.payload.name,
                                    ]}
                                    contentStyle={{
                                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                      border: '1px solid rgba(100, 116, 139, 0.5)',
                                      borderRadius: '6px',
                                      color: '#e2e8f0',
                                      fontSize: '11px',
                                    }}
                                  />
                                  <Legend
                                    formatter={(value, entry: any) => {
                                      const p = entry.payload;
                                      return `${p.name}: ${p.reserve}`;
                                    }}
                                    wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          <ul className="max-h-28 overflow-y-auto space-y-0.5 text-[10px] font-mono text-slate-400">
                            {contract.addressesWithReserve.map(({ address: addr, reserve }) => (
                              <li key={`${contract.contractAddress}-${addr}`}>
                                {addr.slice(0, 10)}…{addr.slice(-8)} — {formatMorbius(reserve)} MORBIUS
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
