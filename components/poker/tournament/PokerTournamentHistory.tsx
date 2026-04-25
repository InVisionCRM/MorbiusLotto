'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

interface CompletedTournament {
  tournamentId: string;
  name: string;
  tournamentType: string;
  buyInAmount: string;
  prizePool: string;
  prizeTokenAddress: string | null;
  status: string;
  createdAt: string;
  endedAt: string | null;
  customImage: string | null;
  entryCount: number;
}

interface PlayerHistoryItem {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  finalRank: number | null;
  prizeWon: string;
  boughtInAt: string;
  finishedAt: string | null;
  handsPlayed: number;
}

interface PokerTournamentHistoryProps {
  myAddress?: string | null;
}

type HistoryView = 'mine' | 'all';

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
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

function formatBuyIn(wei: string, isFreeroll: boolean): string {
  if (isFreeroll) return 'Free';
  try {
    const n = BigInt(wei);
    if (n === 0n) return 'Free';
    return `${formatMorbiusFloor(n)} MORBIUS`;
  } catch {
    return '—';
  }
}

export function PokerTournamentHistory({ myAddress }: PokerTournamentHistoryProps) {
  const [view, setView] = useState<HistoryView>(myAddress ? 'mine' : 'all');
  const [allList, setAllList] = useState<CompletedTournament[]>([]);
  const [mineList, setMineList] = useState<PlayerHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      {loading && (
        <p className="text-sm text-slate-400">Loading…</p>
      )}

      {!loading && view === 'all' && allList.length === 0 && !error && (
        <p className="text-sm text-slate-400">No completed tournaments yet.</p>
      )}

      {!loading && view === 'mine' && myAddress && mineList.length === 0 && !error && (
        <p className="text-sm text-slate-400">You haven&apos;t finished any tournaments yet.</p>
      )}

      {!loading && view === 'all' && allList.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
          <table className="w-full border-collapse text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-700/50 bg-black/20">
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tournament</th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ended</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Buy-in</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Players</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Prize Pool</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {allList.map((t) => (
                <tr key={t.tournamentId} className="border-b border-slate-800/50 hover:bg-cyan-500/[0.04] transition-colors">
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/poker/tournaments/${t.tournamentId}`}
                      className="font-semibold text-cyan-300 hover:text-cyan-200"
                    >
                      {t.name}
                    </Link>
                    <div className="text-[10px] uppercase tracking-wider text-slate-600">{t.tournamentType}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{formatDate(t.endedAt ?? t.createdAt)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatBuyIn(t.buyInAmount, t.tournamentType === 'freeroll')}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{t.entryCount}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-amber-300">
                    {t.prizeTokenAddress ? formatChips(BigInt(t.prizePool)) : `${formatMorbiusFloor(BigInt(t.prizePool))} MORBIUS`}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      t.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-slate-500/10 text-slate-400'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'mine' && mineList.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-cyan-500/15">
          <table className="w-full border-collapse text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-700/50 bg-black/20">
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tournament</th>
                <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Played</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Finish</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Hands</th>
                <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Prize</th>
              </tr>
            </thead>
            <tbody>
              {mineList.map((t) => (
                <tr key={t.tournamentId} className="border-b border-slate-800/50 hover:bg-cyan-500/[0.04] transition-colors">
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/poker/tournaments/${t.tournamentId}`}
                      className="font-semibold text-cyan-300 hover:text-cyan-200"
                    >
                      {t.tournamentName}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{formatDate(t.boughtInAt)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {t.finalRank != null ? ordinal(t.finalRank) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{t.handsPlayed}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-amber-300">
                    {(() => {
                      try {
                        const n = BigInt(t.prizeWon);
                        return n > 0n ? `${formatMorbiusFloor(n)} MORBIUS` : '—';
                      } catch {
                        return '—';
                      }
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PokerTournamentHistory;
