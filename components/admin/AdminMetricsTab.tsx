'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEther } from 'viem';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { BarChart3, RefreshCw } from 'lucide-react';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_ADDRESS, BIGWHEEL_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { KENO_ABI } from '@/lib/keno-abi';
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2';

type Range = '24h' | '7d' | '30d' | 'all';

export interface AdminMetricsData {
  range: string;
  blackjack: {
    volume: string;
    games: number;
    activePlayers: number;
    pnl: string;
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

export default function AdminMetricsTab() {
  const { address } = useAccount();
  const [range, setRange] = useState<Range>('24h');
  const [data, setData] = useState<AdminMetricsData | null>(null);
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

  // Keno stats
  const { data: kenoStats } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getGlobalStats',
  }) as { data: [bigint, bigint, bigint, bigint] | undefined };

  const { data: kenoCurrentRoundId } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'currentRoundId',
  }) as { data: bigint | undefined };

  // Lottery stats
  const { data: lotteryTickets } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'totalTicketsEver',
  }) as { data: bigint | undefined };

  const { data: lotteryCollected } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'totalMORBIUSEverCollected',
  }) as { data: bigint | undefined };

  const { data: lotteryClaimed } = useReadContract({
    address: LOTTERY_ADDRESS,
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
      // Fetch Blackjack stats from the same endpoint the home page uses (works correctly)
      const [platformRes, adminRes] = await Promise.all([
        fetch('/api/analytics/platform'),
        fetch(`/api/admin/metrics?range=${range}`, {
          headers: { 'x-admin-wallet': address },
        }),
      ]);
      
      if (!platformRes.ok) throw new Error(`Platform API HTTP ${platformRes.status}`);
      if (!adminRes.ok) throw new Error(`Admin API HTTP ${adminRes.status}`);
      
      const platformData = await platformRes.json();
      const adminData = await adminRes.json();
      
      // Merge: Use Blackjack from platform API (works), tournaments and series from admin API
      setData({
        range: adminData.range || range,
        blackjack: {
          volume: platformData.blackjack?.total_volume?.toString() || '0',
          games: platformData.blackjack?.total_games_played || 0,
          activePlayers: platformData.blackjack?.active_players || 0,
          pnl: platformData.blackjack?.house_profit?.toString() || '0',
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
    activeRoundId: kenoStats[3],
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
          {(data || plinkoData || kenoData || lotteryData || bigWheelData) && (
            <div className="space-y-4 text-[11px]">
              {/* Blackjack Metrics */}
              {data && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Blackjack</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Volume</p>
                      <p className="text-slate-200 font-mono">{formatMorbius(data.blackjack?.volume || '0')} MORBIUS</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Games</p>
                      <p className="text-slate-200 font-mono">{formatNumber(data.blackjack?.games || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Active Players</p>
                      <p className="text-slate-200 font-mono">{formatNumber(data.blackjack?.activePlayers || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">PnL</p>
                      <p className={`font-mono ${Number(data.blackjack?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatMorbius(data.blackjack?.pnl || '0')} MORBIUS
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Plinko Metrics */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Plinko</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Drops</p>
                    <p className="text-slate-200 font-mono">{formatNumber(plinkoData?.totalDrops ?? 0n)}</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Balls Sold</p>
                    <p className="text-slate-200 font-mono">{formatNumber(plinkoData?.totalBallsSold ?? 0n)}</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Revenue</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(plinkoData?.totalRevenue ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Payouts</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(plinkoData?.totalPayouts ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Reserve</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(plinkoData?.contractReserve ?? 0n)} MORBIUS</p>
                  </div>
                </div>
              </div>

              {/* Keno Metrics */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Keno</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Wagered</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(kenoData?.totalWagered ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Won</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(kenoData?.totalWon ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Tickets</p>
                    <p className="text-slate-200 font-mono">{formatNumber(kenoData?.ticketCount ?? 0n)}</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Active Round</p>
                    <p className="text-slate-200 font-mono">{formatNumber(kenoData?.activeRoundId ?? 0n)}</p>
                  </div>
                </div>
              </div>

              {/* Lottery Metrics */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Lottery</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Tickets</p>
                    <p className="text-slate-200 font-mono">{formatNumber(lotteryData.totalTicketsEver)}</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Collected</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(lotteryData.totalCollected)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Total Claimed</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(lotteryData.totalClaimed)} MORBIUS</p>
                  </div>
                </div>
              </div>

              {/* BigWheel Metrics */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">BigWheel</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Spins</p>
                    <p className="text-slate-200 font-mono">{formatNumber(bigWheelData?.spins ?? 0n)}</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Volume</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(bigWheelData?.volume ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Payouts</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(bigWheelData?.payouts ?? 0n)} MORBIUS</p>
                  </div>
                  <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                    <p className="text-slate-500 text-[10px]">Balance</p>
                    <p className="text-slate-200 font-mono">{formatMorbius(bigWheelData?.contractBalance ?? 0n)} MORBIUS</p>
                  </div>
                </div>
              </div>

              {/* Tournament Metrics */}
              {data && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Tournaments</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Total</p>
                      <p className="text-slate-200 font-mono">{formatNumber(data.tournaments?.totalTournaments || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Active</p>
                      <p className="text-emerald-400 font-mono">{formatNumber(data.tournaments?.activeTournaments || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Completed</p>
                      <p className="text-slate-200 font-mono">{formatNumber(data.tournaments?.completedTournaments || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Total Entries</p>
                      <p className="text-slate-200 font-mono">{formatNumber(data.tournaments?.totalEntries || 0)}</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Prize Pool</p>
                      <p className="text-yellow-400 font-mono">{formatMorbius(data.tournaments?.totalPrizePool || '0')} MORBIUS</p>
                    </div>
                    <div className="rounded border border-slate-700/50 p-2 bg-slate-800/50">
                      <p className="text-slate-500 text-[10px]">Total Buy-Ins</p>
                      <p className="text-slate-200 font-mono">{formatMorbius(data.tournaments?.totalBuyIns || '0')} MORBIUS</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Volume Chart (Blackjack only) */}
              {data && chartData.length > 0 && (
                <div className="rounded border border-slate-700/50 p-2 bg-slate-800/30 h-40">
                  <p className="text-slate-500 text-[10px] mb-1">Blackjack Volume over time</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 9 }} stroke="#64748b" tickFormatter={(v) => (v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                      <Area type="monotone" dataKey="volumeNum" stroke="rgba(139, 92, 246, 0.8)" fill="rgba(139, 92, 246, 0.2)" strokeWidth={1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
