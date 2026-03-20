'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { Card, CardContent } from '@/components/ui/card';

type PendingDepositRow = {
  id: string;
  wallet_address: string;
  status: string;
  created_at: string;
};

type PendingWithdrawalRow = {
  id: string;
  wallet_address: string;
  status: string;
  created_at: string;
};

const PAGE_SIZE = 25;

const EMBOSSED_PANEL = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
};

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDateTime(input: string): string {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase();
  const colorClass =
    normalized === 'pending' || normalized === 'pending_confirmation'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : normalized === 'completed' || normalized === 'credited'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : normalized === 'expired'
      ? 'bg-red-500/20 text-red-300 border-red-500/30'
      : 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${colorClass}`}>
      {status || 'unknown'}
    </span>
  );
}

export default function AdminPendingTransfersTab() {
  const { address } = useAccount();
  const [deposits, setDeposits] = useState<PendingDepositRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawalRow[]>([]);
  const [depositsHasMore, setDepositsHasMore] = useState(false);
  const [withdrawalsHasMore, setWithdrawalsHasMore] = useState(false);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeposits = useCallback(async (offset = 0, append = false) => {
    if (!address) return;
    setDepositsLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-transfers?type=deposits&limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`Failed to load deposits (${res.status})`);
      const payload = await res.json();
      const rows: PendingDepositRow[] = Array.isArray(payload.rows) ? payload.rows : [];
      setDeposits((prev) => (append ? [...prev, ...rows] : rows));
      setDepositsHasMore(Boolean(payload.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending deposits');
    } finally {
      setDepositsLoading(false);
    }
  }, [address]);

  const fetchWithdrawals = useCallback(async (offset = 0, append = false) => {
    if (!address) return;
    setWithdrawalsLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-transfers?type=withdrawals&limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`Failed to load withdrawals (${res.status})`);
      const payload = await res.json();
      const rows: PendingWithdrawalRow[] = Array.isArray(payload.rows) ? payload.rows : [];
      setWithdrawals((prev) => (append ? [...prev, ...rows] : rows));
      setWithdrawalsHasMore(Boolean(payload.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending withdrawals');
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setError(null);
    void Promise.all([fetchDeposits(0, false), fetchWithdrawals(0, false)]);
  }, [address, fetchDeposits, fetchWithdrawals]);

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">Connect wallet to view pending transfers.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-500/30 overflow-hidden" style={EMBOSSED_PANEL}>
          <div className="px-3 py-2 border-b border-cyan-500/20 text-xs font-semibold text-cyan-300">Pending Deposits</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-700/70 text-slate-400">
                  <th className="text-left py-2 px-3">Player Address</th>
                  <th className="text-left py-2 px-3">Date & Time</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 && !depositsLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-500 text-center" colSpan={3}>No pending deposits found.</td>
                  </tr>
                ) : (
                  deposits.map((row) => (
                    <tr key={row.id} className="border-b border-slate-700/40 hover:bg-slate-800/40">
                      <td className="py-2 px-3">
                        <Link
                          href={`/player/${row.wallet_address}`}
                          className="font-mono text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                          title="Open player dashboard (All games)"
                        >
                          {truncateAddress(row.wallet_address)}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{formatDateTime(row.created_at)}</td>
                      <td className="py-2 px-3"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={() => void fetchDeposits(deposits.length, true)}
              disabled={!depositsHasMore || depositsLoading}
              className="text-xs px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {depositsLoading ? 'Loading...' : depositsHasMore ? 'Load more' : 'No more rows'}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/30 overflow-hidden" style={EMBOSSED_PANEL}>
          <div className="px-3 py-2 border-b border-cyan-500/20 text-xs font-semibold text-cyan-300">Pending Withdrawals</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-700/70 text-slate-400">
                  <th className="text-left py-2 px-3">Player Address</th>
                  <th className="text-left py-2 px-3">Date & Time</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.length === 0 && !withdrawalsLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-500 text-center" colSpan={3}>No pending withdrawals found.</td>
                  </tr>
                ) : (
                  withdrawals.map((row) => (
                    <tr key={row.id} className="border-b border-slate-700/40 hover:bg-slate-800/40">
                      <td className="py-2 px-3">
                        <Link
                          href={`/player/${row.wallet_address}`}
                          className="font-mono text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                          title="Open player dashboard (All games)"
                        >
                          {truncateAddress(row.wallet_address)}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{formatDateTime(row.created_at)}</td>
                      <td className="py-2 px-3"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={() => void fetchWithdrawals(withdrawals.length, true)}
              disabled={!withdrawalsHasMore || withdrawalsLoading}
              className="text-xs px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {withdrawalsLoading ? 'Loading...' : withdrawalsHasMore ? 'Load more' : 'No more rows'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
