import type { Pool } from 'pg';
import { STATIC_HOLDER_SNAPSHOT_EXCLUSIONS } from '../config/snapshot-exclusions';

/** Merge DB blocklist, static protocol exclusions, and all LP pair addresses. */
export async function loadHolderSnapshotBlocklist(pool: Pool): Promise<Set<string>> {
  const blocklist = new Set<string>();

  for (const addr of STATIC_HOLDER_SNAPSHOT_EXCLUSIONS) {
    if (addr) blocklist.add(addr.toLowerCase());
  }

  const { rows: blockedRows } = await pool.query<{ address: string }>(
    'SELECT address FROM merkle_blocklist',
  );
  for (const row of blockedRows) {
    blocklist.add(row.address.toLowerCase());
  }

  const { rows: lpPairs } = await pool.query<{ pair_address: string }>(
    'SELECT pair_address FROM merkle_lp_pairs',
  );
  for (const row of lpPairs) {
    blocklist.add(row.pair_address.toLowerCase());
  }

  return blocklist;
}

/** LP snapshots use merkle_lp_blocklist + static protocol exclusions. */
export async function loadLpSnapshotBlocklist(pool: Pool): Promise<Set<string>> {
  const blocklist = new Set<string>();

  for (const addr of STATIC_HOLDER_SNAPSHOT_EXCLUSIONS) {
    if (addr) blocklist.add(addr.toLowerCase());
  }

  const { rows: blockedRows } = await pool.query<{ address: string }>(
    'SELECT address FROM merkle_lp_blocklist',
  );
  for (const row of blockedRows) {
    blocklist.add(row.address.toLowerCase());
  }

  return blocklist;
}
