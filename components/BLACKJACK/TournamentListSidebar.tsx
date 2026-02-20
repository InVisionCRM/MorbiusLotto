'use client';

import React, { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { AnimatePresence, motion } from 'motion/react';
import {
  TournamentListItem,
  PRIZE_DISTRIBUTION_LABELS,
  TIME_LIMIT_LABELS,
  type PrizeDistributionType,
} from '@/lib/tournament-types';
import { useOutsideClick } from '@/hooks/use-outside-click';
import { useTokenInfo } from '@/hooks/use-token-info';
import { Theme } from '@/lib/theme';

const PAGE_SIZE = 10;

function truncAddr(addr: string | null): string {
  if (!addr) return '—';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatRegStart(t: TournamentListItem): string {
  const date = t.registrationOpensAt ?? t.createdAt;
  if (!date) return '—';
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBuyIn(t: TournamentListItem): string {
  if (t.tournamentType === 'freeroll') return 'Freeroll';
  const amt = BigInt(t.buyInAmount ?? 0);
  if (amt === 0n) return '0';
  const decimals = t.prizeTokenDecimals ?? 18;
  if (decimals === 18 && !t.prizeTokenAddress) {
    const ether = formatEther(amt);
    const num = Number(ether);
    return `${num >= 1e6 ? num.toExponential(0) : num.toLocaleString(undefined, { maximumFractionDigits: 4 })} MORBIUS`;
  }
  const val = Number(amt / BigInt(10 ** Math.max(0, Math.min(decimals, 36) - 4))) / 10000;
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${t.prizeTokenAddress ? 'token' : 'MORBIUS'}`;
}

/** For custom-token tournaments: use escrow total when funded, else prize_pool from DB. */
function getEffectivePrizeAmount(t: TournamentListItem): string {
  if (t.prizeTokenAddress && BigInt(t.escrowTotalDeposited ?? '0') > 0n) {
    return t.escrowTotalDeposited ?? '0';
  }
  return t.prizePool ?? '0';
}

function PrizeCell({ tournament }: { tournament: TournamentListItem }) {
  const tokenInfo = useTokenInfo(tournament.prizeTokenAddress ?? undefined);
  const amt = BigInt(getEffectivePrizeAmount(tournament));
  const symbol = tournament.prizeTokenAddress ? (tokenInfo?.symbol ?? 'token') : 'MORBIUS';
  if (amt === 0n) return <span>0</span>;
  const decimals = tournament.prizeTokenDecimals ?? 18;
  const val = Number(amt / BigInt(10 ** Math.max(0, decimals - 4))) / 10000;
  return <span className="whitespace-nowrap">{val.toLocaleString()} {symbol}</span>;
}

function formatChipCount(t: TournamentListItem): string {
  return `${t.startingChips.toLocaleString()} / ${t.maxHands}`;
}

export interface TournamentListSidebarProps {
  tournaments: TournamentListItem[];
  isLoading: boolean;
  /** When true, a join is in progress — show on Join button */
  isJoinLoading?: boolean;
  onRefresh: () => void | Promise<void | TournamentListItem[]>;
  onTournamentLobby: () => void;
  onCreateTournament?: () => void;
  onJoin?: (tournament: TournamentListItem) => void;
  playerBalance?: bigint;
  playerAddress?: string | null;
}

export function TournamentListSidebar({
  tournaments,
  isLoading,
  isJoinLoading = false,
  onRefresh,
  onTournamentLobby,
  onCreateTournament,
  onJoin,
  playerBalance = 0n,
  playerAddress,
}: TournamentListSidebarProps) {
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<TournamentListItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(tournaments.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = tournaments.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useOutsideClick(expandedRef, () => setActive(null));

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 relative">
      {/* Scrollable content: count + refresh, then table + pagination */}
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
        {/* Count + manual refresh */}
        <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
          <span className="text-xs text-white/60">
            {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={isLoading}
            className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-white/30 disabled:cursor-not-allowed p-1 rounded"
            title="Refresh list"
            aria-label="Refresh tournament list"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-6 w-6 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : tournaments.length === 0 ? (
          <p className="text-white/60 text-xs text-center py-4">No active tournaments.</p>
        ) : (
          <>
            <div className="overflow-x-auto flex-1 min-h-0 -mx-1">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-white/60 border-b border-white/10">
                    <th className="py-1.5 px-1 font-medium">Name</th>
                    <th className="py-1.5 px-1 font-medium">Reg. Start</th>
                    <th className="py-1.5 px-1 font-medium">Buy-in</th>
                    <th className="py-1.5 px-1 font-medium">Prize</th>
                    <th className="py-1.5 px-1 font-medium">Chips/Hands</th>
                    <th className="py-1.5 px-1 font-medium">Creator</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setActive(t)}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer text-white/90"
                    >
                      <td className="py-1.5 px-1 truncate max-w-[80px]" title={t.name}>
                        {t.name}
                      </td>
                      <td className="py-1.5 px-1 whitespace-nowrap">{formatRegStart(t)}</td>
                      <td className="py-1.5 px-1 whitespace-nowrap">{formatBuyIn(t)}</td>
                      <td className="py-1.5 px-1 whitespace-nowrap"><PrizeCell tournament={t} /></td>
                      <td className="py-1.5 px-1 whitespace-nowrap">{formatChipCount(t)}</td>
                      <td className="py-1.5 px-1 font-mono text-white/70">
                        <a
                          href={`/player/${t.creatorAddress}`}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="hover:text-cyan-400 hover:underline transition-colors"
                          title={`View ${truncAddr(t.creatorAddress)} profile and stats`}
                        >
                          {truncAddr(t.creatorAddress)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-white/30 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-xs text-white/60">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-white/30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky bottom: 2-col grid — Create Tournament Now! + Tournament Lobby; stays in place when expanded (overlay covers it) */}
      <div className="sticky bottom-0 shrink-0 pt-3 border-t border-white/10 rounded-b-xl" style={Theme.panel.sidebar}>
        <div className="grid gap-0 grid-cols-2">
          {onCreateTournament && (
            <button
              type="button"
              onClick={onCreateTournament}
              className="px-5 py-1 rounded-xs bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-colors border border-cyan-500/30"
            >
              Create Tournament Now!
            </button>
          )}
          <button
            type="button"
            onClick={() => onTournamentLobby()}
            className="px-4 py-1 rounded-xs bg-gradient-to-r from-purple-600 to-purple-400 hover:from-purple-500 hover:to-purple-500 text-white font-semibold text-xs transition-colors border border-cyan-500/30"
          >
            Tournament Lobby
          </button>
        </div>
      </div>

      {/* Expanded overlay: full width/height of container, scrollable */}
      <AnimatePresence>
        {active && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 z-10 rounded-xl"
              aria-hidden
            />
            <div className="absolute inset-0 z-20 flex flex-col rounded-xl overflow-hidden pointer-events-none">
              <div className="pointer-events-auto flex flex-col flex-1 min-h-0" ref={expandedRef}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col flex-1 min-h-0 bg-gradient-to-b from-slate-900 to-slate-800 border border-cyan-500/30 rounded-xl overflow-hidden shadow-xl"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-slate-800/60">
                    <h3 className="text-sm font-semibold text-white truncate pr-2">{active.name}</h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(null);
                      }}
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      aria-label="Close"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 [scrollbar-width:thin] text-xs">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-white/90">
                      <span className="text-white/50">Creator</span>
                      <a
                        href={`/player/${active.creatorAddress}`}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="font-mono hover:text-cyan-400 hover:underline transition-colors"
                        title={`View ${truncAddr(active.creatorAddress)} profile and stats`}
                      >
                        {truncAddr(active.creatorAddress)}
                      </a>
                      <span className="text-white/50">Type</span>
                      <span>{active.tournamentType === 'freeroll' ? 'Freeroll' : 'Standard'}</span>
                      <span className="text-white/50">Registration</span>
                      <span>{formatRegStart(active)}</span>
                      <span className="text-white/50">Buy-in</span>
                      <span>{formatBuyIn(active)}</span>
                      <span className="text-white/50">Prize</span>
                      <span><PrizeCell tournament={active} /></span>
                      <span className="text-white/50">Chips / Hands</span>
                      <span>{formatChipCount(active)}</span>
                      <span className="text-white/50">Players</span>
                      <span>
                        {active.entryCount}
                        {active.maxPlayers != null ? ` / ${active.maxPlayers}` : ''}
                      </span>
                      <span className="text-white/50">Time limit</span>
                      <span>
                        {active.timeLimitMinutes == null
                          ? TIME_LIMIT_LABELS['null']
                          : TIME_LIMIT_LABELS[active.timeLimitMinutes] ?? `${active.timeLimitMinutes}m`}
                      </span>
                      <span className="text-white/50">Prize structure</span>
                      <span>
                        {PRIZE_DISTRIBUTION_LABELS[active.prizeDistributionType as PrizeDistributionType] ??
                          active.prizeDistributionType}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 border-t border-white/10 space-y-2 bg-slate-900/60">
                    {onJoin && (() => {
                      const isFull = active.maxPlayers != null && active.entryCount >= active.maxPlayers;
                      const canAfford = active.tournamentType === 'freeroll' || playerBalance >= BigInt(active.buyInAmount);
                      const isDisabled = isJoinLoading || !canAfford || isFull;
                      
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDisabled) {
                              onJoin(active);
                            }
                          }}
                          disabled={isDisabled}
                          className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                          title={
                            isJoinLoading
                              ? 'Confirm in wallet...'
                              : isFull
                              ? 'Tournament is full'
                              : !canAfford && active.tournamentType !== 'freeroll'
                              ? `Insufficient balance. Need ${formatBuyIn(active)}`
                              : active.isPrivate
                              ? 'Click to join (PIN required)'
                              : 'Click to join tournament'
                          }
                        >
                          {isJoinLoading ? (
                            <>
                              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>Confirm in wallet...</span>
                            </>
                          ) : isFull ? (
                            'Tournament Full'
                          ) : !canAfford && active.tournamentType !== 'freeroll' ? (
                            'Insufficient Balance'
                          ) : active.isPrivate ? (
                            'Join (PIN required)'
                          ) : (
                            'Join Tournament'
                          )}
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTournamentLobby();
                        setActive(null);
                      }}
                      className="w-full py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold text-xs transition-colors"
                    >
                      Open in Lobby
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
