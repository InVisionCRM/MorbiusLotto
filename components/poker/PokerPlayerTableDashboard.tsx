'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Clock,
  Hash,
  DollarSign,
  Trophy,
  Activity,
  Zap,
  TrendingUp,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PokerTableState } from '@/lib/websocket-client';
import { CardDisplay } from '@/components/poker/CardDisplay';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtWei(wei: string | number): string {
  try {
    return formatMorbiusFloor(wei);
  } catch {
    return '0';
  }
}

function fmtAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeSince(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Dashboard data (from admin dashboard API, reused) ───────────────────────

interface DashboardData {
  table: {
    id: string;
    small_blind: string;
    big_blind: string;
    max_seats: number;
    hand_number: number;
    created_at: string;
  };
  stats: {
    total_hands: number;
    total_rake: string;
    total_pot_volume: string;
    avg_pot: string;
    avg_hand_duration_seconds: number;
    biggest_pot: string;
    hands_today: number;
    hands_this_hour: number;
  };
  recent_hands: Array<{
    id: string;
    hand_number: number;
    pot_amount: string;
    rake_amount: string;
    street: string;
    community_cards: number[];
    result: { winners: Array<{ address: string; amount: string; handName?: string }> } | null;
    completed_at: string;
    duration_seconds: number;
    player_count: number;
  }>;
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface PokerPlayerTableDashboardProps {
  tableId: string;
  state: PokerTableState | null;
  onClose?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function PokerPlayerTableDashboard({ tableId, state, onClose }: PokerPlayerTableDashboardProps) {
  // Fetch table metadata & history from the dashboard API (proxied through Next.js)
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['pokerTableInfo', tableId],
    queryFn: async () => {
      const res = await fetch(`/api/poker/table/${tableId}/dashboard`);
      if (!res.ok) throw new Error('Failed to fetch table info');
      return res.json();
    },
    enabled: !!tableId,
    refetchInterval: 15_000,
  });

  // Live seats from WebSocket state (real-time)
  const liveSeats = useMemo(() => {
    if (!state?.seats) return [];
    return state.seats.filter((s) => s.playerAddress);
  }, [state?.seats]);

  // Sort by stack descending
  const sortedSeats = useMemo(
    () => [...liveSeats].sort((a, b) => {
      try { return Number(BigInt(b.stack) - BigInt(a.stack)); } catch { return 0; }
    }),
    [liveSeats],
  );

  const totalChipsOnTable = useMemo(
    () => liveSeats.reduce((sum, s) => sum + BigInt(s.stack || '0'), 0n),
    [liveSeats],
  );

  const tableUptime = data?.table?.created_at ? timeSince(data.table.created_at) : '—';

  const closeHeader = onClose ? (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 -mt-1 mb-1">
      <h2 className="text-sm font-bold text-white tracking-tight">Table stats</h2>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 border border-transparent hover:border-cyan-500/30 transition-colors"
        aria-label="Close table stats"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  ) : null;

  // Loading skeleton
  if (isLoading && !state) {
    return (
      <div className="p-4 space-y-4">
        {closeHeader}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
              <CardContent className="pt-4">
                <div className="h-4 bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-6 bg-gray-700 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {closeHeader}
      {/* ── Table Info Bar ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            title: 'Players',
            value: `${liveSeats.length} / ${state?.maxSeats ?? data?.table?.max_seats ?? '?'}`,
            icon: Users,
            color: 'text-blue-400',
          },
          {
            title: 'Table Uptime',
            value: tableUptime,
            icon: Clock,
            color: 'text-cyan-400',
          },
          {
            title: 'Hands Played',
            value: (data?.stats?.total_hands ?? state?.currentHand ? '—' : '0').toString(),
            realValue: data?.stats?.total_hands?.toLocaleString() ?? '—',
            icon: Hash,
            color: 'text-yellow-400',
          },
          {
            title: 'Blinds',
            value: `${fmtWei(state?.smallBlind ?? data?.table?.small_blind ?? '0')} / ${fmtWei(state?.bigBlind ?? data?.table?.big_blind ?? '0')}`,
            icon: DollarSign,
            color: 'text-purple-400',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-500 font-medium">{stat.title}</span>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
                <div className={`text-lg font-bold ${stat.color} tabular-nums`}>
                  {stat.realValue ?? stat.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Players at Table ──────────────────────────────────────── */}
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-blue-400" />
            Players at Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedSeats.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No players seated</p>
          ) : (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-2 text-[10px] text-gray-600 uppercase tracking-wider font-medium">
                <span>Seat</span>
                <span>Player</span>
                <span className="text-right">Stack</span>
                <span className="text-right">Status</span>
              </div>
              {sortedSeats.map((seat, i) => {
                const isDealer = seat.isDealer;
                const isActing = seat.isActing;
                return (
                  <motion.div
                    key={seat.position}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-2 py-2 rounded-md ${
                      isActing ? 'bg-cyan-400/5 border border-cyan-400/20' : 'bg-gray-800/30'
                    }`}
                  >
                    {/* Seat # */}
                    <span className="text-xs text-gray-500 font-mono w-6 text-center">
                      {seat.position + 1}
                    </span>

                    {/* Player name + badges */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-white font-medium truncate">
                        {seat.displayName || fmtAddr(seat.playerAddress!)}
                      </span>
                      {isDealer && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 flex-shrink-0">
                          D
                        </span>
                      )}
                      {seat.isSmallBlind && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-400 flex-shrink-0">
                          SB
                        </span>
                      )}
                      {seat.isBigBlind && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-400/15 text-purple-400 flex-shrink-0">
                          BB
                        </span>
                      )}
                    </div>

                    {/* Stack */}
                    <span className="text-sm font-bold text-green-400 tabular-nums text-right">
                      {fmtWei(seat.stack)}
                    </span>

                    {/* Status */}
                    <span
                      className={`text-[10px] font-medium text-right ${
                        isActing
                          ? 'text-cyan-400'
                          : seat.folded
                            ? 'text-red-400/60'
                            : 'text-gray-500'
                      }`}
                    >
                      {isActing ? 'Acting' : seat.folded ? 'Folded' : seat.status === 'sitting_out' ? 'Sitting out' : 'Active'}
                    </span>
                  </motion.div>
                );
              })}
              {/* Total chips row */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-2 pt-2 border-t border-gray-700/50">
                <span />
                <span className="text-xs text-gray-400 font-medium">Total on table</span>
                <span className="text-sm font-bold text-white tabular-nums text-right">
                  {fmtWei(totalChipsOnTable.toString())}
                </span>
                <span />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Table Stats ───────────────────────────────────────────── */}
      {data?.stats && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-cyan-400" />
              Table Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Pot Volume', value: `${fmtWei(data.stats.total_pot_volume)} MORBIUS`, color: 'text-purple-400' },
                { label: 'Biggest Pot', value: `${fmtWei(data.stats.biggest_pot)} MORBIUS`, color: 'text-yellow-400' },
                { label: 'Avg Pot', value: `${fmtWei(data.stats.avg_pot)} MORBIUS`, color: 'text-cyan-400' },
                { label: 'Hands This Hour', value: data.stats.hands_this_hour.toString(), color: 'text-green-400' },
              ].map((item) => (
                <div key={item.label} className="text-center p-2 rounded-md bg-gray-800/40">
                  <div className={`text-sm font-bold ${item.color} tabular-nums`}>{item.value}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Hands ──────────────────────────────────────────── */}
      {data?.recent_hands && data.recent_hands.length > 0 && (
        <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Recent Hands
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.recent_hands.slice(0, 20).map((hand) => (
                <div
                  key={hand.id}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-md bg-gray-800/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-500 font-mono">#{hand.hand_number}</span>
                    {/* Community cards */}
                    {hand.community_cards?.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {hand.community_cards.map((c, i) => (
                          <CardDisplay key={i} cardIndex={c} small />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400">
                      Pot: <span className="text-white font-medium">{fmtWei(hand.pot_amount)}</span>
                    </span>
                    {hand.result?.winners?.[0] && (
                      <span className="text-[10px] text-green-400">
                        {fmtAddr(hand.result.winners[0].address)}
                        {hand.result.winners[0].handName && (
                          <span className="text-cyan-400 ml-1">({hand.result.winners[0].handName})</span>
                        )}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">{timeAgo(hand.completed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
