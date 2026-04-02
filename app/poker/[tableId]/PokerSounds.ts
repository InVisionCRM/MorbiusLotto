'use client';

import { useEffect, useRef } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import type { PokerCurrentHand, PokerTableState } from '@/lib/websocket-client';
import { usePokerSounds } from '@/hooks/use-poker-sounds';

interface UsePokerSoundsArgs {
  canAct: boolean;
  hand: PokerCurrentHand | null | undefined;
  mySeatIndex: number;
  state: PokerTableState | null;
  normalizedAddress: string | null;
}

export function usePokerTableSounds({
  canAct,
  hand,
  mySeatIndex,
  state,
  normalizedAddress,
}: UsePokerSoundsArgs) {
  const sounds = usePokerSounds();
  const ps = (file: string) => `/POKER/PokerSounds/${file}`;

  const prevCanActRef = useRef(false);
  useEffect(() => {
    if (canAct && !prevCanActRef.current) {
      sounds.play('player_turn', ps('PlayerTurn.mp3'));
    }
    prevCanActRef.current = !!canAct;
  }, [canAct, sounds]);

  const prevHandIdRef = useRef<string | null>(null);
  useEffect(() => {
    const handId = hand?.handId ?? null;
    if (handId && handId !== prevHandIdRef.current) {
      sounds.play('cards_dealing', ps('CardsDealing.wav'));
    }
    prevHandIdRef.current = handId;
  }, [hand?.handId, sounds]);

  const prevLastActionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const la = hand?.lastAction;
    if (!la) return;
    const key = `${hand?.handId}:${la.position}:${la.action}:${la.amount}`;
    if (key === prevLastActionKeyRef.current) return;
    prevLastActionKeyRef.current = key;
    if (mySeatIndex >= 0 && la.position === mySeatIndex) return;

    const opponentStack = state?.seats[la.position]?.stack ?? '1';
    const stackBig = toBigIntSafe(opponentStack);
    const isAllIn = stackBig === 0n && (la.action === 'bet' || la.action === 'raise' || la.action === 'call');

    if (la.action === 'fold') sounds.play('opponent_fold', ps('OpponentFold.wav'));
    else if (isAllIn) sounds.play('opponent_allin', ps('OpponentAllin.mp3'));
    else if (la.action === 'call' || la.action === 'raise' || la.action === 'bet') {
      sounds.play('opponent_call_raise', ps('OpponentCall-Raise.wav'));
    } else if (la.action === 'check') sounds.play('opponent_checks', ps('OpponentChecks.mp3'));
  }, [hand?.lastAction, hand?.handId, mySeatIndex, state?.seats, sounds]);

  const prevWinnerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (hand?.street !== 'showdown' || !hand.winners?.length) return;
    const key = `${hand.handId}:${hand.winners.map((w) => w.address).join(',')}`;
    if (key === prevWinnerKeyRef.current) return;
    prevWinnerKeyRef.current = key;
    if (hand.winners.some((w) => w.address === normalizedAddress)) {
      sounds.play('win', ps('PlayerWins.mp3'));
    }
  }, [hand?.street, hand?.winners, hand?.handId, normalizedAddress, sounds]);

  const prevSeatAddrsRef = useRef<(string | null)[]>([]);
  useEffect(() => {
    if (!state) return;
    const current = state.seats.map((s) => s.playerAddress ?? null);
    const prev = prevSeatAddrsRef.current;
    if (prev.length > 0) {
      for (let i = 0; i < current.length; i++) {
        const wasOpponent = prev[i] && prev[i] !== normalizedAddress;
        const isOpponent = current[i] && current[i] !== normalizedAddress;
        if (!wasOpponent && isOpponent) sounds.play('opponent_joined', ps('OpponentJoined.mp3'));
        else if (wasOpponent && !isOpponent) sounds.play('opponent_left', ps('OpponentLeft.mp3'));
      }
    }
    prevSeatAddrsRef.current = current;
  }, [state?.seats, normalizedAddress, sounds]);

  const playClick = () => {
    sounds.play('call', ps('PlayerClickConfirmation1.mp3'));
  };

  return { playClick };
}
