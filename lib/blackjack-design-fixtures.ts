/**
 * Static table state for the layout designer.
 *
 * The designer renders the real seat and dealer components, so it needs the
 * same shapes the websocket would deliver — but with no wallet, no socket and
 * no live round. That is the point: it makes the table inspectable on demand
 * instead of only when a game happens to be in progress.
 *
 * Card values are cosmetic here. Nothing in this file reaches the server or
 * influences a real hand.
 */

import type { BJMultiHandObj, BJMultiSeatState, BJMultiTableState } from '@/lib/websocket-client';

/** Card indices are 0–51: `rank = (i % 13) + 1`, `suit = floor(i / 13)`. */
const CARD = {
  aceSpades: 39,
  kingHearts: 12,
  queenSpades: 50,
  queenHearts: 11,
  jackClubs: 36,
  tenDiamonds: 22,
  nineClubs: 34,
  sevenHearts: 6,
  sixDiamonds: 18,
  fourSpades: 42,
} as const;

function hand(cards: number[], total: number, opts: Partial<BJMultiHandObj> = {}): BJMultiHandObj {
  return {
    cards,
    total,
    hasAce: false,
    isBlackjack: false,
    isBust: false,
    betAmount: '25000',
    result: null,
    payout: '0',
    actions: [],
    canHit: true,
    canStand: true,
    canDoubleDown: false,
    canSplit: false,
    ...opts,
  };
}

function seat(
  position: number,
  displayName: string | null,
  hands: BJMultiHandObj[],
  opts: Partial<BJMultiSeatState> = {},
): BJMultiSeatState {
  return {
    position,
    playerAddress: displayName ? `0x${(position + 1).toString().repeat(40).slice(0, 40)}` : null,
    seatStatus: 'active',
    consecutiveTimeouts: 0,
    pendingBet: '0',
    displayName,
    profileImageUrl: null,
    avatarConfig: null,
    profileDisplayMode: 'avatar',
    betAmount: hands.length > 0 ? '25000' : '0',
    hands,
    activeHandIndex: 0,
    result: null,
    payout: '0',
    isActing: false,
    ...opts,
  };
}

/**
 * Scenarios worth being able to look at. Each exercises a different part of the
 * layout — an empty seat, a long hand that stresses card stacking, a split, a
 * bust — so a layout can be judged against the cases that actually break it,
 * not just the tidy one.
 */
export interface DesignScenario {
  id: string;
  name: string;
  description: string;
  state: BJMultiTableState;
}

function table(overrides: Partial<BJMultiTableState>): BJMultiTableState {
  return {
    tableId: 'design-preview',
    status: 'playing',
    minBet: '10000',
    maxBet: '50000',
    seats: [],
    dealerCards: [],
    dealerCardCount: 0,
    dealerTotal: 0,
    dealerHasAce: false,
    currentRoundId: 'design-round',
    actingSeatPosition: null,
    phase: 'playing',
    roundNumber: 11,
    turnStartedAt: null,
    bettingStartedAt: null,
    themeKind: 'image',
    themeId: 'design',
    ...overrides,
  };
}

export const DESIGN_SCENARIOS: DesignScenario[] = [
  {
    id: 'typical',
    name: 'Typical round',
    description: 'Three seated players mid-hand. The everyday case.',
    state: table({
      phase: 'playing',
      actingSeatPosition: 1,
      dealerCards: [CARD.queenHearts, CARD.sevenHearts],
      dealerCardCount: 2,
      dealerTotal: 17,
      seats: [
        seat(0, 'Paige', [hand([CARD.kingHearts, CARD.nineClubs], 19)]),
        seat(1, 'MrTeddyBear', [hand([CARD.queenSpades, CARD.nineClubs], 19)], { isActing: true }),
        seat(2, 'MorbKing', [hand([CARD.tenDiamonds, CARD.sixDiamonds], 16)]),
      ],
    }),
  },
  {
    id: 'empty-seats',
    name: 'Mostly empty',
    description: 'One player, two open seats — checks empty-seat placement.',
    state: table({
      phase: 'betting',
      dealerCards: [],
      dealerCardCount: 0,
      seats: [seat(0, null, []), seat(1, 'MrTeddyBear', [hand([CARD.aceSpades, CARD.kingHearts], 21, { isBlackjack: true, hasAce: true })]), seat(2, null, [])],
    }),
  },
  {
    id: 'long-hands',
    name: 'Long hands',
    description: 'Five-card hands and a five-card dealer — the case that stresses card stacking.',
    state: table({
      phase: 'dealer_turn',
      dealerCards: [CARD.fourSpades, CARD.sixDiamonds, CARD.sevenHearts, CARD.nineClubs, CARD.aceSpades],
      dealerCardCount: 5,
      dealerTotal: 27,
      dealerHasAce: true,
      seats: [
        seat(0, 'Paige', [
          hand([CARD.fourSpades, CARD.sixDiamonds, CARD.nineClubs, CARD.aceSpades, CARD.sevenHearts], 27, { isBust: true }),
        ]),
        seat(1, 'MrTeddyBear', [
          hand([CARD.sixDiamonds, CARD.fourSpades, CARD.sevenHearts, CARD.nineClubs], 26, { isBust: true }),
        ]),
        seat(2, 'MorbKing', [hand([CARD.jackClubs, CARD.queenSpades], 20)]),
      ],
    }),
  },
  {
    id: 'split',
    name: 'Split hand',
    description: 'A player holding two hands at one seat — the widest a seat ever gets.',
    state: table({
      phase: 'playing',
      actingSeatPosition: 1,
      dealerCards: [CARD.aceSpades, CARD.sixDiamonds],
      dealerCardCount: 2,
      dealerTotal: 17,
      dealerHasAce: true,
      seats: [
        seat(0, 'Paige', [hand([CARD.kingHearts, CARD.queenSpades], 20)]),
        seat(
          1,
          'MrTeddyBear',
          [
            hand([CARD.nineClubs, CARD.sevenHearts], 16),
            hand([CARD.nineClubs, CARD.jackClubs], 19),
          ],
          { isActing: true },
        ),
        seat(2, 'MorbKing', [hand([CARD.sevenHearts, CARD.fourSpades, CARD.sixDiamonds], 17)]),
      ],
    }),
  },
];
