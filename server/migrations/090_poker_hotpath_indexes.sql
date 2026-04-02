-- 090: Poker hot-path indexes for timer and active-hand reads.
-- Scope: read-path acceleration only; no schema behavior changes.

-- Auto-fold watchdog path:
--   WHERE completed_at IS NULL
--     AND acting_position IS NOT NULL
--     AND turn_started_at < NOW() - INTERVAL '30 seconds'
CREATE INDEX IF NOT EXISTS idx_poker_hands_turn_timeout_active
  ON poker_hands (turn_started_at)
  WHERE completed_at IS NULL AND acting_position IS NOT NULL;

-- Active-hand lookup by table:
--   WHERE table_id = $1 AND completed_at IS NULL
--   ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_poker_hands_table_active_created_desc
  ON poker_hands (table_id, created_at DESC)
  WHERE completed_at IS NULL;
