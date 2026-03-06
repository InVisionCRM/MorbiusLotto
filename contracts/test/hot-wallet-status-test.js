#!/usr/bin/env node
/**
 * Poll a single withdrawal job status. Useful after running hot-wallet-withdraw-test.js
 * or when you have a jobId from the UI.
 *
 * Usage (from repo root):
 *   BLACKJACK_SERVER_URL=http://localhost:3001 node contracts/test/hot-wallet-status-test.js <jobId>
 */
const BASE = process.env.BLACKJACK_SERVER_URL || 'http://localhost:3001';

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('Usage: node hot-wallet-status-test.js <jobId>');
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/withdraw/status/${jobId}`);
  const data = await res.json();

  if (!res.ok) {
    console.error('Status fetch failed:', res.status, data);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
