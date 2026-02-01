#!/usr/bin/env node
/**
 * Run a single migration file. Usage: node run-migration.js migrations/010_chat_messages.sql
 * Loads .env from server directory and uses DATABASE_URL.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const migrationFile = process.argv[2] || 'migrations/010_chat_messages.sql';
const fullPath = path.isAbsolute(migrationFile) ? migrationFile : path.join(__dirname, migrationFile);
const sql = fs.readFileSync(fullPath, 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration completed:', fullPath);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
