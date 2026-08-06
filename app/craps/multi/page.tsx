'use client';

/**
 * Multiplayer craps lobby.
 *
 * Browsable without a wallet — the table list is the one craps message the
 * server answers unauthenticated, so someone can see whether a game is running
 * before deciding to connect anything.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { Dices, RefreshCw, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listCrapsTables, type CrapsMultiTableSummary } from '@/lib/craps-multi-client';

import '../craps.css';

export default function CrapsMultiLobbyPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [tables, setTables] = useState<CrapsMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (client: BlackjackWebSocketClient) => {
    try {
      setTables(await listCrapsTables(client));
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
    <GlobalMainNav>
      {/* Centred in the viewport rather than stacked at the top: the house runs
          one table, so the page has exactly one thing to say and it should be
          the thing you land on. */}
      <main className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="arc-display flex items-center justify-center gap-3 text-4xl font-bold text-slate-100 sm:text-5xl">
              <Dices className="h-9 w-9 text-amber-300 sm:h-11 sm:w-11" />
              Craps tables
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-slate-400">
              One shooter, one throw, the whole rail riding on it. Take a seat and the dice come
              round to you.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-cyan-500/5" />
          ) : tables.length === 0 ? (
            <Card className="arc-panel border-0 p-10 text-center">
              <Dices className="mx-auto mb-4 h-12 w-12 text-slate-600" />
              <p className="arc-display text-lg text-slate-300">No craps table is open yet.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                Tables are opened by the house. In the meantime the solo game is always running.
              </p>
              <Button
                onClick={() => router.push('/craps')}
                className="mt-6 bg-cyan-500 px-6 py-5 text-base font-semibold text-[#04121b] hover:bg-cyan-400"
              >
                Play solo craps
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {tables.map((t) => {
                const full = t.emptySeats === 0;
                const seats = t.seatedCount + t.emptySeats;
                return (
                  <Card
                    key={t.id}
                    className={cn(
                      'arc-panel border-0 p-8 text-center transition-colors',
                      full ? 'opacity-70' : 'cursor-pointer hover:bg-cyan-500/5',
                    )}
                    onClick={() => { if (!full) router.push(`/craps/multi/${t.id}`); }}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <span className="arc-display text-2xl font-semibold text-slate-100">
                        {t.phase === 'POINT' ? 'Point on' : 'Come out'}
                      </span>
                      {t.point && (
                        <span className="arc-mono rounded bg-cyan-500 px-2 py-1 text-xs font-bold text-[#04121b]">
                          {t.point}
                        </span>
                      )}
                    </div>

                    <div className="arc-mono mt-4 flex items-center justify-center gap-6 text-base text-slate-400">
                      <span className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {t.seatedCount}/{seats} seated
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>{t.minBet.toLocaleString()} – {t.maxBet.toLocaleString()} per bet</span>
                    </div>

                    <Button
                      disabled={full}
                      onClick={(e) => { e.stopPropagation(); router.push(`/craps/multi/${t.id}`); }}
                      className="mt-7 w-full max-w-xs bg-cyan-500 py-6 text-lg font-bold text-[#04121b] hover:bg-cyan-400"
                    >
                      {full ? 'Table full' : 'Take a seat'}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => ws && refresh(ws)}
              disabled={!ws}
              className="flex items-center gap-2 rounded border border-cyan-500/25 bg-cyan-500/5 px-3 py-2 text-sm text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Button
              variant="outline"
              onClick={() => router.push('/craps')}
              className="border-cyan-500/25 text-sm text-slate-300"
            >
              Play solo
            </Button>
          </div>
        </div>
      </main>
    </GlobalMainNav>
  );
}
