#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, v] = arg.slice(2).split("=");
    if (!k) continue;
    out[k] = v ?? "true";
  }
  return out;
}

function fail(message) {
  console.error(`[poker-real-runner] ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const configRel = args.config || process.env.POKER_TEST_PLAYERS_FILE || "cypress/poker-real-players.json";
const configPath = path.resolve(process.cwd(), configRel);

if (!fs.existsSync(configPath)) {
  fail(`Config file not found: ${configRel}`);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (error) {
  fail(`Invalid JSON in ${configRel}: ${error.message}`);
}

let players = Array.isArray(config.players) ? config.players.map((a) => String(a).trim().toLowerCase()).filter(Boolean) : [];
players = [...new Set(players)];
if (players.length < 2) fail("Config must include at least 2 players.");
if (!players.every((a) => ADDRESS_RE.test(a))) fail("All players must be valid 0x wallet addresses.");
if (players.length > 10) {
  console.warn(`[poker-real-runner] More than 10 players provided (${players.length}). Using first 10.`);
  players = players.slice(0, 10);
}

const tableCreator = String(args.creator || config.tableCreator || players[0]).trim().toLowerCase();
if (!ADDRESS_RE.test(tableCreator)) fail("tableCreator must be a valid 0x wallet address.");

const handsRaw = Number(args.hands || config.hands || 5);
if (!Number.isFinite(handsRaw)) fail("hands must be a number.");
const hands = Math.max(1, Math.min(10, Math.floor(handsRaw)));

const wsUrl = String(args.wsUrl || config.wsUrl || "ws://localhost:8081").trim();
const keepTableRaw = String(args.keepTable ?? config.keepTable ?? "false").toLowerCase();
const keepTable = keepTableRaw === "true" || keepTableRaw === "1" || keepTableRaw === "yes";
const observeSecondsRaw = Number(args.observeSeconds ?? config.observeSeconds ?? 0);
const observeSeconds = Number.isFinite(observeSecondsRaw) ? Math.max(0, Math.floor(observeSecondsRaw)) : 0;
const env = {
  ...process.env,
  CYPRESS_POKER_WS_URL: wsUrl,
  CYPRESS_POKER_TEST_TABLE_CREATOR: tableCreator,
  CYPRESS_POKER_TEST_PLAYERS: players.join(","),
  CYPRESS_POKER_TEST_HANDS: String(hands),
  CYPRESS_POKER_TEST_KEEP_TABLE: keepTable ? "true" : "false",
  CYPRESS_POKER_TEST_OBSERVE_MS: String(observeSeconds * 1000),
};

console.log(`[poker-real-runner] Using config: ${configRel}`);
console.log(
  `[poker-real-runner] Players: ${players.length}, Hands: ${hands}, WS: ${wsUrl}, KeepTable: ${keepTable}, ObserveSeconds: ${observeSeconds}`
);

const result = spawnSync(
  "npx",
  ["cypress", "run", "--e2e", "--browser", "chrome", "--spec", "cypress/e2e/poker-real-backend.cy.ts"],
  {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  }
);

process.exit(result.status ?? 1);
