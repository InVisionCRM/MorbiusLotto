-- Migration 122: Multi-Table Tournaments (MTT) for poker.
--
-- `poker_tables` already supports multiple rows per tournament — the schema
-- never required a unique index on `tournament_id`. This migration only adds
-- two display/coordination columns and updates the lobby view so callers can
-- tell SNG (1 table) apart from MTT (N tables).
--
--   table_seq         1-based label within a tournament ("Table 1", "Table 2", …)
--                     stable for the life of the table — the final table also
--                     keeps its own seq for the post-tourney verify links.
--   is_final_table    flipped TRUE on the surviving table after consolidation.
--                     Used by the HUD to show "Final Table" badge + by the
--                     post-hand consolidation guard to no-op when already final.

ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS table_seq INTEGER,
  ADD COLUMN IF NOT EXISTS is_final_table BOOLEAN NOT NULL DEFAULT FALSE;

-- Index so the per-tournament table listing (lobby + HUD) stays cheap as we
-- add more tables. Partial: only tournament tables have a tournament_id.
CREATE INDEX IF NOT EXISTS idx_poker_tables_tournament_seq
  ON poker_tables (tournament_id, table_seq)
  WHERE tournament_id IS NOT NULL;

-- Replace the lobby view: expose `table_count` so the lobby can render
-- "3 tables · 18 players" for MTTs without an extra round-trip. Single-table
-- (SNG) rows still show `table_id` so old client code keeps working.
DROP VIEW IF EXISTS poker_tournament_registrations;
CREATE OR REPLACE VIEW poker_tournament_registrations AS
SELECT
  t.id                  AS tournament_id,
  t.name,
  t.status,
  t.prize_pool,
  t.buy_in_amount,
  t.starting_chips,
  t.poker_config,
  t.creator_address,
  t.prize_distribution_type,
  t.min_players,
  t.max_players,
  t.created_at,
  COUNT(te.id) FILTER (WHERE te.status NOT IN ('busted', 'completed')) AS registered_count,
  (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id ORDER BY pt.table_seq NULLS LAST, pt.created_at LIMIT 1) AS table_id,
  (SELECT COUNT(*) FROM poker_tables pt WHERE pt.tournament_id = t.id) AS table_count,
  t.scheduled_start_at
FROM tournaments t
LEFT JOIN tournament_entries te ON te.tournament_id = t.id
WHERE t.game_type = 'poker'
  AND t.status IN ('registration', 'active')
GROUP BY t.id;

COMMENT ON COLUMN poker_tables.table_seq IS
  'MTT: 1-based table label within a tournament (Table 1 / Table 2 …). NULL for cash + legacy single-table SNG tables.';
COMMENT ON COLUMN poker_tables.is_final_table IS
  'MTT: set TRUE on the surviving table after consolidation so the HUD can show "Final Table".';
