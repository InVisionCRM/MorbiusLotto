#!/usr/bin/env node
/**
 * Test deposit notify: POST /api/deposit/notify to record a deposit as pending.
 * Balance is credited only after N block confirmations (deposit confirmation worker).
 *
 * Usage (from repo root):
 *   BLACKJACK_SERVER_URL=http://localhost:3001 node contracts/test/hot-wallet-deposit-notify-test.js <walletAddress> <txHash> <amountWei> [blockNumber]
 *
 * Example (1 MORBIUS = 1e18 wei):
 *   node contracts/test/hot-wallet-deposit-notify-test.js 0xYourAddress 0xabc... 1000000000000000000 12345678
 *
 * blockNumber is optional; server will try to fetch from chain if omitted.
 */
const BASE = process.env.BLACKJACK_SERVER_URL || 'http://localhost:3001';

async function main() {
  const walletAddress = process.argv[2];
  const txHash = process.argv[3];
  const amountWei = process.argv[4];
  const blockNumber = process.argv[5]; // optional

  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    console.error('Invalid wallet address');
    process.exit(1);
  }
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    console.error('Invalid tx hash (64 hex chars)');
    process.exit(1);
  }
  if (!amountWei || BigInt(amountWei) <= 0n) {
    console.error('Amount (wei) must be a positive integer string');
    process.exit(1);
  }

  const body = { walletAddress, txHash, amount: amountWei };
  if (blockNumber != null && blockNumber !== '') body.blockNumber = blockNumber;

  console.log('Server:', BASE);
  console.log('Notify payload:', JSON.stringify(body, null, 2));

  const res = await fetch(`${BASE}/api/deposit/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error('Deposit notify failed:', res.status, data);
    process.exit(1);
  }

  console.log('OK:', data.message || data);
  console.log('Balance will be credited after confirmations (see server DEPOSIT_CONFIRMATIONS_REQUIRED, default 12).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
