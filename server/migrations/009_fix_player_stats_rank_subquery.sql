-- Migration: Fix get_player_stats_enhanced function - player_rank subquery returns multiple rows
-- Fixes error: "more than one row returned by a subquery used as an expression"

DROP FUNCTION IF EXISTS get_player_stats_enhanced(character varying);

CREATE OR REPLACE FUNCTION get_player_stats_enhanced(player_wallet VARCHAR(42))
RETURNS TABLE (
    total_games BIGINT,
    total_bet NUMERIC(78, 0),
    total_win NUMERIC(78, 0),
    win_rate DECIMAL,
    blackjack_count BIGINT,
    current_streak INTEGER,
    best_streak INTEGER,
    biggest_win NUMERIC(78, 0),
    biggest_loss NUMERIC(78, 0),
    average_bet DECIMAL,
    average_payout DECIMAL,
    profit_loss NUMERIC(78, 0),
    roi DECIMAL,
    games_today BIGINT,
    games_this_week BIGINT,
    favorite_bet_amount NUMERIC(78, 0),
    last_game_timestamp TIMESTAMP WITH TIME ZONE,
    rank BIGINT
) AS $$
DECLARE
    player_id_val UUID;
    current_streak_val INTEGER := 0;
    best_streak_val INTEGER := 0;
    streak_count INTEGER := 0;
    last_result VARCHAR(20);
BEGIN
    -- Get player ID
    SELECT id INTO player_id_val FROM players WHERE LOWER(wallet_address) = LOWER(player_wallet);
    
    IF player_id_val IS NULL THEN
        RETURN;
    END IF;

    -- Calculate streaks
    WITH ordered_games AS (
        SELECT g.result, g.created_at
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        WHERE gs.player_id = player_id_val
        AND g.result IS NOT NULL
        AND g.result != 'ongoing'
        ORDER BY g.created_at DESC
    ),
    streak_calc AS (
        SELECT 
            result,
            ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn,
            CASE 
                WHEN result IN ('win', 'blackjack') THEN 1
                ELSE -1
            END as result_value
        FROM ordered_games
    ),
    streak_groups AS (
        SELECT 
            result_value,
            rn - ROW_NUMBER() OVER (PARTITION BY result_value ORDER BY rn) as streak_group
        FROM streak_calc
    ),
    streak_lengths AS (
        SELECT 
            result_value,
            COUNT(*) as streak_length
        FROM streak_groups
        GROUP BY result_value, streak_group
    )
    SELECT 
        COALESCE(MAX(CASE WHEN result_value = 1 THEN streak_length END), 0),
        COALESCE(MAX(streak_length), 0)
    INTO current_streak_val, best_streak_val
    FROM streak_lengths;

    RETURN QUERY
    WITH player_games AS (
        SELECT 
            g.*,
            g.created_at as game_time
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        WHERE gs.player_id = player_id_val
        AND g.result IS NOT NULL
        AND g.result != 'ongoing'
    ),
    bet_stats AS (
        SELECT 
            total_bet_amount,
            total_payout,
            CASE 
                WHEN result IN ('win', 'blackjack') THEN total_payout
                ELSE 0::NUMERIC
            END as win_amount,
            CASE 
                WHEN result = 'loss' THEN total_bet_amount
                ELSE 0::NUMERIC
            END as loss_amount
        FROM player_games
    ),
    time_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE game_time > NOW() - INTERVAL '24 hours')::BIGINT as today,
            COUNT(*) FILTER (WHERE game_time > NOW() - INTERVAL '7 days')::BIGINT as week
        FROM player_games
    ),
    bet_frequency AS (
        SELECT total_bet_amount, COUNT(*) as freq
        FROM player_games
        GROUP BY total_bet_amount
        ORDER BY freq DESC
        LIMIT 1
    ),
    player_total AS (
        SELECT COALESCE(SUM(g3.total_bet_amount), 0) as player_total_bet
        FROM game_sessions gs3
        JOIN games g3 ON gs3.id = g3.session_id
        WHERE gs3.player_id = player_id_val
        AND g3.result IS NOT NULL
        AND g3.result != 'ongoing'
    ),
    players_with_higher_total AS (
        SELECT DISTINCT p2.id
        FROM players p2
        JOIN game_sessions gs2 ON p2.id = gs2.player_id
        JOIN games g2 ON gs2.id = g2.session_id
        WHERE g2.result IS NOT NULL
        AND g2.result != 'ongoing'
        GROUP BY p2.id
        HAVING COALESCE(SUM(g2.total_bet_amount), 0) > (SELECT player_total_bet FROM player_total)
    ),
    player_rank AS (
        SELECT COUNT(*) + 1 as rank_pos
        FROM players_with_higher_total
    )
    SELECT
        COUNT(*)::BIGINT as total_games,
        COALESCE(SUM(total_bet_amount), 0)::NUMERIC(78, 0) as total_bet,
        COALESCE(SUM(total_payout), 0)::NUMERIC(78, 0) as total_win,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END as win_rate,
        COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::BIGINT as blackjack_count,
        current_streak_val::INTEGER as current_streak,
        best_streak_val::INTEGER as best_streak,
        COALESCE((SELECT MAX(win_amount) FROM bet_stats), 0)::NUMERIC(78, 0) as biggest_win,
        COALESCE((SELECT MAX(loss_amount) FROM bet_stats), 0)::NUMERIC(78, 0) as biggest_loss,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND(AVG(total_bet_amount)::DECIMAL, 0)
        ELSE 0 END as average_bet,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND(AVG(total_payout)::DECIMAL, 0)
        ELSE 0 END as average_payout,
        (COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::NUMERIC(78, 0) as profit_loss,
        CASE WHEN COALESCE(SUM(total_bet_amount), 0) > 0 THEN
            ROUND(((COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::DECIMAL / SUM(total_bet_amount)::DECIMAL) * 100, 2)
        ELSE 0 END as roi,
        (SELECT today FROM time_stats) as games_today,
        (SELECT week FROM time_stats) as games_this_week,
        COALESCE((SELECT total_bet_amount FROM bet_frequency), 0)::NUMERIC(78, 0) as favorite_bet_amount,
        MAX(game_time) as last_game_timestamp,
        COALESCE((SELECT rank_pos FROM player_rank), 0)::BIGINT as rank
    FROM player_games;
END;
$$ LANGUAGE plpgsql;
