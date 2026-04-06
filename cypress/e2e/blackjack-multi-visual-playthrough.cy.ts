export {};

type BJPhase = 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed';

type BJHand = {
  cards: number[];
  total: number;
  hasAce: boolean;
  isBlackjack: boolean;
  isBust: boolean;
  betAmount: string;
  result?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  payout: string;
  actions: any[];
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
};

type BJSeat = {
  position: number;
  playerAddress: string | null;
  seatStatus: 'active' | 'sitting_out';
  consecutiveTimeouts: number;
  pendingBet: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: any | null;
  betAmount: string;
  hands: BJHand[];
  activeHandIndex: number;
  result?: string | null;
  payout: string;
  isActing: boolean;
};

type BJState = {
  tableId: string;
  status: string;
  minBet: string;
  maxBet: string;
  seats: BJSeat[];
  dealerCards: number[];
  dealerCardCount: number;
  dealerTotal: number;
  dealerHasAce: boolean;
  currentRoundId: string | null;
  actingSeatPosition: number | null;
  phase: BJPhase;
  roundNumber: number;
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  themeKind: 'video' | 'image';
  themeId: string;
  stateVersion?: number;
  viewerCount?: number;
};

const WEI = 10n ** 18n;
const toWei = (n: number) => (BigInt(n) * WEI).toString();
const addr = (i: number) => `0x${(i + 1).toString(16).padStart(40, '0')}`.toLowerCase();

function hand(cards: number[], bet = 2000, result: BJHand['result'] = null, payout = 0): BJHand {
  const hard = cards.reduce((s, c) => {
    const rank = (c % 13) + 1;
    if (rank === 1) return s + 11;
    if (rank >= 10) return s + 10;
    return s + rank;
  }, 0);
  const hasAce = cards.some((c) => (c % 13) + 1 === 1);
  const total = hasAce && hard > 21 ? hard - 10 : hard;
  return {
    cards,
    total,
    hasAce,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: total > 21,
    betAmount: toWei(bet),
    result,
    payout: toWei(payout),
    actions: [],
    canHit: false,
    canStand: false,
    canDoubleDown: false,
    canSplit: false,
  };
}

function stateFor(args: {
  handNo: number;
  phase: BJPhase;
  acting: number | null;
  dealerCards: number[];
  seats: BJSeat[];
}): BJState {
  const dc = args.dealerCards;
  const hasAce = dc.some((c) => (c % 13) + 1 === 1);
  const raw = dc.reduce((s, c) => {
    const rank = (c % 13) + 1;
    if (rank === 1) return s + 11;
    if (rank >= 10) return s + 10;
    return s + rank;
  }, 0);
  return {
    tableId: 'e2e-table',
    status: 'active',
    minBet: toWei(100),
    maxBet: toWei(5000),
    seats: args.seats.map((s) => ({ ...s, isActing: args.acting === s.position })),
    dealerCards: dc,
    dealerCardCount: dc.length,
    dealerTotal: hasAce && raw > 21 ? raw - 10 : raw,
    dealerHasAce: hasAce,
    currentRoundId: `round-${args.handNo}`,
    actingSeatPosition: args.acting,
    phase: args.phase,
    roundNumber: args.handNo,
    turnStartedAt: args.phase === 'playing' && args.acting != null ? new Date().toISOString() : null,
    bettingStartedAt: args.phase === 'betting' ? new Date().toISOString() : null,
    themeKind: 'video',
    themeId: 'glowingTable',
    viewerCount: 1,
  };
}

describe('Blackjack multi visual playthrough', () => {
  it('plays super-slow multiplayer flow for manual review', function () {
    this.timeout(60 * 60 * 1000);

    const env = (Cypress.config('env') ?? {}) as Record<string, unknown>;
    const handsRaw = Number(typeof env.BJ_VISUAL_HANDS === 'string' ? env.BJ_VISUAL_HANDS : 5);
    const hands = Number.isFinite(handsRaw) ? Math.max(1, Math.min(10, Math.floor(handsRaw))) : 5;
    const handSecondsRaw = Number(typeof env.BJ_VISUAL_HAND_SECONDS === 'string' ? env.BJ_VISUAL_HAND_SECONDS : 84);
    const handSeconds = Number.isFinite(handSecondsRaw) ? Math.max(20, Math.floor(handSecondsRaw)) : 84;
    const transitionsPerHand = 14;
    const stepDelay = Math.max(500, Math.floor((handSeconds * 1000) / transitionsPerHand));

    cy.visit('/blackjack-multi/e2e-table?e2eMock=1');
    cy.window().its('__BJ_MULTI_E2E_TEST_API').should('exist');

    for (let i = 1; i <= hands; i += 1) {
      const seatsBase: BJSeat[] = [
        {
          position: 0,
          playerAddress: addr(0),
          seatStatus: 'active',
          consecutiveTimeouts: 0,
          pendingBet: toWei(2000),
          displayName: 'Player 1',
          betAmount: toWei(0),
          hands: [],
          activeHandIndex: 0,
          result: null,
          payout: toWei(0),
          isActing: false,
        },
        {
          position: 1,
          playerAddress: addr(1),
          seatStatus: 'active',
          consecutiveTimeouts: 0,
          pendingBet: toWei(2000),
          displayName: 'Player 2',
          betAmount: toWei(0),
          hands: [],
          activeHandIndex: 0,
          result: null,
          payout: toWei(0),
          isActing: false,
        },
        {
          position: 2,
          playerAddress: addr(2),
          seatStatus: 'active',
          consecutiveTimeouts: 0,
          pendingBet: toWei(2000),
          displayName: 'Player 3',
          betAmount: toWei(0),
          hands: [],
          activeHandIndex: 0,
          result: null,
          payout: toWei(0),
          isActing: false,
        },
      ];

      cy.log(`Hand ${i}/${hands}: betting`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'betting', acting: null, dealerCards: [], seats: seatsBase }) as any
        )
      );
      cy.get('[data-bj-multi-phase=betting]').should('exist');
      cy.wait(stepDelay);

      const playing0 = seatsBase.map((s) => ({ ...s, pendingBet: '0', betAmount: toWei(2000), hands: [hand([0 + s.position, 9 + s.position])] }));
      cy.log(`Hand ${i}/${hands}: player 1 turn`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'playing', acting: 0, dealerCards: [12, 25], seats: playing0 }) as any
        )
      );
      cy.get('[data-bj-multi-phase=playing]').should('exist');
      cy.wait(stepDelay);

      const playing1 = playing0.map((s, idx) =>
        idx === 0 ? { ...s, hands: [hand([0, 9, 18])] } : s
      );
      cy.log(`Hand ${i}/${hands}: player 2 turn`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'playing', acting: 1, dealerCards: [12, 25], seats: playing1 }) as any
        )
      );
      cy.wait(stepDelay);

      const playing2 = playing1.map((s, idx) =>
        idx === 1 ? { ...s, hands: [hand([1, 10, 19])] } : s
      );
      cy.log(`Hand ${i}/${hands}: player 3 turn`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'playing', acting: 2, dealerCards: [12, 25], seats: playing2 }) as any
        )
      );
      cy.wait(stepDelay);

      const dealerTurn = playing2.map((s, idx) =>
        idx === 2 ? { ...s, hands: [hand([2, 11, 20])] } : s
      );
      cy.log(`Hand ${i}/${hands}: dealer turn`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'dealer_turn', acting: null, dealerCards: [12, 25, 38], seats: dealerTurn }) as any
        )
      );
      cy.get('[data-bj-multi-phase=dealer_turn]').should('exist');
      cy.wait(stepDelay);

      const completed = dealerTurn.map((s, idx) => {
        if (idx === 0) return { ...s, hands: [hand([0, 9, 18], 2000, 'loss', 0)], result: 'loss', payout: toWei(0) };
        if (idx === 1) return { ...s, hands: [hand([1, 10, 19], 2000, 'push', 2000)], result: 'push', payout: toWei(2000) };
        return { ...s, hands: [hand([2, 11, 20], 2000, 'win', 4000)], result: 'win', payout: toWei(4000) };
      });
      cy.log(`Hand ${i}/${hands}: round complete`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i, phase: 'completed', acting: null, dealerCards: [12, 25, 38], seats: completed }) as any
        )
      );
      cy.get('[data-bj-multi-phase=completed]').should('exist');
      cy.wait(stepDelay);

      cy.log(`Hand ${i}/${hands}: reset`);
      cy.window().then((win) =>
        win.__BJ_MULTI_E2E_TEST_API?.setState(
          stateFor({ handNo: i + 1, phase: 'betting', acting: null, dealerCards: [], seats: seatsBase }) as any
        )
      );
      cy.get('[data-bj-multi-phase=betting]').should('exist');
      cy.wait(stepDelay);
    }
  });
});
