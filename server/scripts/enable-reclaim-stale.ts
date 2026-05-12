// Flip reclaim_stale_enabled from 'false' to 'true' on both holder and LP
// settings tables. Run once.
//
// Usage (from /Users/kyle/MORBlotto/server):
//   npx ts-node --transpile-only scripts/enable-reclaim-stale.ts
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(__dirname, '..', '.env') });

import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const keys = ['reclaim_stale_enabled', 'reclaim_stale_age_days', 'reclaim_min_epochs_back'];

  async function dump(label: string) {
    const h = await pool.query(
      `SELECT key, value FROM merkle_settings WHERE key = ANY($1) ORDER BY key`,
      [keys],
    );
    const l = await pool.query(
      `SELECT key, value FROM merkle_lp_settings WHERE key = ANY($1) ORDER BY key`,
      [keys],
    );
    console.log(`\n--- ${label} ---`);
    console.log('HOLDER (merkle_settings):');
    for (const r of h.rows) console.log(`  ${r.key.padEnd(28)} = ${r.value}`);
    console.log('LP     (merkle_lp_settings):');
    for (const r of l.rows) console.log(`  ${r.key.padEnd(28)} = ${r.value}`);
  }

  await dump('BEFORE');

  const a = await pool.query(
    `UPDATE merkle_settings SET value = 'true', updated_at = NOW()
     WHERE key = 'reclaim_stale_enabled' RETURNING key, value`,
  );
  const b = await pool.query(
    `UPDATE merkle_lp_settings SET value = 'true', updated_at = NOW()
     WHERE key = 'reclaim_stale_enabled' RETURNING key, value`,
  );
  console.log(`\nUpdated rows: holder=${a.rowCount}, lp=${b.rowCount}`);

  await dump('AFTER');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
