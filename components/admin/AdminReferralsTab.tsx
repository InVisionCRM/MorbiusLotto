'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, RefreshCw, Coins, Gift, UserCheck } from 'lucide-react';
import { getApiUrlOptional } from '@/lib/api-urls';

/** Mirror of AdminReferralsResult in referral.service.ts. */
interface AdminReferralRow {
  referee: string;
  referrer: string;
  code: string;
  welcomeBonusChips: string;
  totalRewardChips: string;
  boundAt: string;
}
interface AdminReferralsResult {
  totals: {
    totalReferrals: number;
    uniqueReferrers: number;
    totalWelcomePaidChips: string;
    totalRewardPaidChips: string;
  };
  limit: number;
  referrals: AdminReferralRow[];
}

/** Whole-chip decimal string → grouped display (chips are 1:1 MORBIUS). */
function fmtChips(v: string | number | undefined): string {
  if (v == null) return '0';
  try {
    return BigInt(typeof v === 'number' ? Math.trunc(v) : v).toLocaleString('en-US');
  } catch {
    return String(v);
  }
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

export default function AdminReferralsTab() {
  const { address } = useAccount();
  const [data, setData] = useState<AdminReferralsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const apiBase = getApiUrlOptional() ?? '';

  const fetchAll = useCallback(async () => {
    if (!address) return;
    if (!apiBase) {
      setError('Backend URL not configured (NEXT_PUBLIC_API_URL)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/referrals/admin/all?limit=2000`, {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as AdminReferralsResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [address, apiBase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const rows = useMemo(() => {
    const all = data?.referrals ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.referee.toLowerCase().includes(q) ||
        r.referrer.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <Card style={{ background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(20, 30, 40))' }}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5 text-purple-400" />
            All Referrals
          </CardTitle>
          <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <>
            {/* Program totals */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<Users className="h-3.5 w-3.5" />}
                label="Total referrals"
                value={(data?.totals.totalReferrals ?? 0).toLocaleString('en-US')}
              />
              <StatCard
                icon={<UserCheck className="h-3.5 w-3.5" />}
                label="Unique referrers"
                value={(data?.totals.uniqueReferrers ?? 0).toLocaleString('en-US')}
              />
              <StatCard
                icon={<Gift className="h-3.5 w-3.5" />}
                label="Welcome bonuses paid"
                value={fmtChips(data?.totals.totalWelcomePaidChips)}
              />
              <StatCard
                icon={<Coins className="h-3.5 w-3.5" />}
                label="Referrer rewards paid"
                value={fmtChips(data?.totals.totalRewardPaidChips)}
              />
            </div>

            {/* Search */}
            <div className="mt-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by referee, referrer, or code…"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-purple-400/60 sm:max-w-md"
              />
            </div>

            {/* Table */}
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wide text-white/40">
                    <th className="px-3 py-2 font-medium">Referee</th>
                    <th className="px-3 py-2 font-medium">Referrer</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 text-right font-medium">Welcome</th>
                    <th className="px-3 py-2 text-right font-medium">Earned</th>
                    <th className="px-3 py-2 font-medium">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !data ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-white/40">
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-white/40">
                        {data && data.referrals.length > 0
                          ? 'No referrals match your filter.'
                          : 'No referral codes have been used yet.'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={`${r.referee}-${r.boundAt}`}
                        className="border-t border-white/[0.06] hover:bg-white/[0.02]"
                      >
                        <td className="px-3 py-2 font-mono text-white" title={r.referee}>
                          {shortAddr(r.referee)}
                        </td>
                        <td className="px-3 py-2 font-mono text-white/80" title={r.referrer}>
                          {shortAddr(r.referrer)}
                        </td>
                        <td className="px-3 py-2 font-mono uppercase tracking-wider text-purple-300">
                          {r.code}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-white/80">
                          {fmtChips(r.welcomeBonusChips)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-purple-300">
                          {fmtChips(r.totalRewardChips)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-white/50">
                          {fmtDate(r.boundAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && data.referrals.length >= data.limit && (
              <p className="mt-2 text-xs text-white/35">
                Showing the {data.limit.toLocaleString('en-US')} most recent referrals.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
