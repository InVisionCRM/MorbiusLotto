'use client';

/**
 * Multiplayer craps — the shared felt.
 *
 * Craps is the one casino game that is genuinely worse alone: one shooter, one
 * throw, and the whole rail living or dying on it together. This page is the
 * solo game's felt (same CrapsTable, same chips, same Deep-Sea Neon) with the
 * three things a shared table adds — the rail, the dice, and a clock.
 *
 * The client derives nothing. Every phase, point and payout arrives in a
 * `craps_multi_table_state` broadcast; the only local state is which chip is
 * selected and what the countdown reads. If you find yourself computing a
 * payout here, it belongs on the server.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { ArrowLeft, Coins, Dices, ShieldCheck, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BetType } from '@/lib/craps-types';
import { CrapsTable } from '@/components/craps/CrapsTable';
import { CrapsDiceThrow } from '@/components/craps/CrapsDiceThrow';
import { CrapsChipRail } from '@/components/craps/CrapsChipRail';
import { CrapsMultiRail } from '@/components/craps/multi/CrapsMultiRail';
import { crapsMultiFaqs } from '@/components/craps/multi/crapsMultiFaqs';
import { CrapsMultiRollHistory } from '@/components/craps/multi/CrapsMultiRollHistory';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { TableFeltControls, useTableFelt } from '@/components/shared/TableFeltControls';
import { tableAudio } from '@/lib/table-audio';
import {
  CRAPS_MULTI_EVENTS,
  clearCrapsMultiBet,
  crapsClockRemaining,
  crapsSeatOf,
  crapsSeatLabel,
  getCrapsTableState,
  joinCrapsTable,
  leaveCrapsTable,
  placeCrapsMultiBet,
  rollCrapsMulti,
  rotateCrapsMultiSeed,
  fetchCrapsRollHistory,
  type CrapsMultiRollHistoryRow,
  type CrapsMultiTableState,
} from '@/lib/craps-multi-client';

import '../../craps.css';

export default function CrapsMultiTablePage() {
  const params = useParams();
  const router = useRouter();
  const tableId = String(params?.tableId ?? '');
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<CrapsMultiTableState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeChip, setActiveChip] = useState(25);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const felt = useTableFelt();
  // The last throw we have already sounded, so a re-render never replays it.
  const soundedRollRef = useRef<string | null>(null);
  // This viewer's own winnings from the latest throw, mirrored into a ref so
  // the roll-sound effect can read it without taking the seat as a dependency
  // (which would re-fire the sound whenever anything else about the seat moved).
  const mySeatWinRef = useRef<number>(0);
  // The throw currently in the air. Which roll id the dice are animating, and
  // the outcome held back until they land.
  const [throwKey, setThrowKey] = useState<string | null>(null);
  const pendingOutcomeRef = useRef<CrapsMultiTableState['lastRoll']>(null);
  const [rolls, setRolls] = useState<CrapsMultiRollHistoryRow[]>([]);
  const [rollsLoading, setRollsLoading] = useState(true);

  const stateRef = useRef<CrapsMultiTableState | null>(null);
  stateRef.current = state;

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
      // The room membership died with the socket; re-ask for state, which
      // re-joins the room server-side.
      try { setState(await getCrapsTableState(client, tableId)); } catch { /* broadcast will catch us up */ }
    });
    client.on(CRAPS_MULTI_EVENTS.tableState, (payload: CrapsMultiTableState) => {
      setState(payload);
    });
    client.on('error', (err: any) => setError(err?.message ?? 'Connection error'));

    let cancelled = false;
    client.connect()
      .then(async () => {
        if (cancelled) return;
        setConnected(true);
        setWs(client);
        try {
          setState(await getCrapsTableState(client, tableId));
        } catch (err) {
          setError((err as Error)?.message ?? 'Could not load the table.');
        }
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Could not connect.'); });

    return () => {
      cancelled = true;
      try { (client as any).disconnect?.(); } catch { /* nothing to unwind */ }
    };
  }, [tableId, address, signTypedDataAsync]);

  // Local ticker purely for the countdown ring — the server owns the deadline.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Sound the throw the TABLE last made, not the one this client asked for:
  // every seat should hear the dice, including the seven that just emptied the
  // felt, and only the shooter sends a roll request.
  useEffect(() => {
    const roll = state?.lastRoll;
    if (!roll || soundedRollRef.current === roll.rollId) return;
    const first = soundedRollRef.current === null;
    soundedRollRef.current = roll.rollId;
    // Don't replay the table's history on arrival — only throws made while
    // we're watching. A throw we joined after is already over; showing the
    // dice mid-flight for it would be a lie about when it happened.
    if (first) return;

    tableAudio.init();
    // The knocks now come from the dice hitting things, so there is nothing to
    // play here. What the throw *meant* waits for the dice to stop, below.
    pendingOutcomeRef.current = roll;
    setThrowKey(roll.rollId);
  }, [state?.lastRoll]);

  // The rail reacts when the dice do, not on a timer that guesses at it.
  const handleDiceSettled = useCallback(() => {
    const roll = pendingOutcomeRef.current;
    if (!roll) return;
    pendingOutcomeRef.current = null;
    if (roll.isSevenOut) tableAudio.playSevenOut();
    else if (roll.isPoint) tableAudio.playPointMade();
    else if ((mySeatWinRef.current ?? 0) > 0) tableAudio.playWin();
    if (roll.dicePassed) setTimeout(() => tableAudio.playDicePass(), 420);
  }, []);

  const lastRollId = state?.lastRoll?.rollId ?? null;
  useEffect(() => {
    if (!tableId) return;
    // No socket means there is nothing to fetch from — stop claiming to load,
    // or the skeleton spins forever whenever the backend is unreachable. The
    // connection dot and error banner already say what actually went wrong.
    if (!ws) {
      setRollsLoading(false);
      return;
    }
    let cancelled = false;
    fetchCrapsRollHistory(ws, tableId, 25)
      .then((rows) => { if (!cancelled) setRolls(rows); })
      .catch(() => { /* the felt still works without the list */ })
      .finally(() => { if (!cancelled) setRollsLoading(false); });
    return () => { cancelled = true; };
    // Re-fetch on each new throw, and once the socket is up.
  }, [ws, tableId, lastRollId]);

  const mySeat = useMemo(() => crapsSeatOf(state, address), [state, address]);
  useEffect(() => {
    mySeatWinRef.current = mySeat?.lastWin ?? 0;
  }, [mySeat?.lastWin]);

  const iAmShooter = !!mySeat?.isShooter;
  const secondsLeft = crapsClockRemaining(state, nowMs);
  const bettingOpen = state?.status === 'betting';

  const shooterSeat = useMemo(() => {
    if (!state || state.shooterPosition === null) return null;
    return state.seats.find((s) => s.position === state.shooterPosition) ?? null;
  }, [state]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const guard = useCallback(async (fn: () => Promise<unknown>) => {
    if (!ws || busy) return;
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (err) { setError((err as Error)?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  }, [ws, busy]);

  const takeSeat = useCallback((position: number) => {
    if (!address) { setError('Connect a wallet to sit down.'); return; }
    void guard(() => joinCrapsTable(ws!, tableId, position));
  }, [guard, ws, tableId, address]);

  const standUp = useCallback(() => {
    void guard(async () => {
      await leaveCrapsTable(ws!, tableId);
      router.push('/craps/multi');
    });
  }, [guard, ws, tableId, router]);

  const placeBet = useCallback((type: BetType, amount: number) => {
    if (!mySeat) { setError('Take a seat before betting.'); return; }
    tableAudio.init();
    tableAudio.playChip();
    void guard(() => placeCrapsMultiBet(ws!, tableId, type, amount));
  }, [guard, ws, tableId, mySeat]);

  const pickUp = useCallback((type: BetType) => {
    void guard(() => clearCrapsMultiBet(ws!, tableId, type));
  }, [guard, ws, tableId]);

  const throwDice = useCallback(() => {
    tableAudio.init();
    void guard(() => rollCrapsMulti(ws!, tableId));
  }, [guard, ws, tableId]);

  const rotateSeed = useCallback(() => {
    void guard(async () => {
      const res = await rotateCrapsMultiSeed(ws!, tableId);
      if (!res.ok && res.error) setError(res.error);
    });
  }, [guard, ws, tableId]);

  const lastRoll = state?.lastRoll ?? null;
  const dice: [number, number] = lastRoll ? [lastRoll.die1, lastRoll.die2] : [1, 1];

  return (
    <GlobalMainNav>
      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push('/craps/multi')}
            className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-cyan-300 arc-display"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tables
          </button>

          <div className="flex items-center gap-3">
            {typeof state?.viewerCount === 'number' && state.viewerCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500 arc-mono">
                <Users className="h-3.5 w-3.5" />
                {state.viewerCount} watching
              </span>
            )}
            <TableFeltControls felt={felt} />
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse',
              )}
              aria-label={connected ? 'Connected' : 'Reconnecting'}
            />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* ───────── The rail ───────── */}
        <Card className="arc-panel mb-4 border-0 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="arc-display text-[10px] uppercase tracking-[0.25em] text-slate-500">
              The rail
            </span>
            {mySeat && (
              <button
                type="button"
                onClick={standUp}
                disabled={busy}
                className="arc-display text-[10px] uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-rose-300 disabled:opacity-50"
              >
                Stand up
              </button>
            )}
          </div>
          {state ? (
            <CrapsMultiRail
              seats={state.seats}
              myAddress={address ?? null}
              onTakeSeat={takeSeat}
              busy={busy}
            />
          ) : (
            <div className="h-[86px] animate-pulse rounded-xl bg-cyan-500/5" />
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* ───────── Game area ───────── */}
          <div className="space-y-4">
            {/* Shooter — dice, the clock, and the throw */}
            <Card className="arc-panel border-0 p-3 sm:p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="arc-display flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                  <Dices className="h-3.5 w-3.5" />
                  {shooterSeat ? `${crapsSeatLabel(shooterSeat)} shooting` : 'Nobody has the dice'}
                </span>
                <div className="flex gap-1">
                  {(state?.rollHistory ?? []).map((r, i) => (
                    <span
                      key={i}
                      className={cn(
                        'arc-mono flex h-6 w-6 items-center justify-center rounded text-xs font-bold',
                        r === 7
                          ? 'bg-rose-600/80 text-white'
                          : [4, 5, 6, 8, 9, 10].includes(r)
                            ? 'bg-cyan-500 text-[#04121b]'
                            : 'bg-cyan-500/10 text-slate-400',
                        i === 0 ? 'scale-105 ring-1 ring-cyan-300/60' : 'opacity-80',
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="relative flex min-h-[120px] items-center justify-center">
                <div className="w-full">
                  <CrapsDiceThrow
                    val1={dice[0]}
                    val2={dice[1]}
                    rollKey={throwKey}
                    onSettle={handleDiceSettled}
                  />
                </div>
                {lastRoll && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-right">
                    <span className="arc-mono block text-3xl font-bold leading-none text-cyan-300">
                      {lastRoll.sum}
                    </span>
                    {lastRoll.isSevenOut ? (
                      <span className="arc-display text-xs tracking-widest text-rose-400">7 OUT</span>
                    ) : lastRoll.isPoint ? (
                      <span className="arc-display text-xs tracking-widest text-amber-300">POINT</span>
                    ) : null}
                    {/* Your own slice of the throw, not the table's. */}
                    {mySeat && mySeat.lastWin > 0 && (
                      <span className="arc-mono block text-xs text-amber-300">
                        +{mySeat.lastWin.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="arc-display text-xs uppercase tracking-[0.15em] text-slate-500">
                  {state?.status === 'rolling'
                    ? 'Dice are out'
                    : state?.status === 'betting'
                      ? 'Place your bets'
                      : 'Waiting for players'}
                  {secondsLeft !== null && (
                    <span className="arc-mono ml-2 text-cyan-300">{secondsLeft}s</span>
                  )}
                </span>

                {iAmShooter ? (
                  <Button
                    onClick={throwDice}
                    disabled={busy || !connected}
                    className="bg-amber-500 font-semibold text-[#04121b] hover:bg-amber-400"
                  >
                    Throw the dice
                  </Button>
                ) : (
                  <span className="arc-display text-[11px] text-slate-500">
                    {shooterSeat ? `Waiting on ${crapsSeatLabel(shooterSeat)}` : 'Sit down to shoot'}
                  </span>
                )}
              </div>
            </Card>

            {/* Felt — your own chips on the shared layout. */}
            <Card className="arc-panel relative border-0 p-3 sm:p-4">
              <CrapsTable
                bets={mySeat?.bets ?? {}}
                point={state?.point ?? null}
                phase={state?.phase ?? 'COME_OUT'}
                activeChip={activeChip}
                placeBet={placeBet}
                // The felt stops taking chips the moment the dice are out.
                isRolling={!bettingOpen || busy}
              />
            </Card>
          </div>

          {/* ───────── Side panel ───────── */}
          <div className="space-y-4">
            <Card className="arc-panel space-y-3 border-0 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Phase</span>
                <span className="arc-display flex items-center gap-2 text-sm font-semibold tracking-[0.15em] text-slate-200">
                  {state?.phase === 'POINT' ? 'POINT' : 'COME OUT'}
                  {state?.point && (
                    <span className="arc-mono rounded bg-cyan-500 px-2 py-0.5 text-xs font-bold text-[#04121b]">
                      {state.point}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">On the felt</span>
                <span className="arc-mono flex items-center gap-1 text-sm tabular-nums text-amber-300">
                  <Coins className="h-3.5 w-3.5 text-amber-300/70" />
                  {(mySeat?.atRisk ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="h-px bg-cyan-950/70" />

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Chip</label>
                <CrapsChipRail activeChip={activeChip} onSelect={setActiveChip} />
              </div>

              {/* Picking chips back up. Only what you actually have down. */}
              {mySeat && Object.keys(mySeat.bets).length > 0 && (
                <>
                  <div className="h-px bg-cyan-950/70" />
                  <div className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Take down</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(mySeat.bets).map(([type, amount]) => (
                        <button
                          key={type}
                          type="button"
                          disabled={!bettingOpen || busy}
                          onClick={() => pickUp(type as BetType)}
                          className="rounded border border-cyan-500/25 bg-cyan-500/5 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
                        >
                          {type.replace('_', ' ')} · {amount.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="h-px bg-cyan-950/70" />

              <div className="space-y-1 text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Table min</span>
                  <span className="arc-mono text-slate-400">
                    {(state?.minBet ?? 0).toLocaleString()}
                  </span>
                </div>
                {/* The max is per zone — the total resting on it — the way a
                    real craps table posts it. */}
                <div className="flex items-center justify-between">
                  <span>Max per bet</span>
                  <span className="arc-mono text-slate-400">
                    {(state?.maxBet ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            {/* What the dice have been doing, and what it cost you. */}
            <Card className="arc-panel space-y-2 border-0 p-3 sm:p-4">
              <span className="arc-display flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                <Dices className="h-3.5 w-3.5" />
                Recent throws
              </span>
              <div className="max-h-[320px] overflow-y-auto pr-0.5">
                <CrapsMultiRollHistory
                  rolls={rolls}
                  loading={rollsLoading}
                  myAddress={address ?? null}
                />
              </div>
            </Card>

            {/* Fairness. The shooter's seed is genuinely in every throw they make. */}
            <Card className="arc-panel space-y-2 border-0 p-3 sm:p-4">
              <span className="arc-display flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                Provably fair
              </span>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Every throw comes from this table&apos;s server seed mixed with the{' '}
                <span className="text-slate-400">shooter&apos;s own client seed</span> — holding the
                dice really does change the outcome. Rotating publishes the current seed so every
                throw made under it can be checked.
              </p>
              {state?.serverSeedHash && (
                <p className="arc-mono break-all text-[10px] text-slate-600">
                  {state.serverSeedHash.slice(0, 22)}… · epoch {state.seedEpoch} · roll {state.nonce}
                </p>
              )}
              {mySeat && (
                <button
                  type="button"
                  onClick={rotateSeed}
                  disabled={busy || state?.phase === 'POINT'}
                  className="w-full rounded border border-cyan-500/25 bg-cyan-500/5 px-2 py-1.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:opacity-40"
                  title={state?.phase === 'POINT' ? 'Cannot rotate while a point is on' : undefined}
                >
                  {state?.phase === 'POINT' ? 'Rotate after this hand' : 'Rotate the seed'}
                </button>
              )}
            </Card>
          </div>
        </div>
        {/* The questions a shared felt raises that a solo game never does. */}
        <section className="mt-6">
          <ArcadeFAQ items={crapsMultiFaqs} accent="#86EFAC" />
        </section>
      </main>
    </GlobalMainNav>
  );
}
