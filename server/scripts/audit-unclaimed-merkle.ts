/**
 * Read-only audit of unclaimed MORBIUS still owed via published merkle epochs.
 *
 * Run BEFORE the first chip-rewards finalize. The finalize rescues the entire
 * MerkleClaim vault balance — any holder with an outstanding allocation from
 * a past epoch loses on-chain claim ability the moment the vault is drained.
 *
 * No on-chain writes, no DB writes. Just reports.
 *
 * Usage (from /Users/kyle/morbius.io/server):
 *   npx ts-node -r dotenv/config scripts/audit-unclaimed-merkle.ts
 *
 * Flags:
 *   --detail     also lists top 10 unclaimed wallets per epoch (slower; batches hasClaimed)
 *   --top=N      override the top-N count (default 10)
 *   --recent=N   only audit the N most recent published epochs (default 5)
 */

import { Pool } from 'pg';
import { getEpochClaimedAmount as getMorbiusEpochClaimed, checkHasClaimed as checkMorbiusHasClaimed, getContractMorbiusBalance as getMorbiusVaultBalance } from '../src/utils/merkle-claim';
import { getEpochClaimedAmount as getLpEpochClaimed, checkHasClaimed as checkLpHasClaimed, getContractMorbiusBalance as getLpVaultBalance } from '../src/utils/merkle-claim-lp';

const E18 = 10n ** 18n;

interface CliArgs {
  detail: boolean;
  topN: number;
  recentN: number;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { detail: false, topN: 10, recentN: 5 };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--detail') args.detail = true;
    else if (arg.startsWith('--top=')) args.topN = Number(arg.slice('--top='.length)) || 10;
    else if (arg.startsWith('--recent=')) args.recentN = Number(arg.slice('--recent='.length)) || 5;
  }
  return args;
}

function fmtMorbius(wei: bigint): string {
  const whole = wei / E18;
  const frac = wei % E18;
  const fracStr = (frac.toString().padStart(18, '0')).slice(0, 2);
  // Add thousand separators to whole part
  const wholeFmt = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${wholeFmt}.${fracStr}`;
}

function fmtPct(part: bigint, whole: bigint): string {
  if (whole === 0n) return '0.00%';
  const bps = (part * 10_000n) / whole;
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

type Cohort = 'morbius' | 'lp';

interface PublishedEpochRow {
  id: number;
  epoch_number: number;
  total_reward_amount: string;
  published_at: string;
}

async function listPublishedEpochs(
  pool: Pool,
  cohort: Cohort,
  recentN: number,
): Promise<PublishedEpochRow[]> {
  const table = cohort === 'morbius' ? 'merkle_epochs' : 'merkle_lp_epochs';
  const { rows } = await pool.query<PublishedEpochRow>(
    `SELECT id, epoch_number, total_reward_amount::text AS total_reward_amount, published_at::text AS published_at
     FROM ${table}
     WHERE status = 'published'
     ORDER BY epoch_number DESC
     LIMIT $1`,
    [recentN],
  );
  return rows;
}

interface WalletAllocation {
  wallet_address: string;
  reward_amount: string;
}

async function listSnapshotAllocations(pool: Pool, cohort: Cohort, epochId: number): Promise<WalletAllocation[]> {
  const table = cohort === 'morbius' ? 'merkle_snapshots' : 'merkle_lp_snapshots';
  const { rows } = await pool.query<WalletAllocation>(
    `SELECT wallet_address, reward_amount::text AS reward_amount
     FROM ${table}
     WHERE epoch_id = $1 AND superseded_by_epoch_id IS NULL AND reward_amount > 0
     ORDER BY reward_amount DESC`,
    [epochId],
  );
  return rows;
}

interface EpochAudit {
  cohort: Cohort;
  epochNumber: number;
  publishedAt: string;
  totalRewardWei: bigint;
  onChainClaimedWei: bigint;
  unclaimedWei: bigint;
  pctClaimed: string;
}

async function auditEpoch(cohort: Cohort, row: PublishedEpochRow): Promise<EpochAudit> {
  const totalRewardWei = BigInt(row.total_reward_amount);
  const onChainClaimedWei =
    cohort === 'morbius'
      ? await getMorbiusEpochClaimed(row.epoch_number)
      : await getLpEpochClaimed(row.epoch_number);
  const unclaimedWei = totalRewardWei > onChainClaimedWei ? totalRewardWei - onChainClaimedWei : 0n;
  return {
    cohort,
    epochNumber: row.epoch_number,
    publishedAt: row.published_at,
    totalRewardWei,
    onChainClaimedWei,
    unclaimedWei,
    pctClaimed: fmtPct(onChainClaimedWei, totalRewardWei),
  };
}

function printCohortSummary(cohort: Cohort, audits: EpochAudit[], vaultBalance: bigint) {
  console.log(`\n=== ${cohort.toUpperCase()} cohort ===`);
  console.log(`  ▶ Real exposure (vault balance — what gets swept on first finalize): ${fmtMorbius(vaultBalance)} MORBIUS`);
  if (audits.length === 0) {
    console.log('  No published epochs found.');
    return;
  }
  console.log('  Recent epoch claim activity (informational — batch-disperse pushes do NOT show as "claimed"):');
  console.log('  ──────────────────────────────────────────────────────────────────────');
  console.log('  Epoch | Published         |          Allocated |     Claimed via UI | % via UI');
  console.log('  ──────┼───────────────────┼────────────────────┼────────────────────┼─────────');
  for (const a of audits) {
    const pub = new Date(a.publishedAt).toISOString().slice(0, 10);
    console.log(
      `  #${String(a.epochNumber).padStart(4)} | ${pub} | ${fmtMorbius(a.totalRewardWei).padStart(18)} | ${fmtMorbius(a.onChainClaimedWei).padStart(18)} | ${a.pctClaimed.padStart(7)}`,
    );
  }
  console.log('  ──────┴───────────────────┴────────────────────┴────────────────────┴─────────');
  console.log('  Notes:');
  console.log('    · Each epoch\'s "Allocated" already includes rolled-up unclaimed from prior epochs.');
  console.log('    · Past rescue → MorbiusBatchDisperse settlements don\'t increment on-chain epochClaimedAmount.');
  console.log('    · Therefore "Claimed via UI" reflects only ClaimMerkle() txns by holders themselves.');
  console.log('    · Single source of truth for "what\'s owed" = current vault balance (above).');
}

async function listTopUnclaimedWallets(
  pool: Pool,
  cohort: Cohort,
  epoch: EpochAudit & { dbId: number },
  topN: number,
): Promise<Array<{ wallet: string; amount: bigint }>> {
  if (epoch.unclaimedWei === 0n) return [];
  const allocations = await listSnapshotAllocations(pool, cohort, epoch.dbId);
  const checker = cohort === 'morbius' ? checkMorbiusHasClaimed : checkLpHasClaimed;
  const top: Array<{ wallet: string; amount: bigint }> = [];

  for (const a of allocations) {
    if (top.length >= topN) break;
    try {
      const claimed = await checker(epoch.epochNumber, a.wallet_address);
      if (!claimed) {
        top.push({ wallet: a.wallet_address, amount: BigInt(a.reward_amount) });
      }
    } catch {
      // skip on RPC error
    }
  }
  return top;
}

function printTopUnclaimedDetail(epoch: EpochAudit, top: Array<{ wallet: string; amount: bigint }>) {
  if (top.length === 0) return;
  console.log(`\n  Epoch #${epoch.epochNumber} — top ${top.length} unclaimed wallets:`);
  for (const { wallet, amount } of top) {
    console.log(`    ${wallet}  ${fmtMorbius(amount).padStart(18)} MORBIUS`);
  }
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing. Run with: npx ts-node -r dotenv/config scripts/audit-unclaimed-merkle.ts');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Unclaimed Merkle Audit — pre-decommission exposure check');
  console.log(`  Recent epochs: ${args.recentN} · Detail mode: ${args.detail ? `top ${args.topN}` : 'off'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Vault balances (sanity check against unclaimed totals)
  const [morbiusVault, lpVault] = await Promise.all([
    getMorbiusVaultBalance().catch(() => 0n),
    getLpVaultBalance().catch(() => 0n),
  ]);

  // ── Morbius cohort ──────────────────────────────────────────────
  const morbiusEpochs = await listPublishedEpochs(pool, 'morbius', args.recentN);
  const morbiusAudits: Array<EpochAudit & { dbId: number }> = [];
  for (const row of morbiusEpochs) {
    const a = await auditEpoch('morbius', row);
    morbiusAudits.push({ ...a, dbId: row.id });
  }
  printCohortSummary('morbius', morbiusAudits, morbiusVault);
  if (args.detail) {
    for (const a of morbiusAudits) {
      const top = await listTopUnclaimedWallets(pool, 'morbius', a, args.topN);
      printTopUnclaimedDetail(a, top);
    }
  }

  // ── LP cohort ───────────────────────────────────────────────────
  const lpEpochs = await listPublishedEpochs(pool, 'lp', args.recentN);
  const lpAudits: Array<EpochAudit & { dbId: number }> = [];
  for (const row of lpEpochs) {
    const a = await auditEpoch('lp', row);
    lpAudits.push({ ...a, dbId: row.id });
  }
  printCohortSummary('lp', lpAudits, lpVault);
  if (args.detail) {
    for (const a of lpAudits) {
      const top = await listTopUnclaimedWallets(pool, 'lp', a, args.topN);
      printTopUnclaimedDetail(a, top);
    }
  }

  // ── Grand decision summary ──────────────────────────────────────
  const grandVault = morbiusVault + lpVault;
  const morbiusLatest = morbiusAudits[0];
  const lpLatest = lpAudits[0];

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Decision summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  MORBIUS vault: ${fmtMorbius(morbiusVault)} MORBIUS`);
  console.log(`  LP vault:      ${fmtMorbius(lpVault)} MORBIUS`);
  console.log(`  ───────────────────`);
  console.log(`  Total chip pool on first finalize: ${fmtMorbius(grandVault)} MORBIUS`);

  if (morbiusLatest) {
    console.log(`\n  Latest morbius epoch is #${morbiusLatest.epochNumber} (published ${new Date(morbiusLatest.publishedAt).toISOString().slice(0,10)}).`);
  }
  if (lpLatest) {
    console.log(`  Latest LP epoch is #${lpLatest.epochNumber} (published ${new Date(lpLatest.publishedAt).toISOString().slice(0,10)}).`);
  }

  console.log('\n  Decision tree:');
  if (grandVault === 0n) {
    console.log('  ✓ Both vaults are empty. Nothing to settle. Run chip-epoch finalize whenever fees accrue.');
  } else {
    console.log('  Option A — sweep & credit (recommended):');
    console.log(`    POST /api/admin/holder-rewards/epochs { cohort: "morbius" }   → snapshots current holders`);
    console.log(`    POST /api/admin/holder-rewards/epochs/:id/finalize             → rescues ${fmtMorbius(morbiusVault)} + credits chips`);
    console.log('    (then repeat for cohort="lp")');
    console.log('  Option B — settle outstanding merkle claims first:');
    console.log('    Run existing contracts/scripts/merkle/disperse/disperse-merkle-epoch.js per RUNBOOK.md');
    console.log('    Then run Option A. Cleanest cut-over; favored if a public claim deadline was promised.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
