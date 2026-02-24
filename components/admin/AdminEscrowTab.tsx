'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Theme } from '@/lib/theme';
import { formatEther } from 'viem';

interface EscrowSummary {
  totalTournaments: number;
  activeTournaments: number;
  cancelledTournaments: number;
  totalValueLocked: string;
}

interface EscrowPool {
  tournamentId: string;
  token: string | null;
  depositor: string | null;
  totalDeposited: string;
  amountPaidOut: string;
  remainingBalance: string;
  depositedAt: string;
  cancelled: boolean;
  ageDays: number;
}

export function AdminEscrowTab() {
  const { address } = useAccount();
  const [summary, setSummary] = useState<EscrowSummary | null>(null);
  const [pools, setPools] = useState<EscrowPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [depositorFilter, setDepositorFilter] = useState<string>('');

  const fetchSummary = async () => {
    if (!address) return;
    try {
      const res = await fetch('/api/admin/escrow/summary', {
        headers: {
          'x-admin-wallet': address,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch escrow summary');
      const data = await res.json();
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load escrow summary');
    }
  };

  const fetchPools = async () => {
    if (!address) return;
    try {
      let url = '/api/admin/escrow/pools';
      const params = new URLSearchParams();
      if (depositorFilter) {
        params.append('depositor', depositorFilter);
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      const res = await fetch(url, {
        headers: {
          'x-admin-wallet': address,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch pools');
      const data = await res.json();
      setPools(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load pools');
    }
  };

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    Promise.all([fetchSummary(), fetchPools()]).finally(() => setLoading(false));
  }, [address, depositorFilter]);

  const truncAddr = (addr: string | null | undefined) => {
    if (!addr) return '—';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatToken = (amount: string) => {
    try {
      return Number(formatEther(BigInt(amount || '0'))).toLocaleString();
    } catch {
      return '0';
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      return new Date(Number(timestamp) * 1000).toLocaleString();
    } catch {
      return '-';
    }
  };

  const filteredPools = pools.filter((p) => {
    if (filter === 'active') return !p.cancelled && BigInt(p.remainingBalance) > 0n;
    if (filter === 'cancelled') return p.cancelled;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-400">Loading escrow data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border border-cyan-500/30" style={Theme.panel.base}>
            <div className="text-gray-400 text-xs mb-1">Total Tournaments</div>
            <div className="text-2xl font-bold text-white">{summary.totalTournaments}</div>
          </div>
          <div className="p-4 rounded-lg border border-green-500/30" style={Theme.panel.base}>
            <div className="text-gray-400 text-xs mb-1">Active</div>
            <div className="text-2xl font-bold text-green-400">{summary.activeTournaments}</div>
          </div>
          <div className="p-4 rounded-lg border border-red-500/30" style={Theme.panel.base}>
            <div className="text-gray-400 text-xs mb-1">Cancelled</div>
            <div className="text-2xl font-bold text-red-400">{summary.cancelledTournaments}</div>
          </div>
          <div className="p-4 rounded-lg border border-yellow-500/30" style={Theme.panel.base}>
            <div className="text-gray-400 text-xs mb-1">Total Value Locked</div>
            <div className="text-2xl font-bold text-yellow-400">{formatToken(summary.totalValueLocked)} PLS</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'active'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('cancelled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'cancelled'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Cancelled
          </button>
        </div>
        <input
          type="text"
          placeholder="Filter by depositor address..."
          value={depositorFilter}
          onChange={(e) => setDepositorFilter(e.target.value)}
          className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          onClick={() => Promise.all([fetchSummary(), fetchPools()])}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm" style={Theme.panel.base}>
          {error}
        </div>
      )}

      {/* Pools Table */}
      <div className="rounded-xl border border-gray-700 overflow-hidden" style={Theme.panel.base}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Tournament ID</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Token</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Depositor</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Total Deposited</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Paid Out</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Remaining</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Deposited At</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Age (Days)</th>
                <th className="px-4 py-3 text-left text-gray-400 text-xs font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPools.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No pools found
                  </td>
                </tr>
              ) : (
                filteredPools.map((pool, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-white font-mono text-xs">{truncAddr(pool.tournamentId)}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{truncAddr(pool.token)}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{truncAddr(pool.depositor)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatToken(pool.totalDeposited)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatToken(pool.amountPaidOut)}</td>
                    <td className="px-4 py-3 text-yellow-400 font-semibold text-sm">{formatToken(pool.remainingBalance)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(pool.depositedAt)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{pool.ageDays.toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          pool.cancelled
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : BigInt(pool.remainingBalance) > 0n
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}
                      >
                        {pool.cancelled ? 'Cancelled' : BigInt(pool.remainingBalance) > 0n ? 'Active' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
