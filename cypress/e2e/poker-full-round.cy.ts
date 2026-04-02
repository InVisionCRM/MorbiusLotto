type DemoSeatAction = "check" | "fold" | "raise" | "call";

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
    winners?: Array<{ address: string; amount: string; handName: string }>;
  };
  myHoleCards: number[] | null;
};

const WEI = 10n ** 18n;
const toWei = (v: bigint | number) => (BigInt(v) * WEI).toString();
const addr = (i: number) => `0x${(i + 1).toString(16).padStart(40, "0")}`;
const HERO = addr(0).toLowerCase();

function buildBaseSeats(): DemoSeat[] {
  return Array.from({ length: 10 }, (_, i) => ({
    position: i,
    playerAddress: addr(i).toLowerCase(),
    stack: toWei(10000),
    status: "active",
    isDealer: i === 2,
    isSmallBlind: i === 8,
    isBigBlind: i === 9,
    isActing: false,
    folded: false,
    currentBet: toWei(0),
  }));
}

function stateFor(args: {
  street: "preflop" | "flop" | "turn" | "river" | "showdown";
  pot: number;
  communityCards: number[];
  actingPosition: number | null;
  lastAction: { position: number; action: DemoSeatAction; amount?: number } | null;
  folded: number[];
  bets: Record<number, number>;
  streetActions?: Record<number, { action: DemoSeatAction; amount: number }>;
  showdownHands?: Record<string, number[]>;
  winners?: Array<{ address: string; amount: number; handName: string }>;
  waiting?: boolean;
}): DemoState {
  const seats = buildBaseSeats();

  args.folded.forEach((idx) => {
    seats[idx].folded = true;
  });

  Object.entries(args.bets).forEach(([k, amt]) => {
    const idx = Number(k);
    seats[idx].currentBet = toWei(amt);
    const baseStack = 10000n;
    seats[idx].stack = toWei(baseStack - BigInt(amt));
  });

  if (args.actingPosition != null) {
    seats[args.actingPosition].isActing = true;
  }

  const winner = args.winners?.[0];
  if (winner) {
    const winnerSeat = seats.find((s) => s.playerAddress === winner.address.toLowerCase());
    if (winnerSeat) {
      winnerSeat.stack = toWei(13000);
    }
  }

  return {
    tableId: "demo",
    smallBlind: toWei(10),
    bigBlind: toWei(20),
    maxSeats: 10,
    status: args.waiting ? "waiting" : "active",
    seats,
    currentHand: args.waiting
      ? null
      : {
          handId: "cypress-full-round",
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
          winners: args.winners?.map((w) => ({
            address: w.address.toLowerCase(),
            amount: toWei(w.amount),
            handName: w.handName,
          })),
        },
    myHoleCards: [1, 14],
  };
}

describe("Poker full round (10 players, mocked)", () => {
  it("runs a complete hold'em hand and returns to waiting", () => {
    cy.visit("/poker/e2e-table?e2eMock=1");
    cy.window().its("__POKER_E2E_TEST_API").should("exist");

    const seated = stateFor({
      street: "preflop",
      pot: 0,
      communityCards: [],
      actingPosition: 0,
      lastAction: null,
      folded: [],
      bets: {},
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(seated as any));
    cy.wait(300);

    cy.contains("10/10 seats").should("be.visible");
    cy.get('[data-testid="poker-seat-0"]').should("exist");
    cy.get('[data-testid="poker-seat-9"]').should("exist");

    const preflopStates = [
      { pos: 0, action: "raise" as const, folded: [] as number[], bets: { 0: 200 } },
      { pos: 1, action: "call" as const, folded: [] as number[], bets: { 0: 200, 1: 200 } },
      { pos: 2, action: "fold" as const, folded: [2], bets: { 0: 200, 1: 200 } },
      { pos: 3, action: "call" as const, folded: [2], bets: { 0: 200, 1: 200, 3: 200 } },
      { pos: 4, action: "fold" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200 } },
      { pos: 5, action: "call" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200, 5: 200 } },
      { pos: 6, action: "call" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200 } },
      { pos: 7, action: "check" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200 } },
      { pos: 8, action: "call" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200, 8: 200 } },
      { pos: 9, action: "check" as const, folded: [2, 4], bets: { 0: 200, 1: 200, 3: 200, 5: 200, 6: 200, 8: 200 } },
    ];

    preflopStates.forEach((step, index) => {
      cy.log(`Pre-flop action ${index + 1}: seat ${step.pos + 1} ${step.action}`);
      const s = stateFor({
        street: "preflop",
        pot: 1200,
        communityCards: [],
        actingPosition: (step.pos + 1) % 10,
        lastAction: { position: step.pos, action: step.action, amount: 200 },
        folded: step.folded,
        bets: step.bets,
        streetActions: {
          [step.pos]: { action: step.action, amount: 200 },
        },
      });
      cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(s as any));
      cy.get(`[data-testid="poker-seat-action-${step.pos}"]`).should("contain.text", step.action === "raise" ? "Raised" : step.action === "fold" ? "Folded" : step.action === "check" ? "Checked" : "Called");
      cy.wait(150);
    });

    cy.log("Flop");
    const flop = stateFor({
      street: "flop",
      pot: 1800,
      communityCards: [0, 13, 26],
      actingPosition: 3,
      lastAction: { position: 1, action: "check", amount: 0 },
      folded: [2, 4],
      bets: {},
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(flop as any));
    cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 3);
    cy.wait(350);

    cy.log("Turn");
    const turn = stateFor({
      street: "turn",
      pot: 2200,
      communityCards: [0, 13, 26, 39],
      actingPosition: 6,
      lastAction: { position: 3, action: "raise", amount: 400 },
      folded: [2, 4, 8],
      bets: {},
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(turn as any));
    cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 4);
    cy.wait(350);

    cy.log("River");
    const river = stateFor({
      street: "river",
      pot: 3000,
      communityCards: [0, 13, 26, 39, 12],
      actingPosition: 0,
      lastAction: { position: 6, action: "check", amount: 0 },
      folded: [2, 4, 8],
      bets: {},
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(river as any));
    cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 5);
    cy.wait(350);

    const showdownHands: Record<string, number[]> = {};
    for (let i = 0; i < 10; i += 1) {
      showdownHands[addr(i).toLowerCase()] = [i, i + 13];
    }

    cy.log("Showdown + winners + pot distribution");
    const showdown = stateFor({
      street: "showdown",
      pot: 3000,
      communityCards: [0, 13, 26, 39, 12],
      actingPosition: null,
      lastAction: { position: 0, action: "call", amount: 400 },
      folded: [2, 4, 8],
      bets: {},
      showdownHands,
      winners: [{ address: addr(3), amount: 3000, handName: "Two pair" }],
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(showdown as any));

    cy.get('[data-testid="poker-winner-banner"]').should("exist");
    cy.get('[data-testid="poker-winner-banner"]').should("contain.text", "wins");
    cy.get('[data-testid="poker-winner-banner"]')
      .invoke("text")
      .should((text) => {
        const normalized = text.replace(/\s+/g, "");
        expect(normalized).to.match(/\+(3,000|3K)/i);
      });
    cy.wait(500);
    cy.get('[data-testid="poker-seat-cards-0"] img[alt*=" of "]').should("have.length", 2);
    cy.get('img[alt*=" of "]').should("have.length.at.least", 25);

    cy.log("Round ends -> waiting state");
    const waiting = stateFor({
      street: "showdown",
      pot: 0,
      communityCards: [],
      actingPosition: null,
      lastAction: null,
      folded: [],
      bets: {},
      waiting: true,
    });
    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(waiting as any));

    cy.get('[data-testid="poker-winner-banner"]').should("not.exist");
    cy.get('[data-testid="poker-community-cards"] img[alt*=" of "]').should("have.length", 0);
    cy.contains("Morbius").should("be.visible");
    cy.wait(300);
  });
});
