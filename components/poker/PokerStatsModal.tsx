'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { formatChips } from '@/lib/format-poker-chips';
import {
  BarChart3,
  History,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDisplay } from '@/components/poker/CardDisplay';
import { PokerPlayerDashboard } from '@/components/poker/PokerPlayerDashboard';
import {
  usePokerPlayerHands,
  usePokerHandDetail,
  type PokerHandListEntry,
} from '@/hooks/use-poker-stats';

function formatHandChipAmount(_isTournament: boolean, raw: string | number): string {
  return formatChips(raw);
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
          const aProfit = Number(toBigIntSafe(a.myWon) - toBigIntSafe(a.myContributed));
          const bProfit = Number(toBigIntSafe(b.myWon) - toBigIntSafe(b.myContributed));
          return bProfit - aProfit;
        });
      }
      default:
        return sorted;
    }
  }, [hands, sortBy]);

  const selectedEntry = useMemo(
    () => (expandedHandId ? sortedHands.find((h) => h.id === expandedHandId) ?? null : null),
    [expandedHandId, sortedHands]
  );

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
    const n = Number(toBigIntSafe(profitLoss));
    if (n > 0) return 'text-green-400';
    if (n < 0) return 'text-red-400';
    return 'text-yellow-400';
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="surface-modal-shell"
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
        className="surface-modal-card fixed left-1/2 top-1/2 z-50 flex max-h-[75vh] w-full !max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col"
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
                ? 'text-cyan-500 bg-cyan-500/10 border border-cyan-500/20'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {activeTab === 'stats' && playerAddress && (
            <PokerPlayerDashboard playerAddress={playerAddress} showRecentHands={false} />
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
                <>
                  {/* Header: title + sort */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Hand History ({hands.length})
                    </h3>
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
                  </div>

                  {/* ── Desktop: 2-panel (list | detail) ── */}
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 min-h-0">
                    {/* Left panel — hand list */}
                    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden flex flex-col">
                      <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
                        <div className="divide-y divide-gray-700/60">
                          {sortedHands.map((entry) => {
                            const profit = toBigIntSafe(entry.myWon) - toBigIntSafe(entry.myContributed);
                            const isTourney = !!entry.tournamentId;
                            const isSelected = expandedHandId === entry.id;
                            return (
                              <div
                                key={entry.id}
                                className={`flex flex-wrap items-center justify-between gap-2 p-3 cursor-pointer transition-colors ${
                                  isSelected ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400' : 'bg-gray-800/30 hover:bg-gray-800/50 border-l-2 border-l-transparent'
                                }`}
                                onClick={() => setExpandedHandId(isSelected ? null : entry.id)}
                              >
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border-0 ${getResultColor(entry.resultType)}`}
                                  >
                                    {entry.resultType.toUpperCase()}
                                  </span>
                                  {isTourney && (
                                    <span
                                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 max-w-[10rem] truncate"
                                      title={entry.tournamentName ?? 'Tournament'}
                                    >
                                      SNG
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatHandTime(entry.completed_at)}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Hand #{entry.hand_number}
                                  </span>
                                </div>
                                <span className={`text-sm font-bold ${getProfitColor(profit.toString())}`}>
                                  {profit >= 0n ? '+' : ''}{formatHandChipAmount(isTourney, profit.toString())}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Right panel — hand detail */}
                    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden flex flex-col">
                      <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
                        {expandedHandId && selectedEntry ? (
                          <HandReplay entry={selectedEntry} detail={handDetail} detailLoading={detailLoading} />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
                            <History className="w-10 h-10 mb-3 opacity-40" />
                            <p className="text-sm">Select a hand to view details</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Mobile: stacked accordion ── */}
                  <Card className="md:hidden bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-visible">
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-700/60">
                        <AnimatePresence>
                          {sortedHands.map((entry) => {
                            const profit = toBigIntSafe(entry.myWon) - toBigIntSafe(entry.myContributed);
                            const isTourney = !!entry.tournamentId;
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
                                  onClick={() => setExpandedHandId(isExpanded ? null : entry.id)}
                                >
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border-0 ${getResultColor(entry.resultType)}`}
                                    >
                                      {entry.resultType.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      {formatHandTime(entry.completed_at)}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      Hand #{entry.hand_number} · Pot {formatHandChipAmount(isTourney, entry.pot_amount)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-bold ${getProfitColor(profit.toString())}`}>
                                      {profit >= 0n ? '+' : ''}{formatHandChipAmount(isTourney, profit.toString())}
                                    </span>
                                    {isExpanded ? (
                                      <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                                    )}
                                  </div>
                                </div>
                                {isExpanded && (
                                  <HandReplay entry={entry} detail={handDetail} detailLoading={detailLoading} />
                                )}
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </CardContent>
                  </Card>
                </>
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
  const isTourney = !!(entry.tournamentId ?? detail?.tournamentId);
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
    <div className="px-3 pb-3 pt-1 border-t border-gray-700/60 space-y-3 overflow-visible">
      <div className="flex flex-wrap gap-5 sm:gap-6 items-start">
        <div className="shrink-0 min-w-0 max-w-full">
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
          <div className="shrink-0 min-w-[11rem] sm:min-w-[12.5rem] md:min-w-[14rem] px-1 overflow-visible">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Your cards</p>
            <div className="flex gap-1.5 justify-start overflow-visible">
              {detail!.holeCards.map((cardIdx, i) => (
                <CardDisplay key={i} cardIndex={cardIdx} small className="shrink-0" />
              ))}
            </div>
          </div>
        )}
        <div className="shrink-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pot</p>
          <p className="text-sm text-white font-medium">{formatHandChipAmount(isTourney, entry.pot_amount)}</p>
        </div>
      </div>
      {entry.result?.winners && entry.result.winners.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Winners</p>
          <ul className="space-y-1">
            {entry.result.winners.map((w, i) => (
              <li key={i} className="text-sm text-gray-300">
                {shortAddr(w.address)} +{formatHandChipAmount(isTourney, w.amount)}
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
                {Number(a.amount) > 0 ? formatHandChipAmount(isTourney, a.amount) : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Provably-fair verification link. Lands on /poker/verify with this
          hand pre-filled; the page re-derives the shuffle in the browser and
          confirms the deal wasn't rigged. */}
      <div className="pt-2 border-t border-gray-700/40">
        <a
          href={`/poker/verify?handId=${entry.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Verify this hand <span aria-hidden>↗</span>
        </a>
      </div>
    </div>
  );
}
