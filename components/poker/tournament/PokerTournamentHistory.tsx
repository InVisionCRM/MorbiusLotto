'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  buyInMetaFromHistoryRow,
  formatPrizePoolDisplay,
  formatTournamentBuyInDisplay,
  formatTournamentPayoutDisplay,
  payoutMetaFromHistoryRow,
  prizePoolMetaFromHistoryRow,
} from '@/lib/format-poker-tournament-prize-display';
import { PokerTournamentResultsModalView } from './PokerTournamentResultsModalView';

interface CompletedTournament {
  tournamentId: string;
  name: string;
  tournamentType: string;
  buyInAmount: string;
  prizePool: string;
  prizeTokenAddress: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  prizeTokenName?: string | null;
  gameType?: string | null;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt: string | null;
  customImage: string | null;
  entryCount: number;
  creatorAddress?: string | null;
  creatorDisplayName?: string | null;
  escrowTxHash?: string | null;
}

interface PlayerHistoryItem {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  tournamentType?: string;
  finalRank: number | null;
  prizeWon: string;
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  prizeTokenName?: string | null;
  gameType?: string | null;
  boughtInAt: string;
  finishedAt: string | null;
  handsPlayed: number;
}

interface PokerTournamentHistoryProps {
  myAddress?: string | null;
}

type HistoryView = 'mine' | 'all';

const PULSESCAN_TX = 'https://scan.pulsechain.com/tx/';

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function shortAddr(a: string | null | undefined): string {
  if (!a || a.length < 10) return a ?? '—';
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

/** Wall-clock tournament length (start → end). */
function formatElapsed(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  const startIso = startedAt || createdAt;
  const endIso = endedAt || createdAt;
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const ms = end - start;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  if (d > 0) return `${d}d ${hr}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

function formatBuyInRow(t: CompletedTournament): string {
  if (t.tournamentType === 'freeroll') return 'Free';
  return formatTournamentBuyInDisplay(
    t.buyInAmount,
    buyInMetaFromHistoryRow(t as unknown as Record<string, unknown>),
  );
}

function creatorLine(t: CompletedTournament): string {
  const name = t.creatorDisplayName?.trim();
  if (name) return name;
  return shortAddr(t.creatorAddress);
}

interface ResultsEntryRow {
  entryId: string;
  playerAddress: string;
  displayName?: string | null;
  finalRank: number | null;
  prizeWon: string;
  handsPlayed: number;
}

function TournamentPlayersModal({
  tournamentId,
  open,
  onClose,
}: {
  tournamentId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState<ResultsEntryRow[]>([]);
  const [payoutMeta, setPayoutMeta] = useState<{
    prizeTokenAddress: string | null;
    prizeTokenDecimals: number | null;
    prizeTokenSymbol: string | null;
    prizeTokenName: string | null;
    gameType: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !tournamentId) {
      setEntries([]);
      setPayoutMeta(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tournament/${encodeURIComponent(tournamentId)}/results`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Tournament not found');
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setTitle(typeof data.name === 'string' ? data.name : 'Tournament');
        setPayoutMeta({
          prizeTokenAddress: data.prizeTokenAddress ?? null,
          prizeTokenDecimals: data.prizeTokenDecimals ?? null,
          prizeTokenSymbol: data.prizeTokenSymbol ?? null,
          prizeTokenName: data.prizeTokenName ?? null,
          gameType: data.gameType ?? null,
        });
        const raw = Array.isArray(data.entries) ? data.entries : [];
        setEntries(
          raw.map((e: Record<string, unknown>) => ({
            entryId: String(e.entryId ?? ''),
            playerAddress: String(e.playerAddress ?? ''),
            displayName: (e.displayName as string | null | undefined) ?? null,
            finalRank: e.finalRank != null ? Number(e.finalRank) : null,
            prizeWon: String(e.prizeWon ?? '0'),
            handsPlayed: Number(e.handsPlayed ?? 0),
          })),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load players');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tournamentId]);

  if (!open || !tournamentId) return null;

  const ranked = [...entries].sort((a, b) => {
    if (a.finalRank == null && b.finalRank == null) return 0;
    if (a.finalRank == null) return 1;
    if (b.finalRank == null) return -1;
    return a.finalRank - b.finalRank;
  });

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="relative max-w-lg w-full max-h-[85vh] overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl flex flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative flex items-start justify-between gap-3 border-b border-cyan-500/20 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white truncate">Players</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="relative overflow-y-auto p-4 flex-1">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {!loading && error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && (
            <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-black/20">
                    <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Rank
                    </th>
                    <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Player
                    </th>
                    <th className="py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Hands
                    </th>
                    <th className="py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Prize
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((e) => (
                    <tr key={e.entryId} className="border-b border-slate-800/50">
                      <td className="py-2 px-2 tabular-nums text-slate-300">
                        {e.finalRank != null ? ordinal(e.finalRank) : '—'}
                      </td>
                      <td className="py-2 px-2 text-slate-200">
                        <span className="font-medium text-sm">
                          {e.displayName?.trim() ? e.displayName.trim() : shortAddr(e.playerAddress)}
                        </span>
                        {e.displayName?.trim() ? (
                          <span className="block font-mono text-[10px] text-slate-500">{shortAddr(e.playerAddress)}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-400">{e.handsPlayed}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-amber-300/95">
                        {payoutMeta
                          ? formatTournamentPayoutDisplay(e.prizeWon, payoutMeta)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PokerTournamentHistory({ myAddress }: PokerTournamentHistoryProps) {
  const [view, setView] = useState<HistoryView>(myAddress ? 'mine' : 'all');
  const [allList, setAllList] = useState<CompletedTournament[]>([]);
  const [mineList, setMineList] = useState<PlayerHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsTournamentId, setResultsTournamentId] = useState<string | null>(null);
  const [playersTournamentId, setPlayersTournamentId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tournament/completed?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMine = useCallback(async () => {
    if (!myAddress) {
      setMineList([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournament/player/${encodeURIComponent(myAddress)}/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const completed = (Array.isArray(data) ? data : []).filter(
        (r: PlayerHistoryItem) =>
          r.tournamentStatus === 'completed' || r.tournamentStatus === 'cancelled',
      );
      setMineList(completed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [myAddress]);

  useEffect(() => {
    if (view === 'all') void loadAll();
    else void loadMine();
  }, [view, loadAll, loadMine]);

  const tabBtn = (label: string, target: HistoryView) => (
    <button
      type="button"
      onClick={() => setView(target)}
      className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
        view === target
          ? 'bg-cyan-500/[0.15] text-cyan-300'
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );

  const th = 'py-2.5 px-2 sm:px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap';
  const thRight = `${th} text-right`;

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        {tabBtn('My Tournaments', 'mine')}
        {tabBtn('All Tournaments', 'all')}
      </div>

      {!myAddress && view === 'mine' && (
        <p className="text-sm text-cyan-200/80 mb-4 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-3 py-2">
          Connect your wallet to see your tournament history.
        </p>
      )}

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && view === 'all' && allList.length === 0 && !error && (
        <p className="text-sm text-slate-400">No completed tournaments yet.</p>
      )}

      {!loading && view === 'mine' && myAddress && mineList.length === 0 && !error && (
        <p className="text-sm text-slate-400">You haven&apos;t finished any tournaments yet.</p>
      )}

      {!loading && view === 'all' && allList.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
          <table className="w-full border-collapse text-sm text-slate-200 min-w-[920px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-black/20">
                <th className={th}>Tournament</th>
                <th className={th}>Creator</th>
                <th className={thRight}>Elapsed</th>
                <th className={th}>Ended</th>
                <th className={thRight}>Buy-in</th>
                <th className={thRight}>Players</th>
                <th className={thRight}>Prize pool</th>
                <th className={th}>Pool deposit</th>
                <th className={thRight}>Status</th>
                <th className={`${thRight} min-w-[9rem]`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allList.map((t) => {
                const hasToken = !!t.prizeTokenAddress;
                const tx = t.escrowTxHash?.trim();
                return (
                  <tr key={t.tournamentId} className="border-b border-slate-800/50 hover:bg-cyan-500/[0.04] transition-colors">
                    <td className="py-2.5 px-2 sm:px-3">
                      <div className="font-semibold text-cyan-300">{t.name}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600">{t.tournamentType}</div>
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-xs text-slate-300">
                      <span className="font-medium text-white/90">{creatorLine(t)}</span>
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-right text-xs tabular-nums text-slate-400 whitespace-nowrap">
                      {formatElapsed(t.startedAt, t.endedAt, t.createdAt)}
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-slate-400 text-xs whitespace-nowrap">
                      {formatDate(t.endedAt ?? t.createdAt)}
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-right tabular-nums text-xs">{formatBuyInRow(t)}</td>
                    <td className="py-2.5 px-2 sm:px-3 text-right">
                      <div className="tabular-nums text-slate-300">{t.entryCount}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setResultsTournamentId(null);
                          setPlayersTournamentId(t.tournamentId);
                        }}
                        className="mt-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
                      >
                        Players
                      </button>
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-right tabular-nums text-amber-300 text-xs">
                      {formatPrizePoolDisplay(t.prizePool, prizePoolMetaFromHistoryRow(t as unknown as Record<string, unknown>))}
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-xs">
                      {hasToken && tx ? (
                        <a
                          href={`${PULSESCAN_TX}${tx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 break-all"
                        >
                          {tx.slice(0, 10)}…{tx.slice(-6)}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-right">
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded inline-block ${
                          t.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-500/10 text-slate-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setPlayersTournamentId(null);
                          setResultsTournamentId(t.tournamentId);
                        }}
                        className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                      >
                        Results
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'mine' && mineList.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
          <table className="w-full border-collapse text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-700/50 bg-black/20">
                <th className={th}>Tournament</th>
                <th className={th}>Played</th>
                <th className={thRight}>Finish</th>
                <th className={thRight}>Hands</th>
                <th className={thRight}>Prize</th>
                <th className={`${thRight} min-w-[9rem]`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mineList.map((t) => (
                <tr key={t.tournamentId} className="border-b border-slate-800/50 hover:bg-cyan-500/[0.04] transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-cyan-300">{t.tournamentName}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{formatDate(t.boughtInAt)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {t.finalRank != null ? ordinal(t.finalRank) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{t.handsPlayed}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-amber-300">
                    {formatTournamentPayoutDisplay(
                      t.prizeWon,
                      payoutMetaFromHistoryRow(t as unknown as Record<string, unknown>),
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex flex-col sm:flex-row gap-1 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setResultsTournamentId(null);
                          setPlayersTournamentId(t.tournamentId);
                        }}
                        className="rounded-lg border border-cyan-500/35 bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/15 transition-colors"
                      >
                        Players
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlayersTournamentId(null);
                          setResultsTournamentId(t.tournamentId);
                        }}
                        className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                      >
                        Results
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PokerTournamentResultsModalView
        open={resultsTournamentId !== null}
        onClose={() => setResultsTournamentId(null)}
        tournamentId={resultsTournamentId}
      />

      <TournamentPlayersModal
        open={playersTournamentId !== null}
        onClose={() => setPlayersTournamentId(null)}
        tournamentId={playersTournamentId}
      />
    </div>
  );
}

export default PokerTournamentHistory;
