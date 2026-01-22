-- Migration: Update stats functions to use NUMERIC for wei values
-- Prevents "bigint out of range" when totals exceed int8.

-- These functions change their RETURN TABLE types, so we must DROP first.
DROP FUNCTION IF EXISTS get_player_stats(character varying);
DROP FUNCTION IF EXISTS get_player_stats_enhanced(character varying);
DROP FUNCTION IF EXISTS get_global_analytics();

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
    LEFT JOIN games g ON gs.id = g.session_id AND g.result IS NOT NULL
    WHERE p.wallet_address = player_wallet;
END;
$$ LANGUAGE plpgsql;

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
BEGIN
    -- Get player ID
    SELECT id INTO player_id_val FROM players WHERE wallet_address = player_wallet;
    
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
    player_rank AS (
        SELECT COUNT(DISTINCT p2.id) + 1 as rank_pos
        FROM players p2
        JOIN game_sessions gs2 ON p2.id = gs2.player_id
        JOIN games g2 ON gs2.id = g2.session_id
        WHERE g2.result IS NOT NULL
        GROUP BY p2.id
        HAVING COALESCE(SUM(g2.total_bet_amount), 0) > (
            SELECT COALESCE(SUM(g3.total_bet_amount), 0)
            FROM game_sessions gs3
            JOIN games g3 ON gs3.id = g3.session_id
            WHERE gs3.player_id = player_id_val
            AND g3.result IS NOT NULL
        )
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
        COALESCE(MAX((SELECT MAX(win_amount) FROM bet_stats)), 0)::NUMERIC(78, 0) as biggest_win,
        COALESCE(MAX((SELECT MAX(loss_amount) FROM bet_stats)), 0)::NUMERIC(78, 0) as biggest_loss,
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

CREATE OR REPLACE FUNCTION get_global_analytics()
RETURNS TABLE (
    total_players BIGINT,
    active_players BIGINT,
    total_games_played BIGINT,
    total_volume NUMERIC(78, 0),
    total_payouts NUMERIC(78, 0),
    house_profit NUMERIC(78, 0),
    games_last_hour BIGINT,
    games_last_24_hours BIGINT,
    volume_last_24_hours NUMERIC(78, 0),
    profit_last_24_hours NUMERIC(78, 0),
    average_win_rate DECIMAL,
    average_bet_size DECIMAL,
    house_edge DECIMAL,
    active_connections BIGINT,
    blackjack_rate DECIMAL,
    split_rate DECIMAL,
    double_down_rate DECIMAL,
    surrender_rate DECIMAL,
    pending_settlements BIGINT,
    failed_settlements BIGINT,
    largest_bet NUMERIC(78, 0),
    largest_payout NUMERIC(78, 0)
) AS $$
BEGIN
    RETURN QUERY
    WITH game_stats AS (
        SELECT 
            COUNT(*)::BIGINT as total_games,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::BIGINT as games_1h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT as games_24h,
            COALESCE(SUM(total_bet_amount), 0)::NUMERIC(78, 0) as total_vol,
            COALESCE(SUM(total_payout), 0)::NUMERIC(78, 0) as total_pay,
            COALESCE(SUM(total_bet_amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::NUMERIC(78, 0) as vol_24h,
            COALESCE(SUM(total_payout) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::NUMERIC(78, 0) as pay_24h,
            CASE WHEN COUNT(*) > 0 THEN
                ROUND(AVG(CASE WHEN result IN ('win', 'blackjack') THEN 100.0 ELSE 0.0 END), 2)
            ELSE 0 END as avg_win_rate,
            CASE WHEN COUNT(*) > 0 THEN
                ROUND(AVG(total_bet_amount)::DECIMAL, 0)
            ELSE 0 END as avg_bet,
            COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::DECIMAL as bj_count,
            COUNT(CASE WHEN hand_count > 1 THEN 1 END)::DECIMAL as split_count,
            COUNT(CASE WHEN actions::text LIKE '%double_down%' THEN 1 END)::DECIMAL as dd_count,
            COUNT(CASE WHEN actions::text LIKE '%surrender%' THEN 1 END)::DECIMAL as surr_count,
            MAX(total_bet_amount)::NUMERIC(78, 0) as max_bet,
            MAX(total_payout)::NUMERIC(78, 0) as max_payout
        FROM games
        WHERE result IS NOT NULL
    ),
    player_stats AS (
        SELECT 
            COUNT(DISTINCT p.id)::BIGINT as total_pl,
            COUNT(DISTINCT gs.player_id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM games g 
                    WHERE g.session_id = gs.id 
                    AND g.created_at > NOW() - INTERVAL '24 hours'
                )
            )::BIGINT as active_pl
        FROM players p
        LEFT JOIN game_sessions gs ON p.id = gs.player_id
    ),
    connection_stats AS (
        SELECT COUNT(*)::BIGINT as active_conn
        FROM active_connections
        WHERE last_ping > NOW() - INTERVAL '5 minutes'
    )
    SELECT
        (SELECT total_pl FROM player_stats) as total_players,
        (SELECT active_pl FROM player_stats) as active_players,
        (SELECT total_games FROM game_stats) as total_games_played,
        (SELECT total_vol FROM game_stats) as total_volume,
        (SELECT total_pay FROM game_stats) as total_payouts,
        ((SELECT total_vol FROM game_stats) - (SELECT total_pay FROM game_stats))::NUMERIC(78, 0) as house_profit,
        (SELECT games_1h FROM game_stats) as games_last_hour,
        (SELECT games_24h FROM game_stats) as games_last_24_hours,
        (SELECT vol_24h FROM game_stats) as volume_last_24_hours,
        ((SELECT vol_24h FROM game_stats) - (SELECT pay_24h FROM game_stats))::NUMERIC(78, 0) as profit_last_24_hours,
        (SELECT avg_win_rate FROM game_stats) as average_win_rate,
        (SELECT avg_bet FROM game_stats) as average_bet_size,
        CASE WHEN (SELECT total_vol FROM game_stats) > 0 THEN
            ROUND((((SELECT total_vol FROM game_stats) - (SELECT total_pay FROM game_stats))::DECIMAL / (SELECT total_vol FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as house_edge,
        (SELECT active_conn FROM connection_stats) as active_connections,
        CASE WHEN (SELECT total_games FROM game_stats) > 0 THEN
            ROUND(((SELECT bj_count FROM game_stats) / (SELECT total_games FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as blackjack_rate,
        CASE WHEN (SELECT total_games FROM game_stats) > 0 THEN
            ROUND(((SELECT split_count FROM game_stats) / (SELECT total_games FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as split_rate,
        CASE WHEN (SELECT total_games FROM game_stats) > 0 THEN
            ROUND(((SELECT dd_count FROM game_stats) / (SELECT total_games FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as double_down_rate,
        CASE WHEN (SELECT total_games FROM game_stats) > 0 THEN
            ROUND(((SELECT surr_count FROM game_stats) / (SELECT total_games FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as surrender_rate,
        0::BIGINT as pending_settlements,
        0::BIGINT as failed_settlements,
        (SELECT max_bet FROM game_stats) as largest_bet,
        (SELECT max_payout FROM game_stats) as largest_payout;
END;
$$ LANGUAGE plpgsql;

