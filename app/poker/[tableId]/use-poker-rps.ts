'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { isRpsChoice, RPS_REVEAL_FLY_MS, type RpsChoice } from '@/lib/poker-rps';

/**
 * RPS table mini-game client state: subscribes to the server's poker_rps_*
 * events, holds the live match for the dock + the incoming-challenge prompt,
 * and exposes the challenge/respond/pick/leave actions. Sibling of
 * usePokerSeatOverlays. Just-for-fun — never any stakes.
 */

export type RpsPhase = 'picking' | 'revealing' | 'result';

export interface RpsMatchView {
  matchId: string;
  mySeatIndex: number;
  oppSeatIndex: number;
  oppName: string | null;
  myScore: number;
  oppScore: number;
  /** This round's locked pick (hidden from opponent until both are in). */
  myPick: RpsChoice | null;
  /** Opponent has locked a pick this round (their choice stays hidden). */
  oppPicked: boolean;
  phase: RpsPhase;
  result: { myChoice: RpsChoice; oppChoice: RpsChoice; outcome: 'win' | 'lose' | 'draw' } | null;
}

export interface RpsIncoming {
  matchId: string;
  fromSeatIndex: number;
  fromName: string | null;
}

/** A single emoji toss over a seat at reveal (consumed by the PokerTable animation). */
export interface RpsRevealFlight {
  id: string;
  seatIndex: number;
  choice: RpsChoice;
}

/**
 * A spectator-facing badge for a duel I'm watching (not playing). The rail sees a
 * small "these two are dueling" marker over each seat with the running score; the
 * emoji toss + winner flash play at each reveal. Consumed by PokerTable.
 */
export interface RpsSpectatorBadge {
  matchId: string;
  aSeatIndex: number;
  bSeatIndex: number;
  scoreA: number;
  scoreB: number;
  /** Most recent round's winning seat (brief flash), or null (no reveal yet / draw). */
  flashWinnerSeatIndex: number | null;
  /** Bumps each reveal so the UI can retrigger the flash animation. */
  flashKey: number;
}

interface UsePokerRpsArgs {
  clientRef: MutableRefObject<BlackjackWebSocketClient | null>;
  tableId: string;
  normalizedAddress: string | null;
  state: PokerTableState | null;
  mySeatIndex: number;
  /** From usePokerRpsChallenges — when false, incoming challenges auto-decline. */
  challengesEnabled: boolean;
}

/** A seat is out of the live hand (eligible for RPS) when there's no live hand or it has folded. */
function isSeatOutOfHand(state: PokerTableState | null, seatIndex: number): boolean {
  if (!state || seatIndex < 0) return false;
  const seat = state.seats[seatIndex];
  if (!seat || !seat.playerAddress) return false;
  const noLiveHand = !state.currentHand || state.currentHand.street === 'showdown';
  return noLiveHand || !!seat.folded;
}

export function usePokerRps({
  clientRef,
  tableId,
  normalizedAddress,
  state,
  mySeatIndex,
  challengesEnabled,
}: UsePokerRpsArgs) {
  const [incoming, setIncoming] = useState<RpsIncoming | null>(null);
  const [match, setMatch] = useState<RpsMatchView | null>(null);
  const [revealFlights, setRevealFlights] = useState<RpsRevealFlight[]>([]);
  // Duels I'm watching (not playing) — drives the rail's seat badges + tosses.
  const [spectatorBadges, setSpectatorBadges] = useState<RpsSpectatorBadge[]>([]);

  // Listeners are bound once per table; read live values via refs to avoid re-subscribing.
  const challengesEnabledRef = useRef(challengesEnabled);
  const stateRef = useRef(state);
  const mySeatIndexRef = useRef(mySeatIndex);
  const matchRef = useRef<RpsMatchView | null>(match);
  const revealTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // `${matchId}:${round}` we've already animated — makes reveal handling idempotent.
  const seenRevealsRef = useRef<Set<string>>(new Set());

  useEffect(() => { challengesEnabledRef.current = challengesEnabled; }, [challengesEnabled]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { mySeatIndexRef.current = mySeatIndex; }, [mySeatIndex]);
  useEffect(() => { matchRef.current = match; }, [match]);

  const seatName = useCallback((seatIndex: number): string | null => {
    const s = stateRef.current?.seats[seatIndex];
    return s?.displayName ?? null;
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !tableId) return;

    const onChallenge = (payload: { matchId?: string; tableId?: string; fromSeatIndex?: number; toSeatIndex?: number; fromName?: string | null }) => {
      if (payload.tableId !== tableId || !payload.matchId || typeof payload.fromSeatIndex !== 'number') return;
      // Honor the "challenges off" toggle: silently auto-decline.
      if (!challengesEnabledRef.current) {
        client.sendRpsRespond(payload.matchId, false, 'challenges_off');
        return;
      }
      // Already dueling — let it lapse (server also guards busy on its side).
      if (matchRef.current) return;
      setIncoming({ matchId: payload.matchId, fromSeatIndex: payload.fromSeatIndex, fromName: payload.fromName ?? seatName(payload.fromSeatIndex) });
    };

    const onDeclined = (payload: { matchId?: string | null; reason?: string }) => {
      const reason = payload.reason;
      if (reason === 'busy') toast.info('That player is already in a match.');
      else if (reason === 'in_hand') toast.info('You can play once you’re both out of the hand.');
      else if (reason === 'challenges_off') toast.info('That player isn’t accepting challenges.');
      else if (reason === 'timeout') toast.info('Challenge expired — no response.');
      else toast.info('Challenge declined.');
    };

    const onStarted = (payload: { matchId?: string; tableId?: string; aSeatIndex?: number; bSeatIndex?: number; scoreA?: number; scoreB?: number }) => {
      if (payload.tableId !== tableId || !payload.matchId) return;
      const { aSeatIndex, bSeatIndex, scoreA = 0, scoreB = 0 } = payload;
      if (typeof aSeatIndex !== 'number' || typeof bSeatIndex !== 'number') return;
      const me = mySeatIndexRef.current;
      const iAmA = me === aSeatIndex;
      const iAmB = me === bSeatIndex;
      if (!iAmA && !iAmB) return; // spectators don't open a dock
      const oppSeatIndex = iAmA ? bSeatIndex : aSeatIndex;
      setIncoming(null);
      setMatch({
        matchId: payload.matchId,
        mySeatIndex: me,
        oppSeatIndex,
        oppName: seatName(oppSeatIndex),
        myScore: iAmA ? scoreA : scoreB,
        oppScore: iAmA ? scoreB : scoreA,
        myPick: null,
        oppPicked: false,
        phase: 'picking',
        result: null,
      });
    };

    const onPicked = (payload: { matchId?: string; seatIndex?: number }) => {
      const m = matchRef.current;
      if (!m || payload.matchId !== m.matchId || typeof payload.seatIndex !== 'number') return;
      if (payload.seatIndex === m.oppSeatIndex) {
        setMatch((prev) => (prev && prev.matchId === m.matchId ? { ...prev, oppPicked: true } : prev));
      }
    };

    // Toss both picks' emoji up over their seats simultaneously. Deterministic ids
    // (matchId+round) so a reveal that arrives twice doesn't double-animate.
    const tossFlights = (matchId: string, round: number, aSeatIndex: number, aChoice: RpsChoice, bSeatIndex: number, bChoice: RpsChoice) => {
      const flights: RpsRevealFlight[] = [
        { id: `rps-${matchId}-${round}-${aSeatIndex}`, seatIndex: aSeatIndex, choice: aChoice },
        { id: `rps-${matchId}-${round}-${bSeatIndex}`, seatIndex: bSeatIndex, choice: bChoice },
      ];
      setRevealFlights((prev) => {
        const have = new Set(prev.map((f) => f.id));
        const add = flights.filter((f) => !have.has(f.id));
        return add.length ? [...prev, ...add] : prev;
      });
      const clearT = setTimeout(() => {
        setRevealFlights((prev) => prev.filter((f) => f.id !== flights[0].id && f.id !== flights[1].id));
        revealTimeoutsRef.current.delete(clearT);
      }, RPS_REVEAL_FLY_MS + 200);
      revealTimeoutsRef.current.add(clearT);
    };

    // Reveal for a match I'm IN (server delivers by address, so it always lands —
    // this is what un-sticks the challenger's dock from "waiting").
    const onReveal = (payload: { matchId?: string; aSeatIndex?: number; aChoice?: string; bSeatIndex?: number; bChoice?: string; winnerSeatIndex?: number | null; scoreA?: number; scoreB?: number; round?: number }) => {
      const { matchId, aSeatIndex, aChoice, bSeatIndex, bChoice, winnerSeatIndex, scoreA = 0, scoreB = 0, round = 0 } = payload;
      if (!matchId || typeof aSeatIndex !== 'number' || typeof bSeatIndex !== 'number' || !isRpsChoice(aChoice) || !isRpsChoice(bChoice)) return;

      const key = `${matchId}:${round}`;
      if (!seenRevealsRef.current.has(key)) {
        seenRevealsRef.current.add(key);
        tossFlights(matchId, round, aSeatIndex, aChoice, bSeatIndex, bChoice);
      }

      const m = matchRef.current;
      if (!m || matchId !== m.matchId) return; // only participants score the dock
      const iAmA = m.mySeatIndex === aSeatIndex;
      const myChoice = iAmA ? aChoice : bChoice;
      const oppChoice = iAmA ? bChoice : aChoice;
      const outcome: 'win' | 'lose' | 'draw' =
        winnerSeatIndex == null ? 'draw' : winnerSeatIndex === m.mySeatIndex ? 'win' : 'lose';
      setMatch((prev) => (prev && prev.matchId === m.matchId ? {
        ...prev,
        myScore: iAmA ? scoreA : scoreB,
        oppScore: iAmA ? scoreB : scoreA,
        myPick: null,
        oppPicked: false,
        phase: 'result',
        result: { myChoice, oppChoice, outcome },
      } : prev));
    };

    // Spectator channel: a duel between two OTHER seats. Drives the rail's badge +
    // the toss/outcome. Ignored if I'm one of the duelists (my dock handles me).
    const onSpectator = (payload: { matchId?: string; phase?: string; aSeatIndex?: number; bSeatIndex?: number; scoreA?: number; scoreB?: number; reveal?: { aChoice?: string; bChoice?: string; winnerSeatIndex?: number | null; round?: number } | null }) => {
      const { matchId, phase, aSeatIndex, bSeatIndex, scoreA = 0, scoreB = 0, reveal } = payload;
      if (!matchId || typeof aSeatIndex !== 'number' || typeof bSeatIndex !== 'number') return;
      const me = mySeatIndexRef.current;
      if (me === aSeatIndex || me === bSeatIndex) return;
      if (phase === 'ended') {
        setSpectatorBadges((prev) => prev.filter((b) => b.matchId !== matchId));
        return;
      }
      let winnerSeat: number | null = null;
      let didReveal = false;
      if (reveal && isRpsChoice(reveal.aChoice) && isRpsChoice(reveal.bChoice)) {
        didReveal = true;
        winnerSeat = typeof reveal.winnerSeatIndex === 'number' ? reveal.winnerSeatIndex : null;
        const round = typeof reveal.round === 'number' ? reveal.round : 0;
        const key = `${matchId}:${round}`;
        if (!seenRevealsRef.current.has(key)) {
          seenRevealsRef.current.add(key);
          tossFlights(matchId, round, aSeatIndex, reveal.aChoice, bSeatIndex, reveal.bChoice);
        }
      }
      setSpectatorBadges((prev) => {
        const existing = prev.find((b) => b.matchId === matchId);
        const next: RpsSpectatorBadge = {
          matchId, aSeatIndex, bSeatIndex, scoreA, scoreB,
          flashWinnerSeatIndex: didReveal ? winnerSeat : (existing?.flashWinnerSeatIndex ?? null),
          flashKey: (existing?.flashKey ?? 0) + (didReveal ? 1 : 0),
        };
        if (existing) return prev.map((b) => (b.matchId === matchId ? next : b));
        return [...prev, next];
      });
    };

    const onRoundCancelled = (payload: { matchId?: string; reason?: string }) => {
      const m = matchRef.current;
      if (!m || payload.matchId !== m.matchId) return;
      setMatch((prev) => (prev && prev.matchId === m.matchId ? { ...prev, myPick: null, oppPicked: false, phase: 'picking', result: null } : prev));
      toast.info('Round cancelled — someone didn’t pick in time.');
    };

    const onEnded = (payload: { matchId?: string; reason?: string }) => {
      const m = matchRef.current;
      if (!m || payload.matchId !== m.matchId) return;
      if (payload.reason === 'peer_left') toast.info('Your opponent left the match.');
      setMatch(null);
    };

    client.on('poker_rps_challenge', onChallenge);
    client.on('poker_rps_declined', onDeclined);
    client.on('poker_rps_started', onStarted);
    client.on('poker_rps_picked', onPicked);
    client.on('poker_rps_reveal', onReveal);
    client.on('poker_rps_spectator', onSpectator);
    client.on('poker_rps_round_cancelled', onRoundCancelled);
    client.on('poker_rps_ended', onEnded);
    return () => {
      client.off('poker_rps_challenge', onChallenge);
      client.off('poker_rps_declined', onDeclined);
      client.off('poker_rps_started', onStarted);
      client.off('poker_rps_picked', onPicked);
      client.off('poker_rps_reveal', onReveal);
      client.off('poker_rps_spectator', onSpectator);
      client.off('poker_rps_round_cancelled', onRoundCancelled);
      client.off('poker_rps_ended', onEnded);
      revealTimeoutsRef.current.forEach((t) => clearTimeout(t));
      revealTimeoutsRef.current.clear();
      seenRevealsRef.current.clear();
      setSpectatorBadges([]);
    };
  }, [clientRef, tableId, seatName]);

  // Hand-start teardown is client-driven: if I'm dealt back into a live hand
  // while dueling (folded resets every hand), leave the match so both docks close.
  useEffect(() => {
    if (!match) return;
    if (!isSeatOutOfHand(state, match.mySeatIndex)) {
      const client = clientRef.current;
      client?.sendRpsLeave(match.matchId);
      setMatch(null);
    }
  }, [state, match, clientRef]);

  const onChallengeRps = useCallback(
    (toSeatIndex: number) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      if (toSeatIndex < 0 || toSeatIndex === mySeatIndex) return;
      if (!isSeatOutOfHand(state, mySeatIndex) || !isSeatOutOfHand(state, toSeatIndex)) {
        toast.info('You can play once you’re both out of the hand.');
        return;
      }
      client.sendRpsChallenge(tableId, toSeatIndex);
      toast.success('Challenge sent — waiting for them to accept.');
    },
    [clientRef, tableId, mySeatIndex, state],
  );

  const acceptChallenge = useCallback(() => {
    const client = clientRef.current;
    if (!client || !incoming) return;
    client.sendRpsRespond(incoming.matchId, true);
    setIncoming(null);
  }, [clientRef, incoming]);

  const denyChallenge = useCallback(() => {
    const client = clientRef.current;
    if (!client || !incoming) return;
    client.sendRpsRespond(incoming.matchId, false);
    setIncoming(null);
  }, [clientRef, incoming]);

  // Incoming-challenge prompt (sonner Accept / Deny). The challenges-off
  // auto-decline happens upstream in the listener, so this only fires when a
  // challenge is genuinely pending. 18s < the server's 20s auto-decline so the
  // toast clears before the match is reaped.
  useEffect(() => {
    if (!incoming) return;
    const name = incoming.fromName?.trim() || `Seat ${incoming.fromSeatIndex + 1}`;
    const id = toast(`${name} wants to play Rock Paper Scissors`, {
      duration: 18000,
      action: { label: 'Accept', onClick: () => acceptChallenge() },
      cancel: { label: 'Deny', onClick: () => denyChallenge() },
    });
    return () => { toast.dismiss(id); };
  }, [incoming, acceptChallenge, denyChallenge]);

  const pick = useCallback(
    (choice: RpsChoice) => {
      const client = clientRef.current;
      setMatch((prev) => {
        if (!client || !prev || prev.phase !== 'picking' || prev.myPick) return prev;
        client.sendRpsPick(prev.matchId, choice);
        return { ...prev, myPick: choice };
      });
    },
    [clientRef],
  );

  const playAgain = useCallback(() => {
    setMatch((prev) => (prev ? { ...prev, phase: 'picking', myPick: null, oppPicked: false, result: null } : prev));
  }, []);

  const leaveMatch = useCallback(() => {
    const client = clientRef.current;
    setMatch((prev) => {
      if (prev && client) client.sendRpsLeave(prev.matchId);
      return null;
    });
  }, [clientRef]);

  return {
    incoming,
    match,
    revealFlights,
    spectatorBadges,
    onChallengeRps,
    acceptChallenge,
    denyChallenge,
    pick,
    playAgain,
    leaveMatch,
  };
}
