'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { getApiUrlOptional } from '@/lib/api-urls';

interface Report {
  id: string;
  wallet_address: string | null;
  category: string;
  description: string;
  page_url: string | null;
  user_agent: string | null;
  balance_snapshot: string | null;
  recent_errors: { time: string; message: string }[] | null;
  status: 'new' | 'read' | 'resolved';
  created_at: string;
}

const STATUS_BADGE: Record<Report['status'], { label: string; className: string }> = {
  new:      { label: 'New',      className: 'bg-red-600/80 text-white border-red-500' },
  read:     { label: 'Read',     className: 'bg-amber-600/80 text-white border-amber-500' },
  resolved: { label: 'Resolved', className: 'bg-emerald-700/80 text-white border-emerald-600' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export default function AdminReportsTab() {
  const { address } = useAccount();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const apiBase = getApiUrlOptional() ?? '';

  const fetchReports = useCallback(async () => {
    if (!address) return;
    if (!apiBase) {
      setError('Backend URL not configured (NEXT_PUBLIC_API_URL)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`${apiBase}/api/admin/reports${qs}`, {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setReports(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [address, statusFilter, apiBase]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function updateStatus(id: string, status: 'read' | 'resolved') {
    if (!address) return;
    setUpdating(id);
    try {
      const res = await fetch(`${apiBase}/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      alert(`Failed to update: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUpdating(null);
    }
  }

  const newCount = reports.filter((r) => r.status === 'new').length;

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-400" />
            User Reports
            {newCount > 0 && (
              <span className="ml-1 text-[11px] bg-red-600 text-white rounded-full px-1.5 py-0.5 font-bold">
                {newCount}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 w-28 rounded-md border border-slate-600 bg-slate-800 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="read">Read</option>
              <option value="resolved">Resolved</option>
            </select>
            <Button size="sm" variant="outline" onClick={fetchReports} disabled={loading}
              className="h-7 px-2 border-slate-600 text-slate-300 hover:text-white">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <p className="text-xs text-red-400 px-4 py-3">{error}</p>
        )}
        {!error && reports.length === 0 && (
          <p className="text-xs text-slate-500 px-4 py-6 text-center">
            {loading ? 'Loading…' : 'No reports found.'}
          </p>
        )}

        <div className="divide-y divide-slate-800">
          {reports.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="px-4 py-3 space-y-2">
                {/* Row header */}
                <div className="flex items-start gap-2">
                  <Badge className={`text-[10px] px-1.5 py-0 shrink-0 border ${badge.className}`}>
                    {badge.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-amber-300">{r.category}</span>
                      <span className="text-[10px] text-slate-500">{timeAgo(r.created_at)}</span>
                      {r.wallet_address && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {r.wallet_address.slice(0, 6)}…{r.wallet_address.slice(-4)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                      {expanded ? r.description : truncate(r.description, 120)}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                  >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="ml-2 space-y-2 text-[11px]">
                    {/* Debug context */}
                    <div className="rounded bg-slate-800/70 border border-slate-700/50 px-3 py-2 space-y-1 font-mono">
                      {r.wallet_address && (
                        <p><span className="text-slate-500">wallet:</span> <span className="text-slate-200">{r.wallet_address}</span></p>
                      )}
                      {r.page_url && (
                        <p><span className="text-slate-500">page:</span> <span className="text-slate-200 break-all">{r.page_url}</span></p>
                      )}
                      {r.balance_snapshot != null && (
                        <p><span className="text-slate-500">balance:</span> <span className="text-slate-200">{(Number(r.balance_snapshot) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} MORBIUS</span></p>
                      )}
                      {r.user_agent && (
                        <p><span className="text-slate-500">ua:</span> <span className="text-slate-400 break-all">{r.user_agent}</span></p>
                      )}
                      <p><span className="text-slate-500">id:</span> <span className="text-slate-400">{r.id}</span></p>
                      <p><span className="text-slate-500">submitted:</span> <span className="text-slate-400">{new Date(r.created_at).toLocaleString()}</span></p>
                    </div>

                    {/* Recent errors */}
                    {r.recent_errors && r.recent_errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-slate-500 uppercase tracking-wide text-[10px]">Console errors at time of report</p>
                        <div className="rounded bg-slate-950/80 border border-slate-700/50 px-3 py-2 max-h-40 overflow-y-auto space-y-1">
                          {r.recent_errors.map((e, i) => (
                            <div key={i} className="text-[10px]">
                              <span className="text-slate-500">{new Date(e.time).toLocaleTimeString()} </span>
                              <span className="text-red-300 break-all">{e.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      {r.status !== 'read' && r.status !== 'resolved' && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'read')}
                          disabled={updating === r.id}
                          className="h-6 text-[11px] px-2 border-amber-600/50 text-amber-300 hover:bg-amber-600/20">
                          Mark Read
                        </Button>
                      )}
                      {r.status !== 'resolved' && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'resolved')}
                          disabled={updating === r.id}
                          className="h-6 text-[11px] px-2 border-emerald-600/50 text-emerald-300 hover:bg-emerald-600/20">
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
