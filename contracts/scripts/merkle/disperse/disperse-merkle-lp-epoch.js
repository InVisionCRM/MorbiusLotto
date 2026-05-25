/**
 * Batch-pay LP merkle rewards for a published epoch via MorbiusBatchDisperse.
 *
 *   EPOCH_NUMBER=84 DRY_RUN=1 node contracts/scripts/merkle/disperse/disperse-merkle-lp-epoch.js
 *   EPOCH_NUMBER=84 MARK_CLAIMED=1 REVOKE_ROOT=1 node contracts/scripts/merkle/disperse/disperse-merkle-lp-epoch.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../../server/.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path = require('path');
module.paths.push(path.join(__dirname, '../../../../server/node_modules'));
const { Pool } = require('pg');
const { ethers } = require('ethers');
const { getTxOverrides, sendContractTx, waitForReceipt } = require('./tx-utils');
const { loadLpBlocklist, assertNoBlocklistedPayouts } = require('./blocklist-loader');

const MORBIUS = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const DISPERSE =
  process.env.MORBIUS_BATCH_DISPERSE_ADDRESS || '0x4Ea9064C08dC8B48e4537a0371261ab42E66eBD8';
const MERKLE_LP = process.env.MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A';
const RPC = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com';
const CHUNK = Math.max(1, parseInt(process.env.CHUNK_SIZE || '50', 10));

const disperseAbi = [
  'function disperseFromOwner(uint256 epochId, address token, address[] recipients, uint256[] amounts)',
  'function disperseFromBalance(uint256 epochId, address token, address[] recipients, uint256[] amounts)',
];
const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];
const merkleAbi = [
  'function revokeEpoch(uint256 epochId)',
  'function epochClaimedAmount(uint256 epochId) view returns (uint256)',
];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const epochNumber = parseInt(process.env.EPOCH_NUMBER || '', 10);
  if (!Number.isFinite(epochNumber)) throw new Error('Set EPOCH_NUMBER');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pk = process.env.MERKLE_OWNER_PRIVATE_KEY;
  if (!pk && process.env.DRY_RUN !== '1') throw new Error('MERKLE_OWNER_PRIVATE_KEY required (unless DRY_RUN=1)');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const { rows: epochRows } = await pool.query(
    `SELECT id, epoch_number, status FROM merkle_lp_epochs WHERE epoch_number = $1`,
    [epochNumber],
  );
  if (epochRows.length === 0) throw new Error(`LP epoch #${epochNumber} not found`);
  const epoch = epochRows[0];

  const { rows: payouts } = await pool.query(
    `SELECT wallet_address, reward_amount
     FROM merkle_lp_snapshots
     WHERE epoch_id = $1
       AND claimed_at IS NULL
       AND CAST(reward_amount AS NUMERIC) > 0
     ORDER BY wallet_address ASC`,
    [epoch.id],
  );
  if (payouts.length === 0) throw new Error('No unclaimed LP snapshot rows with reward_amount > 0');

  const blocklist = await loadLpBlocklist(pool);
  assertNoBlocklistedPayouts(blocklist, payouts);

  let total = 0n;
  const recipients = [];
  const amounts = [];
  for (const row of payouts) {
    recipients.push(row.wallet_address);
    const amt = BigInt(row.reward_amount);
    amounts.push(amt);
    total += amt;
  }

  console.log(`LP epoch #${epochNumber} (id=${epoch.id}, status=${epoch.status})`);
  console.log(`Recipients: ${recipients.length}`);
  console.log(`Total MORBIUS: ${ethers.formatEther(total)}`);
  console.log(`Chunks of ${CHUNK}: ${Math.ceil(recipients.length / CHUNK)}`);

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN — no chain or DB writes.');
    await pool.end();
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC, 369);
  const wallet = new ethers.Wallet(pk, provider);
  const disperse = new ethers.Contract(DISPERSE, disperseAbi, wallet);
  const token = new ethers.Contract(MORBIUS, erc20Abi, wallet);
  const fromBalance = process.env.FROM_BALANCE === '1';

  if (!fromBalance) {
    const allowance = await token.allowance(wallet.address, DISPERSE);
    if (allowance < total) {
      console.log('Approving disperse contract…');
      const approveOverrides = await getTxOverrides(provider);
      const tx = await token.approve(DISPERSE, ethers.MaxUint256, approveOverrides);
      await waitForReceipt(provider, tx.hash);
    }
    const bal = await token.balanceOf(wallet.address);
    if (bal < total) {
      throw new Error(`Owner balance ${ethers.formatEther(bal)} MORBIUS < required ${ethers.formatEther(total)}`);
    }
  }

  const recipientChunks = chunk(recipients, CHUNK);
  const amountChunks = chunk(amounts, CHUNK);
  const txHashes = [];

  for (let i = 0; i < recipientChunks.length; i++) {
    const rec = recipientChunks[i];
    const amts = amountChunks[i];
    const chunkTotal = amts.reduce((s, v) => s + v, 0n);
    console.log(`Chunk ${i + 1}/${recipientChunks.length}: ${rec.length} wallets, ${ethers.formatEther(chunkTotal)} MORBIUS`);
    const method = fromBalance ? 'disperseFromBalance' : 'disperseFromOwner';
    const { tx } = await sendContractTx(
      `LP disperse chunk ${i + 1}`,
      disperse,
      method,
      [epochNumber, MORBIUS, rec, amts],
      provider,
    );
    txHashes.push(tx.hash);
  }

  if (process.env.MARK_CLAIMED !== '0') {
    await pool.query(
      `UPDATE merkle_lp_snapshots
       SET claimed_at = NOW()
       WHERE epoch_id = $1 AND claimed_at IS NULL AND CAST(reward_amount AS NUMERIC) > 0`,
      [epoch.id],
    );
    console.log(`Marked ${recipients.length} LP snapshot rows claimed_at in DB.`);
  }

  if (process.env.REVOKE_ROOT === '1') {
    const merkle = new ethers.Contract(MERKLE_LP, merkleAbi, wallet);
    const claimedOnChain = await merkle.epochClaimedAmount(epochNumber);
    if (claimedOnChain > 0n) {
      console.warn(`Skip revoke: LP epoch #${epochNumber} has on-chain claims ${ethers.formatEther(claimedOnChain)} MORBIUS`);
    } else {
      console.log(`Revoking on-chain LP merkle root for epoch #${epochNumber}…`);
      const revokeOverrides = await getTxOverrides(provider);
      const rtx = await merkle.revokeEpoch(epochNumber, revokeOverrides);
      console.log(`  revoke tx: ${rtx.hash}`);
      await waitForReceipt(provider, rtx.hash);
    }
  }

  console.log('Done.', { txHashes });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
