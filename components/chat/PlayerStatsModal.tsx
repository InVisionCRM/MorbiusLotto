'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { createPublicClient, http, formatUnits } from 'viem';
import { pulsechain } from 'viem/chains';
import { PLINKO_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { usePlayerReserveForAddress } from '@/hooks/use-blackjack-contract';

function MorbiusIcon({ size = 16 }: { size?: number }) {
  return (
    <Image
      src="/morbius/MorbiusLogo (3).png"
      alt="MORB"
      width={size}
      height={size}
      className="inline-block align-middle"
    />
  );
}

interface PlayerStats {
  total_games: number;
  total_bet: string;
  total_win: string;
  win_rate: number;
  blackjack_count: number;
  current_streak?: number;
  best_streak?: number;
  biggest_win?: string;
  biggest_loss?: string;
  profit_loss?: string;
  roi?: number;
  games_today?: number;
  games_this_week?: number;
  rank?: number;
  last_game_timestamp?: string;
}

interface PlinkoStats {
  ballBalance: bigint;
  totalDrops: bigint;
  totalWon: bigint;
  biggestWin: bigint;
  totalPurchased: bigint;
}

const publicClient = createPublicClient({
  chain: pulsechain,
  transport: http('https://rpc.pulsechain.com'),
});

interface PlayerStatsModalProps {
  address: string;
  displayName?: string | null;
  onClose: () => void;
}

function formatMorbius(value: string | undefined): string {
  if (!value) return '0';
  try {
    const num = parseFloat(formatUnits(BigInt(value), 18));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  } catch {
    return '0';
  }
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function PlayerStatsModal({ address, displayName, onClose }: PlayerStatsModalProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [plinkoStats, setPlinkoStats] = useState<PlinkoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blackjack' | 'plinko'>('blackjack');
  const { data: reserveBalance } = usePlayerReserveForAddress(address);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch blackjack stats and plinko stats in parallel
        const [blackjackRes, plinkoData] = await Promise.all([
          fetch(`/api/player/${address}/stats`).then(res => res.ok ? res.json() : null).catch(() => null),
          publicClient.readContract({
            address: PLINKO_ADDRESS as `0x${string}`,
            abi: PLINKO_ABI,
            functionName: 'getPlayerInfo',
            args: [address as `0x${string}`],
          } as unknown as Parameters<typeof publicClient.readContract>[0]).catch(() => null),
        ]);

        if (blackjackRes) {
          setStats(blackjackRes);
        }

        if (plinkoData) {
          const [ballBalance, totalDrops, totalWon, biggestWin, totalPurchased] = plinkoData as [bigint, bigint, bigint, bigint, bigint];
          setPlinkoStats({ ballBalance, totalDrops, totalWon, biggestWin, totalPurchased });
        }

        // Set initial tab based on which has data
        if (!blackjackRes && plinkoData) {
          setActiveTab('plinko');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [address]);

  const profitLoss = stats?.profit_loss ? parseFloat(formatUnits(BigInt(stats.profit_loss), 18)) : 0;
  const isProfitable = profitLoss >= 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl"
        style={{
          background: 'linear-gradient(145deg, rgb(20, 30, 40), rgb(30, 35, 45))',
          boxShadow: '0 0 40px rgba(34, 211, 238, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-white/10"
          style={{ background: 'linear-gradient(to right, rgba(34, 211, 238, 0.15), transparent)' }}
        >
          <div className="flex flex-col">
            <span className="text-cyan-300 font-semibold text-sm">
              {displayName || formatAddress(address)}
            </span>
            {displayName && (
              <span className="text-white/40 text-xs font-mono">
                {formatAddress(address)}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-800/80 border border-cyan-500/20 text-white/70 hover:text-white flex items-center justify-center transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-white/50 text-sm mt-2">Loading stats...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-400/80 text-sm">{error}</p>
            </div>
          )}

          {!loading && !stats && !plinkoStats && !error && (
            <div className="text-center py-8">
              <p className="text-white/50 text-sm">No game history found</p>
            </div>
          )}

          {!loading && (stats || plinkoStats) && (
            <div className="space-y-4">
              {/* Tabs */}
              {stats && plinkoStats && (
                <div className="flex gap-2 p-1 rounded-lg bg-black/30">
                  <button
                    onClick={() => setActiveTab('blackjack')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition ${
                      activeTab === 'blackjack'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    Blackjack
                  </button>
                  <button
                    onClick={() => setActiveTab('plinko')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition ${
                      activeTab === 'plinko'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    Plinko
                  </button>
                </div>
              )}

              {/* Blackjack Stats */}
              {activeTab === 'blackjack' && stats && (
                <>
                  {/* Rank Badge */}
                  {stats.rank && (
                    <div className="flex justify-center">
                      <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30">
                        <span className="text-amber-300 text-sm font-medium">
                          Rank #{stats.rank}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Main Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {reserveBalance !== undefined && (
                      <StatCard
                        label="Reserve"
                        value={<>{formatMorbius(reserveBalance.toString())} <MorbiusIcon /></>}
                      />
                    )}
                    <StatCard label="Games Played" value={stats.total_games.toString()} />
                    <StatCard label="Win Rate" value={`${stats.win_rate.toFixed(1)}%`} />
                    <StatCard label="Total Wagered" value={<>{formatMorbius(stats.total_bet)} <MorbiusIcon /></>} />
                    <StatCard label="Total Won" value={<>{formatMorbius(stats.total_win)} <MorbiusIcon /></>} />
                  </div>

                  {/* Profit/Loss */}
                  <div
                    className={`p-3 rounded-xl text-center ${
                      isProfitable
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <p className="text-white/50 text-xs mb-1">Profit / Loss</p>
                    <p className={`text-lg font-bold flex items-center justify-center gap-1 ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfitable ? '+' : ''}{formatMorbius(stats.profit_loss)} <MorbiusIcon size={18} />
                    </p>
                    {stats.roi !== undefined && (
                      <p className={`text-xs ${isProfitable ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                        ROI: {stats.roi > 0 ? '+' : ''}{stats.roi.toFixed(2)}%
                      </p>
                    )}
                  </div>

                  {/* Additional Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="Blackjacks" value={stats.blackjack_count.toString()} />
                    <MiniStat label="Best Streak" value={stats.best_streak?.toString() ?? '-'} />
                    <MiniStat label="Current" value={stats.current_streak?.toString() ?? '-'} />
                  </div>

                  {/* Biggest Win/Loss */}
                  {(stats.biggest_win || stats.biggest_loss) && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      {stats.biggest_win && (
                        <div className="text-center">
                          <p className="text-white/40 text-[10px] uppercase tracking-wider">Biggest Win</p>
                          <p className="text-emerald-400 text-sm font-medium flex items-center justify-center gap-1">
                            {formatMorbius(stats.biggest_win)} <MorbiusIcon />
                          </p>
                        </div>
                      )}
                      {stats.biggest_loss && (
                        <div className="text-center">
                          <p className="text-white/40 text-[10px] uppercase tracking-wider">Biggest Loss</p>
                          <p className="text-red-400 text-sm font-medium flex items-center justify-center gap-1">
                            {formatMorbius(stats.biggest_loss)} <MorbiusIcon />
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Activity */}
                  {(stats.games_today !== undefined || stats.games_this_week !== undefined) && (
                    <div className="flex justify-center gap-4 text-xs text-white/40 pt-2 border-t border-white/5">
                      {stats.games_today !== undefined && (
                        <span>Today: {stats.games_today} games</span>
                      )}
                      {stats.games_this_week !== undefined && (
                        <span>This week: {stats.games_this_week} games</span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Plinko Stats */}
              {activeTab === 'plinko' && plinkoStats && (
                <>
                  {/* Main Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label="Total Drops"
                      value={plinkoStats.totalDrops.toString()}
                    />
                    <StatCard
                      label="Ball Balance"
                      value={plinkoStats.ballBalance.toString()}
                    />
                    <StatCard
                      label="Balls Purchased"
                      value={<>{formatMorbius(plinkoStats.totalPurchased.toString())} <MorbiusIcon /></>}
                    />
                    <StatCard
                      label="Total Won"
                      value={<>{formatMorbius(plinkoStats.totalWon.toString())} <MorbiusIcon /></>}
                    />
                  </div>

                  {/* Plinko Profit/Loss */}
                  {(() => {
                    const plinkoProfitLoss = plinkoStats.totalWon - plinkoStats.totalPurchased;
                    const plinkoIsProfitable = plinkoProfitLoss >= 0n;
                    return (
                      <div
                        className={`p-3 rounded-xl text-center ${
                          plinkoIsProfitable
                            ? 'bg-emerald-500/10 border border-emerald-500/20'
                            : 'bg-red-500/10 border border-red-500/20'
                        }`}
                      >
                        <p className="text-white/50 text-xs mb-1">Profit / Loss</p>
                        <p className={`text-lg font-bold flex items-center justify-center gap-1 ${plinkoIsProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {plinkoIsProfitable ? '+' : ''}{formatMorbius(plinkoProfitLoss.toString())} <MorbiusIcon size={18} />
                        </p>
                      </div>
                    );
                  })()}

                  {/* Biggest Win */}
                  {plinkoStats.biggestWin > 0n && (
                    <div className="text-center pt-2 border-t border-white/5">
                      <p className="text-white/40 text-[10px] uppercase tracking-wider">Biggest Win</p>
                      <p className="text-emerald-400 text-lg font-bold flex items-center justify-center gap-1">
                        {formatMorbius(plinkoStats.biggestWin.toString())} <MorbiusIcon size={18} />
                      </p>
                    </div>
                  )}

                  {/* No games message */}
                  {plinkoStats.totalDrops === 0n && (
                    <div className="text-center py-4 text-white/40 text-sm">
                      No Plinko games played yet
                    </div>
                  )}
                </>
              )}

              {/* No stats message */}
              {activeTab === 'blackjack' && !stats && (
                <div className="text-center py-8 text-white/40 text-sm">
                  No Blackjack games played yet
                </div>
              )}
              {activeTab === 'plinko' && !plinkoStats && (
                <div className="text-center py-8 text-white/40 text-sm">
                  No Plinko data available
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="p-3 rounded-xl text-center"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
    >
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-sm font-semibold flex items-center justify-center gap-1">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-white/40 text-[10px]">{label}</p>
      <p className="text-cyan-300 text-sm font-medium">{value}</p>
    </div>
  );
}
