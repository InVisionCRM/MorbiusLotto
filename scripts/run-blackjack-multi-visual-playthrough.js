#!/usr/bin/env node

const { spawnSync } = require("child_process");

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

const args = parseArgs(process.argv.slice(2));
const handsRaw = Number(args.hands || process.env.BJ_VISUAL_HANDS || 5);
const hands = Number.isFinite(handsRaw) ? Math.max(1, Math.min(10, Math.floor(handsRaw))) : 5;
const handSecondsRaw = Number(args.handSeconds || process.env.BJ_VISUAL_HAND_SECONDS || 84);
const handSeconds = Number.isFinite(handSecondsRaw) ? Math.max(20, Math.floor(handSecondsRaw)) : 84;

const env = {
  ...process.env,
  CYPRESS_BJ_VISUAL_HANDS: String(hands),
  CYPRESS_BJ_VISUAL_HAND_SECONDS: String(handSeconds),
};

console.log(`[bj-multi-visual-runner] Hands: ${hands}, HandSeconds: ${handSeconds}`);

const result = spawnSync(
  "npx",
  ["cypress", "run", "--e2e", "--browser", "chrome", "--spec", "cypress/e2e/blackjack-multi-visual-playthrough.cy.ts"],
  {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  }
);

process.exit(result.status ?? 1);
