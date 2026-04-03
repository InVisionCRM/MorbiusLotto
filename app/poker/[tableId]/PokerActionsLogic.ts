'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { PokerTableState, BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PreActionOption } from '@/components/poker/PokerActions';

type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

interface UsePokerActionsLogicArgs {
  tableId: string;
  state: PokerTableState | null;
  setState: Dispatch<SetStateAction<PokerTableState | null>>;
  renderedState: PokerTableState | null;
  effectivePlayerAddress: string | null;
  clientRef: MutableRefObject<BlackjackWebSocketClient | null>;
  applyE2EMockAction: (action: PokerActionType, amount?: string) => boolean;
}

export function usePokerActionsLogic({
  tableId,
  state,
  setState,
  renderedState,
  effectivePlayerAddress,
  clientRef,
  applyE2EMockAction,
}: UsePokerActionsLogicArgs) {
  const [queuedPreAction, setQueuedPreAction] = useState<PreActionOption>(null);

  const hand = renderedState?.currentHand;
  const mySeatIndex = renderedState
    ? renderedState.seats.findIndex((s) => s.playerAddress === effectivePlayerAddress)
    : -1;
  const mySeat = mySeatIndex >= 0 && renderedState ? renderedState.seats[mySeatIndex] : null;
  const canReup = !!mySeat && (!hand || hand.street === 'showdown');

  const canAct =
    !!hand &&
    hand.actingPosition != null &&
    mySeat &&
    renderedState!.seats[hand.actingPosition]?.playerAddress === effectivePlayerAddress &&
    !mySeat.folded &&
    !!renderedState?.myHoleCards &&
    renderedState.myHoleCards.length > 0;
  const canCheck = hand?.toCall === '0' || hand?.toCall === '';
  const callAmount = hand?.toCall ?? '0';
  const currentHand = state?.currentHand;

  const sendPokerAction = useCallback(
    (action: PokerActionType, amount?: string) => {
      if (applyE2EMockAction(action, amount)) return;
      if (!currentHand || !clientRef.current) return;
      clientRef.current
        .pokerAction(
          tableId,
          currentHand.handId,
          action,
          amount ?? (action === 'call' ? currentHand.toCall : undefined),
        )
        .then(setState)
        .catch((err) => toast.error((err as Error).message));
    },
    [tableId, currentHand, applyE2EMockAction, clientRef, setState]
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
    // Keep pre-actions scoped to the current hand only.
    setQueuedPreAction(null);
  }, [hand?.handId]);

  const autoActionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canAct || !hand?.handId || !queuedPreAction) {
      autoActionKeyRef.current = null;
      return;
    }
    const key = `${hand.handId}:${queuedPreAction}:${canCheck ? 'check' : 'no-check'}`;
    if (autoActionKeyRef.current === key) return;
    autoActionKeyRef.current = key;
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
