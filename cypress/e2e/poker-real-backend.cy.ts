import { BlackjackWebSocketClient } from "../../lib/websocket-client";
import type { PokerTableState } from "../../lib/websocket-client";

const CHIP_WEI = 10n ** 15n; // default server poker chip size
const SMALL_BLIND = CHIP_WEI.toString();
const BIG_BLIND = (CHIP_WEI * 2n).toString();
const MIN_BUYIN = (BigInt(BIG_BLIND) * 40n).toString(); // server min 40bb

function getActorAddress(state: PokerTableState): string {
  const actingPos = state.currentHand?.actingPosition;
  if (actingPos == null) throw new Error("No acting position in current hand");
  const seat = state.seats[actingPos];
  if (!seat?.playerAddress) throw new Error("Acting seat has no player address");
  return seat.playerAddress.toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envString(env: Record<string, unknown>, key: string): string {
  const direct = env[key];
  if (typeof direct === "string") return direct;
  const lower = env[key.toLowerCase()];
  if (typeof lower === "string") return lower;
  const upper = env[key.toUpperCase()];
  if (typeof upper === "string") return upper;
  return "";
}

describe("Poker real backend (WebSocket)", () => {
  it("supports 2-10 players and auto-plays 1-10 hands", () => {
    const clients: BlackjackWebSocketClient[] = [];
    const clientByAddress = new Map<string, BlackjackWebSocketClient>();
    let tableId = "";
    let wsUrl = "ws://localhost:8081";
    let adminA = "0x2775dd8242c4f589536113475b7c80f42ab4a70a";
    let adminB = "0x70444750eedf1b2c9b777cbf096a5919a14895e5";
    let tableCreator = adminA;
    let players: string[] = [adminA, adminB];
    let handCount = 1;
    let keepTable = false;
    let observeMs = 0;

    cy.then(() => {
      const env = (Cypress.config("env") ?? {}) as Record<string, unknown>;
      wsUrl = (envString(env, "POKER_WS_URL") || wsUrl).trim();
      adminA = (envString(env, "POKER_TEST_ADMIN_A") || adminA).trim().toLowerCase();
      adminB = (envString(env, "POKER_TEST_ADMIN_B") || adminB).trim().toLowerCase();

      const creatorOverride = envString(env, "POKER_TEST_TABLE_CREATOR");
      tableCreator = (creatorOverride || adminA).trim().toLowerCase();

      const playersCsv = envString(env, "POKER_TEST_PLAYERS");
      if (playersCsv.trim()) {
        players = playersCsv
          .split(",")
          .map((a) => a.trim().toLowerCase())
          .filter((a) => /^0x[a-f0-9]{40}$/i.test(a));
      }
      if (players.length < 2) throw new Error("Need at least 2 valid addresses in POKER_TEST_PLAYERS");
      if (players.length > 10) players = players.slice(0, 10);
      if (!players.includes(tableCreator)) players = [tableCreator, ...players].slice(0, 10);

      const handsRaw = Number(envString(env, "POKER_TEST_HANDS") || 1);
      handCount = Number.isFinite(handsRaw) ? Math.max(1, Math.min(10, Math.floor(handsRaw))) : 1;

      const keepTableRaw = (envString(env, "POKER_TEST_KEEP_TABLE") || "false").toLowerCase();
      keepTable = keepTableRaw === "true" || keepTableRaw === "1" || keepTableRaw === "yes";

      const observeRaw = Number(envString(env, "POKER_TEST_OBSERVE_MS") || 0);
      observeMs = Number.isFinite(observeRaw) ? Math.max(0, Math.floor(observeRaw)) : 0;
    });

    cy.then({ timeout: 120000 }, async () => {
      for (const addr of players) {
        const client = new BlackjackWebSocketClient(wsUrl, addr);
        await client.connect();
        clients.push(client);
        clientByAddress.set(addr, client);
      }
    });

    cy.then(async () => {
      const creatorClient = clientByAddress.get(tableCreator);
      if (!creatorClient) throw new Error("table creator client missing");
      const created = await creatorClient.pokerCreateTable(SMALL_BLIND, BIG_BLIND, players.length);
      tableId = created.tableId;
      expect(tableId).to.be.a("string").and.not.equal("");

      const state = await creatorClient.pokerGetState(tableId);
      expect(state.maxSeats, "server maxSeats should match requested player count").to.equal(players.length);
    });

    cy.then({ timeout: 120000 }, async () => {
      for (const addr of players) {
        const client = clientByAddress.get(addr);
        if (!client) throw new Error(`client missing for ${addr}`);
        await client.pokerJoinTable(tableId, MIN_BUYIN);
      }
    });

    cy.then({ timeout: 600000 }, async () => {
      const observer = clients[0];
      if (!observer) throw new Error("observer client missing");

      const seenHandIds = new Set<string>();
      for (let handIndex = 0; handIndex < handCount; handIndex++) {
        const handStart = Date.now();
        let state = await observer.pokerGetState(tableId);
        while (!state.currentHand || seenHandIds.has(state.currentHand.handId)) {
          if (Date.now() - handStart > 30000) throw new Error(`Hand ${handIndex + 1} did not start in time`);
          await sleep(300);
          state = await observer.pokerGetState(tableId);
        }

        const handId = state.currentHand.handId;
        seenHandIds.add(handId);
        let actions = 0;
        let handDone = false;

        while (!handDone) {
          state = await observer.pokerGetState(tableId);
          if (!state.currentHand || state.currentHand.handId !== handId) {
            handDone = true;
            break;
          }

          if (state.currentHand.street === "showdown" && (state.currentHand.winners?.length ?? 0) > 0) {
            const winners = state.currentHand.winners!.map((w) => w.address.toLowerCase());
            const hasKnownWinner = winners.some((w) => players.includes(w));
            expect(hasKnownWinner, `hand ${handIndex + 1} winner must be one of test players`).to.equal(true);
            expect(BigInt(state.currentHand.pot) >= 0n, `hand ${handIndex + 1} pot must be non-negative`).to.equal(true);
            handDone = true;
            break;
          }

          const actingPos = state.currentHand.actingPosition;
          if (actingPos == null) {
            await sleep(150);
            continue;
          }

          const actorAddr = getActorAddress(state);
          const actorClient = clientByAddress.get(actorAddr);
          if (!actorClient) throw new Error(`No WS client for acting player ${actorAddr}`);

          const toCall = BigInt(state.currentHand.toCall || "0");
          if (toCall > 0n) {
            await actorClient.pokerAction(tableId, handId, "call", state.currentHand.toCall);
          } else {
            await actorClient.pokerAction(tableId, handId, "check");
          }

          actions += 1;
          if (actions > 500) throw new Error(`Hand ${handIndex + 1} exceeded max action budget`);
        }
      }
    });

    cy.then(() => {
      if (observeMs > 0) {
        cy.visit("/poker");
        cy.wait(observeMs);
      }
    });

    cy.then(() => {
      if (!tableId || keepTable) return;
      return cy.request({
        method: "DELETE",
        url: `http://localhost:8081/api/admin/poker/tables/${encodeURIComponent(tableId)}`,
        headers: { "x-admin-wallet": tableCreator },
        failOnStatusCode: false,
      });
    });

    cy.then(() => {
      clients.forEach((c) => c.disconnect());
    });
  });
});
