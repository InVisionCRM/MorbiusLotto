'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import {
  Activity,
  BarChart3,
  Trophy,
  DollarSign,
  Target,
  TrendingUp,
  TrendingDown,
  History,
  ChevronDown,
  ChevronUp,
  Zap,
  PieChart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import {
  usePokerPlayerTableStats,
  usePokerPlayerHands,
  usePokerHandDetail,
  type PokerHandListEntry,
} from '@/hooks/use-poker-stats';
import { CardDisplay } from '@/components/poker/CardDisplay';

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
};

function formatChips(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)));
    if (num === 0) return '0';
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(wei);
  }
}

function formatChipsFull(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(wei);
  }
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatHandTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export interface PokerPlayerTableDashboardProps {
  tableId: string;
  playerAddress: string;
}

export function PokerPlayerTableDashboard({ tableId, playerAddress }: PokerPlayerTableDashboardProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'profit'>('newest');
  const [expandedHandId, setExpandedHandId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = usePokerPlayerTableStats(tableId, playerAddress);
  const { data: hands, isLoading: handsLoading } = usePokerPlayerHands(playerAddress, 100);
  const { data: handDetail, isLoading: detailLoading } = usePokerHandDetail(expandedHandId, playerAddress);

  // Filter hands to this table only
  const tableHands = useMemo(() => {
    if (!hands) return [];
    return hands.filter((h) => h.table_id === tableId);
  }, [hands, tableId]);

  const sortedHands = useMemo(() => {
    const arr = [...tableHands];
    if (sortBy === 'oldest') arr.reverse();
    if (sortBy === 'profit') {
      arr.sort((a, b) => {
        const pA = Number(formatEther(toBigIntSafe(a.myWon) - toBigIntSafe(a.myContributed)));
        const pB = Number(formatEther(toBigIntSafe(b.myWon) - toBigIntSafe(b.myContributed)));
        return pB - pA;
      });
    }
    return arr;
  }, [tableHands, sortBy]);

  // Chart data — cumulative P&L over time at this table
  const chartData = useMemo(() => {
    if (!stats?.hands_history || stats.hands_history.length === 0) return [];
    let cumWagered = 0;
    let cumWon = 0;
    const data: Array<{ hand: string; totalWagered: number; totalWon: number }> = [];
    // Sample every N hands to avoid overplotting
    const step = Math.max(1, Math.floor(stats.hands_history.length / 50));
    stats.hands_history.forEach((h, i) => {
      cumWagered += Number(formatEther(toBigIntSafe(h.my_contributed)));
      cumWon += Number(formatEther(toBigIntSafe(h.my_won)));
      if (i % step === 0 || i === stats.hands_history.length - 1) {
        data.push({
          hand: `#${h.hand_number}`,
          totalWagered: Math.round(cumWagered),
          totalWon: Math.round(cumWon),
        });
      }
    });
    return data;
  }, [stats?.hands_history]);

  // Build stats cards
  const pnl = stats ? toBigIntSafe(stats.profit_loss) : 0n;
  const pnlNum = stats ? Number(formatEther(pnl)) : 0;
  const pnlPositive = pnlNum >= 0;

  const statsCards = stats
    ? [
        {
          title: 'Hands Played',
          value: stats.total_hands.toLocaleString(),
          subtitle: `${stats.hands_won} won`,
          icon: Activity,
          color: 'text-blue-400',
        },
        {
          title: 'Win Rate',
          value: `${stats.win_rate.toFixed(1)}%`,
          subtitle: `${stats.hands_won} / ${stats.total_hands}`,
          icon: Target,
          color: 'text-yellow-400',
          progress: stats.win_rate,
        },
        {
          title: 'Profit / Loss',
          value: `${pnlPositive ? '+' : ''}${formatChips(stats.profit_loss)}`,
          subtitle: `ROI: ${stats.roi.toFixed(1)}%`,
          icon: pnlPositive ? TrendingUp : TrendingDown,
          color: pnlPositive ? 'text-green-400' : 'text-red-400',
        },
        {
          title: 'Total Wagered',
          value: formatChips(stats.total_wagered),
          subtitle: 'MORBIUS',
          icon: DollarSign,
          color: 'text-purple-400',
        },
        {
          title: 'Total Won',
          value: formatChips(stats.total_won),
          subtitle: 'MORBIUS',
          icon: Trophy,
          color: 'text-cyan-400',
        },
        {
          title: 'Current Streak',
          value: `${stats.current_streak > 0 ? '+' : ''}${stats.current_streak}`,
          subtitle: `Best: ${stats.best_streak}`,
          icon: Zap,
          color:
            stats.current_streak > 0
              ? 'text-green-400'
              : stats.current_streak < 0
                ? 'text-red-400'
                : 'text-gray-400',
        },
      ]
    : [];

  // Loading skeleton
  if (statsLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
              <CardHeader className="pb-3">
                <div className="h-4 bg-gray-700 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-3 bg-gray-700 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats || stats.total_hands === 0) {
    return (
      <div className="p-8 text-center">
        <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">No hands played at this table yet.</p>
        <p className="text-gray-600 text-xs mt-1">Stats will appear after your first hand.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'history' as const, label: 'History', icon: History },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <>
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statsCards.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 hover:border-gray-600 transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
                    {stat.progress !== undefined && (
                      <Progress value={stat.progress} className="mt-2 h-1.5" />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Personal Records */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Personal Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-gray-800/50">
                  <div className="text-lg font-bold text-green-400 mb-1">
                    {formatChips(stats.biggest_pot_won)} MORBIUS
                  </div>
                  <div className="text-xs text-gray-400">Biggest Pot Won</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-800/50">
                  <div className="text-lg font-bold text-red-400 mb-1">
                    {formatChips(stats.biggest_loss)} MORBIUS
                  </div>
                  <div className="text-xs text-gray-400">Biggest Loss</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Insights */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-400" />
                Quick Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-400 mb-1">
                    {stats.total_hands > 0
                      ? ((stats.hands_history.filter((h) => h.result_type === 'fold').length / stats.total_hands) * 100).toFixed(1)
                      : 0}
                    %
                  </div>
                  <div className="text-xs text-gray-400">Fold Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-cyan-400 mb-1">
                    {stats.total_hands > 0
                      ? formatChips(
                          (toBigIntSafe(stats.total_wagered) / BigInt(stats.total_hands)).toString()
                        )
                      : '0'}
                  </div>
                  <div className="text-xs text-gray-400">Avg Wager / Hand</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-lg font-bold mb-1 ${
                      stats.current_streak > 3
                        ? 'text-green-400'
                        : stats.current_streak < -3
                          ? 'text-red-400'
                          : 'text-yellow-400'
                    }`}
                  >
                    {stats.best_streak}
                  </div>
                  <div className="text-xs text-gray-400">Best Win Streak</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* P&L Chart */}
          <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Cumulative Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full min-w-0">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="pokerTableColorWagered" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="pokerTableColorWon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="hand"
                        tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickLine={{ stroke: 'rgba(156, 163, 175, 0.3)' }}
                        tickFormatter={(v) =>
                          Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(17, 24, 39, 0.95)',
                          border: '1px solid rgba(75, 85, 99, 0.5)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'rgb(209, 213, 219)' }}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString()} MORBIUS`,
                          name === 'totalWagered' ? 'Total Wagered' : 'Total Won',
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="line"
                        formatter={(v) => (v === 'totalWagered' ? 'Total Wagered' : 'Total Won')}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalWagered"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fill="url(#pokerTableColorWagered)"
                        name="totalWagered"
                      />
                      <Area
                        type="monotone"
                        dataKey="totalWon"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        fill="url(#pokerTableColorWon)"
                        name="totalWon"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-white/60">
                    <p>Not enough data for chart yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {/* Sort selector */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {tableHands.length} hand{tableHands.length !== 1 ? 's' : ''} at this table
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="profit">By Profit</option>
            </select>
          </div>

          {handsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-sm text-gray-400">Loading hands…</span>
            </div>
          ) : sortedHands.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No hands recorded at this table yet.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedHands.map((hand) => (
                <HandRow
                  key={hand.id}
                  hand={hand}
                  expanded={expandedHandId === hand.id}
                  onToggle={() =>
                    setExpandedHandId(expandedHandId === hand.id ? null : hand.id)
                  }
                  detail={expandedHandId === hand.id ? handDetail : null}
                  detailLoading={expandedHandId === hand.id && detailLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Hand row (expandable)
// ────────────────────────────────────────────────────────────────────────────────

function HandRow({
  hand,
  expanded,
  onToggle,
  detail,
  detailLoading,
}: {
  hand: PokerHandListEntry;
  expanded: boolean;
  onToggle: () => void;
  detail: any;
  detailLoading: boolean;
}) {
  const pnl = toBigIntSafe(hand.myWon) - toBigIntSafe(hand.myContributed);
  const pnlNum = Number(formatEther(pnl));
  const resultColor =
    hand.resultType === 'win'
      ? 'text-green-400'
      : hand.resultType === 'fold'
        ? 'text-yellow-400'
        : 'text-red-400';
  const resultBg =
    hand.resultType === 'win'
      ? 'bg-green-400/10'
      : hand.resultType === 'fold'
        ? 'bg-yellow-400/10'
        : 'bg-red-400/10';

  return (
    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${resultColor} ${resultBg}`}
            >
              {hand.resultType}
            </span>
            <span className="text-xs text-gray-400">Hand #{hand.hand_number}</span>
            <span className="text-xs text-gray-600">{formatHandTime(hand.completed_at)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Pot: <span className="text-white font-medium">{formatChips(hand.pot_amount)}</span>
            </span>
            <span
              className={`text-xs font-bold tabular-nums ${pnlNum >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {pnlNum >= 0 ? '+' : ''}
              {formatChipsFull(pnl.toString())}
            </span>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          {detailLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : detail ? (
            <>
              {/* Community cards */}
              {detail.community_cards?.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Board</span>
                  <div className="flex items-center gap-1 mt-1">
                    {detail.community_cards.map((card: number, i: number) => (
                      <CardDisplay key={i} cardIndex={card} small />
                    ))}
                  </div>
                </div>
              )}

              {/* Hole cards */}
              {detail.holeCards?.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Your Cards
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    {detail.holeCards.map((card: number, i: number) => (
                      <CardDisplay key={i} cardIndex={card} small />
                    ))}
                  </div>
                </div>
              )}

              {/* Winners */}
              {detail.result?.winners?.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Winner{detail.result.winners.length > 1 ? 's' : ''}
                  </span>
                  <div className="mt-1 space-y-1">
                    {detail.result.winners.map(
                      (w: { address: string; amount: string; handName?: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-green-400 font-medium">
                            {shortAddr(w.address)}
                          </span>
                          <span className="text-gray-400">
                            won {formatChips(w.amount)} MORBIUS
                          </span>
                          {w.handName && (
                            <span className="text-cyan-400 text-[10px]">({w.handName})</span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              {detail.actions?.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                    Actions
                  </span>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {detail.actions.map(
                      (
                        a: {
                          street: string;
                          player_address: string;
                          action: string;
                          amount: string;
                        },
                        i: number
                      ) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-600 w-14 flex-shrink-0">{a.street}</span>
                          <span className="text-gray-400">{shortAddr(a.player_address)}</span>
                          <span
                            className={`font-medium ${
                              a.action === 'fold'
                                ? 'text-yellow-400'
                                : a.action === 'raise' || a.action === 'bet'
                                  ? 'text-orange-400'
                                  : a.action === 'call'
                                    ? 'text-cyan-400'
                                    : 'text-gray-400'
                            }`}
                          >
                            {a.action}
                          </span>
                          {Number(a.amount) > 0 && (
                            <span className="text-gray-500">
                              {formatChips(a.amount)}
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">Unable to load hand details.</p>
          )}
        </div>
      )}
    </Card>
  );
}
