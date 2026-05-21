'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { PokerTableState, BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PreActionOption } from '@/components/poker/PokerActions';

type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/**
 * Local prediction applied to {@link PokerTableState} immediately after the
 * user clicks fold/check/call, so the UI updates without waiting on the
 * server round-trip. Cleared once the authoritative response/broadcast lands.
 */
export type PokerOptimisticOverlay = {
  handId: string;
  seatIndex: number;
  action: 'fold' | 'check' | 'call';
  /** Chips moved from stack → pot on `call`. '0' for fold/check. */
  callChips: string;
};

/**
 * Apply an optimistic overlay to authoritative state. Idempotent: skipped
 * when the server's `lastAction` already reflects the same action (broadcast
 * landed before the response resolved). Stale overlays from a prior hand are
 * also skipped.
 */
export function applyPokerOptimisticOverlay(
  state: PokerTableState,
  overlay: PokerOptimisticOverlay,
): PokerTableState {
  const hand = state.currentHand;
  if (!hand || hand.handId !== overlay.handId) return state;

  // If the server's most recent action equals our optimistic one, the
  // authoritative broadcast already lands the same change — don't double-apply.
  // (Single WebSocket connection delivers broadcast → response in send-order, so
  // our `.then()` clears the overlay before any later broadcast can arrive.)
  const la = hand.lastAction;
  if (la && la.position === overlay.seatIndex && la.action === overlay.action) {
    return state;
  }

  const seat = state.seats[overlay.seatIndex];
  if (!seat) return state;

  const nextSeats = state.seats.map((s, i) => {
    if (i !== overlay.seatIndex) return { ...s, isActing: false };
    if (overlay.action === 'fold') return { ...s, folded: true, isActing: false };
    if (overlay.action === 'check') return { ...s, isActing: false };
    // call
    let chips: bigint;
    try {
      chips = BigInt(overlay.callChips);
    } catch {
      chips = 0n;
    }
    const stackBI = safeBigInt(s.stack);
    const clamped = chips > stackBI ? stackBI : chips;
    return {
      ...s,
      stack: (stackBI - clamped).toString(),
      currentBet: (safeBigInt(s.currentBet) + clamped).toString(),
      isActing: false,
    };
  });

  let nextPot = hand.pot;
  if (overlay.action === 'call') {
    const chips = safeBigInt(overlay.callChips);
    const stackBI = safeBigInt(seat.stack);
    const clamped = chips > stackBI ? stackBI : chips;
    nextPot = (safeBigInt(hand.pot) + clamped).toString();
  }

  return {
    ...state,
    seats: nextSeats,
    currentHand: {
      ...hand,
      // Null out actingPosition so canAct flips to false everywhere until the
      // server tells us who's next. Avoids guessing chevtek's next-actor logic.
      actingPosition: null,
      pot: nextPot,
      lastAction: {
        position: overlay.seatIndex,
        action: overlay.action,
        amount: overlay.action === 'call' ? overlay.callChips : '0',
      },
    },
  };
}

function safeBigInt(s: string | null | undefined): bigint {
  if (!s) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

interface UsePokerActionsLogicArgs {
  tableId: string;
  state: PokerTableState | null;
  setState: Dispatch<SetStateAction<PokerTableState | null>>;
  renderedState: PokerTableState | null;
  effectivePlayerAddress: string | null;
  clientRef: MutableRefObject<BlackjackWebSocketClient | null>;
  applyE2EMockAction: (action: PokerActionType, amount?: string) => boolean;
  setOptimisticOverlay: Dispatch<SetStateAction<PokerOptimisticOverlay | null>>;
}

export function usePokerActionsLogic({
  tableId,
  state,
  setState,
  renderedState,
  effectivePlayerAddress,
  clientRef,
  applyE2EMockAction,
  setOptimisticOverlay,
}: UsePokerActionsLogicArgs) {
  const [queuedPreAction, setQueuedPreAction] = useState<PreActionOption>(null);

  const hand = renderedState?.currentHand;
  const me = effectivePlayerAddress?.toLowerCase() ?? null;
  const mySeatIndex =
    renderedState && me
      ? renderedState.seats.findIndex((s) => s.playerAddress?.toLowerCase() === me)
      : -1;
  const mySeat = mySeatIndex >= 0 && renderedState ? renderedState.seats[mySeatIndex] : null;
  const canReup = !!mySeat && (!hand || hand.street === 'showdown');

  const actingAddr =
    hand?.actingPosition != null && renderedState
      ? renderedState.seats[hand.actingPosition]?.playerAddress?.toLowerCase() ?? null
      : null;

  const canAct =
    !!hand &&
    hand.actingPosition != null &&
    mySeat &&
    actingAddr === me &&
    !mySeat.folded &&
    !!renderedState?.myHoleCards &&
    renderedState.myHoleCards.length > 0;
  const canCheck = hand?.toCall === '0' || hand?.toCall === '';
  const callAmount = hand?.toCall ?? '0';
  const currentHand = renderedState?.currentHand ?? state?.currentHand;

  const sendPokerAction = useCallback(
    (action: PokerActionType, amount?: string) => {
      if (applyE2EMockAction(action, amount)) return;
      if (!currentHand || !clientRef.current) return;
      // Manual action wins over any queued pre-action.
      setQueuedPreAction(null);

      // Optimistic update for the three actions whose outcome is mechanically
      // deterministic from current state. bet/raise need server-side min-raise
      // validation, so we wait for the authoritative response there.
      if (
        (action === 'fold' || action === 'check' || action === 'call') &&
        mySeatIndex >= 0
      ) {
        setOptimisticOverlay({
          handId: currentHand.handId,
          seatIndex: mySeatIndex,
          action,
          callChips: action === 'call' ? (currentHand.toCall || '0') : '0',
        });
      }

      clientRef.current
        .pokerAction(
          tableId,
          currentHand.handId,
          action,
          amount ?? (action === 'call' ? currentHand.toCall : undefined),
        )
        .then((next) => {
          setState(next);
          setOptimisticOverlay(null);
        })
        .catch((err) => {
          setOptimisticOverlay(null);
          toast.error((err as Error).message);
        });
    },
    [tableId, currentHand, mySeatIndex, applyE2EMockAction, clientRef, setState, setOptimisticOverlay]
  );

  const handleFold = useCallback(() => {
    sendPokerAction('fold');
  }, [sendPokerAction]);

  const handleCheck = useCallback(() => {
    if (!canCheck) {
      toast.error('Cannot check when facing a bet');
      return;
    }
    sendPokerAction('check');
  }, [canCheck, sendPokerAction]);

  const handleCall = useCallback(() => {
    sendPokerAction('call');
  }, [sendPokerAction]);

  const handleBet = useCallback(
    (amount: string) => {
      sendPokerAction('bet', amount);
    },
    [sendPokerAction]
  );

  const handleRaise = useCallback(
    (amount: string) => {
      sendPokerAction('raise', amount);
    },
    [sendPokerAction]
  );

  useEffect(() => {
    // Keep pre-actions and any stale optimistic overlay scoped to the current hand only.
    setQueuedPreAction(null);
    setOptimisticOverlay(null);
  }, [hand?.handId, setOptimisticOverlay]);

  const autoActionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canAct || !hand?.handId || !queuedPreAction) {
      autoActionKeyRef.current = null;
      return;
    }
    const key = `${hand.handId}:${queuedPreAction}:${canCheck ? 'check' : 'no-check'}`;
    if (autoActionKeyRef.current === key) return;
    autoActionKeyRef.current = key;
    // Small grace period prevents queued pre-action from stealing a fresh manual click.
    const timer = setTimeout(() => {
      const selected = queuedPreAction;
      setQueuedPreAction(null);
      if (selected === 'check') {
        if (canCheck) sendPokerAction('check');
        return;
      }
      if (selected === 'call_any') {
        if (canCheck) sendPokerAction('check');
        else sendPokerAction('call');
        return;
      }
      if (canCheck) sendPokerAction('check');
      else sendPokerAction('fold');
    }, 250);

    return () => clearTimeout(timer);
  }, [canAct, canCheck, hand?.handId, queuedPreAction, sendPokerAction]);

  return {
    hand,
    mySeatIndex,
    mySeat,
    canReup,
    canAct,
    canCheck,
    callAmount,
    queuedPreAction,
    setQueuedPreAction,
    handleFold,
    handleCheck,
    handleCall,
    handleBet,
    handleRaise,
    sendPokerAction,
  };
}
