#!/usr/bin/env node
/**
 * Test hot-wallet withdrawal: enqueue via POST /api/withdraw, then poll GET /api/withdraw/status/:jobId
 * until status is completed or failed.
 *
 * Usage (from repo root):
 *   BLACKJACK_SERVER_URL=http://localhost:3001 node contracts/test/hot-wallet-withdraw-test.js <walletAddress> [amountMorbius]
 *
 * Example:
 *   node contracts/test/hot-wallet-withdraw-test.js 0xYourAddress 10
 *
 * amountMorbius defaults to 1. Wallet must have sufficient DB balance (off-chain balance).
 */
const BASE = process.env.BLACKJACK_SERVER_URL || 'http://localhost:3001';

function parseEther(amount) {
  const [whole = '0', frac = ''] = String(amount).split('.');
  const padded = frac.padEnd(18, '0').slice(0, 18);
  return BigInt(whole + padded);
}

async function main() {
  const address = process.argv[2];
  const amountMorbius = process.argv[3] || '1';
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.error('Usage: node hot-wallet-withdraw-test.js <walletAddress> [amountMorbius]');
    process.exit(1);
  }
  const amountWei = parseEther(amountMorbius).toString();
  console.log('Server:', BASE);
  console.log('Address:', address);
  console.log('Amount (wei):', amountWei);

  const res = await fetch(`${BASE}/api/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amount: amountWei }),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error('Withdraw enqueue failed:', res.status, data);
    process.exit(1);
  }
  if (!data.jobId) {
    console.error('No jobId in response:', data);
    process.exit(1);
  }

  console.log('Enqueued. jobId:', data.jobId);
  console.log('Polling status...');

  const pollIntervalMs = 2000;
  const maxPolls = 90;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(`${BASE}/api/withdraw/status/${data.jobId}`);
    const statusData = await statusRes.json();
    if (!statusRes.ok) {
      console.error('Status fetch failed:', statusRes.status, statusData);
      process.exit(1);
    }
    const status = statusData.status;
    console.log(`  [${i + 1}] status: ${status}${statusData.txHash ? ` txHash: ${statusData.txHash}` : ''}`);

    if (status === 'completed') {
      console.log('SUCCESS. Tx:', statusData.txHash);
      console.log('Net to user (wei):', statusData.netToUser || '(see response)');
      process.exit(0);
    }
    if (status === 'failed') {
      console.error('FAILED:', statusData.error || 'Unknown error');
      process.exit(1);
    }
  }

  console.error('Timed out waiting for completion');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
