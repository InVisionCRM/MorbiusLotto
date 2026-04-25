-- Surface custom-token prize info in the poker lobby view so clients can render
-- "1,000 HEX" instead of "1000000000000000000000 chips" for custom-token freerolls.

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
  COUNT(te.id) FILTER (WHERE te.status NOT IN ('busted', 'completed')) AS registered_count,
  (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id LIMIT 1) AS table_id,
  t.scheduled_start_at
FROM tournaments t
LEFT JOIN tournament_entries te ON te.tournament_id = t.id
WHERE t.game_type = 'poker'
  AND t.status IN ('registration', 'active')
GROUP BY t.id;
