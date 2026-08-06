'use client';

/**
 * Multiplayer Ultimate Texas Hold'em — the shared felt.
 *
 * One board, one dealer, every seat playing its own hand. Nobody waits for a
 * turn: each seat has its own clock on each street and the street advances once
 * everyone still choosing has chosen.
 *
 * The client derives nothing. The street, which board cards are visible, whose
 * hole cards you may see and what you are allowed to do all arrive from the
 * server. Other players' cards are face down because the SERVER withheld them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { ArrowLeft, Coins, ShieldCheck, Users } from 'lucide-react';

import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TableCard, TableCardStyles } from '@/components/shared/TableCard';
import { TableFeltControls, useTableFelt } from '@/components/shared/TableFeltControls';
import { tableAudio } from '@/lib/table-audio';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ultimateHoldemFaqs } from '@/components/UltimateHoldem/ultimateHoldemFaqs';
import { UthMultiRail } from '@/components/UltimateHoldem/multi/UthMultiRail';
import { uthActionLabel } from '@/lib/ultimate-holdem-client';
import type { UthAction } from '@/lib/ultimate-holdem-client';

/**
 * Reveal pacing. The board arrives from the server a whole street at a time;
 * these are what turn that into a dealer laying cards down rather than three
 * appearing at once.
 */
const DEAL_GAP = 280;
/** The dealer's hand decides the round, so it gets a beat before it turns. */
const SHOWDOWN_PAUSE = 420;
const FLIP_GAP = 340;
import {
  UTH_MULTI_EVENTS,
  actUthMulti,
  getUthTableState,
  joinUthTable,
  leaveUthTable,
  postUthAnte,
  rotateUthSeed,
  uthClockRemaining,
  uthSeatOf,
  uthStageLabel,
  type UthMultiTableState,
} from '@/lib/uth-multi-client';

export default function UthMultiTablePage() {
  const params = useParams();
  const router = useRouter();
  const tableId = String(params?.tableId ?? '');
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const felt = useTableFelt();

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<UthMultiTableState | null>(null);
  // Read by the reveal scheduler, which runs off stage changes and must not
  // re-run every time anything else about the table moves.
  const stateRef = useRef<UthMultiTableState | null>(null);
  stateRef.current = state;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ante, setAnte] = useState(500);
  const [trips, setTrips] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Sound the table's transitions once each, not on every re-render.
  const lastStageRef = useRef<string | null>(null);
  const lastRoundRef = useRef<string | null>(null);

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
      try { setState(await getUthTableState(client, tableId)); } catch { /* broadcast catches up */ }
    });
    client.on(UTH_MULTI_EVENTS.tableState, (p: UthMultiTableState) => setState(p));
    client.on('error', (err: any) => setError(err?.message ?? 'Connection error'));

    let cancelled = false;
    client.connect()
      .then(async () => {
        if (cancelled) return;
        setConnected(true);
        setWs(client);
        try { setState(await getUthTableState(client, tableId)); }
        catch (err) { setError((err as Error)?.message ?? 'Could not load the table.'); }
      })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Could not connect.'); });

    return () => {
      cancelled = true;
      try { (client as any).disconnect?.(); } catch { /* nothing to unwind */ }
    };
  }, [tableId, address, signTypedDataAsync]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const mySeat = useMemo(() => uthSeatOf(state, address), [state, address]);
  const settled = state?.stage === 'settled';

  // How much of the board and the dealer's hand has actually been turned over
  // for this viewer. The server says which cards exist; this says which ones
  // the dealer has got to yet.
  const [shownBoard, setShownBoard] = useState(0);
  const [shownDealer, setShownDealer] = useState(0);
  // Mirrored so the scheduler can read the count without doing it inside a
  // state updater — React may run an updater twice, which would schedule the
  // whole street's reveals twice over.
  const shownBoardRef = useRef(0);
  shownBoardRef.current = shownBoard;
  const revealTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearReveals = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
  }, []);

  const scheduleReveal = useCallback((delay: number, fn: () => void) => {
    revealTimers.current.push(setTimeout(fn, delay));
  }, []);

  // A reveal in flight when the page goes away would otherwise fire into a
  // dead component.
  useEffect(() => clearReveals, [clearReveals]);

  // A new round deals; each street turns more board cards over; showdown pays.
  const roundId = state?.roundId ?? null;
  const stage = state?.stage ?? null;
  const myNet = mySeat && settled
    ? mySeat.totalPayout - (mySeat.ante + mySeat.blind + mySeat.trips + mySeat.play)
    : 0;
  const myNetRef = useRef(0);
  useEffect(() => { myNetRef.current = myNet; }, [myNet]);

  useEffect(() => {
    if (!roundId || !stage) return;
    const isNewRound = lastRoundRef.current !== roundId;
    const isNewStage = lastStageRef.current !== `${roundId}:${stage}`;
    lastRoundRef.current = roundId;
    lastStageRef.current = `${roundId}:${stage}`;
    if (!isNewStage) return;

    tableAudio.init();

    const boardLen = stateRef.current?.board?.length ?? 0;
    const dealerLen = stateRef.current?.dealerCards?.length ?? 0;

    // Walking in on a hand already in progress: those cards were turned before
    // we got here, so dealing them out now would be theatre about a moment
    // that has passed. Show them as found.
    if (isNewRound && stage !== 'preflop') {
      clearReveals();
      setShownBoard(boardLen);
      setShownDealer(dealerLen);
      return;
    }

    if (isNewRound && stage === 'preflop') {
      clearReveals();
      setShownBoard(0);
      setShownDealer(0);
      tableAudio.playChip();
      for (let i = 0; i < 2; i++) scheduleReveal(i * DEAL_GAP, () => tableAudio.playDeal());
      return;
    }

    if (stage === 'flop' || stage === 'river') {
      // One card at a time, each with its own sound as it lands — the deal
      // was already staggered in audio while every card appeared at once,
      // which is why the street felt like a jump cut with a rattle over it.
      const already = shownBoardRef.current;
      for (let n = already; n < boardLen; n++) {
        scheduleReveal((n - already) * DEAL_GAP, () => {
          setShownBoard(n + 1);
          tableAudio.playDeal();
        });
      }
      return;
    }

    if (stage === 'settled') {
      // The dealer's hand is the answer to the whole round, so it gets a beat
      // to itself before turning, and the two cards turn separately.
      setShownBoard(boardLen);
      for (let i = 0; i < dealerLen; i++) {
        scheduleReveal(SHOWDOWN_PAUSE + i * FLIP_GAP, () => {
          setShownDealer(i + 1);
          tableAudio.playFlip();
        });
      }
      scheduleReveal(SHOWDOWN_PAUSE + dealerLen * FLIP_GAP + 260, () => {
        const net = myNetRef.current;
        if (net > 0) tableAudio.playWin();
        else if (net < 0) tableAudio.playLose();
        else tableAudio.playPush();
      });
    }
  }, [roundId, stage, clearReveals, scheduleReveal]);

  const secondsLeft = uthClockRemaining(state, nowMs);

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
    void guard(() => joinUthTable(ws!, tableId, position));
  }, [guard, ws, tableId, address]);

  const standUp = useCallback(() => {
    void guard(async () => {
      await leaveUthTable(ws!, tableId);
      router.push('/ultimate-holdem/multi');
    });
  }, [guard, ws, tableId, router]);

  const post = useCallback(() => {
    tableAudio.init();
    tableAudio.playChip();
    void guard(() => postUthAnte(ws!, tableId, ante, trips ? ante : 0));
  }, [guard, ws, tableId, ante, trips]);

  const act = useCallback((action: UthAction) => {
    tableAudio.init();
    if (action !== 'check' && action !== 'fold') tableAudio.playCommit();
    void guard(() => actUthMulti(ws!, tableId, action));
  }, [guard, ws, tableId]);

  const rotate = useCallback(() => {
    void guard(async () => {
      const res = await rotateUthSeed(ws!, tableId);
      if (!res.ok && res.error) setError(res.error);
    });
  }, [guard, ws, tableId]);

  const board = state?.board ?? [];
  const canPost = !!mySeat && state?.status !== 'dealing';

  return (
    <GlobalMainNav>
      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push('/ultimate-holdem/multi')}
            className="arc-display flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tables
          </button>
          <div className="flex items-center gap-3">
            <TableFeltControls felt={felt} />
            <span
              className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse')}
              aria-label={connected ? 'Connected' : 'Reconnecting'}
            />
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* ───────── The board ───────── */}
        <Card className="arc-panel mb-4 border-0 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="arc-display text-[10px] uppercase tracking-[0.25em] text-slate-500">
              {state ? uthStageLabel(state.stage) : 'Table'}
              {state && state.roundNumber > 0 && (
                <span className="ml-2 text-slate-700">hand #{state.roundNumber}</span>
              )}
            </span>
            <span className="arc-display text-xs uppercase tracking-[0.15em] text-slate-500">
              {state?.status === 'betting' ? 'Post your ante' : state?.status === 'dealing' ? 'In play' : 'Waiting'}
              {secondsLeft !== null && <span className="arc-mono ml-2 text-cyan-300">{secondsLeft}s</span>}
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 py-2 sm:gap-2.5">
            {[0, 1, 2, 3, 4].map((i) =>
              // A card the server has sent but the dealer has not reached yet
              // stays an empty space, so the street lands one card at a time.
              board[i] != null && i < shownBoard ? (
                <TableCard key={i} cardIdx={board[i]} back={felt.back} deal />
              ) : (
                <TableCard key={i} placeholder />
              ),
            )}
          </div>

          {/* The dealer only ever shows at showdown. */}
          <div className="mt-2 flex flex-col items-center gap-1">
            <span className="arc-display text-[10px] uppercase tracking-[0.25em] text-slate-600">Dealer</span>
            <div className="flex gap-1.5">
              {[0, 1].map((i) => (
                <TableCard
                  key={i}
                  width="clamp(32px, 8vw, 44px)"
                  cardIdx={state?.dealerCards?.[i]}
                  // Face down until this particular card has been turned, so
                  // the dealer's hand arrives one card at a time rather than
                  // both flipping the instant the round settles.
                  faceDown={i >= shownDealer}
                  back={felt.back}
                />
              ))}
            </div>
          </div>
        </Card>

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
            <UthMultiRail
              seats={state.seats}
              myAddress={address ?? null}
              onTakeSeat={takeSeat}
              busy={busy}
              back={felt.back}
              settled={!!settled}
            />
          ) : (
            <div className="h-[118px] animate-pulse rounded-xl bg-cyan-500/5" />
          )}
        </Card>

        {/* ───────── Your action ───────── */}
        <Card className="arc-panel mb-4 border-0 p-3 sm:p-4">
          {!mySeat ? (
            <p className="py-3 text-center text-[13px] text-slate-500">
              Take a seat to play. You&apos;ll be dealt in from the next hand.
            </p>
          ) : state?.legalActions.length ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {state.legalActions.map((a) => (
                <Button
                  key={a}
                  onClick={() => act(a)}
                  disabled={busy || !connected}
                  className={cn(
                    'font-semibold',
                    a === 'fold'
                      ? 'bg-rose-600/80 hover:bg-rose-600'
                      : a === 'check'
                        ? 'bg-slate-700 hover:bg-slate-600'
                        : 'bg-amber-500 text-[#04121b] hover:bg-amber-400',
                  )}
                >
                  {uthActionLabel(a)}
                  {a !== 'check' && a !== 'fold' && mySeat.ante > 0 && (
                    <span className="arc-mono ml-1.5 text-[11px] opacity-80">
                      {(mySeat.ante * (a === 'bet4' ? 4 : a === 'bet3' ? 3 : a === 'bet2' ? 2 : 1)).toLocaleString()}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Ante</span>
                <span className="text-[11px] text-slate-600">
                  {state?.minBet.toLocaleString()} – {state?.maxBet.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={ante}
                  onChange={(e) => setAnte(Math.floor(Number(e.target.value) || 0))}
                  disabled={!canPost || busy}
                  className="h-9 bg-[#040d14] text-sm"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={trips}
                    onChange={(e) => setTrips(e.target.checked)}
                    disabled={!canPost || busy}
                  />
                  Trips
                </label>
                <Button
                  onClick={post}
                  disabled={!canPost || busy}
                  className="shrink-0 bg-cyan-500 font-semibold text-[#04121b] hover:bg-cyan-400"
                >
                  Post
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                An ante posts an equal Blind alongside it. Nothing leaves your balance until the
                hand actually deals.
              </p>
            </div>
          )}
        </Card>

        {/* ───────── Fairness ───────── */}
        <Card className="arc-panel mb-4 space-y-2 border-0 p-3 sm:p-4">
          <span className="arc-display flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Provably fair
          </span>
          <p className="text-[11px] leading-relaxed text-slate-500">
            One shuffle per hand, sealed behind the commitment below and mixed with{' '}
            <span className="text-slate-400">every seated player&apos;s client seed</span> — so no
            single player, and not the house alone, decides the deal. All five board cards are fixed
            before anyone acts.
          </p>
          {state?.serverSeedHash && (
            <p className="arc-mono break-all text-[10px] text-slate-600">
              {state.serverSeedHash.slice(0, 22)}… · epoch {state.seedEpoch} · hand {state.nonce}
            </p>
          )}
          {mySeat && (
            <button
              type="button"
              onClick={rotate}
              disabled={busy || state?.status === 'dealing'}
              className="w-full rounded border border-cyan-500/25 bg-cyan-500/5 px-2 py-1.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:opacity-40"
              title={state?.status === 'dealing' ? 'Cannot rotate mid-hand' : undefined}
            >
              {state?.status === 'dealing' ? 'Rotate after this hand' : 'Rotate the seed'}
            </button>
          )}
        </Card>

        <section className="mt-6">
          <ArcadeFAQ items={ultimateHoldemFaqs} accent="#A78BFA" />
        </section>
      </main>

      <TableCardStyles />
    </GlobalMainNav>
  );
}
