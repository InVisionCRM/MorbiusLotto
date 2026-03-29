'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { isAdminWallet } from '@/lib/admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PokerTable {
  id: string;
  small_blind: string;
  big_blind: string;
  max_seats: number;
  status: string;
  tournament_mode: boolean;
  tournament_id: string | null;
  hand_number: number;
  seated_count: number;
}

interface PokerTournament {
  tournament_id: string;
  name: string;
  status: string;
  buy_in_amount: string;
  prize_pool: string;
  min_players: number;
  max_players: number;
  starting_chips: number;
  scheduled_start_at: string | null;
  created_at: string;
  creator_address: string | null;
  prize_distribution_type: string;
  active_players: number;
  total_entries: number;
  table_id: string | null;
}

interface StatusData {
  health: { status: string; timestamp: string } | null;
  cashTables: PokerTable[];
  allTables: PokerTable[] | null;
  tournaments: PokerTournament[];
  fetchedAt: string;
}

interface TestResult {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  suite: string;
  ranAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SUITES = [
  { key: 'all',         label: 'All Suites',              desc: 'Run the full test suite' },
  { key: 'create',      label: '1 — Create Tournament',   desc: 'game_type=poker, status=registration, config stored' },
  { key: 'join',        label: '2 — Join Tournament',     desc: 'Buy-in deducted, entry created, validations' },
  { key: 'auto-start',  label: '3 — Auto-start (SNG)',    desc: 'Triggers on minPlayers, table created, seats filled' },
  { key: 'blind-level', label: '4 — Blind Level (pure)',  desc: 'computeBlindLevel for all hand ranges' },
  { key: 'chip-sync',   label: '5 — Chip Sync',           desc: 'syncAfterHand updates chips_remaining + hands_played' },
  { key: 'elimination', label: '6 — Elimination',         desc: '0-chip player busted, seat removed, rank assigned' },
  { key: 'prizes',      label: '7 — Prize Distribution',  desc: 'Winner balance credited after completeTournament' },
  { key: 'e2e',         label: '8 — Full E2E',            desc: 'Create → join × 2 → play → bust → prizes' },
  { key: 'regression',  label: '9 — Regression',          desc: 'Blackjack & cash games unaffected; cancel refunds' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(wei: string | null | undefined): string {
  if (!wei) return '0';
  try {
    return formatMorbiusFloor(wei, { compact: false });
  } catch {
    return wei;
  }
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function statusDot(status: string) {
  const colors: Record<string, string> = {
    ok:           'bg-green-400',
    active:       'bg-green-400',
    registration: 'bg-blue-400',
    waiting:      'bg-yellow-400',
    playing:      'bg-cyan-400',
    completed:    'bg-slate-400',
    cancelled:    'bg-red-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-slate-500'} mr-1.5`} />;
}

// ---------------------------------------------------------------------------
// Tab: Health
// ---------------------------------------------------------------------------

function HealthTab({ data, loading, onRefresh }: { data: StatusData | null; loading: boolean; onRefresh: () => void }) {
  const cashTables = data?.cashTables ?? [];
  const allTables  = data?.allTables  ?? [];
  const tournaments = data?.tournaments ?? [];

  const activeTournaments      = tournaments.filter(t => t.status === 'active');
  const registrationTournaments = tournaments.filter(t => t.status === 'registration');
  const tournamentTables       = allTables.filter(t => t.tournament_mode);
  const totalSeated            = cashTables.reduce((s, t) => s + Number(t.seated_count), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">System Health</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Server status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Server',         value: data?.health?.status ?? '—',   color: data?.health?.status === 'ok' ? 'text-green-400' : 'text-red-400' },
          { label: 'Cash Tables',    value: cashTables.length,              color: 'text-cyan-400' },
          { label: 'Active Players', value: totalSeated,                    color: 'text-yellow-400' },
          { label: 'Tournaments',    value: tournaments.length,             color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center">
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{String(value)}</div>
            <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Tournament health */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tournament Status</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-blue-400">{registrationTournaments.length}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Open (Registration)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">{activeTournaments.length}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Active (Playing)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-400">{tournamentTables.length}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Tournament Tables</div>
          </div>
        </div>
      </div>

      {/* Active cash tables summary */}
      {cashTables.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Cash Tables</h3>
          <div className="space-y-1.5">
            {cashTables.map(t => (
              <div key={t.id} className="flex items-center justify-between text-xs text-slate-300 py-1 border-b border-slate-700/30 last:border-0">
                <span className="font-mono text-slate-500">{t.id.slice(0, 8)}…</span>
                <span>{fmt(t.small_blind)} / {fmt(t.big_blind)}</span>
                <span>{statusDot(t.status)}{t.status}</span>
                <span className="text-slate-400">{t.seated_count}/{t.max_seats} seated</span>
                <span className="text-slate-500">hand #{t.hand_number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <p className="text-[11px] text-slate-600 text-right">
          Last fetched {new Date(data.fetchedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Tournaments
// ---------------------------------------------------------------------------

function TournamentsTab({ data }: { data: StatusData | null }) {
  const tournaments = data?.tournaments ?? [];
  if (tournaments.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">No poker tournaments found.</p>;
  }

  return (
    <div className="space-y-3">
      {tournaments.map(t => (
        <div key={t.tournament_id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="font-semibold text-white text-sm">{t.name}</span>
              <span className="ml-2 text-[11px] text-slate-500 font-mono">{t.tournament_id.slice(0, 8)}…</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
              t.status === 'active'       ? 'bg-green-500/20 text-green-300 border-green-500/30' :
              t.status === 'registration' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
              t.status === 'completed'    ? 'bg-slate-500/20 text-slate-400 border-slate-500/30' :
                                           'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>{t.status}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400">
            <div><span className="text-slate-600 block text-[10px] uppercase">Buy-in</span>{fmt(t.buy_in_amount)} MORBIUS</div>
            <div><span className="text-slate-600 block text-[10px] uppercase">Prize Pool</span><span className="text-yellow-400">{fmt(t.prize_pool)} MORBIUS</span></div>
            <div><span className="text-slate-600 block text-[10px] uppercase">Players</span>{t.active_players} active / {t.total_entries} total ({t.min_players}–{t.max_players})</div>
            <div><span className="text-slate-600 block text-[10px] uppercase">Creator</span>{shortAddr(t.creator_address)}</div>
            {t.scheduled_start_at && (
              <div className="col-span-2"><span className="text-slate-600 block text-[10px] uppercase">Scheduled Start</span>{new Date(t.scheduled_start_at).toLocaleString()}</div>
            )}
            {t.table_id && (
              <div className="col-span-2"><span className="text-slate-600 block text-[10px] uppercase">Table ID</span>
                <Link href={`/poker/${t.table_id}`} className="text-cyan-400 hover:underline font-mono">{t.table_id.slice(0, 16)}…</Link>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: All Tables (including tournament)
// ---------------------------------------------------------------------------

function TablesTab({ data }: { data: StatusData | null }) {
  const tables = data?.allTables ?? data?.cashTables ?? [];
  if (tables.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">No poker tables found.</p>;
  }
  return (
    <div className="space-y-2">
      {tables.map(t => (
        <div key={t.id} className={`rounded-xl border p-4 flex flex-wrap gap-4 items-center text-xs ${
          t.tournament_mode
            ? 'border-purple-500/30 bg-purple-500/5'
            : 'border-slate-700/50 bg-slate-800/30'
        }`}>
          <Link href={`/poker/${t.id}`} className="font-mono text-cyan-400 hover:underline text-[11px]">
            {t.id.slice(0, 12)}…
          </Link>
          <span>{statusDot(t.status)}{t.status}</span>
          <span className="text-slate-300">{fmt(t.small_blind)} / {fmt(t.big_blind)} blinds</span>
          <span className="text-slate-400">{t.seated_count}/{t.max_seats} seated</span>
          <span className="text-slate-500">hand #{t.hand_number}</span>
          {t.tournament_mode && (
            <span className="text-purple-400 text-[10px] px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10">
              Tournament
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Tests
// ---------------------------------------------------------------------------

function TestsTab() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const runSuite = useCallback(async (key: string) => {
    setRunning(r => ({ ...r, [key]: true }));
    try {
      const res = await fetch('/api/poker/admin/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suite: key }),
      });
      const data: TestResult = await res.json();
      setResults(r => ({ ...r, [key]: data }));
    } catch (err) {
      setResults(r => ({ ...r, [key]: {
        ok: false, exitCode: -1, timedOut: false,
        output: (err as Error).message,
        suite: key, ranAt: new Date().toISOString(),
      }}));
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400/80">
        Tests run against the <strong>real database</strong>. Requires <code className="bg-yellow-500/10 px-1 rounded">server/.env</code> with <code className="bg-yellow-500/10 px-1 rounded">DATABASE_URL</code> and migrations 063 + 064 applied. Each test cleans up after itself.
      </div>

      {TEST_SUITES.map(suite => {
        const result = results[suite.key];
        const isRunning = running[suite.key];
        const isAllRunning = running['all'];

        return (
          <div key={suite.key} className={`rounded-xl border p-4 transition-colors ${
            result === undefined ? 'border-slate-700/50 bg-slate-800/30' :
            result.ok           ? 'border-green-500/30 bg-green-500/5' :
                                  'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {result && (
                    <span className={`text-sm ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {result.ok ? '✓' : '✗'}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-white">{suite.label}</span>
                  {suite.key === 'all' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">Full Suite</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{suite.desc}</p>
                {result && (
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Exit {result.exitCode} · {new Date(result.ranAt).toLocaleTimeString()}
                    {result.timedOut && <span className="text-red-400 ml-2">TIMED OUT</span>}
                  </p>
                )}
              </div>
              <button
                onClick={() => runSuite(suite.key)}
                disabled={isRunning || (suite.key !== 'all' && isAllRunning)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 ${
                  suite.key === 'all'
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
                }`}
              >
                {isRunning ? 'Running…' : 'Run'}
              </button>
            </div>

            {/* Output */}
            {result?.output && (
              <div className="mt-3">
                <pre className={`text-[11px] font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-80 ${
                  result.ok ? 'bg-green-950/30 text-green-300/80' : 'bg-red-950/30 text-red-300/80'
                }`}>
                  {/* Strip ANSI escape codes for clean display */}
                  {result.output.replace(/\x1b\[[0-9;]*m/g, '')}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'health',       label: 'Health',      icon: '♥' },
  { key: 'tournaments',  label: 'Tournaments', icon: '🏆' },
  { key: 'tables',       label: 'Tables',      icon: '♠' },
  { key: 'tests',        label: 'Tests',       icon: '⚗' },
];

export default function PokerAdminPage() {
  const { address } = useAccount();
  const isAdmin = isAdminWallet(address);
  const [activeTab, setActiveTab] = useState('health');
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/poker/admin/status');
      if (res.ok) setStatusData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchStatus();
      const id = setInterval(fetchStatus, 30_000);
      return () => clearInterval(id);
    }
  }, [isAdmin, fetchStatus]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-3">
        <span className="text-4xl">🚫</span>
        <h1 className="text-lg font-semibold text-slate-200">Admin wallet required</h1>
        <Link href="/poker" className="text-xs text-cyan-400 hover:underline">← Back to Poker</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link href="/poker" className="text-slate-500 hover:text-slate-300 text-sm">← Poker</Link>
              <span className="text-slate-700">/</span>
              <h1 className="text-white font-bold text-lg">Poker Admin</h1>
            </div>
            <span className="text-[11px] text-slate-600 font-mono">{address?.slice(0, 10)}…</span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-6 bg-slate-900/50 rounded-xl p-1 w-fit">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'health'      && <HealthTab data={statusData} loading={loading} onRefresh={fetchStatus} />}
          {activeTab === 'tournaments' && <TournamentsTab data={statusData} />}
          {activeTab === 'tables'      && <TablesTab data={statusData} />}
          {activeTab === 'tests'       && <TestsTab />}
      </div>
    </div>
  );
}
