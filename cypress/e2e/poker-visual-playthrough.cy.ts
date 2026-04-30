type DemoSeatAction = "check" | "fold" | "raise" | "call";
export {};

type DemoSeat = {
  position: number;
  playerAddress: string;
  stack: string;
  status: "active";
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  folded: boolean;
  currentBet: string;
};

type DemoState = {
  tableId: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: "active" | "waiting";
  seats: DemoSeat[];
  currentHand: null | {
    handId: string;
    street: "preflop" | "flop" | "turn" | "river" | "showdown";
    communityCards: number[];
    pot: string;
    actingPosition: number | null;
    lastAction: null | { position: number; action: DemoSeatAction; amount: string };
    minRaise: string;
    toCall: string;
    turnStartedAt: string | null;
    streetActions?: Record<number, { action: DemoSeatAction; amount: string }>;
    showdownHands?: Record<string, number[]>;
    handWentToShowdown?: boolean;
    winners?: Array<{ address: string; amount: string; handName: string }>;
  };
  myHoleCards: number[] | null;
};

const WEI = 10n ** 18n;
const toWei = (v: bigint | number) => (BigInt(v) * WEI).toString();
const addr = (i: number) => `0x${(i + 1).toString(16).padStart(40, "0")}`;
const SHOWDOWN_FOLDED_POSITIONS = [2, 4, 8];

function buildBaseSeats(dealerPos: number): DemoSeat[] {
  return Array.from({ length: 10 }, (_, i) => ({
    position: i,
    playerAddress: addr(i).toLowerCase(),
    stack: toWei(10000),
    status: "active",
    isDealer: i === dealerPos,
    isSmallBlind: i === ((dealerPos + 1) % 10),
    isBigBlind: i === ((dealerPos + 2) % 10),
    isActing: false,
    folded: false,
    currentBet: toWei(0),
  }));
}

function buildShowdownHands(communityCards: number[]): Record<string, number[]> {
  const blocked = new Set<number>(communityCards);
  const available: number[] = [];
  for (let c = 0; c < 52; c += 1) {
    if (!blocked.has(c)) available.push(c);
  }
  const showdownHands: Record<string, number[]> = {};
  for (let i = 0; i < 10; i += 1) {
    const first = available[i * 2];
    const second = available[(i * 2) + 1];
    showdownHands[addr(i).toLowerCase()] = [first, second];
  }
  return showdownHands;
}

function stateFor(args: {
  handId: string;
  dealerPos: number;
  street: "preflop" | "flop" | "turn" | "river" | "showdown";
  pot: number;
  communityCards: number[];
  actingPosition: number | null;
  lastAction: { position: number; action: DemoSeatAction; amount?: number } | null;
  folded: number[];
  bets: Record<number, number>;
  streetActions?: Record<number, { action: DemoSeatAction; amount: number }>;
  showdownHands?: Record<string, number[]>;
  handWentToShowdown?: boolean;
  winners?: Array<{ address: string; amount: number; handName: string }>;
  waiting?: boolean;
}): DemoState {
  const seats = buildBaseSeats(args.dealerPos);

  args.folded.forEach((idx) => {
    seats[idx].folded = true;
  });

  Object.entries(args.bets).forEach(([k, amt]) => {
    const idx = Number(k);
    seats[idx].currentBet = toWei(amt);
  });

  if (args.actingPosition != null) {
    seats[args.actingPosition].isActing = true;
  }

  return {
    tableId: "visual-playthrough",
    smallBlind: toWei(10),
    bigBlind: toWei(20),
    maxSeats: 10,
    status: args.waiting ? "waiting" : "active",
    seats,
    currentHand: args.waiting
      ? null
      : {
          handId: args.handId,
          street: args.street,
          communityCards: args.communityCards,
          pot: toWei(args.pot),
          actingPosition: args.actingPosition,
          lastAction: args.lastAction
            ? {
                position: args.lastAction.position,
                action: args.lastAction.action,
                amount: toWei(args.lastAction.amount ?? 0),
              }
            : null,
          minRaise: toWei(200),
          toCall: toWei(0),
          turnStartedAt: args.actingPosition != null ? new Date().toISOString() : null,
          streetActions: Object.fromEntries(
            Object.entries(args.streetActions ?? {}).map(([k, v]) => [
              Number(k),
              { action: v.action, amount: toWei(v.amount) },
            ]),
          ),
          showdownHands: args.showdownHands,
          ...(typeof args.handWentToShowdown === 'boolean'
            ? { handWentToShowdown: args.handWentToShowdown }
            : {}),
          winners: args.winners?.map((w) => ({
            address: w.address.toLowerCase(),
            amount: toWei(w.amount),
            handName: w.handName,
          })),
        },
    myHoleCards: [1, 14],
  };
}

describe("Poker visual playthrough", () => {
  it("plays slowed full-flow hands for manual inspection", () => {
    const env = (Cypress.config("env") ?? {}) as Record<string, unknown>;
    const handsRaw = Number(typeof env.POKER_VISUAL_HANDS === "string" ? env.POKER_VISUAL_HANDS : 5);
    const hands = Number.isFinite(handsRaw) ? Math.max(1, Math.min(10, Math.floor(handsRaw))) : 5;
    const delayRaw = Number(typeof env.POKER_VISUAL_STEP_DELAY_MS === "string" ? env.POKER_VISUAL_STEP_DELAY_MS : 900);
    const handSecondsRaw = Number(typeof env.POKER_VISUAL_HAND_SECONDS === "string" ? env.POKER_VISUAL_HAND_SECONDS : 0);
    const transitionsPerHand = 26;
    const computedFromHandSeconds =
      Number.isFinite(handSecondsRaw) && handSecondsRaw > 0
        ? Math.floor((handSecondsRaw * 1000) / transitionsPerHand)
        : 0;
    const stepDelay = Number.isFinite(computedFromHandSeconds) && computedFromHandSeconds > 0
      ? Math.max(250, computedFromHandSeconds)
      : (Number.isFinite(delayRaw) ? Math.max(250, Math.floor(delayRaw)) : 900);

    cy.visit("/poker/e2e-table?e2eMock=1");
    cy.window().its("__POKER_E2E_TEST_API").should("exist");

    for (let handNo = 1; handNo <= hands; handNo += 1) {
      const dealerPos = (handNo + 1) % 10;
      const handId = `visual-hand-${handNo}`;

      cy.log(`Hand ${handNo}/${hands}: table set`);
      const seated = stateFor({
        handId,
        dealerPos,
        street: "preflop",
        pot: 1200,
        communityCards: [],
        actingPosition: 0,
        lastAction: { position: 9, action: "check", amount: 0 },
        folded: [],
        bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200, 8: 200 },
      });
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(seated as any));
      cy.contains("10/10 seats").should("be.visible");
      cy.wait(stepDelay);

      const preflopActions = [
        { pos: 0, action: "raise" as const, amt: 200, folded: [] as number[] },
        { pos: 1, action: "call" as const, amt: 200, folded: [] as number[] },
        { pos: 2, action: "fold" as const, amt: 0, folded: [2] },
        { pos: 3, action: "call" as const, amt: 200, folded: [2] },
        { pos: 4, action: "fold" as const, amt: 0, folded: [2, 4] },
        { pos: 5, action: "call" as const, amt: 200, folded: [2, 4] },
        { pos: 6, action: "call" as const, amt: 200, folded: [2, 4] },
        { pos: 7, action: "check" as const, amt: 0, folded: [2, 4] },
        { pos: 8, action: "call" as const, amt: 200, folded: [2, 4] },
        { pos: 9, action: "check" as const, amt: 0, folded: [2, 4] },
      ];
      preflopActions.forEach((a, idx) => {
        const s = stateFor({
          handId,
          dealerPos,
          street: "preflop",
          pot: 1200,
          communityCards: [],
          actingPosition: (idx + 1) % 10,
          lastAction: { position: a.pos, action: a.action, amount: a.amt },
          folded: a.folded,
          bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200, 8: 200 },
          streetActions: { [a.pos]: { action: a.action, amount: a.amt } },
        });
        cy.log(`Hand ${handNo}/${hands}: pre-flop ${a.action} seat ${a.pos + 1}`);
        cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(s as any));
        cy.wait(stepDelay);
      });

      const flop = stateFor({
        handId,
        dealerPos,
        street: "flop",
        pot: 1800,
        communityCards: [0, 13, 26],
        actingPosition: 3,
        lastAction: { position: 1, action: "check", amount: 0 },
        folded: [2, 4],
        bets: {},
      });
      cy.log(`Hand ${handNo}/${hands}: flop`);
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(flop as any));
      cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 3);
      cy.wait(stepDelay);

      const flopActions = [
        { pos: 3, action: "check" as const, amt: 0 },
        { pos: 5, action: "bet" as const, amt: 400 },
        { pos: 6, action: "call" as const, amt: 400 },
        { pos: 0, action: "call" as const, amt: 400 },
      ];
      flopActions.forEach((a, idx) => {
        const s = stateFor({
          handId,
          dealerPos,
          street: "flop",
          pot: 2200 + (idx * 200),
          communityCards: [0, 13, 26],
          actingPosition: (a.pos + 1) % 10,
          lastAction: { position: a.pos, action: a.action as DemoSeatAction, amount: a.amt },
          folded: [2, 4, 8],
          bets: {},
          streetActions: { [a.pos]: { action: a.action as DemoSeatAction, amount: a.amt } },
        });
        cy.log(`Hand ${handNo}/${hands}: flop ${a.action} seat ${a.pos + 1}`);
        cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(s as any));
        cy.wait(stepDelay);
      });

      const turn = stateFor({
        handId,
        dealerPos,
        street: "turn",
        pot: 2200,
        communityCards: [0, 13, 26, 39],
        actingPosition: 6,
        lastAction: { position: 3, action: "raise", amount: 400 },
        folded: [2, 4, 8],
        bets: {},
      });
      cy.log(`Hand ${handNo}/${hands}: turn`);
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(turn as any));
      cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 4);
      cy.wait(stepDelay);

      const turnActions = [
        { pos: 6, action: "check" as const, amt: 0 },
        { pos: 0, action: "bet" as const, amt: 600 },
        { pos: 3, action: "call" as const, amt: 600 },
      ];
      turnActions.forEach((a) => {
        const s = stateFor({
          handId,
          dealerPos,
          street: "turn",
          pot: 2600,
          communityCards: [0, 13, 26, 39],
          actingPosition: (a.pos + 1) % 10,
          lastAction: { position: a.pos, action: a.action as DemoSeatAction, amount: a.amt },
          folded: [2, 4, 8],
          bets: {},
          streetActions: { [a.pos]: { action: a.action as DemoSeatAction, amount: a.amt } },
        });
        cy.log(`Hand ${handNo}/${hands}: turn ${a.action} seat ${a.pos + 1}`);
        cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(s as any));
        cy.wait(stepDelay);
      });

      const river = stateFor({
        handId,
        dealerPos,
        street: "river",
        pot: 3000,
        communityCards: [0, 13, 26, 39, 12],
        actingPosition: 0,
        lastAction: { position: 6, action: "check", amount: 0 },
        folded: [2, 4, 8],
        bets: {},
      });
      cy.log(`Hand ${handNo}/${hands}: river`);
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(river as any));
      cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 5);
      cy.wait(stepDelay);

      const riverActions = [
        { pos: 0, action: "check" as const, amt: 0 },
        { pos: 3, action: "bet" as const, amt: 800 },
        { pos: 6, action: "call" as const, amt: 800 },
      ];
      riverActions.forEach((a) => {
        const s = stateFor({
          handId,
          dealerPos,
          street: "river",
          pot: 3000,
          communityCards: [0, 13, 26, 39, 12],
          actingPosition: (a.pos + 1) % 10,
          lastAction: { position: a.pos, action: a.action as DemoSeatAction, amount: a.amt },
          folded: [2, 4, 8],
          bets: {},
          streetActions: { [a.pos]: { action: a.action as DemoSeatAction, amount: a.amt } },
        });
        cy.log(`Hand ${handNo}/${hands}: river ${a.action} seat ${a.pos + 1}`);
        cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(s as any));
        cy.wait(stepDelay);
      });

      const showdownCommunity = [0, 13, 26, 39, 12];
      const showdownHands = buildShowdownHands(showdownCommunity);
      const activeWinnerPositions = Array.from({ length: 10 }, (_, i) => i).filter(
        (position) => !SHOWDOWN_FOLDED_POSITIONS.includes(position)
      );
      const winnerPos = activeWinnerPositions[handNo % activeWinnerPositions.length];
      const showdown = stateFor({
        handId,
        dealerPos,
        street: "showdown",
        pot: 3000,
        communityCards: showdownCommunity,
        actingPosition: null,
        lastAction: { position: 0, action: "call", amount: 400 },
        folded: SHOWDOWN_FOLDED_POSITIONS,
        bets: {},
        showdownHands,
        handWentToShowdown: true,
        winners: [{ address: addr(winnerPos), amount: 3000, handName: "Two pair" }],
      });
      cy.log(`Hand ${handNo}/${hands}: showdown`);
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(showdown as any));
      cy.get('[data-testid="poker-winner-banner"]').should("exist");
      cy.wait(stepDelay);

      const waiting = stateFor({
        handId,
        dealerPos,
        street: "showdown",
        pot: 0,
        communityCards: [],
        actingPosition: null,
        lastAction: null,
        folded: [],
        bets: {},
        waiting: true,
      });
      cy.log(`Hand ${handNo}/${hands}: reset`);
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(waiting as any));
      cy.get('[data-testid="poker-winner-banner"]').should("not.exist");
      cy.wait(stepDelay);
    }
  });
});
