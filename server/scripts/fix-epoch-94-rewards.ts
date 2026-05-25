/**
 * Fix / resize epoch #94 holder rewards.
 * Redistributes the full merkle vault balance proportionally across
 * eligible snapshot holders (208 after blocklist fix), then republishes root.
 *
 *   npx ts-node server/scripts/fix-epoch-94-rewards.ts
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
import { MerkleDropsService } from '../src/services/merkle-drops.service';
import {
  getContractMorbiusBalance,
  getEpochRootOnChain,
  revokeEpochOnChain,
  setEpochRootOnChain,
} from '../src/utils/merkle-claim';

const EPOCH_NUMBER = 94;
/** Fallback if vault read fails. */
const FALLBACK_TOTAL_WEI = 603472642079343675789882n;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const service = new MerkleDropsService(pool);

  const { rows: epochRows } = await pool.query(
    'SELECT id, epoch_number FROM merkle_epochs WHERE epoch_number = $1',
    [EPOCH_NUMBER],
  );
  if (!epochRows.length) throw new Error('Epoch 94 not found');
  const epochId = epochRows[0].id;

  const { rows: snapshots } = await pool.query<{ wallet_address: string; morbius_balance: string }>(
    'SELECT wallet_address, morbius_balance FROM merkle_snapshots WHERE epoch_id = $1 ORDER BY wallet_address',
    [epochId],
  );
  if (snapshots.length === 0) throw new Error('No snapshots');

  const vaultWei = await getContractMorbiusBalance();
  const TARGET_TOTAL_WEI = vaultWei > 0n ? vaultWei : FALLBACK_TOTAL_WEI;

  const totalBalance = snapshots.reduce((s, r) => s + BigInt(r.morbius_balance), 0n);
  if (totalBalance === 0n) throw new Error('Zero total balance');

  console.log(`Fix epoch #${EPOCH_NUMBER}: ${snapshots.length} holders`);
  console.log(`  vault balance: ${ethers.formatEther(TARGET_TOTAL_WEI)} MORBIUS`);

  const onChainRoot = await getEpochRootOnChain(EPOCH_NUMBER);
  if (onChainRoot && onChainRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('Revoking inflated on-chain root…');
    const revoke = await revokeEpochOnChain(EPOCH_NUMBER);
    if (!revoke.success) throw new Error(`revoke failed: ${revoke.error}`);
    console.log('  revoke tx:', revoke.txHash);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let distributed = 0n;
    for (let i = 0; i < snapshots.length; i++) {
      const { wallet_address, morbius_balance } = snapshots[i];
      let reward: bigint;
      if (i === snapshots.length - 1) {
        reward = TARGET_TOTAL_WEI - distributed;
      } else {
        reward = (BigInt(morbius_balance) * TARGET_TOTAL_WEI) / totalBalance;
      }
      distributed += reward;
      await client.query(
        'UPDATE merkle_snapshots SET reward_amount = $1, merkle_proof = NULL WHERE epoch_id = $2 AND wallet_address = $3',
        [reward.toString(), epochId, wallet_address],
      );
    }
    await client.query(
      `UPDATE merkle_epochs
       SET status = 'calculated', total_reward_amount = $1, rollup_amount = $2,
           new_reward_amount = $3, calculated_at = NOW(), merkle_root = NULL, finalized_at = NULL
       WHERE id = $4`,
      [TARGET_TOTAL_WEI.toString(), (TARGET_TOTAL_WEI - 4018575000000000000000n).toString(), '4018575000000000000000', epochId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log('Generating Merkle tree…');
  const root = await service.generateMerkleTree(epochId);
  console.log('  root:', root);

  console.log('setEpochRoot on-chain…');
  const setRoot = await setEpochRootOnChain(EPOCH_NUMBER, root as `0x${string}`, TARGET_TOTAL_WEI);
  if (!setRoot.success && !(setRoot.error && /epoch already set/i.test(setRoot.error))) {
    throw new Error(`setEpochRoot failed: ${setRoot.error}`);
  }
  console.log('  tx:', setRoot.txHash ?? '(already set)');

  await pool.query(
    "UPDATE merkle_epochs SET status = 'published', published_at = NOW() WHERE id = $1",
    [epochId],
  );

  console.log('Fixed. Holders:', snapshots.length, 'Total:', ethers.formatEther(TARGET_TOTAL_WEI), 'MORBIUS');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
