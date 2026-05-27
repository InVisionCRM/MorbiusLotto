-- Migration 139: Fix telegram_cash_table_cards.table_id type.
--
-- Original migration 126 declared table_id as TEXT, but poker_tables.id is UUID.
-- The LEFT JOIN in loadCashCard (telegram-rail.service.ts) compares the two
-- directly (c.table_id = t.id), which Postgres rejects with
--   "operator does not exist: text = uuid"
-- on every cash-table join — spamming logs and silently breaking the Rail
-- card refresh + sit-down activity line.
--
-- All existing values are UUID strings inserted from JS, so the cast is safe.

ALTER TABLE telegram_cash_table_cards
  ALTER COLUMN table_id TYPE UUID USING table_id::uuid;
