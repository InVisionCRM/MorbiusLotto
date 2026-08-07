'use client';

/**
 * Multiplayer roulette lobby.
 *
 * Browsable without a wallet, like the other shared lobbies: someone can see
 * whether a wheel is running before deciding to connect anything.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { CircleDot, RefreshCw, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pocketColor } from '@/lib/roulette2-client';
import { listRouletteTables, type RouletteMultiTableSummary } from '@/lib/roulette-multi-client';

/** The last few pockets, coloured the way the board colours them. */
function RecentStrip({ recent }: { recent: number[] }) {
  if (recent.length === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-1">
      {recent.map((n, i) => {
        const colour = pocketColor(n);
        return (
          <span
            key={i}
            className={cn(
              'arc-mono flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold',
              colour === 'green' && 'bg-emerald-600 text-white',
              colour === 'red' && 'bg-rose-600 text-white',
              colour === 'black' && 'bg-slate-900 text-slate-200 ring-1 ring-white/20',
            )}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

export default function RouletteMultiLobbyPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [tables, setTables] = useState<RouletteMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (client: BlackjackWebSocketClient) => {
    try {
      setTables(await listRouletteTables(client));
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
      {/* Centred rather than stacked at the top: the house runs one wheel, so
          the page has exactly one thing to say. */}
      <main className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="w-full min-w-0 max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="arc-display flex items-center justify-center gap-3 text-4xl font-bold text-slate-100 sm:text-5xl">
              <CircleDot className="h-9 w-9 text-emerald-300 sm:h-11 sm:w-11" />
              Roulette tables
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-slate-400">
              One wheel, one pocket, every seat settled at once. Watch what the rest of the rail is
              behind before you put a chip down.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-emerald-500/5" />
          ) : tables.length === 0 ? (
            <Card className="arc-panel border-0 p-10 text-center">
              <CircleDot className="mx-auto mb-4 h-12 w-12 text-slate-600" />
              <p className="arc-display text-lg text-slate-300">No wheel is turning yet.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                Tables are opened by the house. The solo game is always running in the meantime.
              </p>
              <Button
                onClick={() => router.push('/roulette2')}
                className="mt-6 bg-emerald-500 px-6 py-5 text-base font-semibold text-[#04121b] hover:bg-emerald-400"
              >
                Play solo roulette
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
                      full ? 'opacity-70' : 'cursor-pointer hover:bg-emerald-500/5',
                    )}
                    onClick={() => { if (!full) router.push(`/roulette/multi/${t.id}`); }}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <span className="arc-display text-2xl font-semibold text-slate-100">
                        {t.status === 'spinning' ? 'Wheel turning' : 'Place your bets'}
                      </span>
                    </div>

                    <div className="arc-mono mt-4 flex items-center justify-center gap-6 text-base text-slate-400">
                      <span className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {t.seatedCount}/{seats} seated
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>{t.minBet.toLocaleString()} – {t.maxBet.toLocaleString()} per zone</span>
                    </div>

                    <RecentStrip recent={t.recent} />

                    <Button
                      disabled={full}
                      onClick={(e) => { e.stopPropagation(); router.push(`/roulette/multi/${t.id}`); }}
                      className="mt-7 w-full max-w-xs bg-emerald-500 py-6 text-lg font-bold text-[#04121b] hover:bg-emerald-400"
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
              className="flex items-center gap-2 rounded border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Button
              variant="outline"
              onClick={() => router.push('/roulette2')}
              className="border-emerald-500/25 text-sm text-slate-300"
            >
              Play solo
            </Button>
          </div>
        </div>
      </main>
    </GlobalMainNav>
  );
}
