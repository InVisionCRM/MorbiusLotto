'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cherry, RefreshCw } from 'lucide-react';
import { getApiUrlOptional } from '@/lib/api-urls';

/**
 * Admin: every community slot machine and all money movement across them.
 * Mirrors the shapes served by slot-machines-stats.routes.ts
 * (GET /api/slot-machines/admin/overview and …/admin/activity).
 */

interface OverviewTotals {
  machines: number;
  published: number;
  tokenMachines: number;
  spins: number;
  realSpins: number;
  realWagered: string;
  realPaid: string;
  players: number;
}
interface MachineRow {
  slug: string;
  name: string;
  status: string;
  owner: string;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  bankroll: string;
  feeWarning: boolean;
  simRtpPct: number | null;
  spins: number;
  realSpins: number;
  realWagered: string;
  realNet: string;
  players: number;
  lastSpinAt: string | null;
  playerLiabilities: string;
}
interface ActivityEvent {
  kind: string;
  slug: string;
  machine: string;
  actor: string;
  a: string | null;
  b: string | null;
  detail: string | null;
  at: string;
}

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
function fmtInt(v: string | number | null | undefined): string {
  if (v == null) return '0';
  try { return BigInt(typeof v === 'number' ? Math.trunc(v) : v).toLocaleString('en-US'); } catch { return String(v); }
}
/** Token base units → human string using the machine's decimals. */
function fmtBase(v: string | null | undefined, decimals: number | null): string {
  if (v == null || decimals == null) return fmtInt(v);
  try {
    const b = BigInt(v);
    const d = 10n ** BigInt(decimals);
    const frac = (b % d).toString().padStart(decimals, '0').slice(0, 2).replace(/0+$/, '');
    return `${(b / d).toLocaleString('en-US')}${frac ? '.' + frac : ''}`;
  } catch { return String(v); }
}
function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function eventLabel(e: ActivityEvent): string {
  switch (e.kind) {
    case 'spin': return `spin ${fmtInt(e.a)} → ${fmtInt(e.b)} (${e.detail})`;
    case 'bankroll_deposit': return `bankroll +${fmtInt(e.a)} base units`;
    case 'bankroll_withdrawal': return `bankroll −${fmtInt(e.a)} base units`;
    case 'player_deposit': return `player deposit ${fmtInt(e.b)} cr`;
    case 'player_cashout': return `player cashout ${fmtInt(e.b)} cr`;
    default: return e.kind;
  }
}

export default function AdminSlotsTab() {
  const { address } = useAccount();
  const [totals, setTotals] = useState<OverviewTotals | null>(null);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const base = getApiUrlOptional();
    if (!base || !address) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-admin-wallet': address };
      const [ovRes, actRes] = await Promise.all([
        fetch(`${base}/api/slot-machines/admin/overview`, { headers }),
        fetch(`${base}/api/slot-machines/admin/activity?limit=60`, { headers }),
      ]);
      if (!ovRes.ok) throw new Error(`overview failed (${ovRes.status})`);
      const ov = await ovRes.json();
      setTotals(ov.totals);
      setMachines(ov.machines ?? []);
      if (actRes.ok) {
        const act = await actRes.json();
        setEvents(act.events ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card className="border border-slate-700/50 bg-slate-900/40">
        <CardHeader className="py-3 px-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-100">
            <Cherry className="w-4 h-4 text-pink-400/90" />
            Community slots — all machines
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="h-7 text-xs">
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
              <div className="rounded bg-slate-800/60 p-2"><div className="text-slate-500">machines</div><div className="text-slate-100 font-semibold">{totals.machines} ({totals.published} live · {totals.tokenMachines} token)</div></div>
              <div className="rounded bg-slate-800/60 p-2"><div className="text-slate-500">spins</div><div className="text-slate-100 font-semibold">{fmtInt(totals.spins)} ({fmtInt(totals.realSpins)} real)</div></div>
              <div className="rounded bg-slate-800/60 p-2"><div className="text-slate-500">real wagered / paid (cr)</div><div className="text-slate-100 font-semibold">{fmtInt(totals.realWagered)} / {fmtInt(totals.realPaid)}</div></div>
              <div className="rounded bg-slate-800/60 p-2"><div className="text-slate-500">unique players</div><div className="text-slate-100 font-semibold">{fmtInt(totals.players)}</div></div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700/50">
                  <th className="py-1 pr-2">machine</th>
                  <th className="py-1 pr-2">creator</th>
                  <th className="py-1 pr-2">status</th>
                  <th className="py-1 pr-2">token</th>
                  <th className="py-1 pr-2">bankroll</th>
                  <th className="py-1 pr-2">spins (real)</th>
                  <th className="py-1 pr-2">real net (cr)</th>
                  <th className="py-1 pr-2">players</th>
                  <th className="py-1 pr-2">owed (cr)</th>
                  <th className="py-1">last spin</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.slug} className="border-b border-slate-800/60 text-slate-200">
                    <td className="py-1 pr-2">
                      <a className="text-cyan-400 hover:underline" href={`/embed/${m.slug}`} target="_blank" rel="noreferrer">{m.name}</a>
                      {m.feeWarning && <span title="fee-on-transfer token" className="ml-1 text-amber-400">⚠</span>}
                    </td>
                    <td className="py-1 pr-2 font-mono">{shortAddr(m.owner)}</td>
                    <td className="py-1 pr-2">{m.status}{m.simRtpPct != null ? ` · ${Math.round(m.simRtpPct)}%` : ''}</td>
                    <td className="py-1 pr-2">{m.tokenSymbol ?? '—'}</td>
                    <td className="py-1 pr-2">{m.tokenSymbol ? `${fmtBase(m.bankroll, m.tokenDecimals)} ${m.tokenSymbol}` : '—'}</td>
                    <td className="py-1 pr-2">{fmtInt(m.spins)} ({fmtInt(m.realSpins)})</td>
                    <td className="py-1 pr-2">{fmtInt(m.realNet)}</td>
                    <td className="py-1 pr-2">{m.players}</td>
                    <td className="py-1 pr-2">{fmtInt(m.playerLiabilities)}</td>
                    <td className="py-1">{fmtWhen(m.lastSpinAt)}</td>
                  </tr>
                ))}
                {machines.length === 0 && !loading && (
                  <tr><td colSpan={10} className="py-3 text-slate-500">No community machines yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-700/50 bg-slate-900/40">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="text-sm text-slate-100">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          <div className="space-y-1 text-xs">
            {events.map((e, i) => (
              <div key={i} className="flex flex-wrap gap-x-2 text-slate-300">
                <span className="text-slate-500 w-28 shrink-0">{fmtWhen(e.at)}</span>
                <span className="text-cyan-400">{e.machine}</span>
                <span className="font-mono text-slate-500">{shortAddr(e.actor)}</span>
                <span>{eventLabel(e)}</span>
              </div>
            ))}
            {events.length === 0 && <div className="text-slate-500">Nothing yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
