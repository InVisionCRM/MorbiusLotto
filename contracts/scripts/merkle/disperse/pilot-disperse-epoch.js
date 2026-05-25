/**
 * Pilot: send a fixed MORBIUS amount to every unclaimed snapshot wallet for an epoch.
 * Does NOT update DB claimed_at — use before the full rescue + disperse run.
 *
 *   EPOCH_NUMBER=94 PILOT_MORBIUS=1 DRY_RUN=1 node contracts/scripts/merkle/disperse/pilot-disperse-epoch.js
 *   EPOCH_NUMBER=94 PILOT_MORBIUS=1 node contracts/scripts/merkle/disperse/pilot-disperse-epoch.js
 *
 * Env: DATABASE_URL, MERKLE_OWNER_PRIVATE_KEY, MORBIUS_BATCH_DISPERSE_ADDRESS, PULSECHAIN_RPC_URL
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../../server/.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path = require('path');
module.paths.push(path.join(__dirname, '../../../../server/node_modules'));
const { Pool } = require('pg');
const { ethers } = require('ethers');
const { getTxOverrides, sendContractTx, waitForReceipt } = require('./tx-utils');

const MORBIUS = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const DISPERSE = process.env.MORBIUS_BATCH_DISPERSE_ADDRESS;
const RPC = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com';
const CHUNK = Math.max(1, parseInt(process.env.CHUNK_SIZE || '50', 10));

const disperseAbi = [
  'function disperseFromOwner(uint256 epochId, address token, address[] recipients, uint256[] amounts)',
  'event BatchDispersed(uint256 indexed epochId, address indexed token, address indexed operator, uint256 recipientCount, uint256 totalAmount)',
];
const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const epochNumber = parseInt(process.env.EPOCH_NUMBER || '', 10);
  if (!Number.isFinite(epochNumber)) throw new Error('Set EPOCH_NUMBER');
  const pilotHuman = process.env.PILOT_MORBIUS || '1';
  const pilotWei = ethers.parseEther(pilotHuman);

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  if (!DISPERSE && process.env.DRY_RUN !== '1') throw new Error('MORBIUS_BATCH_DISPERSE_ADDRESS required');
  const pk = process.env.MERKLE_OWNER_PRIVATE_KEY;
  if (!pk && process.env.DRY_RUN !== '1') throw new Error('MERKLE_OWNER_PRIVATE_KEY required');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const { rows: epochRows } = await pool.query(
    'SELECT id, epoch_number, status FROM merkle_epochs WHERE epoch_number = $1',
    [epochNumber],
  );
  if (epochRows.length === 0) throw new Error(`Epoch #${epochNumber} not found`);
  const epoch = epochRows[0];

  const { rows: payouts } = await pool.query(
    `SELECT wallet_address FROM merkle_snapshots
     WHERE epoch_id = $1 AND claimed_at IS NULL AND CAST(reward_amount AS NUMERIC) > 0
     ORDER BY wallet_address ASC`,
    [epoch.id],
  );
  if (payouts.length === 0) throw new Error('No unclaimed snapshot rows');

  const recipients = payouts.map((r) => r.wallet_address);
  const amounts = recipients.map(() => pilotWei);
  const total = pilotWei * BigInt(recipients.length);

  console.log(`Pilot epoch #${epochNumber}: ${pilotHuman} MORBIUS × ${recipients.length} wallets = ${ethers.formatEther(total)} MORBIUS`);
  console.log('Disperse contract:', DISPERSE || '(not set)');
  console.log('NOTE: This does NOT mark DB claimed. Full run will send snapshot amounts on top of this pilot.');

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN — no transactions.');
    await pool.end();
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC, 369);
  const wallet = new ethers.Wallet(pk, provider);
  console.log('Owner wallet:', wallet.address);

  const disperse = new ethers.Contract(DISPERSE, disperseAbi, wallet);
  const token = new ethers.Contract(MORBIUS, erc20Abi, wallet);

  const bal = await token.balanceOf(wallet.address);
  if (bal < total) {
    throw new Error(`Owner needs ${ethers.formatEther(total)} MORBIUS, has ${ethers.formatEther(bal)}`);
  }

  const allowance = await token.allowance(wallet.address, DISPERSE);
  if (allowance < total) {
    console.log('Approving disperse contract…');
    const approveOverrides = await getTxOverrides(provider);
    const approveTx = await token.approve(DISPERSE, ethers.MaxUint256, approveOverrides);
    await waitForReceipt(provider, approveTx.hash);
    console.log('  approve confirmed:', approveTx.hash);
  }

  const limit = process.env.PILOT_LIMIT ? parseInt(process.env.PILOT_LIMIT, 10) : recipients.length;
  const pilotRecipients = recipients.slice(0, limit);
  const pilotAmounts = amounts.slice(0, limit);
  if (limit < recipients.length) {
    console.log(`PILOT_LIMIT=${limit} — only first ${limit} wallets (smoke test)`);
  }

  const recipientChunks = chunk(pilotRecipients, CHUNK);
  const amountChunks = chunk(pilotAmounts, CHUNK);
  const txHashes = [];

  const startChunk = Math.max(0, parseInt(process.env.START_CHUNK || '0', 10));

  for (let i = startChunk; i < recipientChunks.length; i++) {
    const rec = recipientChunks[i];
    const amts = amountChunks[i];
    console.log(`Chunk ${i + 1}/${recipientChunks.length}: ${rec.length} wallets`);
    const { tx } = await sendContractTx(
      `pilot chunk ${i + 1}`,
      disperse,
      'disperseFromOwner',
      [epochNumber, MORBIUS, rec, amts],
      provider,
    );
    txHashes.push(tx.hash);
    if (i + 1 < recipientChunks.length) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log('Pilot complete. Verify a few wallets on PulseScan before full run.');
  console.log({ txHashes });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
