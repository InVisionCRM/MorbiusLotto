'use client';

/**
 * Multiplayer roulette — the shared wheel.
 *
 * The felt, the board and the wheel are the solo game's, unchanged: the same
 * RouletteBoard2 with its true inner bets, the same RouletteWheel2 animation.
 * What a shared table adds is the rail, a clock, and the thing that makes the
 * game worth playing together — seeing what everyone else is behind before the
 * ball drops.
 *
 * The client derives nothing. Every pocket, payout and phase arrives in a
 * `roulette_multi_table_state` broadcast. If you find yourself computing a
 * payout here, it belongs on the server.
 *
 * REVEAL DISCIPLINE
 *
 * The wheel must show the number before anything else does. A spin's state
 * update carries the pocket, the swept felt and every seat's win — painting it
 * on arrival would put the answer on screen while the ball was still rolling.
 * So a new spin starts the wheel and freezes the board; `handleWheelLanded`
 * applies the update as one piece. Same rule the craps dice earned.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { ArrowLeft, CircleDot, Coins, ShieldCheck, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import RouletteBoard2 from '@/components/StakeRoulette/RouletteBoard2';
import RouletteWheel2 from '@/components/StakeRoulette/RouletteWheel2';
import { CrapsChipRail } from '@/components/craps/CrapsChipRail';
import { CrapsMultiRail } from '@/components/craps/multi/CrapsMultiRail';
import { pocketColor, type Roulette2Bet } from '@/lib/roulette2-client';
import { tableAudio } from '@/lib/table-audio';
import {
  ROULETTE_MULTI_EVENTS,
  amountsKeyToBet,
  betsToAmounts,
  clearAllRouletteMultiBets,
  clearRouletteMultiBet,
  getRouletteTableState,
  joinRouletteTable,
  leaveRouletteTable,
  placeRouletteMultiBet,
  railAmountsExcluding,
  rouletteClockRemaining,
  rouletteSeatLabel,
  rouletteSeatOf,
  spinRouletteMulti,
  type RouletteMultiTableState,
} from '@/lib/roulette-multi-client';

export default function RouletteMultiTablePage() {
  const params = useParams();
  const router = useRouter();
  const tableId = String(params?.tableId ?? '');
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RouletteMultiTableState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeChip, setActiveChip] = useState(25);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The spin currently in the air: which one the wheel is animating, and the
  // state held back until it lands.
  const [spinSeq, setSpinSeq] = useState(0);
  const [spinResult, setSpinResult] = useState<number | null>(null);
  const spunRef = useRef<string | null>(null);
  const liveRef = useRef<RouletteMultiTableState | null>(null);
  const spinInFlight = useRef(false);

  /**
   * The board must not know the number before the wheel does.
   *
   * A new spin starts the wheel and otherwise holds the whole table where it
   * was; the landing applies the update in one piece.
   */
  const applyState = useCallback((s: RouletteMultiTableState) => {
    liveRef.current = s;

    const spin = s.lastSpin;
    if (spin && spunRef.current !== spin.spinId) {
      const first = spunRef.current === null;
      spunRef.current = spin.spinId;
      // A spin we arrived after is already over — animating it would be a lie
      // about when it happened, so the first state we ever see just paints.
      if (!first) {
        tableAudio.init();
        spinInFlight.current = true;
        setSpinResult(spin.result);
        setSpinSeq((n) => n + 1);
        return;
      }
    }

    if (spinInFlight.current) return;
    setState(s);
  }, []);

  /** The ball has settled: the felt may now catch up. */
  const handleWheelLanded = useCallback(() => {
    spinInFlight.current = false;
    const live = liveRef.current;
    if (live) setState(live);
    tableAudio.playDiceSettle();
    // What the spin meant to THIS player, once the number is readable.
    const seat = rouletteSeatOf(live, address);
    if (seat && seat.lastWin > 0) tableAudio.playWin();
    else if (seat && seat.lastLoss > 0) tableAudio.playLose();
  }, [address]);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !tableId) return;

    const client = address
      ? new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync as any)
      : new BlackjackWebSocketClient(wsUrl);

    client.on('disconnected', () => setConnected(false));
    client.on('reconnected', async () => {
      setConnected(true);
      setError(null);
      try { applyState(await getRouletteTableState(client, tableId)); } catch { /* broadcast catches us up */ }
    });
    client.on(ROULETTE_MULTI_EVENTS.tableState, (payload: RouletteMultiTableState) => {
      applyState(payload);
    });
    client.on('error', (err: any) => setError(err?.message ?? 'Connection error'));

    let cancelled = false;
    client.connect()
      .then(async () => {
        if (cancelled) return;
        setConnected(true);
        setWs(client);
        try {
          applyState(await getRouletteTableState(client, tableId));
        } catch (err) {
          setError((err as Error)?.message ?? 'Could not load the table.');
        }
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Could not connect.'); });

    return () => {
      cancelled = true;
      try { (client as any).disconnect?.(); } catch { /* nothing to unwind */ }
    };
  }, [tableId, address, signTypedDataAsync, applyState]);

  // Local ticker purely for the countdown — the server owns the deadline.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const mySeat = useMemo(() => rouletteSeatOf(state, address), [state, address]);
  const bettingOpen = state?.status === 'betting' && !spinInFlight.current;
  const secondsLeft = rouletteClockRemaining(state, nowMs);

  /** My own chips, keyed the way the board wants them. */
  const myAmounts = useMemo(() => betsToAmounts(mySeat?.bets), [mySeat]);

  /** Everyone else's, so the felt shows the whole rail's action. */
  const railAmounts = useMemo(
    () => railAmountsExcluding(state?.seats, mySeat?.position ?? null),
    [state?.seats, mySeat?.position],
  );

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (err) { setError((err as Error)?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  }, []);

  const placeBet = useCallback((bet: Roulette2Bet) => {
    if (!ws || !bettingOpen || busy) return;
    void run(() => placeRouletteMultiBet(ws, tableId, { ...bet, amount: activeChip }));
  }, [ws, tableId, activeChip, bettingOpen, busy, run]);

  const removeBet = useCallback((key: string) => {
    if (!ws || !bettingOpen || busy) return;
    const bet = amountsKeyToBet(key);
    if (!bet) return;
    void run(() => clearRouletteMultiBet(ws, tableId, bet));
  }, [ws, tableId, bettingOpen, busy, run]);

  const seatedCount = state?.seats.filter((s) => s.playerAddress).length ?? 0;

  return (
    <GlobalMainNav>
      <main className="mx-auto w-full max-w-6xl px-2 py-3 sm:px-4 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
          <button
            type="button"
            onClick={() => router.push('/roulette/multi')}
            className="arc-display flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tables
          </button>
          <div className="flex items-center gap-2">
            {typeof state?.viewerCount === 'number' && state.viewerCount > 0 && (
              <span className="arc-mono flex items-center gap-1 text-[11px] text-slate-500">
                <Users className="h-3 w-3" />
                {state.viewerCount} watching
              </span>
            )}
            <span
              className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-500')}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* ───────── The rail ───────── */}
        <Card className="arc-panel mb-3 border-0 p-2 sm:mb-4 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="arc-display text-[10px] uppercase tracking-[0.25em] text-slate-500">
              The rail
            </span>
            {mySeat && (
              <button
                type="button"
                disabled={busy || !ws}
                onClick={() => ws && run(() => leaveRouletteTable(ws, tableId))}
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
              >
                Stand up
              </button>
            )}
          </div>
          {/* The craps rail, unchanged — a seat is a seat, and the shared
              component already knows how to draw one. `isShooter` reads as the
              seed seat here, which is the same idea wearing a different name:
              the player whose seed feeds the next spin. */}
          <CrapsMultiRail
            seats={(state?.seats ?? []).map((s) => ({
              position: s.position,
              playerAddress: s.playerAddress,
              status: s.status,
              bets: {},
              atRisk: s.atRisk,
              isShooter: s.isSeedSeat,
              consecutiveTimeouts: s.consecutiveTimeouts,
              displayName: s.displayName,
              profileImageUrl: s.profileImageUrl,
              avatarConfig: s.avatarConfig,
              profileDisplayMode: s.profileDisplayMode,
              lastWin: s.lastWin,
              lastLoss: s.lastLoss,
            })) as never}
            myAddress={address ?? null}
            busy={busy}
            onTakeSeat={(position: number) => {
              if (!ws) return;
              void run(() => joinRouletteTable(ws, tableId, position));
            }}
          />
        </Card>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_320px]">
          {/* ───────── Wheel + board ───────── */}
          <div className="min-w-0 space-y-4">
            <Card className="arc-panel border-0 p-2 sm:p-4">
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <span className="arc-display flex min-w-0 shrink items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                  <CircleDot className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {state?.status === 'spinning' ? 'Wheel turning' : 'Place your bets'}
                  </span>
                </span>
                {/* Newest pocket first, so the one that just landed is never the
                    one that scrolls out of sight. */}
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(state?.spinHistory ?? []).map((n, i) => {
                    const colour = pocketColor(n);
                    return (
                      <span
                        key={i}
                        className={cn(
                          'arc-mono flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold sm:h-6 sm:w-6 sm:text-xs',
                          colour === 'green' && 'bg-emerald-600 text-white',
                          colour === 'red' && 'bg-rose-600 text-white',
                          colour === 'black' && 'bg-slate-900 text-slate-200 ring-1 ring-white/15',
                          i === 0 ? 'ring-1 ring-white/60' : 'opacity-80',
                        )}
                      >
                        {n}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center py-2">
                <RouletteWheel2
                  result={spinResult}
                  spinSeq={spinSeq}
                  lastResult={state?.lastSpin?.result ?? null}
                  onLanded={handleWheelLanded}
                />
              </div>

              <div className="mt-2 flex min-w-0 items-center justify-between gap-2 sm:gap-3">
                <span className="arc-display min-w-0 shrink truncate text-[11px] uppercase tracking-[0.15em] text-slate-500 sm:text-xs">
                  {state?.status === 'spinning'
                    ? 'No more bets'
                    : seatedCount === 0
                      ? 'Waiting for players'
                      : 'Bets open'}
                  {secondsLeft !== null && (
                    <span className="arc-mono ml-2 text-emerald-300">{secondsLeft}s</span>
                  )}
                </span>

                {mySeat ? (
                  <Button
                    onClick={() => ws && run(() => spinRouletteMulti(ws, tableId))}
                    disabled={busy || !connected || !bettingOpen}
                    className="shrink-0 whitespace-nowrap bg-emerald-500 px-3 text-sm font-semibold text-[#04121b] hover:bg-emerald-400 sm:px-4 sm:text-base"
                  >
                    Spin
                  </Button>
                ) : (
                  <span className="arc-display min-w-0 shrink truncate text-[11px] text-slate-500">
                    Sit down to play
                  </span>
                )}
              </div>
            </Card>

            <Card className="arc-panel relative border-0 p-2 sm:p-4">
              <RouletteBoard2
                amounts={myAmounts}
                railAmounts={railAmounts}
                disabled={!bettingOpen || busy || !mySeat}
                winningNumber={state?.status === 'spinning' ? null : state?.lastSpin?.result ?? null}
                onPlace={placeBet}
                onRemove={removeBet}
              />
            </Card>
          </div>

          {/* ───────── Side panel ───────── */}
          <div className="min-w-0 space-y-4">
            <Card className="arc-panel space-y-2.5 border-0 p-2 sm:space-y-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">On the felt</span>
                <span className="arc-mono flex items-center gap-1 text-sm text-amber-300">
                  <Coins className="h-3.5 w-3.5" />
                  {(mySeat?.atRisk ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="text-xs uppercase tracking-wide text-slate-500">Chip</div>
              <CrapsChipRail activeChip={activeChip} onSelect={setActiveChip} />

              {mySeat && (mySeat.atRisk ?? 0) > 0 && (
                <button
                  type="button"
                  disabled={!bettingOpen || busy}
                  onClick={() => ws && run(() => clearAllRouletteMultiBets(ws, tableId))}
                  className="w-full rounded border border-white/10 px-2 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
                >
                  Take everything back
                </button>
              )}

              <div className="h-px bg-emerald-950/70" />

              <div className="space-y-1 text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Table min</span>
                  <span className="arc-mono text-slate-400">
                    {(state?.minBet ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Max per zone</span>
                  <span className="arc-mono text-slate-400">
                    {(state?.maxBet ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Max on the felt</span>
                  <span className="arc-mono text-slate-400">
                    {(state?.maxTotalBet ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="arc-panel space-y-2 border-0 p-2 sm:p-4">
              <span className="arc-display flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                Provably fair
              </span>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Every spin comes from this table&apos;s server seed mixed with{' '}
                <span className="text-slate-300">one seat&apos;s own client seed</span>, and which
                seat feeds it rotates each spin — so the randomness is not the house&apos;s alone.
              </p>
              {state?.serverSeedHash && (
                <p className="arc-mono break-all text-[10px] text-slate-600">
                  {state.serverSeedHash.slice(0, 22)}… · epoch {state.seedEpoch} · spin {state.nonce}
                </p>
              )}
            </Card>
          </div>
        </div>
      </main>
    </GlobalMainNav>
  );
}
