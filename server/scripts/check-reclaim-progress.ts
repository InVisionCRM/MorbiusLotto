// Quick status check: which holder/LP epochs are still reclaim candidates,
// what is the current on-chain MORBIUS balance vs DB-owed, and what would
// the cron's "available" be right now.
//
// Usage (from /Users/kyle/MORBlotto/server):
//   npx ts-node --transpile-only scripts/check-reclaim-progress.ts
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(__dirname, '..', '.env') });

import { Pool } from 'pg';
import { createPublicClient, http, parseAbi } from 'viem';
import { pulsechain } from 'viem/chains';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RPC = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com';
const MORBIUS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as `0x${string}`;
const HOLDER = (process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2') as `0x${string}`;
const LP     = (process.env.MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A') as `0x${string}`;

const client = createPublicClient({ chain: pulsechain, transport: http(RPC) });
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

function fmt(weiStr: string) {
  const n = BigInt(weiStr);
  const w = n / 10n ** 18n;
  const f = n % 10n ** 18n;
  return `${w.toString()}.${f.toString().padStart(18, '0').slice(0, 4)}`;
}

async function snapshot(label: string, contract: `0x${string}`, epochsTbl: string, snapshotsTbl: string) {
  const [bal, owedRows, reclaimedRows] = await Promise.all([
    client.readContract({ address: MORBIUS, abi: ERC20, functionName: 'balanceOf', args: [contract] }) as Promise<bigint>,
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)), 0)::text AS total
       FROM ${snapshotsTbl} ms
       JOIN ${epochsTbl} me ON me.id = ms.epoch_id
       WHERE me.status = 'published'
         AND ms.claimed_at IS NULL
         AND ms.superseded_by_epoch_id IS NULL
         AND ms.reclaimed_at IS NULL
         AND CAST(ms.reward_amount AS NUMERIC) > 0`,
    ),
    pool.query<{ total: string; cnt: string }>(
      `SELECT COALESCE(SUM(CAST(reward_amount AS NUMERIC)), 0)::text AS total,
              COUNT(*)::text AS cnt
       FROM ${snapshotsTbl} WHERE reclaimed_at IS NOT NULL`,
    ),
  ]);
  const owed = BigInt(owedRows.rows[0].total);
  const reclaimed = BigInt(reclaimedRows.rows[0].total);
  const reclaimedCnt = Number(reclaimedRows.rows[0].cnt);
  const available = bal > owed ? bal - owed : 0n;
  console.log(`── ${label}`);
  console.log(`   on-chain balance      : ${fmt(bal.toString())} MORBIUS`);
  console.log(`   owed (live unclaimed) : ${fmt(owed.toString())} MORBIUS`);
  console.log(`   reclaimed snapshots   : ${reclaimedCnt} rows = ${fmt(reclaimed.toString())} MORBIUS freed`);
  console.log(`   available for next eph: ${fmt(available.toString())} MORBIUS`);
}

async function main() {
  await snapshot('HOLDER (merkle_*)', HOLDER, 'merkle_epochs', 'merkle_snapshots');
  console.log();
  await snapshot('LP    (merkle_lp_*)', LP, 'merkle_lp_epochs', 'merkle_lp_snapshots');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
