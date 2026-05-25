/**
 * Read-only preflight before batch disperse. Does NOT send transactions.
 *
 *   EPOCH_NUMBER=94 node contracts/scripts/merkle/disperse/preflight-disperse-epoch.js
 *
 * Checks:
 *   - Snapshot rows, total MORBIUS, recipient count
 *   - Merkle contract balance vs total owed
 *   - On-chain root + claimed amount for epoch
 *   - Whether revoke would be allowed after airdrop
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../../server/.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path = require('path');
module.paths.push(path.join(__dirname, '../../../../server/node_modules'));
const { Pool } = require('pg');
const { ethers } = require('ethers');
const { loadHolderBlocklist } = require('./blocklist-loader');

const MORBIUS = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const MERKLE = process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2';
const RPC = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com';

const merkleAbi = [
  'function epochRoots(uint256) view returns (bytes32)',
  'function epochClaimedAmount(uint256) view returns (uint256)',
  'function epochTotalAmount(uint256) view returns (uint256)',
];
const erc20Abi = ['function balanceOf(address) view returns (uint256)'];

async function main() {
  const epochNumber = parseInt(process.env.EPOCH_NUMBER || '', 10);
  if (!Number.isFinite(epochNumber)) throw new Error('Set EPOCH_NUMBER');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const { rows: epochRows } = await pool.query(
    'SELECT id, epoch_number, status, merkle_root FROM merkle_epochs WHERE epoch_number = $1',
    [epochNumber],
  );
  if (epochRows.length === 0) throw new Error(`Epoch #${epochNumber} not found`);
  const epoch = epochRows[0];

  const { rows: payouts } = await pool.query(
    `SELECT wallet_address, reward_amount, claimed_at
     FROM merkle_snapshots
     WHERE epoch_id = $1 AND CAST(reward_amount AS NUMERIC) > 0
     ORDER BY wallet_address ASC`,
    [epoch.id],
  );

  const blocklist = await loadHolderBlocklist(pool);
  const blockedUnclaimed = payouts.filter(
    (r) => !r.claimed_at && blocklist.has(r.wallet_address.toLowerCase()),
  );
  let totalOwed = 0n;
  let unclaimedCount = 0;
  const issues = [];
  for (const row of payouts) {
    const amt = BigInt(row.reward_amount);
    if (amt <= 0n) issues.push(`zero amount: ${row.wallet_address}`);
    totalOwed += amt;
    if (!row.claimed_at) unclaimedCount++;
  }

  const provider = new ethers.JsonRpcProvider(RPC, 369);
  const merkle = new ethers.Contract(MERKLE, merkleAbi, provider);
  const token = new ethers.Contract(MORBIUS, erc20Abi, provider);

  const [merkleBal, root, claimedOnChain, epochTotal] = await Promise.all([
    token.balanceOf(MERKLE),
    merkle.epochRoots(epochNumber),
    merkle.epochClaimedAmount(epochNumber),
    merkle.epochTotalAmount(epochNumber),
  ]);

  const rootSet = root !== ethers.ZeroHash;
  const canRevokeAfter = claimedOnChain === 0n;

  console.log('\n=== Preflight: batch disperse epoch #' + epochNumber + ' ===\n');
  console.log('DB epoch status:', epoch.status);
  console.log('DB merkle_root set:', Boolean(epoch.merkle_root));
  console.log('Snapshot rows (reward > 0):', payouts.length);
  console.log('Blocklist size:', blocklist.size);
  console.log('Blocked addresses still in unclaimed payouts:', blockedUnclaimed.length);
  if (blockedUnclaimed.length > 0) {
    console.log('  FAIL — re-snapshot required. Sample:', blockedUnclaimed.slice(0, 5).map((r) => r.wallet_address).join(', '));
  }
  console.log('Unclaimed in DB:', unclaimedCount);
  console.log('Total to pay (unclaimed rows):',
    ethers.formatEther(
      payouts.filter((r) => !r.claimed_at).reduce((s, r) => s + BigInt(r.reward_amount), 0n),
    ),
    'MORBIUS',
  );
  console.log('Sum all snapshot rewards:', ethers.formatEther(totalOwed), 'MORBIUS');
  console.log('\nOn-chain merkle contract:', MERKLE);
  console.log('  MORBIUS balance:', ethers.formatEther(merkleBal), 'MORBIUS');
  console.log('  epochRoots set:', rootSet, rootSet ? root : '(cleared)');
  console.log('  epochTotalAmount:', ethers.formatEther(epochTotal), 'MORBIUS');
  console.log('  epochClaimedAmount:', ethers.formatEther(claimedOnChain), 'MORBIUS');
  console.log('  revokeEpoch allowed after airdrop:', canRevokeAfter ? 'YES' : 'NO (claims exist on-chain)');

  if (issues.length) {
    console.log('\nRow issues:', issues.slice(0, 5));
  }

  console.log('\n--- Recommended test order ---');
  console.log('1. npx hardhat test test/MorbiusBatchDisperse.test.js  (local, no mainnet)');
  console.log('2. Deploy MorbiusBatchDisperse to mainnet (empty contract, no MORBIUS risk)');
  console.log('3. Pilot: disperse 2–3 wallets with 1 MORBIUS each before full epoch');
  console.log('4. Full run: rescue → disperse → MARK_CLAIMED → REVOKE_ROOT=1');
  console.log('\nThis script did not send any transactions.\n');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
