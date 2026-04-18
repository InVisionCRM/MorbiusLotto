#!/usr/bin/env node
/**
 * Deletes ALL rows for poker SNG tournaments (game_type = 'poker') and linked poker_tables.
 * Does not touch blackjack tournaments or cash-only poker tables.
 *
 * Usage (from repo root or server/):
 *   I_UNDERSTAND_DELETE_ALL_POKER_TOURNAMENTS=YES node server/scripts/clear-poker-tournaments.js
 *
 * Loads server/.env for DATABASE_URL (same as run-migration.js).
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

if (process.env.I_UNDERSTAND_DELETE_ALL_POKER_TOURNAMENTS !== 'YES') {
  console.error(
    'Refusing to run: set I_UNDERSTAND_DELETE_ALL_POKER_TOURNAMENTS=YES to delete all poker tournament data.',
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL is not set (check server/.env).');
  process.exit(1);
}

const useVerifyFull = /sslmode=verify-full|sslmode=verify-ca/i.test(url);
const isNeon = url.includes('neon.tech');
const pool = new Pool({
  connectionString: url,
  ssl: isNeon ? (useVerifyFull ? { rejectUnauthorized: true } : { rejectUnauthorized: false }) : false,
});

const sqlPath = path.join(__dirname, 'clear-poker-tournaments-data.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const client = await pool.connect();
  try {
    console.log('Deleting all poker tournament data (game_type = poker)…');
    await client.query(sql);
    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
