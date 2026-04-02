-- 089: Performance pass hot-path indexes
-- Scope: low-risk read-path acceleration only (no behavior changes).
-- Targets:
--   - multiplayer blackjack timer watchdog queries
--   - tournament status/registration counting queries

-- BJ multi: expired turn watchdog
-- Query shape:
--   WHERE status = 'playing' AND turn_started_at < NOW() - INTERVAL '30 seconds'
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_playing_turn_started
  ON blackjack_multi_rounds (turn_started_at)
  WHERE status = 'playing' AND turn_started_at IS NOT NULL;

-- BJ multi: betting timeout watchdog
-- Query shape:
--   WHERE status = 'betting' AND created_at < NOW() - INTERVAL '15 seconds'
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_betting_created
  ON blackjack_multi_rounds (created_at)
  WHERE status = 'betting';

-- BJ multi: latest round lookups per table/status
-- Query shape:
--   WHERE table_id = $1 AND status = $2 ORDER BY round_number DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_table_status_round_desc
  ON blackjack_multi_rounds (table_id, status, round_number DESC);

-- Tournament: frequent status counts and updates by tournament
-- Query shapes:
--   WHERE tournament_id = $1 AND status = 'playing'
--   WHERE tournament_id = $1 GROUP BY status
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament_status
  ON tournament_entries (tournament_id, status);

-- Tournament: registration-phase counts
-- Query shape:
--   WHERE tournament_id = $1 AND registration_status IN ('registered', 'joined')
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament_registration
  ON tournament_entries (tournament_id, registration_status);
