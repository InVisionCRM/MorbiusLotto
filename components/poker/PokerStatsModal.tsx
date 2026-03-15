'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatEther } from 'viem';
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
  Clock,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDisplay } from '@/components/poker/CardDisplay';
import {
  usePokerPlayerHands,
  usePokerPlayerStats,
  usePokerHandDetail,
  type PokerHandListEntry,
  type PokerPlayerStats as PokerStatsType,
} from '@/hooks/use-poker-stats';

function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
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
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export interface PokerStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerAddress: string | null;
}

export function PokerStatsModal({ isOpen, onClose, playerAddress }: PokerStatsModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [expandedHandId, setExpandedHandId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'profit'>('newest');

  const { data: stats, isLoading: statsLoading } = usePokerPlayerStats(isOpen ? playerAddress : null);
  const { data: hands, isLoading: handsLoading } = usePokerPlayerHands(
    isOpen ? playerAddress : null,
    100
  );
  const { data: handDetail, isLoading: detailLoading } = usePokerHandDetail(
    expandedHandId,
    playerAddress
  );

  const sortedHands = useMemo(() => {
    if (!hands) return [];
    const sorted = [...hands];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
      case 'profit': {
        return sorted.sort((a, b) => {
          const aProfit = Number(BigInt(a.myWon) - BigInt(a.myContributed));
          const bProfit = Number(BigInt(b.myWon) - BigInt(b.myContributed));
          return bProfit - aProfit;
        });
      }
      default:
        return sorted;
    }
  }, [hands, sortBy]);

  const getResultColor = (resultType: string) => {
    switch (resultType) {
      case 'win':
        return 'text-green-400 bg-green-900/20';
      case 'loss':
        return 'text-red-400 bg-red-900/20';
      case 'fold':
        return 'text-yellow-400 bg-yellow-900/20';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
  };

  const getProfitColor = (profitLoss: string) => {
    const n = Number(BigInt(profitLoss));
    if (n > 0) return 'text-green-400';
    if (n < 0) return 'text-red-400';
    return 'text-yellow-400';
  };

  if (!isOpen) return null;

  const s = stats as PokerStatsType | undefined;
  const statsCards = s
    ? [
        {
          title: 'Total Hands',
          value: s.total_hands.toLocaleString(),
          icon: Activity,
          subtitle: `${s.hands_won} wins`,
          color: 'text-blue-400',
        },
        {
          title: 'Win Rate',
          value: `${Math.round(s.win_rate)}%`,
          icon: Target,
          subtitle: `${s.hands_won} of ${s.total_hands} hands`,
          color: s.win_rate >= 50 ? 'text-green-400' : s.win_rate >= 40 ? 'text-yellow-400' : 'text-red-400',
          progress: s.win_rate,
        },
        {
          title: 'Profit / Loss',
          value: `${Number(BigInt(s.profit_loss)) >= 0 ? '+' : ''}${formatChips(s.profit_loss)}`,
          icon: Number(BigInt(s.profit_loss)) >= 0 ? TrendingUp : TrendingDown,
          subtitle: `${s.roi >= 0 ? '+' : ''}${Math.round(s.roi)}% ROI`,
          color: getProfitColor(s.profit_loss),
        },
        {
          title: 'Total Wagered',
          value: formatChips(s.total_wagered),
          icon: DollarSign,
          subtitle: 'Chips put in pot',
          color: 'text-purple-400',
        },
        {
          title: 'Total Won',
          value: formatChips(s.total_won),
          icon: Trophy,
          subtitle: 'From winning hands',
          color: 'text-green-400',
        },
        {
          title: 'Current Streak',
          value: s.current_streak > 0 ? `+${s.current_streak}` : String(s.current_streak),
          icon: BarChart3,
          subtitle: `Best: ${s.best_streak} wins`,
          color: s.current_streak > 0 ? 'text-green-400' : 'text-red-400',
        },
      ]
    : [];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Poker stats and history"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-cyan-500/30 bg-slate-900/80">
          <h2 className="text-lg font-bold text-white">Poker Stats & History</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-white/10 px-4 py-2 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 rounded-lg ${
              activeTab === 'stats'
                ? 'text-cyan-400 bg-cyan-500/20 border border-cyan-500/40'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Stats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 rounded-lg ${
              activeTab === 'history'
                ? 'text-cyan-400 bg-cyan-500/20 border border-cyan-500/40'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {activeTab === 'stats' && (
            <>
              {statsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="bg-gray-900/80 border-gray-700">
                      <CardHeader className="pb-2">
                        <div className="h-4 bg-gray-700 rounded animate-pulse w-24" />
                      </CardHeader>
                      <CardContent>
                        <div className="h-8 bg-gray-700 rounded animate-pulse w-32 mb-2" />
                        <div className="h-3 bg-gray-700 rounded animate-pulse w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {statsCards.map((stat, index) => (
                      <Card
                        key={stat.title}
                        className="bg-gradient-to-br from-gray-900 to-black border-gray-700"
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-gray-400">
                            {stat.title}
                          </CardTitle>
                          <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                          <div className={`text-xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
                          <p className="text-xs text-gray-500">{stat.subtitle}</p>
                          {stat.progress !== undefined && (
                            <div
                              className="mt-2 h-1 rounded-full bg-gray-700 overflow-hidden"
                              style={{ background: 'rgba(55, 65, 81, 0.5)' }}
                            >
                              <div
                                className="h-full bg-cyan-500 rounded-full"
                                style={{ width: `${Math.min(100, stat.progress)}%` }}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {s && (Number(BigInt(s.biggest_pot_won)) > 0 || Number(BigInt(s.biggest_loss)) > 0) && (
                    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                          <Trophy className="w-4 h-4 text-yellow-400" />
                          Personal Records
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
                          <TrendingUp className="h-4 w-4 text-green-400" />
                          <span className="text-sm text-gray-300">Biggest pot won</span>
                          <span className="text-sm font-medium text-green-400">
                            {formatChips(s.biggest_pot_won)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
                          <TrendingDown className="h-4 w-4 text-red-400" />
                          <span className="text-sm text-gray-300">Biggest loss</span>
                          <span className="text-sm font-medium text-red-400">
                            {formatChips(s.biggest_loss)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              {handsLoading ? (
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                  <CardContent className="py-8 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent" />
                    <span className="ml-2 text-gray-400">Loading history...</span>
                  </CardContent>
                </Card>
              ) : !hands || hands.length === 0 ? (
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
                  <CardContent className="py-8 text-center">
                    <History className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">No hands played yet</p>
                    <p className="text-sm text-gray-500 mt-2">Play poker to see your hand history</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-white flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Hand History ({hands.length})
                    </CardTitle>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'profit')}
                      className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                      aria-label="Sort by"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="profit">By profit</option>
                    </select>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-700/60">
                      <AnimatePresence>
                        {sortedHands.map((entry) => {
                          const profit = BigInt(entry.myWon) - BigInt(entry.myContributed);
                          const isExpanded = expandedHandId === entry.id;
                          return (
                            <motion.div
                              key={entry.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-gray-800/30"
                            >
                              <div
                                className="flex flex-wrap items-center justify-between gap-2 p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                                onClick={() =>
                                  setExpandedHandId(isExpanded ? null : entry.id)
                                }
                              >
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border-0 ${getResultColor(
                                      entry.resultType
                                    )}`}
                                  >
                                    {entry.resultType.toUpperCase()}
                                  </span>
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatHandTime(entry.completed_at)}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Hand #{entry.hand_number} · Pot {formatChips(entry.pot_amount)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`text-sm font-bold ${getProfitColor(profit.toString())}`}
                                  >
                                    {Number(profit) >= 0 ? '+' : ''}
                                    {formatChips(profit.toString())}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                                  )}
                                </div>
                              </div>
                              {isExpanded && (
                                <HandReplay
                                  entry={entry}
                                  detail={handDetail}
                                  detailLoading={detailLoading}
                                />
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

function HandReplay({
  entry,
  detail,
  detailLoading,
}: {
  entry: PokerHandListEntry;
  detail: import('@/hooks/use-poker-stats').PokerHandDetail | null | undefined;
  detailLoading: boolean;
}) {
  if (detailLoading) {
    return (
      <div className="px-3 pb-3 pt-1 flex items-center gap-2 text-sm text-gray-400">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-400 border-t-transparent" />
        Loading hand detail...
      </div>
    );
  }
  const hasDetail = detail && detail.id === entry.id;
  return (
    <div className="px-3 pb-3 pt-1 border-t border-gray-700/60 space-y-3">
      <div className="flex flex-wrap gap-4 items-start">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Community</p>
          <div className="flex gap-1 flex-wrap">
            {(hasDetail ? detail!.community_cards : entry.community_cards).map((cardIdx, i) => (
              <CardDisplay key={i} cardIndex={cardIdx} small />
            ))}
            {(!hasDetail ? entry.community_cards : detail!.community_cards).length === 0 && (
              <span className="text-xs text-gray-500">—</span>
            )}
          </div>
        </div>
        {hasDetail && detail!.holeCards && detail!.holeCards.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Your cards</p>
            <div className="flex gap-1">
              {detail!.holeCards.map((cardIdx, i) => (
                <CardDisplay key={i} cardIndex={cardIdx} small />
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pot</p>
          <p className="text-sm text-white font-medium">{formatChips(entry.pot_amount)}</p>
        </div>
      </div>
      {entry.result?.winners && entry.result.winners.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Winners</p>
          <ul className="space-y-1">
            {entry.result.winners.map((w, i) => (
              <li key={i} className="text-sm text-gray-300">
                {shortAddr(w.address)} +{formatChips(w.amount)}
                {w.handName ? ` (${w.handName})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasDetail && detail!.actions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Actions</p>
          <ul className="space-y-0.5 max-h-32 overflow-y-auto">
            {detail!.actions.map((a, i) => (
              <li key={i} className="text-xs text-gray-400">
                <span className="text-cyan-400/90">{a.street}</span>{' '}
                {shortAddr(a.player_address)} {a.action}{' '}
                {Number(a.amount) > 0 ? formatChips(a.amount) : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
