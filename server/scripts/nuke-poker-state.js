/**
 * Option C: Nuke all poker state without refunds.
 *
 * Wipes cash tables, poker hands/actions, seats, and cancels all active
 * poker tournaments. No balances credited — players lose in-flight chips
 * and tournament buy-ins. Run before switching chip scale to 1:1.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM poker_tables) AS tables,
        (SELECT COUNT(*) FROM poker_seats) AS seats,
        (SELECT COUNT(*) FROM poker_hands) AS hands,
        (SELECT COUNT(*) FROM poker_hand_actions) AS actions,
        (SELECT COUNT(*) FROM tournaments WHERE game_type='poker' AND status IN ('pending','registration','active')) AS active_tournaments
    `);
    console.log('Before:', before.rows[0]);

    // Delete hand-level history first (FKs to poker_hands)
    await client.query('DELETE FROM poker_hand_actions');
    await client.query('DELETE FROM poker_hands');

    // Seats and tables
    await client.query('DELETE FROM poker_seats');
    await client.query('DELETE FROM poker_tables');

    // Cancel active poker tournaments without refund
    const tournaments = await client.query(`
      UPDATE tournaments
      SET status='cancelled', ended_at=NOW()
      WHERE game_type='poker' AND status IN ('pending','registration','active')
      RETURNING id, name
    `);
    console.log(`Cancelled ${tournaments.rows.length} poker tournaments (no refunds)`);

    const after = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM poker_tables) AS tables,
        (SELECT COUNT(*) FROM poker_seats) AS seats,
        (SELECT COUNT(*) FROM poker_hands) AS hands,
        (SELECT COUNT(*) FROM poker_hand_actions) AS actions,
        (SELECT COUNT(*) FROM tournaments WHERE game_type='poker' AND status IN ('pending','registration','active')) AS active_tournaments
    `);
    console.log('After:', after.rows[0]);

    await client.query('COMMIT');
    console.log('Nuke committed.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rollback:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
