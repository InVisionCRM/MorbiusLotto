type MockSeat = {
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

const WEI = 10n ** 18n;
const toWei = (n: number | bigint) => (BigInt(n) * WEI).toString();
const addr = (i: number) => `0x${(i + 1).toString(16).padStart(40, "0")}`.toLowerCase();

function baseState(toCall: number) {
  const seats: MockSeat[] = Array.from({ length: 10 }, (_, i) => ({
    position: i,
    playerAddress: addr(i),
    stack: toWei(10000),
    status: "active",
    isDealer: i === 2,
    isSmallBlind: i === 8,
    isBigBlind: i === 9,
    isActing: i === 0,
    folded: false,
    currentBet: toWei(0),
  }));

  return {
    tableId: "e2e-table",
    smallBlind: toWei(10),
    bigBlind: toWei(20),
    maxSeats: 10,
    status: "active",
    seats,
    currentHand: {
      handId: "controls-test",
      street: "preflop",
      communityCards: [],
      pot: toWei(300),
      actingPosition: 0,
      lastAction: null,
      minRaise: toWei(200),
      toCall: toWei(toCall),
      turnStartedAt: new Date().toISOString(),
      streetActions: {},
    },
    myHoleCards: [1, 14],
  };
}

describe("Poker action controls (live table mock mode)", () => {
  it("applies fold/check/call/raise via real controls", () => {
    cy.visit("/poker/e2e-table?e2eMock=1");
    cy.window().its("__POKER_E2E_TEST_API").should("exist");

    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(baseState(100) as any));

    cy.get('[data-testid="poker-action-secondary"]:visible').should("contain.text", "Call");
    cy.get('[data-testid="poker-action-fold"]:visible').click();
    cy.window().then((win) => {
      const state = win.__POKER_E2E_TEST_API?.getState() as any;
      expect(state.seats[0].folded).to.equal(true);
      expect(state.currentHand.lastAction.action).to.equal("fold");
    });

    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(baseState(0) as any));
    cy.get('[data-testid="poker-action-secondary"]:visible').should("contain.text", "Check");
    cy.get('[data-testid="poker-action-secondary"]:visible').click();
    cy.window().then((win) => {
      const state = win.__POKER_E2E_TEST_API?.getState() as any;
      expect(state.currentHand.lastAction.action).to.equal("check");
      expect(state.currentHand.toCall).to.equal("0");
    });

    cy.window().then((win) => win.__POKER_E2E_TEST_API?.setState(baseState(100) as any));
    cy.get('[data-testid="poker-quick-size-min"]:visible').click();
    cy.get('[data-testid="poker-action-primary"]:visible').click();
    cy.window().then((win) => {
      const state = win.__POKER_E2E_TEST_API?.getState() as any;
      expect(state.currentHand.lastAction.action).to.equal("raise");
      expect(state.currentHand.lastAction.amount).to.equal(toWei(200).toString());
      expect(state.currentHand.toCall).to.equal("0");
    });
  });
});
