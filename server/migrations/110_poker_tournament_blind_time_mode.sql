-- Time-based blind increase mode for poker tournaments.
--
-- Adds two columns to `poker_tables` so the scheduler can advance blinds on a
-- wall-clock interval (15/30/45/60 min) when `poker_config.blindIncreaseMode`
-- is `'by_time'`:
--
--   current_blind_level         — schedule index currently in effect (1-based).
--   current_blind_level_started_at — when this level became active.
--
-- The scheduler compares (NOW() - current_blind_level_started_at) against
-- `poker_config.blindIntervalMinutes`. When it elapses, the level advances and
-- this timestamp is reset.
--
-- Both columns are nullable: knockout / by_hand tables never read or write them.
ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS current_blind_level INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_blind_level_started_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index for the scheduler's hot-path lookup: only tournament tables
-- that have ever had a level start time recorded need to be scanned.
CREATE INDEX IF NOT EXISTS idx_poker_tables_blind_level_clock
  ON poker_tables (current_blind_level_started_at)
  WHERE tournament_mode = TRUE AND current_blind_level_started_at IS NOT NULL;
