/**
 * Fix LP epoch #84: drop blocklisted wallets, redistribute full LP vault balance
 * proportionally to morbius_equivalent, republish Merkle root on MerkleClaimLP.
 *
 *   npx ts-node server/scripts/fix-epoch-84-lp-rewards.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '..', '.env') });
loadEnv({ path: resolve(__dirname, '..', '..', 'contracts', '.env'), override: false });

if (!process.env.MERKLE_OWNER_PRIVATE_KEY && process.env.PRIVATE_KEY) {
  process.env.MERKLE_OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
}

import { Pool } from 'pg';
import { ethers } from 'ethers';
import { MerkleDropsLPService } from '../src/services/merkle-lp-drops.service';
import { loadLpSnapshotBlocklist } from '../src/services/merkle-snapshot-blocklist';
import {
  getContractMorbiusBalance,
  getEpochRootOnChain,
  revokeEpochOnChain,
  setEpochRootOnChain,
} from '../src/utils/merkle-claim-lp';

const EPOCH_NUMBER = 84;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const service = new MerkleDropsLPService(pool);

  const { rows: epochRows } = await pool.query<{ id: number; new_reward_amount: string }>(
    'SELECT id, new_reward_amount FROM merkle_lp_epochs WHERE epoch_number = $1',
    [EPOCH_NUMBER],
  );
  if (!epochRows.length) throw new Error('LP epoch 84 not found');
  const epochId = epochRows[0].id;
  const newRewardWei = BigInt(epochRows[0].new_reward_amount || '0');

  const blocklist = await loadLpSnapshotBlocklist(pool);
  const blocked = await pool.query<{ wallet_address: string }>(
    'SELECT wallet_address FROM merkle_lp_snapshots WHERE epoch_id = $1',
    [epochId],
  );
  const toRemove = blocked.rows
    .filter((r) => blocklist.has(r.wallet_address.toLowerCase()))
    .map((r) => r.wallet_address.toLowerCase());
  if (toRemove.length > 0) {
    await pool.query(
      'DELETE FROM merkle_lp_snapshots WHERE epoch_id = $1 AND lower(wallet_address) = ANY($2)',
      [epochId, toRemove],
    );
    console.log(`Removed ${toRemove.length} blocklisted wallet(s):`, toRemove.join(', '));
  }

  const { rows: snapshots } = await pool.query<{ wallet_address: string; morbius_equivalent: string }>(
    'SELECT wallet_address, morbius_equivalent FROM merkle_lp_snapshots WHERE epoch_id = $1 ORDER BY wallet_address',
    [epochId],
  );
  if (snapshots.length === 0) throw new Error('No eligible LP snapshots after blocklist cleanup');

  const vaultWei = await getContractMorbiusBalance();
  if (vaultWei <= 0n) throw new Error('LP merkle vault balance is zero');

  const totalBalance = snapshots.reduce((s, r) => s + BigInt(r.morbius_equivalent), 0n);
  if (totalBalance === 0n) throw new Error('Zero total morbius_equivalent');

  console.log(`Fix LP epoch #${EPOCH_NUMBER}: ${snapshots.length} holders`);
  console.log(`  vault balance: ${ethers.formatEther(vaultWei)} MORBIUS`);

  const onChainRoot = await getEpochRootOnChain(EPOCH_NUMBER);
  if (onChainRoot && onChainRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('Revoking prior on-chain root…');
    const revoke = await revokeEpochOnChain(EPOCH_NUMBER);
    if (!revoke.success) throw new Error(`revoke failed: ${revoke.error}`);
    console.log('  revoke tx:', revoke.txHash);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let distributed = 0n;
    for (let i = 0; i < snapshots.length; i++) {
      const { wallet_address, morbius_equivalent } = snapshots[i];
      let reward: bigint;
      if (i === snapshots.length - 1) {
        reward = vaultWei - distributed;
      } else {
        reward = (BigInt(morbius_equivalent) * vaultWei) / totalBalance;
      }
      distributed += reward;
      await client.query(
        'UPDATE merkle_lp_snapshots SET reward_amount = $1, merkle_proof = NULL WHERE epoch_id = $2 AND wallet_address = $3',
        [reward.toString(), epochId, wallet_address],
      );
    }
    const totalBalanceStr = totalBalance.toString();
    await client.query(
      `UPDATE merkle_lp_epochs
       SET status = 'calculated', total_holders = $1, total_balance = $2,
           total_reward_amount = $3, rollup_amount = $4, new_reward_amount = $5,
           calculated_at = NOW(), merkle_root = NULL, finalized_at = NULL
       WHERE id = $6`,
      [
        snapshots.length,
        totalBalanceStr,
        vaultWei.toString(),
        (vaultWei - newRewardWei).toString(),
        newRewardWei.toString(),
        epochId,
      ],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const emptyEpochs = await pool.query(
    `DELETE FROM merkle_lp_epochs
     WHERE epoch_number > $1 AND status = 'snapshot' AND total_holders = 0
     RETURNING epoch_number`,
    [EPOCH_NUMBER],
  );
  if (emptyEpochs.rowCount) {
    console.log('Removed empty stub epochs:', emptyEpochs.rows.map((r) => r.epoch_number).join(', '));
  }

  console.log('Generating Merkle tree…');
  const root = await service.generateMerkleTree(epochId);
  console.log('  root:', root);

  console.log('setEpochRoot on-chain…');
  const setRoot = await setEpochRootOnChain(EPOCH_NUMBER, root as `0x${string}`, vaultWei);
  if (!setRoot.success && !(setRoot.error && /epoch already set/i.test(setRoot.error))) {
    throw new Error(`setEpochRoot failed: ${setRoot.error}`);
  }
  console.log('  tx:', setRoot.txHash ?? '(already set)');

  await pool.query(
    "UPDATE merkle_lp_epochs SET status = 'published', published_at = NOW() WHERE id = $1",
    [epochId],
  );

  console.log('Fixed. Holders:', snapshots.length, 'Total:', ethers.formatEther(vaultWei), 'MORBIUS');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
