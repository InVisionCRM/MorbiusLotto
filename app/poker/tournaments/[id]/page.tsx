'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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

export default function TournamentResultsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [hands, setHands] = useState<HandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [rRes, sRes, hRes] = await Promise.all([
        fetch(`/api/tournament/${id}/results`),
        fetch(`/api/tournament/${id}/stats`),
        fetch(`/api/tournament/${id}/hands?limit=100`),
      ]);
      if (!rRes.ok) {
        if (rRes.status === 404) {
          setError('Tournament not found');
          setLoading(false);
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
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-slate-200 px-4 sm:px-8 py-8">
        <p className="text-slate-400">Loading tournament…</p>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-black text-slate-200 px-4 sm:px-8 py-8">
        <Link href="/poker?tab=history" className="text-cyan-400 hover:text-cyan-300 text-sm">
          ← Back to history
        </Link>
        <p className="text-red-400 mt-4">{error ?? 'Tournament not found.'}</p>
      </div>
    );
  }

  const payoutMeta = {
    prizeTokenAddress: results.prizeTokenAddress,
    prizeTokenDecimals: results.prizeTokenDecimals,
    prizeTokenSymbol: results.prizeTokenSymbol,
    gameType: results.gameType ?? null,
  };
  const buyInDisplay =
    results.tournamentType === 'freeroll'
      ? 'Free'
      : formatTournamentBuyInDisplay(results.buyInAmount, { gameType: results.gameType ?? null });
  const prizePoolDisplay = formatPrizePoolDisplay(results.prizePool, payoutMeta);
  const ranked = [...results.entries].sort((a, b) => {
    if (a.finalRank == null && b.finalRank == null) return 0;
    if (a.finalRank == null) return 1;
    if (b.finalRank == null) return -1;
    return a.finalRank - b.finalRank;
  });
  const cancelled = results.status === 'cancelled';

  return (
    <div className="min-h-screen bg-black text-slate-200 px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
      <Link href="/poker?tab=history" className="text-cyan-400 hover:text-cyan-300 text-sm">
        ← Back to history
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{results.name}</h1>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
            cancelled
              ? 'bg-slate-500/10 text-slate-400'
              : 'bg-emerald-500/10 text-emerald-300'
          }`}>
            {results.status}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-cyan-500/10 text-cyan-300">
            {results.tournamentType}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {formatDate(results.startedAt ?? results.createdAt)} · Duration {formatDuration(results.startedAt, results.endedAt)}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Buy-in" value={buyInDisplay} />
        <SummaryCard label="Prize Pool" value={prizePoolDisplay} highlight />
        <SummaryCard label="Entrants" value={results.entries.length.toString()} />
        <SummaryCard label="Hands Played" value={(stats?.handCount ?? 0).toString()} />
      </div>

      {/* Stats row */}
      {stats && stats.handCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <SummaryCard
            label="Biggest Pot"
            value={formatChips(BigInt(stats.biggestPot))}
            sub={stats.biggestHand ? `Hand #${stats.biggestHand.handNumber}` : undefined}
          />
          <SummaryCard label="Total Pot Volume" value={formatChips(BigInt(stats.totalPot))} />
          <SummaryCard label="Total Rake" value={formatChips(BigInt(stats.totalRake))} />
        </div>
      )}

      {/* Standings */}
      <h2 className="text-lg font-bold text-white mb-3">Final Standings</h2>
      <div className="overflow-x-auto rounded-xl border border-cyan-500/15 mb-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-black/20">
              <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-16">Rank</th>
              <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Player</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Hands</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Peak Stack</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Prize</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((e) => {
              const isPaid = (() => {
                try { return BigInt(e.prizeWon) > 0n; } catch { return false; }
              })();
              return (
                <tr key={e.entryId} className="border-b border-slate-800/50">
                  <td className="py-2.5 px-3 font-bold tabular-nums">
                    {e.finalRank != null ? (
                      <span className={
                        e.finalRank === 1 ? 'text-amber-300'
                        : e.finalRank === 2 ? 'text-slate-300'
                        : e.finalRank === 3 ? 'text-amber-600'
                        : 'text-slate-400'
                      }>
                        {ordinal(e.finalRank)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-slate-300">{shortAddr(e.playerAddress)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{e.handsPlayed}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-cyan-300">{formatChips(BigInt(e.highestChipCount))}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${isPaid ? 'text-amber-300 font-semibold' : 'text-slate-600'}`}>
                    {formatTournamentPayoutDisplay(e.prizeWon, payoutMeta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hands list */}
      {hands.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-white mb-3">
            Recent Hands <span className="text-xs font-normal text-slate-500">({hands.length} shown)</span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-black/20">
                  <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Hand #</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Pot</th>
                </tr>
              </thead>
              <tbody>
                {hands.map((h) => (
                  <tr key={h.handId} className="border-b border-slate-800/50">
                    <td className="py-2 px-3 font-mono text-xs">{h.handNumber}</td>
                    <td className="py-2 px-3 text-xs text-slate-400">{formatDate(h.completedAt)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-cyan-300">{formatChips(BigInt(h.potAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
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
    <div className={`rounded-xl border p-3 ${
      highlight ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-cyan-500/15 bg-black/20'
    }`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 ${
        highlight ? 'text-amber-300' : 'text-white'
      }`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}
