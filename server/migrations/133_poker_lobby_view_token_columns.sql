-- Migration 133: Restore lobby view columns dropped by 122_poker_multi_table_tournaments.sql
--
-- 122 added table_count (MTT) but recreated poker_tournament_registrations without
-- is_private, prize_token_*, and creator_fee_percent from 121. That broke custom
-- PRC-20 buy-in SNGs: listPokerTournaments() returned prizeTokenAddress=null, the
-- lobby showed wei buy-ins as "chips", and join skipped EscrowBuyInJoinPanel while
-- the server still required joinEscrowTxHash.
--
-- Merge 121 token/privacy/fee columns with 122 table_count + table_id ordering.

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
  t.creator_fee_percent,
  COUNT(te.id) FILTER (WHERE te.status NOT IN ('busted', 'completed')) AS registered_count,
  (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id ORDER BY pt.table_seq NULLS LAST, pt.created_at LIMIT 1) AS table_id,
  (SELECT COUNT(*) FROM poker_tables pt WHERE pt.tournament_id = t.id) AS table_count,
  t.scheduled_start_at
FROM tournaments t
LEFT JOIN tournament_entries te ON te.tournament_id = t.id
WHERE t.game_type = 'poker'
  AND t.status IN ('registration', 'active')
GROUP BY t.id;

COMMENT ON VIEW poker_tournament_registrations IS
  'Poker lobby list: registration/active tournaments with token metadata, privacy, creator fee, and MTT table_count.';
