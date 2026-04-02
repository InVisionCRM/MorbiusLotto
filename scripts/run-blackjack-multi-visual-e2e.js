#!/usr/bin/env node

const { spawnSync } = require("child_process");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

const forwardedArgs = process.argv.slice(2);
const visualCmd = ["node", "scripts/run-blackjack-multi-visual-playthrough.js", ...forwardedArgs].join(" ");

run("npm", ["run", "build"]);
run("npx", ["start-server-and-test", "start", "http://localhost:3000", visualCmd]);
