'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { formatEther } from 'viem';
import type { BJMultiTableSummary } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Button } from '@/components/ui/button';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { Users, ArrowRight, Filter } from 'lucide-react';
import { BlackjackMultiBetaSplash } from '@/components/BLACKJACK/BlackjackMultiBetaSplash';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch {
    return wei;
  }
}

type StatusFilter = 'all' | 'open' | 'active';
type SeatFilter = 'all' | 'has_seats' | 'full';

type BlackjackMultiLobbyClientProps = {
  initialTables: BJMultiTableSummary[];
  initialError: string | null;
};

export default function BlackjackMultiLobbyClient({
  initialTables,
  initialError,
}: BlackjackMultiLobbyClientProps) {
  const { getThemeInfo } = useBlackjackTables();
  const [tables, setTables] = useState<BJMultiTableSummary[]>(initialTables);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [seatFilter, setSeatFilter] = useState<SeatFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const fetchTables = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/bj-multi/admin/tables');
      if (!res.ok) {
        throw new Error('Failed to load tables');
      }
      const data = await res.json();
      setTables(data.tables ?? []);
      setError(null);
    } catch (_err) {
      setError('Failed to load tables');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Recover quickly when initial server-side fetch misses.
    void fetchTables({ silent: initialTables.length > 0 && !initialError });

    const interval = setInterval(() => {
      void fetchTables({ silent: true });
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchTables, initialError, initialTables.length]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (statusFilter === 'open' && t.status !== 'waiting' && t.status !== 'betting') return false;
      if (statusFilter === 'active' && t.status !== 'playing' && t.status !== 'dealer_turn') return false;
      if (seatFilter === 'has_seats' && t.seatedCount >= 3) return false;
      if (seatFilter === 'full' && t.seatedCount < 3) return false;
      return true;
    });
  }, [tables, statusFilter, seatFilter]);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (seatFilter !== 'all' ? 1 : 0);

  return (
    <GlobalMainNav page="blackjackMulti" showBackArrow backArrowHref="/" backArrowLabel="Back">
      <BlackjackMultiBetaSplash />
      <div className="min-h-screen bg-slate-950 text-white">
        <main className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-white mb-1">Multiplayer Blackjack</h1>
            <p className="text-slate-400 text-sm">Up to 3 players per table. MORBIUS bets.</p>
          </div>

          <div className="mb-4">
            <button
              onClick={() => setShowFilters((f) => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-white/70 hover:text-white transition-colors"
            >
              <Filter className="w-3 h-3" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-cyan-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {showFilters && (
              <div className="mt-2 flex flex-wrap gap-2 p-3 bg-slate-800/40 border border-slate-700 rounded-lg">
                <div className="space-y-1">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Status</div>
                  <div className="flex gap-1">
                    {([['all', 'All'], ['open', 'Open'], ['active', 'In Progress']] as const).map(
                      ([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setStatusFilter(val)}
                          className={`px-2.5 py-1 rounded text-xs transition-colors ${
                            statusFilter === val
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-700/60 text-white/60 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Seats</div>
                  <div className="flex gap-1">
                    {([['all', 'Any'], ['has_seats', 'Available'], ['full', 'Full']] as const).map(
                      ([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setSeatFilter(val)}
                          className={`px-2.5 py-1 rounded text-xs transition-colors ${
                            seatFilter === val
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-700/60 text-white/60 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setSeatFilter('all');
                    }}
                    className="text-xs text-red-400 hover:text-red-300 self-end ml-auto"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {loading && (
            <div className="text-center text-slate-500 text-sm py-12">Loading tables...</div>
          )}
          {error && <div className="text-center text-red-400 text-sm py-12">{error}</div>}

          {!loading && filteredTables.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-12">
              {tables.length === 0 ? 'No tables available. Ask an admin to create one.' : 'No tables match your filters.'}
            </div>
          )}

          <div className="space-y-3">
            {filteredTables.map((table) => {
              const kind = table.themeKind ?? 'video';
              const themeId = table.themeId ?? 'glowingTable';
              const theme = getThemeInfo({ kind, id: themeId });
              return (
                <div
                  key={table.id}
                  className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          table.status === 'waiting'
                            ? 'bg-slate-700 text-slate-300'
                            : table.status === 'betting'
                              ? 'bg-yellow-800/60 text-yellow-300'
                              : 'bg-green-800/60 text-green-300'
                        }`}
                      >
                        {table.status === 'waiting'
                          ? 'Open'
                          : table.status === 'betting'
                            ? 'Betting'
                            : 'In Progress'}
                      </span>
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <Users className="w-3 h-3 shrink-0" />
                        {table.seatedCount}/3
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs">
                      {formatMorbius(table.minBet)} - {formatMorbius(table.maxBet)} MORBIUS
                    </p>
                    <p className="text-slate-500 text-[11px] leading-snug">
                      <span className="text-slate-500">Table: </span>
                      <span className="text-cyan-400/90 font-medium">{theme.label}</span>
                      <span className="text-slate-600"> · </span>
                      <span className="text-slate-400">{theme.kind === 'video' ? 'Video' : 'Image'}</span>
                    </p>
                  </div>
                  <Link href={`/blackjack-multi/${table.id}`}>
                    <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs gap-1">
                      {table.seatedCount >= 3 ? 'Watch' : 'Join'} <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <GameFAQ
              game="blackjack"
              addresses={[
                { label: 'Blackjack Contract', address: BLACKJACK_ADDRESS },
                { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
              ]}
            />
          </div>
        </main>
      </div>
    </GlobalMainNav>
  );
}
