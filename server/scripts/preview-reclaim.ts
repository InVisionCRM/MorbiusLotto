// Dry-run: preview what stale-snapshot reclamation would free up for both
// holder and LP merkle drops. No on-chain writes, no DB writes — uses the
// real service `previewReclaimStaleSnapshots()` so it matches exactly what
// the cron / admin endpoints will see.
//
// Usage (from /Users/kyle/MORBlotto/server):
//   npx ts-node -r dotenv/config scripts/preview-reclaim.ts
import { Pool } from 'pg';
import { MerkleDropsService } from '../src/services/merkle-drops.service';
import { MerkleDropsLPService } from '../src/services/merkle-lp-drops.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function fmt(weiStr: string): string {
  const n = BigInt(weiStr);
  const whole = n / 10n ** 18n;
  const frac = n % 10n ** 18n;
  return `${whole.toString().padStart(7)}.${frac.toString().padStart(18, '0').slice(0, 4)}`;
}

interface PreviewResult {
  ageDays: number;
  minEpochsBack: number;
  candidates: Array<{
    epochNumber: number;
    epochId: number;
    publishedAt: string;
    unclaimedSnapshots: number;
    reclaimableWei: string;
    onChainClaimedWei: string;
    revocable: boolean;
  }>;
  totalReclaimableWei: string;
}

function showPreview(label: string, preview: PreviewResult) {
  console.log(`\n=== ${label} reclamation preview ===`);
  console.log(`  Settings: age >= ${preview.ageDays} days, skip last ${preview.minEpochsBack} epochs`);
  console.log(`  Candidate epochs: ${preview.candidates.length}`);
  if (preview.candidates.length === 0) {
    console.log('  (no eligible epochs)');
    return;
  }
  console.log('  ep# | snaps |     reclaimable | on-chain claimed | revocable');
  console.log('  ----+-------+-----------------+------------------+----------');
  for (const c of preview.candidates) {
    console.log(
      `  #${String(c.epochNumber).padStart(3)} | ${String(c.unclaimedSnapshots).padStart(5)} | ${fmt(c.reclaimableWei)} | ${fmt(c.onChainClaimedWei)} |   ${c.revocable ? 'YES' : 'NO '}`,
    );
  }
  console.log(`  TOTAL reclaimable (revocable only): ${fmt(preview.totalReclaimableWei)} MORBIUS`);
}

async function main() {
  const holder = new MerkleDropsService(pool);
  const lp = new MerkleDropsLPService(pool);

  showPreview('HOLDER', await holder.previewReclaimStaleSnapshots());
  showPreview('LP    ', await lp.previewReclaimStaleSnapshots());
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
