-- Migration 063: Sit & Go Poker Tournaments
-- Bridges the existing tournament system with the poker game system.
-- Adds tournament_mode to poker_tables (virtual chips, no balance deduction/credit).
-- Adds game_type + poker_config to tournaments for SNG-specific config.

-- 1. Add tournament linkage to poker_tables
ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tournament_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_poker_tables_tournament_id
  ON poker_tables(tournament_id)
  WHERE tournament_id IS NOT NULL;

-- 2. Extend tournaments with poker config and game type
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS poker_config JSONB,
  ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'blackjack';

-- Ensure status constraint includes all values (idempotent)
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('registration', 'active', 'completed', 'cancelled'));

-- 3. Bridge table: links player positions in poker_seats to tournament_entries
--    Tracks elimination order and final rank per player.
CREATE TABLE IF NOT EXISTS poker_tournament_seats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  entry_id         UUID NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
  table_id         UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  player_address   VARCHAR(42) NOT NULL,
  eliminated_at    TIMESTAMPTZ,
  final_rank       INT,
  UNIQUE(tournament_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_poker_tournament_seats_tournament
  ON poker_tournament_seats(tournament_id);
CREATE INDEX IF NOT EXISTS idx_poker_tournament_seats_table
  ON poker_tournament_seats(table_id);

-- 4. Helper view for the poker tournament lobby
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
  (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id LIMIT 1) AS table_id,
  t.scheduled_start_at
FROM tournaments t
LEFT JOIN tournament_entries te ON te.tournament_id = t.id
WHERE t.game_type = 'poker'
  AND t.status IN ('registration', 'active')
GROUP BY t.id;

COMMENT ON COLUMN tournaments.game_type IS 'blackjack (default) | poker';
COMMENT ON COLUMN tournaments.poker_config IS
  'Poker SNG config: { startingStack, minPlayers, maxPlayers, blindSchedule: [{level,smallBlind,bigBlind,handsPerLevel}] }';
COMMENT ON TABLE poker_tournament_seats IS
  'Bridge table linking poker seat positions to tournament entries for SNG tournaments.';
