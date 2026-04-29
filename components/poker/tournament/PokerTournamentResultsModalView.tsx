'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { formatChips } from '@/lib/format-poker-chips';
import {
  formatPrizePoolDisplay,
  formatTournamentBuyInDisplay,
  formatTournamentPayoutDisplay,
} from '@/lib/format-poker-tournament-prize-display';

interface ResultsEntry {
  entryId: string;
  playerAddress: string;
  finalRank: number | null;
  prizeWon: string;
  status: string;
  boughtInAt: string;
  finishedAt: string | null;
  handsPlayed: number;
  highestChipCount: number;
  chipsRemaining: number;
}

interface TournamentResults {
  tournamentId: string;
  name: string;
  tournamentType: string;
  buyInAmount: string;
  startingChips: number;
  prizePool: string;
  prizeTokenAddress: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  prizeTokenName?: string | null;
  gameType?: string | null;
  status: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  customImage: string | null;
  timeLimitMinutes: number | null;
  maxPlayers: number | null;
  prizeDistributionType: string | null;
  entries: ResultsEntry[];
}

interface TournamentStats {
  handCount: number;
  biggestPot: string;
  totalPot: string;
  totalRake: string;
  firstHandAt: string | null;
  lastHandAt: string | null;
  biggestHand: {
    handId: string;
    handNumber: number;
    potAmount: string;
    completedAt: string;
    tableId: string;
  } | null;
}

interface HandRow {
  handId: string;
  handNumber: number;
  tableId: string;
  potAmount: string;
  completedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tournamentId: string | null;
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const ms = end - start;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-cyan-500/15 bg-black/20'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div
        className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 ${
          highlight ? 'text-amber-300' : 'text-white'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export function PokerTournamentResultsModalView({ open, onClose, tournamentId }: Props) {
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [hands, setHands] = useState<HandRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setStats(null);
    setHands([]);
    try {
      const [rRes, sRes, hRes] = await Promise.all([
        fetch(`/api/tournament/${id}/results`),
        fetch(`/api/tournament/${id}/stats`),
        fetch(`/api/tournament/${id}/hands?limit=100`),
      ]);
      if (!rRes.ok) {
        if (rRes.status === 404) {
          setError('Tournament not found');
          return;
        }
        throw new Error(`Results HTTP ${rRes.status}`);
      }
      setResults(await rRes.json());
      if (sRes.ok) setStats(await sRes.json());
      if (hRes.ok) setHands(await hRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tournamentId) {
      void load(tournamentId);
    }
    if (!open) {
      setResults(null);
      setStats(null);
      setHands([]);
      setError(null);
      setLoading(false);
    }
  }, [open, tournamentId, load]);

  if (!open) return null;

  const isCustomToken = !!results?.prizeTokenAddress;
  const payoutMeta = results
    ? {
        prizeTokenAddress: results.prizeTokenAddress,
        prizeTokenDecimals: results.prizeTokenDecimals,
        prizeTokenSymbol: results.prizeTokenSymbol,
        prizeTokenName: results.prizeTokenName ?? null,
        gameType: results.gameType ?? null,
      }
    : null;
  const buyInDisplay = results
    ? results.tournamentType === 'freeroll'
      ? 'Free'
      : formatTournamentBuyInDisplay(results.buyInAmount, { gameType: results.gameType ?? null })
    : '—';
  const prizePoolDisplay =
    results && payoutMeta ? formatPrizePoolDisplay(results.prizePool, payoutMeta) : '—';

  const ranked = results
    ? [...results.entries].sort((a, b) => {
        if (a.finalRank == null && b.finalRank == null) return 0;
        if (a.finalRank == null) return 1;
        if (b.finalRank == null) return -1;
        return a.finalRank - b.finalRank;
      })
    : [];
  const cancelled = results?.status === 'cancelled';

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="relative max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl flex flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.12),transparent_65%)]" />

        {/* Header */}
        <div className="relative p-5 border-b border-cyan-500/20 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                {results?.name ?? 'Tournament'}
              </h3>
              {results && (
                <>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      cancelled
                        ? 'bg-slate-500/10 text-slate-400'
                        : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {results.status}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                    {results.tournamentType}
                  </span>
                </>
              )}
            </div>
            {results && (
              <p className="text-xs text-slate-500 mt-1">
                {formatDate(results.startedAt ?? results.createdAt)} · Duration{' '}
                {formatDuration(results.startedAt, results.endedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="relative overflow-y-auto p-5 flex-1">
          {loading && <p className="text-sm text-slate-400">Loading tournament…</p>}
          {!loading && error && <p className="text-sm text-red-400">{error}</p>}

          {!loading && !error && results && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <SummaryCard label="Buy-in" value={buyInDisplay} />
                <SummaryCard label="Prize Pool" value={prizePoolDisplay} highlight />
                <SummaryCard label="Entrants" value={results.entries.length.toString()} />
                <SummaryCard label="Hands Played" value={(stats?.handCount ?? 0).toString()} />
              </div>

              {stats && stats.handCount > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  <SummaryCard
                    label="Biggest Pot"
                    value={formatChips(BigInt(stats.biggestPot))}
                    sub={stats.biggestHand ? `Hand #${stats.biggestHand.handNumber}` : undefined}
                  />
                  <SummaryCard label="Total Pot Volume" value={formatChips(BigInt(stats.totalPot))} />
                  <SummaryCard label="Total Rake" value={formatChips(BigInt(stats.totalRake))} />
                </div>
              )}

              <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Final Standings</h4>
              <div className="overflow-x-auto rounded-xl border border-cyan-500/15 mb-6">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-black/20">
                      <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-14">Rank</th>
                      <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Player</th>
                      <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Hands</th>
                      <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peak Stack</th>
                      <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((e) => {
                      const isPaid = (() => {
                        try {
                          return BigInt(e.prizeWon) > 0n;
                        } catch {
                          return false;
                        }
                      })();
                      return (
                        <tr key={e.entryId} className="border-b border-slate-800/50">
                          <td className="py-2 px-3 font-bold tabular-nums">
                            {e.finalRank != null ? (
                              <span
                                className={
                                  e.finalRank === 1
                                    ? 'text-amber-300'
                                    : e.finalRank === 2
                                      ? 'text-slate-300'
                                      : e.finalRank === 3
                                        ? 'text-amber-600'
                                        : 'text-slate-400'
                                }
                              >
                                {ordinal(e.finalRank)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-300">
                            {shortAddr(e.playerAddress)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{e.handsPlayed}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-cyan-300">
                            {formatChips(BigInt(e.highestChipCount))}
                          </td>
                          <td
                            className={`py-2 px-3 text-right tabular-nums ${
                              isPaid ? 'text-amber-300 font-semibold' : 'text-slate-600'
                            }`}
                          >
                            {payoutMeta
                              ? formatTournamentPayoutDisplay(e.prizeWon, payoutMeta)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {hands.length > 0 && (
                <>
                  <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">
                    Recent Hands{' '}
                    <span className="text-[10px] font-normal text-slate-500">({hands.length} shown)</span>
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50 bg-black/20">
                          <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Hand #</th>
                          <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Time</th>
                          <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hands.map((h) => (
                          <tr key={h.handId} className="border-b border-slate-800/50">
                            <td className="py-1.5 px-3 font-mono text-xs">{h.handNumber}</td>
                            <td className="py-1.5 px-3 text-xs text-slate-400">{formatDate(h.completedAt)}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-cyan-300">
                              {formatChips(BigInt(h.potAmount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PokerTournamentResultsModalView;
