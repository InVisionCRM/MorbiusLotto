'use client';

/**
 * Multiplayer Ultimate Hold'em lobby.
 *
 * Browsable without a wallet, like the craps lobby: someone can see whether a
 * game is running before deciding to connect anything.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { Spade, RefreshCw, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listUthTables, type UthMultiTableSummary } from '@/lib/uth-multi-client';


export default function UthMultiLobbyPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [tables, setTables] = useState<UthMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (client: BlackjackWebSocketClient) => {
    try {
      setTables(await listUthTables(client));
      setError(null);
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not load the tables.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) { setLoading(false); return; }

    const client = address
      ? new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync as any)
      : new BlackjackWebSocketClient(wsUrl);

    let cancelled = false;
    client.connect()
      .then(async () => {
        if (cancelled) return;
        setWs(client);
        await refresh(client);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Could not connect.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      try { (client as any).disconnect?.(); } catch { /* nothing to unwind */ }
    };
  }, [address, signTypedDataAsync, refresh]);

  return (
    <div className="min-h-screen bg-[#04121b] text-slate-200">
      <GlobalMainNav />

      <main className="mx-auto max-w-4xl px-3 py-6 sm:px-4">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="arc-display flex items-center gap-2 text-2xl font-bold text-slate-100">
              <Spade className="h-6 w-6 text-violet-300" />
              Hold'em tables
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              One board, one dealer, every seat playing its own hand. Nobody waits for a turn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => ws && refresh(ws)}
              disabled={!ws}
              className="rounded border border-cyan-500/25 bg-cyan-500/5 p-2 text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:opacity-40"
              aria-label="Refresh tables"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Button
              variant="outline"
              onClick={() => router.push('/ultimate-holdem')}
              className="border-cyan-500/25 text-xs text-slate-300"
            >
              Play solo
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl bg-cyan-500/5" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <Card className="arc-panel border-0 p-8 text-center">
            <Spade className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <p className="arc-display text-sm text-slate-400">No Hold'em tables are open yet.</p>
            <p className="mt-1 text-xs text-slate-600">
              Tables are opened by the house. The solo game is always running in the meantime.
            </p>
            <Button
              onClick={() => router.push('/ultimate-holdem')}
              className="mt-4 bg-cyan-500 font-semibold text-[#04121b] hover:bg-cyan-400"
            >
              Play solo Hold'em
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {tables.map((t) => {
              const full = t.emptySeats === 0;
              return (
                <Card
                  key={t.id}
                  className={cn(
                    'arc-panel flex items-center justify-between gap-3 border-0 p-3 transition-colors sm:p-4',
                    full ? 'opacity-70' : 'cursor-pointer hover:bg-cyan-500/5',
                  )}
                  onClick={() => { if (!full) router.push(`/ultimate-holdem/multi/${t.id}`); }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="arc-display text-sm font-semibold text-slate-200">
                        {t.stage ? 'Hand in play' : 'Between hands'}
                      </span>
                      {t.stage && (
                        <span className="arc-mono rounded bg-violet-500 px-1.5 py-0.5 text-[11px] font-bold text-[#04121b]">
                          {t.stage}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {t.minBet.toLocaleString()} – {t.maxBet.toLocaleString()} ante
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="arc-mono flex items-center gap-1 text-xs text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      {t.seatedCount}/{t.seatedCount + t.emptySeats}
                    </span>
                    <Button
                      size="sm"
                      disabled={full}
                      onClick={(e) => { e.stopPropagation(); router.push(`/ultimate-holdem/multi/${t.id}`); }}
                      className="bg-cyan-500 text-xs font-semibold text-[#04121b] hover:bg-cyan-400"
                    >
                      {full ? 'Full' : 'Join'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
