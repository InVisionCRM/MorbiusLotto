-- Migration 096: Keep poker hand rows when a tournament table row is deleted (SNG cleanup).
-- Adds tournament_id on hands, backfills from poker_tables, and sets table FK to ON DELETE SET NULL.

ALTER TABLE poker_hands
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_poker_hands_tournament_id
  ON poker_hands (tournament_id)
  WHERE tournament_id IS NOT NULL;

UPDATE poker_hands ph
SET tournament_id = pt.tournament_id
FROM poker_tables pt
WHERE ph.table_id = pt.id
  AND pt.tournament_id IS NOT NULL
  AND ph.tournament_id IS NULL;

ALTER TABLE poker_hands
  ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE poker_hands
  DROP CONSTRAINT IF EXISTS poker_hands_table_id_fkey;

ALTER TABLE poker_hands
  ADD CONSTRAINT poker_hands_table_id_fkey
  FOREIGN KEY (table_id) REFERENCES poker_tables(id) ON DELETE SET NULL;
