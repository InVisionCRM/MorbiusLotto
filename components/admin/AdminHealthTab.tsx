'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEther } from 'viem';
import { Activity, RefreshCw, CheckCircle, XCircle, Copy } from 'lucide-react';

export interface AdminHealthData {
  api: string;
  ws: string;
  games: Record<string, { rpc: 'ok' | 'fail'; error?: string }>;
  morbius: Record<string, string>;
  blackjackReserves: {
    totalMorbiusInContract: string;
    addressesWithReserve: Array<{ address: string; reserve: string }>;
  };
  contractAddresses?: Record<string, string>;
}

function formatMorbius(wei: string): string {
  if (wei == null || wei === '') return '0';
  try {
    const n = Number(formatEther(BigInt(wei)));
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return n.toFixed(2);
  } catch {
    return '0';
  }
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export default function AdminHealthTab() {
  const { address } = useAccount();
  const [data, setData] = useState<AdminHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/health', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load health');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load health.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Game health
          </CardTitle>
          <button
            type="button"
            onClick={() => fetchHealth()}
            disabled={loading}
            className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </CardHeader>
        <CardContent className="py-2 px-3">
          {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}
          {loading && !data && <p className="text-[11px] text-slate-500">Loading…</p>}
          {data && (
            <div className="space-y-3 text-[11px]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-slate-500">API</span>
              <span className={data.api === 'ok' ? 'text-emerald-400' : 'text-red-400'}>{data.api === 'ok' ? <CheckCircle className="w-3.5 h-3.5 inline mr-0.5" /> : <XCircle className="w-3.5 h-3.5 inline mr-0.5" />}{data.api}</span>
              <span className="text-slate-500">WebSocket</span>
              <span className={data.ws === 'up' ? 'text-emerald-400' : 'text-amber-400'}>{data.ws}</span>
            </div>
            <div>
              <p className="text-slate-500 mb-1">RPC / contract</p>
              <div className="flex flex-wrap gap-2">
                {(['blackjack', 'plinko', 'keno', 'lottery'] as const).map((game) => (
                  <span
                    key={game}
                    className={`px-2 py-0.5 rounded capitalize ${data.games[game]?.rpc === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                    title={data.games[game]?.error}
                  >
                    {game}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-1">MORBIUS in contract</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-300">
                {(['blackjack', 'plinko', 'keno', 'lottery'] as const).map((game) => (
                  <React.Fragment key={game}>
                    <span className="capitalize">{game}</span>
                    <span className="font-mono">{formatMorbius(data.morbius[game] ?? '0')} MORBIUS</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {data.contractAddresses && Object.keys(data.contractAddresses).length > 0 && (
              <div>
                <p className="text-slate-500 mb-1">Contract addresses (click to copy)</p>
                <div className="space-y-1.5">
                  {(['blackjack', 'plinko', 'keno', 'lottery'] as const).map((game) => {
                    const addr = data.contractAddresses?.[game];
                    if (!addr) return null;
                    return (
                      <div key={game} className="flex items-center gap-2 flex-wrap">
                        <span className="capitalize text-slate-400 w-20 shrink-0">{game}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(addr)}
                          className="font-mono text-[10px] text-cyan-300/90 hover:text-cyan-200 break-all text-left bg-slate-800/80 px-2 py-1 rounded border border-slate-600 hover:border-cyan-500/40 flex items-center gap-1.5 max-w-full"
                          title="Copy full address"
                        >
                          <Copy className="w-3 h-3 shrink-0" />
                          {addr}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="text-slate-500 mb-1">Blackjack: addresses with reserve &gt; 0 (sample)</p>
              <p className="text-slate-400 text-[10px] mb-1">
                Total MORBIUS in contract: {formatMorbius(data.blackjackReserves?.totalMorbiusInContract ?? '0')} MORBIUS
              </p>
              {data.blackjackReserves?.addressesWithReserve?.length === 0 ? (
                <p className="text-slate-500 text-[10px]">None in sample.</p>
              ) : (
                <ul className="max-h-32 overflow-y-auto space-y-0.5 text-[10px] font-mono text-slate-400">
                  {(data.blackjackReserves?.addressesWithReserve ?? []).map(({ address: addr, reserve }) => (
                    <li key={addr}>
                      {addr.slice(0, 10)}…{addr.slice(-8)} — {formatMorbius(reserve)} MORBIUS
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
