-- Add total_wins, total_losses, total_pushes to get_global_analytics for admin metrics
DROP FUNCTION IF EXISTS get_global_analytics();
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
    largest_payout NUMERIC(78, 0),
    total_wins BIGINT,
    total_losses BIGINT,
    total_pushes BIGINT
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
            MAX(total_payout)::NUMERIC(78, 0) as max_payout,
            COUNT(*) FILTER (WHERE result IN ('win', 'blackjack'))::BIGINT as wins_count,
            COUNT(*) FILTER (WHERE result = 'loss')::BIGINT as losses_count,
            COUNT(*) FILTER (WHERE result = 'push')::BIGINT as pushes_count
        FROM games
        WHERE result IS NOT NULL
        AND result != 'ongoing'
    ),
    player_stats AS (
        SELECT 
            COUNT(DISTINCT p.id)::BIGINT as total_pl,
            COUNT(DISTINCT gs.player_id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM games g 
                    WHERE g.session_id = gs.id 
                    AND g.created_at > NOW() - INTERVAL '24 hours'
                    AND g.result IS NOT NULL
                    AND g.result != 'ongoing'
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
        ((SELECT total_vol FROM game_stats) - (SELECT total_pay FROM game_stats)) as house_profit,
        (SELECT games_1h FROM game_stats) as games_last_hour,
        (SELECT games_24h FROM game_stats) as games_last_24_hours,
        (SELECT vol_24h FROM game_stats) as volume_last_24_hours,
        ((SELECT vol_24h FROM game_stats) - (SELECT pay_24h FROM game_stats)) as profit_last_24_hours,
        (SELECT avg_win_rate FROM game_stats) as average_win_rate,
        (SELECT avg_bet FROM game_stats) as average_bet_size,
        CASE WHEN (SELECT total_vol FROM game_stats) > 0 THEN
            ROUND((((SELECT total_vol FROM game_stats) - (SELECT total_pay FROM game_stats))::DECIMAL / (SELECT total_vol FROM game_stats)::DECIMAL) * 100, 2)
        ELSE 0 END as house_edge,
        COALESCE((SELECT active_conn FROM connection_stats), 0)::BIGINT as active_connections,
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
        (SELECT max_payout FROM game_stats) as largest_payout,
        COALESCE((SELECT wins_count FROM game_stats), 0)::BIGINT as total_wins,
        COALESCE((SELECT losses_count FROM game_stats), 0)::BIGINT as total_losses,
        COALESCE((SELECT pushes_count FROM game_stats), 0)::BIGINT as total_pushes;
END;
$$ LANGUAGE plpgsql;
