'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther } from 'viem';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableSummary } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Button } from '@/components/ui/button';
import { Users, ArrowRight } from 'lucide-react';

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return wei; }
}

export default function BlackjackMultiLobbyPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [tables, setTables] = useState<BJMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl) { setLoading(false); return; }
    try {
      const res = await fetch(`${apiUrl}/api/admin/bj-multi/tables`);
      const data = await res.json();
      setTables(data.tables ?? []);
    } catch (err) {
      setError('Failed to load tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  return (
    <GlobalMainNav page="home" showBackArrow backArrowHref="/" backArrowLabel="Back">
      <div className="min-h-screen bg-slate-950 text-white">
        <main className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-1">Multiplayer Blackjack</h1>
            <p className="text-slate-400 text-sm">Up to 3 players per table. MORBIUS bets.</p>
          </div>

          {loading && (
            <div className="text-center text-slate-500 text-sm py-12">Loading tables…</div>
          )}
          {error && (
            <div className="text-center text-red-400 text-sm py-12">{error}</div>
          )}

          {!loading && tables.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-12">
              No tables available. Ask an admin to create one.
            </div>
          )}

          <div className="space-y-3">
            {tables.map(table => (
              <div
                key={table.id}
                className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      table.status === 'waiting' ? 'bg-slate-700 text-slate-300' :
                      table.status === 'betting' ? 'bg-yellow-800/60 text-yellow-300' :
                      'bg-green-800/60 text-green-300'
                    }`}>
                      {table.status === 'waiting' ? 'Open' : table.status === 'betting' ? 'Betting' : 'In Progress'}
                    </span>
                    <span className="text-slate-400 text-xs flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {table.seatedCount}/3
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs">
                    {formatMorbius(table.minBet)} – {formatMorbius(table.maxBet)} MORBIUS
                  </p>
                </div>
                <Link href={`/blackjack-multi/${table.id}`}>
                  <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs gap-1">
                    Join <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </main>
      </div>
    </GlobalMainNav>
  );
}
