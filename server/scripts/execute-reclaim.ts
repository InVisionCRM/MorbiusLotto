// One-time executor for stale-snapshot reclamation on holder + LP merkle drops.
//
// Loads server/.env first (DB, RPC, keeper) then contracts/.env to source the
// owner PRIVATE_KEY (mapped onto MERKLE_OWNER_PRIVATE_KEY for this run only).
// Verifies the derived owner address matches both contracts' on-chain owner
// before any tx is sent. Runs holder reclamation first, then LP. For each
// candidate epoch where on-chain epochClaimedAmount==0, it calls revokeEpoch
// then marks matching DB rows reclaimed_at=NOW().
//
// Usage (from /Users/kyle/MORBlotto/server):
//   npx ts-node scripts/execute-reclaim.ts
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// 1. Load server/.env first (DB connection, RPC, keeper key).
loadEnv({ path: resolve(__dirname, '..', '.env') });
// 2. Then layer in contracts/.env without overwriting server-side values.
loadEnv({ path: resolve(__dirname, '..', '..', 'contracts', '.env'), override: false });

// 3. Map contracts/.env PRIVATE_KEY onto MERKLE_OWNER_PRIVATE_KEY for this run only.
//    Server .env stays untouched on disk; this only affects the current process.
if (!process.env.MERKLE_OWNER_PRIVATE_KEY && process.env.PRIVATE_KEY) {
  process.env.MERKLE_OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
}

import { Pool } from 'pg';
import { createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { MerkleDropsService } from '../src/services/merkle-drops.service';
import { MerkleDropsLPService } from '../src/services/merkle-lp-drops.service';

const HOLDER_CONTRACT = (process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2') as `0x${string}`;
const LP_CONTRACT = (process.env.MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A') as `0x${string}`;

function fmt(weiStr: string): string {
  const n = BigInt(weiStr);
  const whole = n / 10n ** 18n;
  const frac = n % 10n ** 18n;
  return `${whole.toString().padStart(7)}.${frac.toString().padStart(18, '0').slice(0, 4)}`;
}

async function verifyOwner(): Promise<void> {
  const ownerKey = process.env.MERKLE_OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerKey) throw new Error('MERKLE_OWNER_PRIVATE_KEY (or contracts/.env PRIVATE_KEY) is not set');

  const ownerAccount = privateKeyToAccount(ownerKey);
  const client = createPublicClient({
    chain: pulsechain,
    transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
  });
  const ownerAbi = parseAbi(['function owner() view returns (address)']);

  const [holderOwner, lpOwner, plsBalance] = await Promise.all([
    client.readContract({ address: HOLDER_CONTRACT, abi: ownerAbi, functionName: 'owner' }) as Promise<`0x${string}`>,
    client.readContract({ address: LP_CONTRACT, abi: ownerAbi, functionName: 'owner' }) as Promise<`0x${string}`>,
    client.getBalance({ address: ownerAccount.address }),
  ]);

  console.log('Owner key wallet :', ownerAccount.address);
  console.log('Holder contract owner:', holderOwner);
  console.log('LP     contract owner:', lpOwner);
  console.log('Owner wallet PLS    :', (Number(plsBalance) / 1e18).toFixed(4));
  console.log();

  if (holderOwner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
    throw new Error(`Owner key does not match holder contract owner (${holderOwner})`);
  }
  if (lpOwner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
    throw new Error(`Owner key does not match LP contract owner (${lpOwner})`);
  }
  if (plsBalance < 10n ** 18n) {
    throw new Error('Owner wallet has < 1 PLS — not enough for revoke gas');
  }
}

interface ReclaimResult {
  results: Array<{
    epochNumber: number;
    epochId: number;
    reclaimableWei: string;
    reclaimedSnapshots: number;
    revoked: boolean;
    txHash?: string;
    error?: string;
  }>;
  totalReclaimedWei: string;
}

function summarize(label: string, out: ReclaimResult) {
  console.log(`\n=== ${label} reclamation result ===`);
  if (out.results.length === 0) {
    console.log('  (no candidate epochs)');
    return;
  }
  console.log('  ep# |  reward (MORBIUS)  | snaps | revoked | tx / error');
  console.log('  ----+--------------------+-------+---------+-----------');
  for (const r of out.results) {
    const tx = r.txHash ? r.txHash.slice(0, 14) + '…' : (r.error ?? '');
    console.log(
      `  #${String(r.epochNumber).padStart(3)} | ${fmt(r.reclaimableWei).padStart(18)} | ${String(r.reclaimedSnapshots).padStart(5)} |   ${r.revoked ? 'YES' : 'NO '}   | ${tx}`,
    );
  }
  console.log(`  TOTAL freed: ${fmt(out.totalReclaimedWei)} MORBIUS`);
}

async function main() {
  await verifyOwner();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const holder = new MerkleDropsService(pool);
    const lp = new MerkleDropsLPService(pool);

    console.log('Running HOLDER reclamation...');
    const holderOut = await holder.reclaimStaleSnapshots();
    summarize('HOLDER', holderOut);

    console.log('\nRunning LP reclamation...');
    const lpOut = await lp.reclaimStaleSnapshots();
    summarize('LP    ', lpOut);

    console.log('\nDone.');
    console.log(`Total HOLDER freed: ${fmt(holderOut.totalReclaimedWei)} MORBIUS`);
    console.log(`Total LP    freed: ${fmt(lpOut.totalReclaimedWei)} MORBIUS`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
