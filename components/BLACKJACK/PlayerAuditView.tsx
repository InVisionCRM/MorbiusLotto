'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatEther } from 'viem';
import {
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { getBlackjackServerUrl } from '@/lib/api-urls';

// ── Types ──────────────────────────────────────────────────────────────────

interface TxRecord {
  type: 'deposit' | 'withdrawal';
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

interface GameRecord {
  id: string;
  game_id: string;
  result: string;
  total_bet_amount: bigint;
  total_payout: bigint;
  created_at: string;
  completed_at: string | null;
}

type AuditFlag =
  | 'negative_balance'   // running balance dips below zero — impossible without exploit
  | 'impossible_payout'  // payout > 10× bet — far beyond any legitimate multiplier
  | 'rapid_withdraw'     // withdrawal within 2 min of large win
  | 'zero_payout_win'    // result marked "win" but payout ≤ 0
  | 'excess_payout';     // payout between 3–10× (review, not necessarily bad)

const FLAG_META: Record<AuditFlag, { label: string; color: string; severity: 'high' | 'medium' | 'low' }> = {
  negative_balance:  { label: 'Negative Balance',   color: 'text-red-400 bg-red-900/30',    severity: 'high'   },
  impossible_payout: { label: 'Impossible Payout',   color: 'text-red-400 bg-red-900/30',    severity: 'high'   },
  zero_payout_win:   { label: 'Win w/ Zero Payout',  color: 'text-red-400 bg-red-900/30',    severity: 'high'   },
  rapid_withdraw:    { label: 'Rapid Withdrawal',     color: 'text-amber-400 bg-amber-900/30', severity: 'medium' },
  excess_payout:     { label: 'High Payout (review)', color: 'text-yellow-400 bg-yellow-900/30', severity: 'low' },
};

interface AuditEvent {
  id: string;
  timestamp: number;
  type: 'deposit' | 'withdrawal' | 'game';
  result?: string;
  bet: bigint;
  payout: bigint;
  amount: bigint;
  netChange: bigint;
  runningBalance: bigint;
  txHash?: string | null;
  gameId?: string;
  flags: AuditFlag[];
}

interface SuspiciousPattern {
  severity: 'high' | 'medium' | 'low';
  description: string;
  count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(wei: bigint): string {
  const n = Number(formatEther(wei < 0n ? -wei : wei));
  const sign = wei < 0n ? '-' : '';
  return sign + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function downloadCsv(events: AuditEvent[], address: string) {
  const header = 'timestamp,type,result,bet,payout,net_change,running_balance,flags,tx_hash,game_id';
  const rows = events.map((e) => [
    new Date(e.timestamp).toISOString(),
    e.type,
    e.result ?? '',
    formatEther(e.bet),
    formatEther(e.payout),
    formatEther(e.netChange),
    formatEther(e.runningBalance),
    e.flags.join('|'),
    e.txHash ?? '',
    e.gameId ?? '',
  ].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_${address.slice(-8)}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────

interface PlayerAuditViewProps {
  playerAddress: string;
  games: GameRecord[];
  gamesLoading: boolean;
  actualBalance?: bigint;
}

const PAGE_SIZE = 50;

export function PlayerAuditView({ playerAddress, games, gamesLoading, actualBalance }: PlayerAuditViewProps) {
  const serverUrl = getBlackjackServerUrl();
  const [txRecords, setTxRecords] = useState<TxRecord[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'flagged' | 'deposit' | 'withdrawal' | 'game'>('all');
  const [page, setPage] = useState(0);
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [sortDesc, setSortDesc] = useState(true);

  const fetchTx = useCallback(async () => {
    if (!playerAddress) return;
    setTxLoading(true);
    setTxError(null);
    try {
      const res = await fetch(`${serverUrl}/api/players/${playerAddress}/transactions?limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTxRecords(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setTxError(e.message ?? 'Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, [playerAddress, serverUrl]);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  // ── Build merged & annotated event list ──────────────────────────────────

  const { events, patterns, hasAnchor, startingBalance } = useMemo(() => {
    const rawEvents: Omit<AuditEvent, 'runningBalance' | 'flags'>[] = [];

    // Deposits & withdrawals
    for (const tx of txRecords) {
      let amount = 0n;
      try { amount = BigInt(tx.amount); } catch {}
      const ts = new Date(tx.created_at).getTime();
      rawEvents.push({
        id: `tx-${tx.created_at}-${tx.type}`,
        timestamp: ts,
        type: tx.type,
        bet: 0n,
        payout: 0n,
        amount,
        netChange: tx.type === 'deposit' ? amount : -amount,
        txHash: tx.tx_hash,
      });
    }

    // Games
    for (const g of games) {
      if (!g.result || !g.completed_at) continue;
      const ts = new Date(g.completed_at).getTime();
      const bet = g.total_bet_amount;
      const payout = g.total_payout;
      const netChange = payout - bet;
      rawEvents.push({
        id: `game-${g.id}`,
        timestamp: ts,
        type: 'game',
        result: g.result,
        bet,
        payout,
        amount: 0n,
        netChange,
        gameId: g.game_id || g.id,
      });
    }

    // Sort ascending (oldest first) for running balance calc
    rawEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Anchor running balance to the real current balance.
    // Sum all net changes in our window, then work out what the balance was
    // BEFORE the first event we have. This anchors every row to a real value
    // rather than starting from an arbitrary 0.
    const totalNetChange = rawEvents.reduce((acc, ev) => acc + ev.netChange, 0n);

    // If actualBalance is known: startingBalance = actualBalance - totalNetChange
    // If not known: fall back to 0 (relative-only mode, no negative-balance detection)
    const hasAnchor = actualBalance !== undefined;
    const startingBalance: bigint = hasAnchor ? (actualBalance - totalNetChange) : 0n;
    // If startingBalance is negative, we are missing older history — don't flag negative balance
    const canDetectNegBalance = hasAnchor && startingBalance >= 0n;

    let running = startingBalance;
    const annotated: AuditEvent[] = [];
    const recentWins: { timestamp: number; amount: bigint }[] = [];

    for (const ev of rawEvents) {
      running += ev.netChange;
      const flags: AuditFlag[] = [];

      // Only flag negative balance if we have a reliable anchor AND it genuinely goes below 0
      if (canDetectNegBalance && running < 0n) flags.push('negative_balance');

      if (ev.type === 'game') {
        const multiplier = ev.bet > 0n ? Number(ev.payout) / Number(ev.bet) : 0;
        if (multiplier > 10) flags.push('impossible_payout');
        else if (multiplier > 3) flags.push('excess_payout');
        if ((ev.result === 'win' || ev.result === 'blackjack') && ev.payout <= 0n) flags.push('zero_payout_win');
        if (ev.netChange > 0n) {
          recentWins.push({ timestamp: ev.timestamp, amount: ev.netChange });
        }
      }

      if (ev.type === 'withdrawal') {
        const cutoff = ev.timestamp - 2 * 60 * 1000;
        const bigWinThreshold = 1_000n * BigInt(1e18);
        const recentBigWin = recentWins.find(
          (w) => w.timestamp >= cutoff && w.amount >= bigWinThreshold
        );
        if (recentBigWin) flags.push('rapid_withdraw');
      }

      annotated.push({ ...ev, runningBalance: running, flags });
    }

    // Detect patterns
    const patternsFound: SuspiciousPattern[] = [];

    const negBalanceCount = annotated.filter((e) => e.flags.includes('negative_balance')).length;
    if (negBalanceCount > 0) {
      patternsFound.push({
        severity: 'high',
        description: `Balance went negative ${negBalanceCount} time(s) — server should prevent this`,
        count: negBalanceCount,
      });
    }

    const impossibleCount = annotated.filter((e) => e.flags.includes('impossible_payout')).length;
    if (impossibleCount > 0) {
      patternsFound.push({
        severity: 'high',
        description: `${impossibleCount} game(s) with payout > 10× bet — exceeds all known multipliers`,
        count: impossibleCount,
      });
    }

    const zeroPayWinCount = annotated.filter((e) => e.flags.includes('zero_payout_win')).length;
    if (zeroPayWinCount > 0) {
      patternsFound.push({
        severity: 'high',
        description: `${zeroPayWinCount} game(s) recorded as win/blackjack but payout is zero`,
        count: zeroPayWinCount,
      });
    }

    const rapidWithdrawCount = annotated.filter((e) => e.flags.includes('rapid_withdraw')).length;
    if (rapidWithdrawCount > 0) {
      patternsFound.push({
        severity: 'medium',
        description: `${rapidWithdrawCount} withdrawal(s) within 2 min of a large win (≥1,000 MORBIUS)`,
        count: rapidWithdrawCount,
      });
    }

    // Win rate check (last 50 completed games)
    const last50 = annotated.filter((e) => e.type === 'game').slice(-50);
    if (last50.length >= 20) {
      const wins = last50.filter((e) => e.result === 'win' || e.result === 'blackjack').length;
      const rate = wins / last50.length;
      if (rate > 0.65) {
        patternsFound.push({
          severity: 'medium',
          description: `Win rate ${Math.round(rate * 100)}% over last ${last50.length} games (expected ~42–48%)`,
          count: wins,
        });
      }
    }

    return { events: annotated, patterns: patternsFound, hasAnchor, startingBalance };
  }, [txRecords, games, actualBalance]);

  // Apply filter + sort for display
  const filtered = useMemo(() => {
    let list = events;
    if (filterType === 'flagged') list = list.filter((e) => e.flags.length > 0);
    else if (filterType !== 'all') list = list.filter((e) => e.type === filterType);
    return sortDesc ? [...list].reverse() : list;
  }, [events, filterType, sortDesc]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalFlagged = events.filter((e) => e.flags.length > 0).length;
  const highSeverityCount = patterns.filter((p) => p.severity === 'high').length;
  const balanceLabel = hasAnchor ? 'Balance' : 'Δ Balance (relative)';

  return (
    <div className="space-y-4 text-sm">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {highSeverityCount > 0 ? (
            <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" />
          ) : totalFlagged > 0 ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          )}
          <div>
            <p className="font-semibold text-white">
              {events.length.toLocaleString()} events · {totalFlagged} flagged
            </p>
            <p className="text-xs text-gray-400">{games.length} games · {txRecords.length} deposits/withdrawals</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTx}
            disabled={txLoading || gamesLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50 text-xs"
          >
            <RefreshCw size={12} className={(txLoading || gamesLoading) ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => downloadCsv(events, playerAddress)}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50 text-xs"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Anchor info ── */}
      {!hasAnchor && events.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-800/60 border border-white/10">
          <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-gray-400 text-xs">
            Balance column shows relative change from the start of this window — no current balance available to anchor it.
          </p>
        </div>
      )}
      {hasAnchor && startingBalance < 0n && events.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-800/60 border border-white/10">
          <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-gray-400 text-xs">
            Player has activity older than the {games.length}-game audit window. Balance is anchored to the current real balance
            and counted backwards — negative-balance detection is disabled since pre-window history is missing.
          </p>
        </div>
      )}

      {/* ── Suspicious patterns ── */}
      {patterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Detected Patterns</p>
          {patterns.map((p, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-3 rounded-xl border ${
                p.severity === 'high'
                  ? 'bg-red-900/20 border-red-500/30'
                  : p.severity === 'medium'
                    ? 'bg-amber-900/20 border-amber-500/30'
                    : 'bg-yellow-900/10 border-yellow-500/20'
              }`}
            >
              {p.severity === 'high'
                ? <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <p className={`text-xs ${p.severity === 'high' ? 'text-red-300' : 'text-amber-300'}`}>
                {p.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={12} className="text-gray-500" />
        {(['all', 'flagged', 'deposit', 'withdrawal', 'game'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilterType(f); setPage(0); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterType === f
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? `All (${events.length})` :
             f === 'flagged' ? `Flagged (${totalFlagged})` :
             f === 'game' ? `Games (${events.filter(e => e.type === 'game').length})` :
             f === 'deposit' ? `Deposits (${events.filter(e => e.type === 'deposit').length})` :
             `Withdrawals (${events.filter(e => e.type === 'withdrawal').length})`}
          </button>
        ))}
        <button
          onClick={() => setSortDesc((v) => !v)}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700"
        >
          {sortDesc ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {sortDesc ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {/* ── Loading / error ── */}
      {(txLoading || gamesLoading) && (
        <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
          <RefreshCw size={12} className="animate-spin" /> Loading audit data...
        </div>
      )}
      {txError && (
        <p className="text-red-400 text-xs">{txError}</p>
      )}

      {/* ── Timeline table ── */}
      {!txLoading && !gamesLoading && filtered.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-gray-900/60">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Time</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Type</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Bet</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Payout</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Net</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{balanceLabel}</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((ev) => {
                  const isExpanded = expandedFlags.has(ev.id);
                  const rowBg =
                    ev.flags.some((f) => FLAG_META[f].severity === 'high')
                      ? 'bg-red-900/10'
                      : ev.flags.some((f) => FLAG_META[f].severity === 'medium')
                        ? 'bg-amber-900/10'
                        : ev.flags.length > 0
                          ? 'bg-yellow-900/5'
                          : '';

                  return (
                    <tr key={ev.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${rowBg}`}>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap font-mono">
                        {fmtDate(ev.timestamp)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ev.type === 'game' ? (
                          <span className={`font-semibold ${
                            ev.result === 'win' || ev.result === 'blackjack' ? 'text-green-400' :
                            ev.result === 'loss' ? 'text-red-400' :
                            'text-gray-400'
                          }`}>
                            {ev.result?.toUpperCase() ?? 'GAME'}
                          </span>
                        ) : ev.type === 'deposit' ? (
                          <span className="text-cyan-400 font-semibold">DEPOSIT</span>
                        ) : (
                          <span className="text-purple-400 font-semibold">WITHDRAW</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300 font-mono tabular-nums">
                        {ev.bet > 0n ? fmt(ev.bet) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300 font-mono tabular-nums">
                        {ev.type === 'game' ? fmt(ev.payout) :
                         ev.type === 'deposit' ? `+${fmt(ev.amount)}` :
                         `-${fmt(ev.amount)}`}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${
                        ev.netChange > 0n ? 'text-green-400' :
                        ev.netChange < 0n ? 'text-red-400' :
                        'text-gray-500'
                      }`}>
                        {ev.netChange >= 0n ? '+' : ''}{fmt(ev.netChange)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${
                        ev.runningBalance < 0n ? 'text-red-400' : 'text-white'
                      }`}>
                        {fmt(ev.runningBalance)}
                      </td>
                      <td className="px-3 py-2">
                        {ev.flags.length > 0 ? (
                          <button
                            onClick={() => setExpandedFlags((prev) => {
                              const next = new Set(prev);
                              isExpanded ? next.delete(ev.id) : next.add(ev.id);
                              return next;
                            })}
                            className="flex flex-wrap gap-1"
                          >
                            {ev.flags.map((f) => (
                              <span key={f} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${FLAG_META[f].color}`}>
                                {FLAG_META[f].label}
                              </span>
                            ))}
                          </button>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
                >
                  ←
                </button>
                {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
                  const p = pageCount <= 7 ? i : page < 4 ? i : page > pageCount - 4 ? pageCount - 7 + i : page - 3 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-2 py-1 rounded ${p === page ? 'bg-cyan-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}
                    >
                      {p + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="px-2 py-1 rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!txLoading && !gamesLoading && filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {filterType === 'flagged' ? 'No flagged events — nothing suspicious found.' : 'No events found.'}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-white/10">
        <p className="text-[10px] text-gray-500 w-full">Flag legend:</p>
        {(Object.entries(FLAG_META) as [AuditFlag, typeof FLAG_META[AuditFlag]][]).map(([key, meta]) => (
          <span key={key} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.color}`}>
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}
