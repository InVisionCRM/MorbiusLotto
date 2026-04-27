-- Human-readable ERC-20 name at create (e.g. from PulseScan picker). Display in lobby/history/HUD; symbol stays the ticker.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_token_name VARCHAR(64) DEFAULT NULL;

COMMENT ON COLUMN tournaments.prize_token_name IS
  'Token contract name for display (e.g. "Wrapped Pulse"). Null = use symbol or generic label.';

DROP VIEW IF EXISTS poker_tournament_registrations;

CREATE VIEW poker_tournament_registrations AS
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
  t.is_private,
  t.prize_token_address,
  t.prize_token_decimals,
  t.prize_token_symbol,
  t.prize_token_name,
  COUNT(te.id) FILTER (WHERE te.status NOT IN ('busted', 'completed')) AS registered_count,
  (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id LIMIT 1) AS table_id,
  t.scheduled_start_at
FROM tournaments t
LEFT JOIN tournament_entries te ON te.tournament_id = t.id
WHERE t.game_type = 'poker'
  AND t.status IN ('registration', 'active')
GROUP BY t.id;
