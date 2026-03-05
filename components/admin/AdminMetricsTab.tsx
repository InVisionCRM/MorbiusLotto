'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatEther } from 'viem';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3, RefreshCw, Activity } from 'lucide-react';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_INSTANT_ADDRESS, BIGWHEEL_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { KENO_ABI } from '@/lib/keno-abi';
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2';

type Range = '24h' | '7d' | '30d' | 'all';

export interface GlobalMetricsPayload {
  range: string;
  totalWagered: string;
  totalWon: string;
  totalDeposited: string;
  totalWithdrawn: string;
  breakdown?: Record<string, { wagered: string; won: string }>;
}

export interface AdminMetricsData {
  range: string;
  blackjack: {
    total_players: number;
    active_players: number;
    total_games_played: number;
    total_volume: string;
    total_payouts: string;
    house_profit: string;
    games_last_hour: number;
    games_last_24_hours: number;
    volume_last_24_hours: string;
    profit_last_24_hours: string;
    average_win_rate: number;
    average_bet_size: number;
    house_edge: number;
    active_connections: number;
    blackjack_rate: number;
    split_rate: number;
    double_down_rate: number;
    surrender_rate: number;
    pending_settlements: number;
    failed_settlements: number;
    largest_bet: string;
    largest_payout: string;
  };
  tournaments: {
    totalTournaments: number;
    activeTournaments: number;
    completedTournaments: number;
    totalEntries: number;
    totalPrizePool: string;
    totalBuyIns: string;
  };
  series: Array<{ period: string; volume: string; games: number }>;
}

function formatMorbius(wei: string | bigint | number): string {
  if (wei == null) return '0';
  try {
    const bigintValue = typeof wei === 'bigint' ? wei : typeof wei === 'string' ? BigInt(wei || '0') : BigInt(wei || 0);
    const n = Number(formatEther(bigintValue));
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return n.toFixed(2);
  } catch {
    return '0';
  }
}

function formatNumber(num: string | number | bigint): string {
  const n = typeof num === 'bigint' ? Number(num) : typeof num === 'string' ? Number(num) : num;
  if (isNaN(n)) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString();
}

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

// Shared embossed panel style (Plinko/theme)
const EMBOSSED_PANEL = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
};

/** Single grouped card: one panel with a grid of label/value pairs. */
function MetricPanel({
  title,
  children,
  className,
}: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-cyan-500/30 p-3 ${className ?? ''}`} style={EMBOSSED_PANEL}>
      {title && <h3 className="text-xs font-semibold text-cyan-400 mb-3">{title}</h3>}
      {children}
    </div>
  );
}

/** One label + value row inside a MetricPanel grid. */
function MetricRow({
  label,
  value,
  valueClassName = 'text-white font-mono text-sm font-bold',
}: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div>
      <p className="text-cyan-400/80 text-[10px] font-medium uppercase tracking-wider mb-0.5">{label}</p>
      <p className={valueClassName}>{value}</p>
    </div>
  );
}

// BigWheel ABI for getGlobalStats
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
] as const;

/** Build chart data from contract metrics: each point is a named metric with its MORBIUS value. */
function buildMovementData(
  metrics: { name: string; wei: bigint }[]
): { name: string; value: number; delta: string; deltaNum: number }[] {
  return metrics.map((m, i) => {
    const value = Number(formatEther(m.wei));
    const prev = i > 0 ? Number(formatEther(metrics[i - 1].wei)) : null;
    const deltaNum = prev !== null ? value - prev : 0;
    const delta = prev !== null
      ? `${deltaNum >= 0 ? '+' : ''}${deltaNum >= 1e6 ? `${(deltaNum / 1e6).toFixed(1)}M` : deltaNum >= 1e3 ? `${(deltaNum / 1e3).toFixed(1)}k` : deltaNum.toFixed(1)}`
      : '';
    return { name: m.name, value, delta, deltaNum };
  });
}

/** Custom dot that renders the data point with value + delta label. */
function MovementDot(props: any) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null) return null;
  const valueLabel = payload.value >= 1e6
    ? `${(payload.value / 1e6).toFixed(1)}M`
    : payload.value >= 1e3
      ? `${(payload.value / 1e3).toFixed(1)}k`
      : payload.value.toFixed(1);
  return (
    <g>
      {/* Glow effect */}
      <circle cx={cx} cy={cy} r={6} fill="rgba(0, 255, 255, 0.15)" />
      <circle cx={cx} cy={cy} r={3.5} fill="#000" stroke="#22d3ee" strokeWidth={1.5} />
      {/* Value label */}
      <text x={cx} y={cy - 16} textAnchor="middle" fill="#22d3ee" fontSize={10} fontFamily="monospace" fontWeight="bold">
        {valueLabel}
      </text>
      {/* Delta label */}
      {index > 0 && payload.delta && (
        <text
          x={cx}
          y={cy - 28}
          textAnchor="middle"
          fill={payload.deltaNum >= 0 ? '#34d399' : '#f87171'}
          fontSize={9}
          fontFamily="monospace"
          fontWeight="600"
        >
          {payload.delta}
        </text>
      )}
    </g>
  );
}

/** Reusable MORBIUS movement area chart with pure black bg + cyan gradient. */
function ContractMovementChart({
  title,
  data,
  gradientId,
}: {
  title: string;
  data: { name: string; value: number; delta: string; deltaNum: number }[];
  gradientId: string;
}) {
  if (!data.length) return null;
  return (
    <div
      className="rounded-lg border border-cyan-500/20 p-3"
      style={{
        background: '#000',
        boxShadow: 'inset 0 2px 8px rgba(0, 255, 255, 0.05), 0 0 20px rgba(0, 0, 0, 0.8)',
      }}
    >
      <p className="text-cyan-400 text-[11px] font-semibold mb-2 tracking-wide">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 35, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 255, 255, 0.35)" />
              <stop offset="50%" stopColor="rgba(0, 255, 255, 0.12)" />
              <stop offset="100%" stopColor="rgba(0, 255, 255, 0.02)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'rgba(0, 255, 255, 0.6)', fontFamily: 'monospace' }}
            stroke="rgba(0, 255, 255, 0.15)"
            axisLine={{ stroke: 'rgba(0, 255, 255, 0.15)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
            stroke="rgba(0, 255, 255, 0.1)"
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v)))}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#22d3ee"
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            isAnimationActive={false}
            dot={<MovementDot />}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminMetricsTab() {
  const { address } = useAccount();
  const [range, setRange] = useState<Range>('24h');
  const [gameTab, setGameTab] = useState<string>('overview');
  const [data, setData] = useState<AdminMetricsData | null>(null);
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plinko stats
  const { data: plinkoStats } = useReadContract({
    address: PLINKO_ADDRESS,
    abi: PLINKO_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint, bigint, bigint] | undefined };

  const { data: plinkoWagerLimits } = useReadContract({
    address: PLINKO_ADDRESS,
    abi: PLINKO_ABI,
    functionName: 'getWagerLimits',
  }) as { data: { min: bigint; max: bigint } | undefined };

  // Keno stats (Quick Play — no rounds)
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

  // Lottery stats
  const { data: lotteryTickets } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'totalTicketsEver',
  }) as { data: bigint | undefined };

  const { data: lotteryCollected } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'totalMORBIUSEverCollected',
  }) as { data: bigint | undefined };

  const { data: lotteryClaimed } = useReadContract({
    address: LOTTERY_INSTANT_ADDRESS,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'totalMORBIUSEverClaimed',
  }) as { data: bigint | undefined };

  // BigWheel stats
  const { data: bigWheelStats } = useReadContract({
    address: BIGWHEEL_ADDRESS,
    abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint, bigint, bigint] | undefined };

  const fetchMetrics = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [platformRes, adminRes, globalRes] = await Promise.all([
        fetch('/api/analytics/platform'),
        fetch(`/api/admin/metrics?range=${range}`, {
          headers: { 'x-admin-wallet': address },
        }),
        fetch(`/api/analytics/global-metrics?range=${range}`),
      ]);

      if (!platformRes.ok) throw new Error(`Platform API HTTP ${platformRes.status}`);
      if (!adminRes.ok) throw new Error(`Admin API HTTP ${adminRes.status}`);

      const platformData = await platformRes.json();
      const adminData = await adminRes.json();
      if (globalRes.ok) {
        const globalData = await globalRes.json();
        setGlobalMetrics(globalData);
      } else {
        setGlobalMetrics(null);
      }

      setData({
        range: adminData.range || range,
        blackjack: platformData.blackjack || {
          total_players: 0,
          active_players: 0,
          total_games_played: 0,
          total_volume: '0',
          total_payouts: '0',
          house_profit: '0',
          games_last_hour: 0,
          games_last_24_hours: 0,
          volume_last_24_hours: '0',
          profit_last_24_hours: '0',
          average_win_rate: 0,
          average_bet_size: 0,
          house_edge: 0,
          active_connections: 0,
          blackjack_rate: 0,
          split_rate: 0,
          double_down_rate: 0,
          surrender_rate: 0,
          pending_settlements: 0,
          failed_settlements: 0,
          largest_bet: '0',
          largest_payout: '0',
        },
        tournaments: adminData.tournaments || {
          totalTournaments: 0,
          activeTournaments: 0,
          completedTournaments: 0,
          totalEntries: 0,
          totalPrizePool: '0',
          totalBuyIns: '0',
        },
        series: adminData.series || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address, range]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh for realtime charts (every 60s when range is 24h)
  useEffect(() => {
    if (!address || range !== '24h') return;
    const interval = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(interval);
  }, [address, range, fetchMetrics]);

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load metrics.
        </CardContent>
      </Card>
    );
  }

  const chartData = (data?.series ?? []).map((p) => ({
    ...p,
    volumeNum: Number(formatEther(BigInt(p.volume || '0'))),
    label: p.period ? new Date(p.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: range === '24h' ? '2-digit' : undefined }) : p.period,
  }));

  // Extract chain stats from hooks
  const plinkoData = plinkoStats ? {
    totalDrops: plinkoStats[0],
    totalBallsSold: plinkoStats[1],
    totalRevenue: plinkoStats[2],
    totalPayouts: plinkoStats[3],
    contractReserve: plinkoStats[4],
  } : null;

  const kenoData = kenoStats ? {
    totalWagered: kenoStats[0],
    totalWon: kenoStats[1],
    ticketCount: kenoStats[2],
    reserve: kenoReserve ?? 0n,
  } : null;

  const lotteryData = {
    totalTicketsEver: lotteryTickets ?? 0n,
    totalCollected: lotteryCollected ?? 0n,
    totalClaimed: lotteryClaimed ?? 0n,
  };

  const bigWheelData = bigWheelStats ? {
    spins: bigWheelStats[0],
    volume: bigWheelStats[1],
    payouts: bigWheelStats[2],
    contractBalance: bigWheelStats[3],
  } : null;

  return (
    <div className="space-y-3">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
            Metrics
          </CardTitle>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`px-2 py-1 rounded text-[10px] font-medium ${range === r.value ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fetchMetrics()}
              disabled={loading}
              className="p-1 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50 ml-1"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3">
          {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}
          {loading && !data && <p className="text-[11px] text-slate-500">Loading…</p>}

          <Tabs value={gameTab} onValueChange={setGameTab} className="mt-2">
            <TabsList className="h-9 w-full grid grid-cols-4 sm:grid-cols-7 bg-slate-800/80 border border-slate-700/50 rounded-lg p-1 text-xs">
              <TabsTrigger value="overview" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Overview</TabsTrigger>
              <TabsTrigger value="blackjack" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Blackjack</TabsTrigger>
              <TabsTrigger value="plinko" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Plinko</TabsTrigger>
              <TabsTrigger value="keno" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Keno</TabsTrigger>
              <TabsTrigger value="lottery" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Lottery</TabsTrigger>
              <TabsTrigger value="bigwheel" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">BigWheel</TabsTrigger>
              <TabsTrigger value="tournaments" className="rounded data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white py-1.5 text-[10px] sm:text-xs">Tournaments</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-4 focus-visible:outline-none">
              {globalMetrics && (
                <div className="rounded-lg border border-cyan-500/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-4" style={EMBOSSED_PANEL}>
                  <MetricRow label="Wagered" value={formatMorbius(globalMetrics.totalWagered ?? globalMetrics.breakdown?.blackjack?.wagered ?? '0')} />
                  <MetricRow label="Won" value={formatMorbius(globalMetrics.totalWon ?? globalMetrics.breakdown?.blackjack?.won ?? '0')} />
                  <MetricRow label="Deposited" value={formatMorbius(globalMetrics.totalDeposited ?? '0')} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                  <MetricRow label="Withdrawn" value={formatMorbius(globalMetrics.totalWithdrawn ?? '0')} valueClassName="text-amber-400 font-mono text-sm font-bold" />
                </div>
              )}

          {/* Realtime charts: volume and games over time (theme-styled) */}
          {data && chartData.length > 0 && (
            <div
              className="rounded-lg border border-cyan-500/30 p-3 mb-4"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-cyan-400">Realtime charts</h3>
                {range === '24h' && (
                  <span className="text-[10px] text-slate-500">(refreshes every 60s)</span>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="min-h-[200px]">
                  <p className="text-slate-500 text-[10px] mb-1">Volume over time</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminVolumeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.4)" />
                          <stop offset="100%" stopColor="rgba(34, 211, 238, 0.05)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" tickFormatter={(v) => (v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                      <Area type="monotone" dataKey="volumeNum" stroke="rgba(34, 211, 238, 0.9)" fill="url(#adminVolumeGrad)" strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-h-[200px]">
                  <p className="text-slate-500 text-[10px] mb-1">Games over time</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminGamesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(139, 92, 246, 0.4)" />
                          <stop offset="100%" stopColor="rgba(139, 92, 246, 0.05)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" />
                      <Area type="monotone" dataKey="games" stroke="rgba(139, 92, 246, 0.9)" fill="url(#adminGamesGrad)" strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
              {(data || plinkoData || kenoData || lotteryData || bigWheelData) && (
                <div className="rounded-lg border border-cyan-500/30 p-3" style={EMBOSSED_PANEL}>
                  <h3 className="text-xs font-semibold text-cyan-400 mb-3">At a glance</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px]">
                    {data && (
                      <div><p className="text-cyan-400/80 text-[10px]">Blackjack</p><p className="text-white font-mono text-sm">{formatMorbius(data.blackjack?.total_volume || '0')} vol · {formatNumber(data.blackjack?.total_games_played || 0)} games</p></div>
                    )}
                    {plinkoData && <div><p className="text-cyan-400/80 text-[10px]">Plinko</p><p className="text-white font-mono text-sm">{formatMorbius(plinkoData.totalRevenue)} rev · {formatNumber(plinkoData.totalDrops)} drops</p></div>}
                    {kenoData && <div><p className="text-cyan-400/80 text-[10px]">Keno</p><p className="text-white font-mono text-sm">{formatMorbius(kenoData.totalWagered)} wagered · {formatNumber(kenoData.ticketCount)} tickets</p></div>}
                    {lotteryData && <div><p className="text-cyan-400/80 text-[10px]">Lottery</p><p className="text-white font-mono text-sm">{formatNumber(lotteryData.totalTicketsEver)} tickets · {formatMorbius(lotteryData.totalCollected)} collected</p></div>}
                    {bigWheelData && <div><p className="text-cyan-400/80 text-[10px]">BigWheel</p><p className="text-white font-mono text-sm">{formatNumber(bigWheelData.spins)} spins · {formatMorbius(bigWheelData.volume)} vol</p></div>}
                    {data?.tournaments && <div><p className="text-cyan-400/80 text-[10px]">Tournaments</p><p className="text-white font-mono text-sm">{formatNumber(data.tournaments.totalTournaments)} total · {formatNumber(data.tournaments.activeTournaments)} active</p></div>}
                  </div>
                </div>
              )}

              {/* MORBIUS Contract Movement Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plinkoData && (
                  <ContractMovementChart
                    title="PLINKO — MORBIUS Flow"
                    gradientId="plinkoMoveGrad"
                    data={buildMovementData([
                      { name: 'Revenue', wei: plinkoData.totalRevenue },
                      { name: 'Payouts', wei: plinkoData.totalPayouts },
                      { name: 'Reserve', wei: plinkoData.contractReserve },
                    ])}
                  />
                )}
                {kenoData && (
                  <ContractMovementChart
                    title="KENO — MORBIUS Flow"
                    gradientId="kenoMoveGrad"
                    data={buildMovementData([
                      { name: 'Wagered', wei: kenoData.totalWagered },
                      { name: 'Won', wei: kenoData.totalWon },
                    ])}
                  />
                )}
                <ContractMovementChart
                  title="LOTTERY — MORBIUS Flow"
                  gradientId="lotteryMoveGrad"
                  data={buildMovementData([
                    { name: 'Collected', wei: lotteryData.totalCollected },
                    { name: 'Claimed', wei: lotteryData.totalClaimed },
                  ])}
                />
                {bigWheelData && (
                  <ContractMovementChart
                    title="BIG WHEEL — MORBIUS Flow"
                    gradientId="bigwheelMoveGrad"
                    data={buildMovementData([
                      { name: 'Volume', wei: bigWheelData.volume },
                      { name: 'Payouts', wei: bigWheelData.payouts },
                      { name: 'Balance', wei: bigWheelData.contractBalance },
                    ])}
                  />
                )}
              </div>
            </TabsContent>
            <TabsContent value="blackjack" className="mt-3 space-y-4 focus-visible:outline-none">
              {data ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MetricPanel title="Summary">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <MetricRow label="Total Players" value={formatNumber(data.blackjack?.total_players || 0)} />
                        <MetricRow label="Active Players" value={formatNumber(data.blackjack?.active_players || 0)} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                        <MetricRow label="Total Games" value={formatNumber(data.blackjack?.total_games_played || 0)} />
                        <MetricRow label="Total Volume" value={`${formatMorbius(data.blackjack?.total_volume || '0')} MORBIUS`} />
                        <MetricRow label="Total Payouts" value={`${formatMorbius(data.blackjack?.total_payouts || '0')} MORBIUS`} />
                        <MetricRow label="House Profit" value={`${formatMorbius(data.blackjack?.house_profit || '0')} MORBIUS`} valueClassName={`font-mono text-sm font-bold ${Number(data.blackjack?.house_profit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                      </div>
                    </MetricPanel>
                    <MetricPanel title="Last 24h">
                      <div className="grid grid-cols-2 gap-3">
                        <MetricRow label="Games (1h)" value={formatNumber(data.blackjack?.games_last_hour || 0)} />
                        <MetricRow label="Games (24h)" value={formatNumber(data.blackjack?.games_last_24_hours || 0)} />
                        <MetricRow label="Volume (24h)" value={`${formatMorbius(data.blackjack?.volume_last_24_hours || '0')} MORBIUS`} />
                        <MetricRow label="Profit (24h)" value={`${formatMorbius(data.blackjack?.profit_last_24_hours || '0')} MORBIUS`} valueClassName={`font-mono text-sm font-bold ${Number(data.blackjack?.profit_last_24_hours || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                      </div>
                    </MetricPanel>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MetricPanel title="Rates & activity">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <MetricRow label="Avg Win Rate" value={`${(data.blackjack?.average_win_rate || 0).toFixed(2)}%`} />
                        <MetricRow label="House Edge" value={`${(data.blackjack?.house_edge || 0).toFixed(2)}%`} />
                        <MetricRow label="Avg Bet Size" value={`${formatMorbius(String(data.blackjack?.average_bet_size || 0))} MORBIUS`} />
                        <MetricRow label="Active Connections" value={formatNumber(data.blackjack?.active_connections || 0)} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                        <MetricRow label="Blackjack Rate" value={`${(data.blackjack?.blackjack_rate || 0).toFixed(2)}%`} />
                        <MetricRow label="Split Rate" value={`${(data.blackjack?.split_rate || 0).toFixed(2)}%`} />
                        <MetricRow label="Double Down Rate" value={`${(data.blackjack?.double_down_rate || 0).toFixed(2)}%`} />
                        <MetricRow label="Surrender Rate" value={`${(data.blackjack?.surrender_rate || 0).toFixed(2)}%`} />
                      </div>
                    </MetricPanel>
                    <MetricPanel title="Settlements & extremes">
                      <div className="grid grid-cols-2 gap-3">
                        <MetricRow label="Pending Settlements" value={formatNumber(data.blackjack?.pending_settlements || 0)} valueClassName="text-amber-400 font-mono text-sm font-bold" />
                        <MetricRow label="Failed Settlements" value={formatNumber(data.blackjack?.failed_settlements || 0)} valueClassName="text-red-400 font-mono text-sm font-bold" />
                        <MetricRow label="Largest Bet" value={`${formatMorbius(data.blackjack?.largest_bet || '0')} MORBIUS`} valueClassName="text-yellow-400 font-mono text-sm font-bold" />
                        <MetricRow label="Largest Payout" value={`${formatMorbius(data.blackjack?.largest_payout || '0')} MORBIUS`} valueClassName="text-yellow-400 font-mono text-sm font-bold" />
                      </div>
                    </MetricPanel>
                  </div>
                  {chartData.length > 0 && (
                    <MetricPanel title="Volume over time">
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="adminVolumeBjGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.3)" />
                              <stop offset="100%" stopColor="rgba(34, 211, 238, 0.05)" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" />
                          <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }} stroke="#64748b" tickFormatter={(v) => (v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                          <Area type="monotone" dataKey="volumeNum" stroke="rgba(34, 211, 238, 0.9)" fill="url(#adminVolumeBjGrad)" strokeWidth={1.5} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </MetricPanel>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">Connect wallet and ensure backend is running to load Blackjack metrics.</p>
              )}
            </TabsContent>
            <TabsContent value="plinko" className="mt-3 focus-visible:outline-none">
              {plinkoData ? (
                <MetricPanel>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <MetricRow label="Total Drops" value={formatNumber(plinkoData?.totalDrops ?? 0n)} />
                    <MetricRow label="Balls Sold" value={formatNumber(plinkoData?.totalBallsSold ?? 0n)} />
                    <MetricRow label="Revenue" value={`${formatMorbius(plinkoData?.totalRevenue ?? 0n)} MORBIUS`} />
                    <MetricRow label="Payouts" value={`${formatMorbius(plinkoData?.totalPayouts ?? 0n)} MORBIUS`} />
                    <MetricRow label="Reserve" value={`${formatMorbius(plinkoData?.contractReserve ?? 0n)} MORBIUS`} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                  </div>
                </MetricPanel>
              ) : (
                <p className="text-slate-500 text-sm">Loading Plinko contract data…</p>
              )}
            </TabsContent>
            <TabsContent value="keno" className="mt-3 focus-visible:outline-none">
              {kenoData ? (
                <MetricPanel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricRow label="Total Wagered" value={`${formatMorbius(kenoData?.totalWagered ?? 0n)} MORBIUS`} />
                    <MetricRow label="Total Won" value={`${formatMorbius(kenoData?.totalWon ?? 0n)} MORBIUS`} />
                    <MetricRow label="Tickets" value={formatNumber(kenoData?.ticketCount ?? 0n)} />
                    <MetricRow label="Contract Reserve" value={`${formatMorbius(kenoData?.reserve ?? 0n)} MORBIUS`} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                  </div>
                </MetricPanel>
              ) : (
                <p className="text-slate-500 text-sm">Loading Keno contract data…</p>
              )}
            </TabsContent>
            <TabsContent value="lottery" className="mt-3 focus-visible:outline-none">
              <MetricPanel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <MetricRow label="Total Tickets" value={formatNumber(lotteryData.totalTicketsEver)} />
                  <MetricRow label="Total Collected" value={`${formatMorbius(lotteryData.totalCollected)} MORBIUS`} />
                  <MetricRow label="Total Claimed" value={`${formatMorbius(lotteryData.totalClaimed)} MORBIUS`} valueClassName="text-amber-400 font-mono text-sm font-bold" />
                </div>
              </MetricPanel>
            </TabsContent>
            <TabsContent value="bigwheel" className="mt-3 focus-visible:outline-none">
              {bigWheelData ? (
                <MetricPanel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricRow label="Spins" value={formatNumber(bigWheelData?.spins ?? 0n)} />
                    <MetricRow label="Volume" value={`${formatMorbius(bigWheelData?.volume ?? 0n)} MORBIUS`} />
                    <MetricRow label="Payouts" value={`${formatMorbius(bigWheelData?.payouts ?? 0n)} MORBIUS`} />
                    <MetricRow label="Balance" value={`${formatMorbius(bigWheelData?.contractBalance ?? 0n)} MORBIUS`} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                  </div>
                </MetricPanel>
              ) : (
                <p className="text-slate-500 text-sm">Loading BigWheel contract data…</p>
              )}
            </TabsContent>
            <TabsContent value="tournaments" className="mt-3 focus-visible:outline-none">
              {data?.tournaments ? (
                <MetricPanel>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    <MetricRow label="Total" value={formatNumber(data.tournaments.totalTournaments)} />
                    <MetricRow label="Active" value={formatNumber(data.tournaments.activeTournaments)} valueClassName="text-emerald-400 font-mono text-sm font-bold" />
                    <MetricRow label="Completed" value={formatNumber(data.tournaments.completedTournaments)} />
                    <MetricRow label="Total Entries" value={formatNumber(data.tournaments.totalEntries)} />
                    <MetricRow label="Prize Pool" value={`${formatMorbius(data.tournaments.totalPrizePool ?? '0')} MORBIUS`} valueClassName="text-yellow-400 font-mono text-sm font-bold" />
                    <MetricRow label="Total Buy-Ins" value={`${formatMorbius(data.tournaments.totalBuyIns ?? '0')} MORBIUS`} />
                  </div>
                </MetricPanel>
              ) : (
                <p className="text-slate-500 text-sm">Connect wallet and ensure backend is running to load Tournament metrics.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
