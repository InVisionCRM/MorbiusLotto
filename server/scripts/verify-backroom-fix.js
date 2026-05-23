/**
 * Read-only verification for "The Backroom" payout-swap correction.
 *
 * Prints:
 *   1. The tournament row (id, name, status, ended_at)
 *   2. Each entry's final_rank / prize_won and player_poker_chips.balance
 *   3. Any poker_chip_ledger entries referencing this tournament_id (so the
 *      audit trail from the correction script is visible)
 *
 * Interpretation:
 *   - Post-fix expected: Midas (0x8997...6c4f) rank=2 prize=142500;
 *                        MVS   (0xcc72...9285) rank=3 prize=95000;
 *     and the ledger shows two correction rows (one +47500, one -47500,
 *     ref_type='tournament_correction').
 *   - Pre-fix state:    MVS rank=2 / Midas rank=3 with the swapped prizes,
 *                       and no 'tournament_correction' ledger rows.
 *
 * Usage:
 *   node server/scripts/verify-backroom-fix.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
const useVerifyFull = /sslmode=verify-full|sslmode=verify-ca/i.test(url);
const isNeon = url.includes('neon.tech');
const pool = new Pool({
  connectionString: url,
  ssl: isNeon ? (useVerifyFull ? { rejectUnauthorized: true } : { rejectUnauthorized: false }) : false,
});

async function main() {
  const client = await pool.connect();
  try {
    const t = await client.query(
      `SELECT id, name, status, created_at, activated_at, ended_at
         FROM tournaments
        WHERE name = 'The Backroom' AND status = 'completed'
        ORDER BY COALESCE(ended_at, activated_at, created_at) DESC
        LIMIT 1`
    );
    if (t.rows.length === 0) {
      console.log('No completed tournament named "The Backroom" found.');
      return;
    }
    const tourn = t.rows[0];
    console.log('Tournament:');
    console.log('  id:          ', tourn.id);
    console.log('  name:        ', tourn.name);
    console.log('  status:      ', tourn.status);
    console.log('  activated_at:', tourn.activated_at);
    console.log('  ended_at:    ', tourn.ended_at);
    console.log();

    const entries = await client.query(
      `SELECT
         te.id           AS entry_id,
         te.player_address,
         te.final_rank,
         te.prize_won::text       AS prize_won,
         te.chips_remaining::text AS chips_remaining,
         te.highest_chip_count::text AS peak,
         te.hands_played,
         te.status,
         te.finished_at,
         COALESCE(ppc.balance::text, '0') AS wallet_balance
       FROM tournament_entries te
       LEFT JOIN player_poker_chips ppc
         ON ppc.wallet_address = LOWER(te.player_address)
       WHERE te.tournament_id = $1
       ORDER BY te.final_rank NULLS LAST, te.hands_played DESC`,
      [tourn.id]
    );

    console.log('Entries (sorted by final_rank):');
    for (const r of entries.rows) {
      console.log(
        `  rank=${r.final_rank ?? '-'} ` +
          `addr=${r.player_address} ` +
          `prize_won=${r.prize_won} ` +
          `peak=${r.peak} ` +
          `hands=${r.hands_played} ` +
          `finished_at=${r.finished_at} ` +
          `wallet_balance=${r.wallet_balance}`
      );
    }
    console.log();

    const ledger = await client.query(
      `SELECT created_at, wallet_address, delta::text AS delta,
              balance_after::text AS balance_after, reason, ref_type
         FROM poker_chip_ledger
        WHERE ref_id = $1
        ORDER BY created_at ASC`,
      [tourn.id]
    );
    console.log(`Ledger entries referencing this tournament (${ledger.rows.length}):`);
    for (const r of ledger.rows) {
      console.log(
        `  ${r.created_at.toISOString()} ` +
          `wallet=${r.wallet_address} delta=${r.delta} after=${r.balance_after} ` +
          `reason=${r.reason} ref_type=${r.ref_type}`
      );
    }
    console.log();

    const mvs = entries.rows.find((r) => /0xcc72.*9285$/i.test(r.player_address));
    const midas = entries.rows.find((r) => /0x8997.*6c4f$/i.test(r.player_address));
    const correctionRows = ledger.rows.filter((r) => r.ref_type === 'tournament_correction');

    console.log('Verdict:');
    if (!mvs || !midas) {
      console.log('  Could not locate both MVS and Midas entries — check output above.');
    } else if (
      midas.final_rank === 2 &&
      midas.prize_won === '142500' &&
      mvs.final_rank === 3 &&
      mvs.prize_won === '95000' &&
      correctionRows.length === 2
    ) {
      console.log('  ✓ Correction applied. Midas is 2nd (142,500), MVS is 3rd (95,000);');
      console.log('    ledger shows 2 tournament_correction rows.');
    } else if (
      mvs.final_rank === 2 &&
      mvs.prize_won === '142500' &&
      midas.final_rank === 3 &&
      midas.prize_won === '95000' &&
      correctionRows.length === 0
    ) {
      console.log('  ✗ Pre-fix state detected — the correction script has NOT been run yet.');
      console.log('    Run: node server/run-migration.js scripts/fix-backroom-2026-05-23-payout-swap.sql');
    } else {
      console.log('  ? Unexpected state. Inspect the entries + ledger output above.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
