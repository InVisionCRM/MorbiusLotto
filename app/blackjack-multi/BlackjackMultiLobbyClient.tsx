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
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import BlackjackHowToVideoModal from '@/components/BLACKJACK/BlackjackHowToVideoModal';

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
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [howToVideoOpen, setHowToVideoOpen] = useState(false);

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

  const openTablesCount = tables.filter((t) => t.status === 'waiting' || t.status === 'betting').length;

  return (
    <GlobalMainNav page="blackjackMulti" showBackArrow backArrowHref="/" backArrowLabel="Back">
      <BlackjackMultiBetaSplash />
      <div className="relative min-h-screen h-full w-full bg-gradient-to-b from-[#080c14] via-slate-950 to-[#080c14] text-white">
        <div className="absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)] pointer-events-none" />
        <main className="relative container mx-auto px-3 py-4 sm:px-4 sm:py-8 max-w-4xl">
          {/* ── Hero Section ── */}
          <div
            className="relative rounded-3xl overflow-hidden mb-6 sm:mb-8 border border-cyan-400/10"
            style={{
              background: 'linear-gradient(170deg, #0c1929 0%, #0a0f1a 40%, #0d1117 100%)',
              boxShadow: '0 0 80px rgba(34,211,238,0.07), 0 2px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.1)',
            }}
          >
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

            {/* Decorative card fan */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] pointer-events-none select-none opacity-[0.04]">
              <div className="relative w-[400px] h-[300px]">
                {[
                  { r: -25, x: -60, y: 0 },
                  { r: -10, x: -20, y: -10 },
                  { r: 5, x: 20, y: -10 },
                  { r: 20, x: 60, y: 0 },
                ].map((c, i) => (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 w-[140px] h-[200px] rounded-2xl border-2 border-white/30 bg-white/10"
                    style={{ transform: `translate(-50%, -50%) rotate(${c.r}deg) translateX(${c.x}px) translateY(${c.y}px)` }}
                  />
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(34,211,238,0.18),transparent_70%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_20%_100%,rgba(59,130,246,0.08),transparent_60%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_80%_100%,rgba(99,102,241,0.06),transparent_60%)] pointer-events-none" />
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }}
              />

              <div className="relative text-center px-5 sm:px-10 pt-12 sm:pt-14 pb-12 sm:pb-16">
                {/* Live badge */}
                <div
                  className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full mb-6 sm:mb-8"
                  style={{
                    background: 'rgba(34,211,238,0.06)',
                    border: '1px solid rgba(34,211,238,0.15)',
                    boxShadow: '0 0 20px rgba(34,211,238,0.08)',
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-cyan-400">
                    {openTablesCount > 0 ? `${openTablesCount} Live Table${openTablesCount !== 1 ? 's' : ''}` : 'No Active Tables'}
                  </span>
                </div>

                {/* Main title */}
                <h1
                  className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-3px] leading-[1] mb-2"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 40%, #64748b 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
                  }}
                >
                  Blackjack
                </h1>
                <p className="text-xs sm:text-sm tracking-[0.3em] uppercase text-cyan-400/80 mb-4">
                  Multiplayer
                </p>
                <p className="text-sm sm:text-base text-slate-500 mb-10 sm:mb-12 max-w-md mx-auto">
                  Up to 3 players per table. MORBIUS bets, provably fair.
                </p>

                {/* CTA buttons */}
                <div className="flex justify-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setWalletModalOpen(true)}
                    className="flex items-center gap-2 px-7 py-3.5 rounded-2xl text-white text-sm font-bold hover:-translate-y-0.5 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                      boxShadow: '0 4px 24px rgba(6,182,212,0.3), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
                    Deposit / Withdraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setHowToVideoOpen(true)}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                    style={{
                      background: 'rgba(30,41,59,0.5)',
                      border: '1px solid rgba(51,65,85,0.5)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                    How to Play
                  </button>
                </div>
              </div>
            </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {filteredTables.map((table) => {
              const kind = table.themeKind ?? 'video';
              const themeId = table.themeId ?? 'glowingTable';
              const theme = getThemeInfo({ kind, id: themeId });
              const isFull = table.seatedCount >= 3;
              const statusLabel =
                table.status === 'waiting'
                  ? 'Open'
                  : table.status === 'betting'
                    ? 'Betting'
                    : 'In Progress';
              const statusClass =
                table.status === 'waiting'
                  ? 'text-slate-300 border-slate-600/60 bg-black/20'
                  : table.status === 'betting'
                    ? 'text-yellow-300 border-yellow-500/35 bg-yellow-500/10'
                    : 'text-cyan-300 border-cyan-500/35 bg-cyan-500/10';
              return (
                <div
                  key={table.id}
                  className="group relative rounded-2xl overflow-hidden flex flex-col border border-cyan-500/15 hover:border-cyan-500/40 transition-all"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Branded table preview — hero of the card */}
                  <div className="relative aspect-[16/9] w-full bg-black overflow-hidden">
                    {theme.kind === 'video' ? (
                      <video
                        src={theme.src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={theme.src}
                        alt={`${theme.label} table`}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />
                    {/* Status + seats pinned to top-right */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusClass}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-white/95 bg-black/50 backdrop-blur px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
                        <Users className="w-3 h-3 shrink-0" />
                        {table.seatedCount}/3
                      </span>
                    </div>
                    {/* Table label on image */}
                    <div className="absolute bottom-2 left-3 right-3">
                      <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-300/90 drop-shadow">
                        {theme.label}
                      </div>
                    </div>
                  </div>

                  {/* Footer: stakes (big font) + action */}
                  <div className="relative px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-0.5">
                        Stakes
                      </div>
                      <div className="text-lg sm:text-xl font-black tabular-nums tracking-tight text-slate-100 leading-none">
                        {formatMorbius(table.minBet)}–{formatMorbius(table.maxBet)}
                      </div>
                      <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-cyan-400/70 mt-1">
                        MORBIUS
                      </div>
                    </div>
                    <Link href={`/blackjack-multi/${table.id}`}>
                      <Button
                        size="sm"
                        className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white gap-1.5 shadow-[0_2px_12px_rgba(34,211,238,0.25)] hover:opacity-95 active:scale-[0.98] transition-all"
                        style={{
                          background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                        }}
                      >
                        {isFull ? 'Watch' : 'Join'} <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
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
              onDepositClick={() => setWalletModalOpen(true)}
              onHowToPlayClick={() => setHowToVideoOpen(true)}
            />
          </div>
        </main>
      </div>
      <DepositWithdrawModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
      <BlackjackHowToVideoModal open={howToVideoOpen} onOpenChange={setHowToVideoOpen} />
    </GlobalMainNav>
  );
}
