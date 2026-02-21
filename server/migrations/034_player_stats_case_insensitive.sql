-- Migration: Make get_player_stats wallet lookup case-insensitive
-- Matches get_player_stats_enhanced and getPlayerGames so stats return a row when games do.
-- Fixes stats showing 0 when chart has data (games API uses LOWER(...), basic stats used exact match).

SET lock_timeout = '3s';
SET statement_timeout = '20s';

DROP FUNCTION IF EXISTS get_player_stats(character varying);
CREATE OR REPLACE FUNCTION get_player_stats(player_wallet VARCHAR(42))
RETURNS TABLE (
    total_games BIGINT,
    total_bet NUMERIC(78, 0),
    total_win NUMERIC(78, 0),
    win_rate DECIMAL,
    blackjack_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(g.*)::BIGINT as total_games,
        COALESCE(SUM(g.total_bet_amount), 0)::NUMERIC(78, 0) as total_bet,
        COALESCE(SUM(g.total_payout), 0)::NUMERIC(78, 0) as total_win,
        CASE
            WHEN COUNT(g.*) > 0 THEN
                ROUND((COUNT(CASE WHEN g.result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(g.*)::DECIMAL) * 100, 2)
            ELSE 0
        END as win_rate,
        COUNT(CASE WHEN g.result = 'blackjack' THEN 1 END)::BIGINT as blackjack_count
    FROM players p
    LEFT JOIN game_sessions gs ON p.id = gs.player_id
    LEFT JOIN games g ON gs.id = g.session_id
        AND g.result IS NOT NULL
        AND g.result != 'ongoing'
    WHERE LOWER(p.wallet_address) = LOWER(player_wallet);
END;
$$ LANGUAGE plpgsql;
