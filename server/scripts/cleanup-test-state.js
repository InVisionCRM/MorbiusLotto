/* eslint-disable @typescript-eslint/no-var-requires */
// Dev/test helper: scrub leftover poker_seats and reseed test players.
// Tests assume a clean DB; previous runs (or aborted runs) sometimes leave
// stale seat rows that make `joinTable` throw "Already seated".
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const TEST_PLAYERS = [
  '0x000000000000000000000000000000000000dead',
  '0x000000000000000000000000000000000000beef',
  '0x000000000000000000000000000000000000cafe',
  '0x000000000000000000000000000000000000babe',
  '0x000000000000000000000000000000000000face',
  '0x000000000000000000000000000000000000fade',
];

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const lower = TEST_PLAYERS.map((a) => a.toLowerCase());
    const r1 = await p.query(
      'SELECT DISTINCT table_id FROM poker_seats WHERE LOWER(player_address) = ANY($1::text[])',
      [lower],
    );
    console.log('stale poker tables to clear:', r1.rows.length);
    for (const row of r1.rows) {
      await p.query('DELETE FROM poker_tables WHERE id = $1', [row.table_id]);
    }
    await p.query(
      `INSERT INTO players (wallet_address, balance)
       SELECT unnest($1::text[]), '10000000000000000000000000'::NUMERIC
       ON CONFLICT (wallet_address) DO UPDATE SET balance = EXCLUDED.balance`,
      [TEST_PLAYERS],
    );
    console.log('cleanup done');
  } finally {
    await p.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
