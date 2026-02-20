'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEther } from 'viem';
import { Activity, RefreshCw, CheckCircle, XCircle, Copy } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  BLACKJACK_LEGACY_ADDRESS,
  BLACKJACK_LEGACY_ADDRESS_2,
  BLACKJACK_LEGACY_ADDRESS_3,
  BLACKJACK_LEGACY_ADDRESS_4,
} from '@/lib/contracts';

export interface BlackjackContractReserves {
  contractAddress: string;
  label: string;
  totalMorbiusInContract: string;
  addressesWithReserve: Array<{ address: string; reserve: string }>;
}

export interface AdminHealthData {
  api: string;
  ws: string;
  games: Record<string, { rpc: 'ok' | 'fail'; error?: string }>;
  morbius: Record<string, string>;
  /** Per-contract reserves: current + legacy 1–3 (when configured) */
  blackjackReservesByContract?: BlackjackContractReserves[];
  /** @deprecated Use blackjackReservesByContract */
  blackjackReserves?: {
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

// Colors for pie chart segments
const PIE_COLORS = [
  'rgba(34, 211, 238, 0.8)',   // cyan
  'rgba(139, 92, 246, 0.8)',   // violet
  'rgba(59, 130, 246, 0.8)',   // blue
  'rgba(16, 185, 129, 0.8)',   // emerald
  'rgba(251, 146, 60, 0.8)',   // orange
  'rgba(236, 72, 153, 0.8)',   // pink
  'rgba(168, 85, 247, 0.8)',   // purple
  'rgba(34, 197, 94, 0.8)',    // green
];

function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
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

  // All Blackjack contracts with reserves (current + legacy)
  const blackjackContracts = useMemo(() => {
    if (data?.blackjackReservesByContract && data.blackjackReservesByContract.length > 0) {
      return data.blackjackReservesByContract;
    }
    if (data?.blackjackReserves) {
      return [{
        contractAddress: data.contractAddresses?.blackjack ?? '',
        label: 'Current',
        totalMorbiusInContract: data.blackjackReserves.totalMorbiusInContract,
        addressesWithReserve: data.blackjackReserves.addressesWithReserve,
      }];
    }
    return [];
  }, [data?.blackjackReservesByContract, data?.blackjackReserves, data?.contractAddresses?.blackjack]);

  // Pie chart for first contract with reserves (or current)
  const pieChartData = useMemo(() => {
    const first = blackjackContracts[0]?.addressesWithReserve;
    if (!first?.length) return [];
    return first.map(({ address, reserve }) => ({
      name: truncateAddress(address),
      value: Number(formatEther(BigInt(reserve))),
      address,
      reserve: formatMorbius(reserve),
    }));
  }, [blackjackContracts]);

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
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 left-align">
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
                  {[
                    ...(['blackjack', 'plinko', 'keno', 'lottery'] as const).map((game) => ({
                      key: game,
                      label: game,
                      address: data.contractAddresses?.[game] ?? '',
                    })),
                    ...(BLACKJACK_LEGACY_ADDRESS
                      ? [{
                          key: 'blackjack-legacy-1',
                          label: 'blackjack legacy 1',
                          address: BLACKJACK_LEGACY_ADDRESS,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_2
                      ? [{
                          key: 'blackjack-legacy-2',
                          label: 'blackjack legacy 2',
                          address: BLACKJACK_LEGACY_ADDRESS_2,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_3
                      ? [{
                          key: 'blackjack-legacy-3',
                          label: 'blackjack legacy 3',
                          address: BLACKJACK_LEGACY_ADDRESS_3,
                        }]
                      : []),
                    ...(BLACKJACK_LEGACY_ADDRESS_4
                      ? [{
                          key: 'blackjack-legacy-4',
                          label: 'blackjack legacy 4',
                          address: BLACKJACK_LEGACY_ADDRESS_4,
                        }]
                      : []),
                  ].map((entry) => {
                    if (!entry.address) return null;
                    return (
                      <div key={entry.key} className="flex items-center gap-2 flex-wrap">
                        <span className="capitalize text-slate-400 w-32 shrink-0">{entry.label}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(entry.address)}
                          className="font-mono text-[10px] text-cyan-300/90 hover:text-cyan-200 break-all text-left bg-slate-800/80 px-2 py-1 rounded border border-slate-600 hover:border-cyan-500/40 flex items-center gap-1.5 max-w-full"
                          title="Copy full address"
                        >
                          <Copy className="w-3 h-3 shrink-0" />
                          {entry.address}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="text-slate-500 mb-1">Blackjack: all contracts — addresses with reserve &gt; 0</p>
              {blackjackContracts.length === 0 ? (
                <p className="text-slate-500 text-[10px]">No contract data.</p>
              ) : (
                <div className="space-y-4">
                  {blackjackContracts.map((contract) => (
                    <div key={contract.contractAddress} className="rounded border border-slate-700/50 p-3 bg-slate-800/30 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-cyan-400 text-[11px]">{contract.label}</span>
                        <span className="text-slate-400 text-[10px]">
                          Total: {formatMorbius(contract.totalMorbiusInContract)} MORBIUS
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(contract.contractAddress)}
                          className="font-mono text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1"
                          title="Copy contract address"
                        >
                          <Copy className="w-3 h-3" />
                          {truncateAddress(contract.contractAddress, 8, 6)}
                        </button>
                      </div>
                      {contract.addressesWithReserve.length === 0 ? (
                        <p className="text-slate-500 text-[10px]">No addresses with reserve in sample.</p>
                      ) : (
                        <>
                          {contract.label === 'Current' && pieChartData.length > 0 && (
                            <div className="mb-2">
                              <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                  <Pie
                                    data={pieChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                                    outerRadius={70}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {pieChartData.map((_, index) => (
                                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    formatter={(value: number, name: string, props: any) => [
                                      `${props.payload.reserve} MORBIUS`,
                                      props.payload.name,
                                    ]}
                                    contentStyle={{
                                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                      border: '1px solid rgba(100, 116, 139, 0.5)',
                                      borderRadius: '6px',
                                      color: '#e2e8f0',
                                      fontSize: '11px',
                                    }}
                                  />
                                  <Legend
                                    formatter={(value, entry: any) => {
                                      const p = entry.payload;
                                      return `${p.name}: ${p.reserve}`;
                                    }}
                                    wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          <ul className="max-h-28 overflow-y-auto space-y-0.5 text-[10px] font-mono text-slate-400">
                            {contract.addressesWithReserve.map(({ address: addr, reserve }) => (
                              <li key={`${contract.contractAddress}-${addr}`}>
                                {addr.slice(0, 10)}…{addr.slice(-8)} — {formatMorbius(reserve)} MORBIUS
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
