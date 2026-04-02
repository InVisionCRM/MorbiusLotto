import { toBigIntSafe } from '@/lib/safe-bigint';
import type { PokerTableState } from '@/lib/websocket-client';

export type PokerE2ETestApi = {
  setState: (state: PokerTableState) => void;
  clearState: () => void;
  getState: () => PokerTableState | null;
};

declare global {
  interface Window {
    __POKER_E2E_TEST_API?: PokerE2ETestApi;
  }
}

export const POKER_E2E_MOCK_ADDRESS = '0x0000000000000000000000000000000000000001';

type MockAction = 'fold' | 'check' | 'call' | 'bet' | 'raise';

type ApplyMockActionParams = {
  base: PokerTableState | null;
  playerAddress: string | null;
  action: MockAction;
  amount?: string;
};

function getSeatIndex(state: PokerTableState, playerAddress: string | null): number {
  if (!playerAddress) return -1;
  return state.seats.findIndex((s) => s.playerAddress === playerAddress);
}

function withStreetAction(
  state: PokerTableState,
  seatIdx: number,
  action: MockAction,
  amount: string,
  handPatch: Partial<PokerTableState['currentHand']>
): PokerTableState {
  if (!state.currentHand) return state;
  const streetActions = { ...((state.currentHand as any).streetActions ?? {}) };
  streetActions[seatIdx] = { action, amount };
  return {
    ...state,
    currentHand: {
      ...state.currentHand,
      lastAction: { position: seatIdx, action, amount },
      streetActions,
      ...handPatch,
    } as any,
  };
}

export function applyPokerE2EMockAction({
  base,
  playerAddress,
  action,
  amount,
}: ApplyMockActionParams): PokerTableState | null {
  if (!base?.currentHand) return base;
  const seatIdx = getSeatIndex(base, playerAddress);
  if (seatIdx < 0) return base;

  if (action === 'fold') {
    const seats = base.seats.map((s) => ({ ...s }));
    seats[seatIdx].folded = true;
    return withStreetAction(
      { ...base, seats },
      seatIdx,
      'fold',
      '0',
      { actingPosition: null }
    );
  }

  if (action === 'check') {
    return withStreetAction(base, seatIdx, 'check', '0', {
      toCall: '0',
      actingPosition: null,
    });
  }

  if (action === 'call') {
    const seats = base.seats.map((s) => ({ ...s }));
    const seat = seats[seatIdx];
    const toCall = toBigIntSafe(base.currentHand.toCall ?? '0');
    const seatBet = toBigIntSafe(seat.currentBet ?? '0');
    const seatStack = toBigIntSafe(seat.stack ?? '0');
    seat.currentBet = (seatBet + toCall).toString();
    seat.stack = (seatStack > toCall ? seatStack - toCall : 0n).toString();
    return withStreetAction(
      { ...base, seats },
      seatIdx,
      'call',
      toCall.toString(),
      { toCall: '0', actingPosition: null }
    );
  }

  const wager = toBigIntSafe(amount ?? '0');
  const seats = base.seats.map((s) => ({ ...s }));
  const seat = seats[seatIdx];
  const seatStack = toBigIntSafe(seat.stack ?? '0');
  seat.currentBet = wager.toString();
  seat.stack = (seatStack > wager ? seatStack - wager : 0n).toString();
  return withStreetAction(
    { ...base, seats },
    seatIdx,
    action,
    wager.toString(),
    { toCall: '0', actingPosition: null }
  );
}
