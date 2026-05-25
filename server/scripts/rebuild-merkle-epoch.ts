/**
 * Rebuild a holder merkle epoch after blocklist fixes:
 *   1. Clear prior supersede links
 *   2. Revoke on-chain root (if set)
 *   3. Re-snapshot (same block by default)
 *   4. Recalculate rewards (same new_reward_amount)
 *   5. Regenerate Merkle tree
 *   6. setEpochRoot on-chain + mark published
 *
 * Usage (from repo root):
 *   npx ts-node server/scripts/rebuild-merkle-epoch.ts --epoch 94
 *   DRY_RUN=1 npx ts-node server/scripts/rebuild-merkle-epoch.ts --epoch 94
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '..', '.env') });
loadEnv({ path: resolve(__dirname, '..', '..', 'contracts', '.env'), override: false });

if (!process.env.MERKLE_OWNER_PRIVATE_KEY && process.env.PRIVATE_KEY) {
  process.env.MERKLE_OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
}

import { Pool } from 'pg';
import { MerkleDropsService } from '../src/services/merkle-drops.service';
import {
  getEpochRootOnChain,
  revokeEpochOnChain,
  setEpochRootOnChain,
} from '../src/utils/merkle-claim';

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const epochNumber = parseInt(parseArg('--epoch') || process.env.EPOCH_NUMBER || '', 10);
  if (!Number.isFinite(epochNumber)) throw new Error('Pass --epoch <number>');

  const dryRun = process.env.DRY_RUN === '1';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const service = new MerkleDropsService(pool);

  const { rows: epochRows } = await pool.query(
    'SELECT id, epoch_number, snapshot_block, new_reward_amount, status FROM merkle_epochs WHERE epoch_number = $1',
    [epochNumber],
  );
  if (!epochRows.length) throw new Error(`Epoch #${epochNumber} not found`);
  const epoch = epochRows[0];
  const epochId = epoch.id;
  const snapshotBlock = epoch.snapshot_block ? Number(epoch.snapshot_block) : undefined;
  const newRewardWei = epoch.new_reward_amount?.toString();
  if (!newRewardWei) throw new Error('Epoch has no new_reward_amount — cannot recalculate');

  console.log(`Rebuild epoch #${epochNumber} (id=${epochId}, status=${epoch.status})`);
  console.log(`  snapshot block: ${snapshotBlock ?? 'latest'}`);
  console.log(`  new reward wei: ${newRewardWei}`);

  const { rows: before } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM merkle_snapshots WHERE epoch_id = $1 AND CAST(reward_amount AS NUMERIC) > 0`,
    [epochId],
  );
  console.log(`  snapshot rows before: ${before[0].cnt}`);

  if (dryRun) {
    console.log('DRY_RUN — no writes.');
    await pool.end();
    return;
  }

  // Unlink prior epochs superseded into this one so rollup works again.
  // ONLY do this when recalculating from scratch on a non-latest epoch rebuild.
  if (process.env.CLEAR_SUPERSEDE === '1') {
    const supersedeReset = await pool.query(
      'UPDATE merkle_snapshots SET superseded_by_epoch_id = NULL WHERE superseded_by_epoch_id = $1',
      [epochId],
    );
    console.log(`  cleared supersede links: ${supersedeReset.rowCount ?? 0}`);
  }

  const onChainRoot = await getEpochRootOnChain(epochNumber);
  if (onChainRoot && onChainRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log(`  revoking on-chain root ${onChainRoot.slice(0, 12)}…`);
    const revoke = await revokeEpochOnChain(epochNumber);
    if (!revoke.success) throw new Error(`revokeEpoch failed: ${revoke.error}`);
    console.log(`  revoke tx: ${revoke.txHash}`);
  } else {
    console.log('  no on-chain root to revoke');
  }

  console.log('  re-snapshot…');
  await service.takeSnapshot(epochId, snapshotBlock);

  const { rows: afterSnap } = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM merkle_snapshots WHERE epoch_id = $1',
    [epochId],
  );
  console.log(`  holders after snapshot: ${afterSnap[0].cnt}`);

  console.log('  calculate rewards…');
  await service.calculateRewards(epochId, newRewardWei);

  console.log('  generate merkle tree…');
  const root = await service.generateMerkleTree(epochId);
  console.log(`  new root: ${root}`);

  const updated = await service.getEpoch(epochId);
  if (!updated) throw new Error('Epoch missing after finalize');
  const totalWei = BigInt(updated.total_reward_amount || '0');

  console.log(`  setEpochRoot on-chain (${totalWei.toString()} wei)…`);
  const setRoot = await setEpochRootOnChain(epochNumber, root as `0x${string}`, totalWei);
  if (!setRoot.success && !(setRoot.error && /epoch already set/i.test(setRoot.error))) {
    throw new Error(`setEpochRoot failed: ${setRoot.error}`);
  }
  console.log(`  setEpochRoot tx: ${setRoot.txHash ?? '(already set)'}`);

  if (process.env.SKIP_AUTO_REVOKE === '1') {
    await pool.query(
      "UPDATE merkle_epochs SET status = 'published', published_at = NOW() WHERE id = $1",
      [epochId],
    );
  } else {
    await service.markPublished(epochId);
  }

  const { rows: after } = await pool.query(
    `SELECT COUNT(*)::int AS cnt,
            COALESCE(SUM(CAST(reward_amount AS NUMERIC)), 0)::text AS total
     FROM merkle_snapshots
     WHERE epoch_id = $1 AND CAST(reward_amount AS NUMERIC) > 0`,
    [epochId],
  );
  console.log(`  snapshot rows after: ${after[0].cnt}, total reward wei: ${after[0].total}`);
  console.log('Rebuild complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
