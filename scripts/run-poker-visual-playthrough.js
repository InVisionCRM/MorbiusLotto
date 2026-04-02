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
const handsRaw = Number(args.hands || process.env.POKER_VISUAL_HANDS || 5);
const hands = Number.isFinite(handsRaw) ? Math.max(1, Math.min(10, Math.floor(handsRaw))) : 5;
const delayRaw = Number(args.delayMs || process.env.POKER_VISUAL_STEP_DELAY_MS || 1400);
const delayMs = Number.isFinite(delayRaw) ? Math.max(250, Math.floor(delayRaw)) : 1400;
const handSecondsRaw = Number(args.handSeconds || process.env.POKER_VISUAL_HAND_SECONDS || 0);
const handSeconds = Number.isFinite(handSecondsRaw) ? Math.max(0, Math.floor(handSecondsRaw)) : 0;

const env = {
  ...process.env,
  CYPRESS_POKER_VISUAL_HANDS: String(hands),
  CYPRESS_POKER_VISUAL_STEP_DELAY_MS: String(delayMs),
  CYPRESS_POKER_VISUAL_HAND_SECONDS: String(handSeconds),
};

console.log(`[poker-visual-runner] Hands: ${hands}, StepDelayMs: ${delayMs}, HandSeconds: ${handSeconds}`);

const result = spawnSync(
  "npx",
  ["cypress", "run", "--e2e", "--browser", "chrome", "--spec", "cypress/e2e/poker-visual-playthrough.cy.ts"],
  {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  }
);

process.exit(result.status ?? 1);
