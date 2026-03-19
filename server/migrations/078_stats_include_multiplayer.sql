-- Migration 078: Include multiplayer blackjack data in all stats functions.
-- UNIONs blackjack_multi_round_seats / blackjack_multi_rounds into:
--   get_player_stats()
--   get_player_stats_enhanced()
--   get_global_analytics()

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ============================================================
-- 1. get_player_stats  (basic stats for a wallet)
-- ============================================================
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
    WITH all_games AS (
        -- Single-player games
        SELECT g.total_bet_amount, g.total_payout, g.result
        FROM players p
        JOIN game_sessions gs ON p.id = gs.player_id
        JOIN games g ON gs.id = g.session_id
        WHERE LOWER(p.wallet_address) = LOWER(player_wallet)
          AND g.result IS NOT NULL
          AND g.result != 'ongoing'

        UNION ALL

        -- Multiplayer games
        SELECT s.bet_amount AS total_bet_amount,
               s.payout    AS total_payout,
               s.result
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE LOWER(s.player_address) = LOWER(player_wallet)
          AND s.result IS NOT NULL
          AND r.status = 'completed'
    )
    SELECT
        COUNT(*)::BIGINT                                                       AS total_games,
        COALESCE(SUM(total_bet_amount), 0)::NUMERIC(78, 0)                     AS total_bet,
        COALESCE(SUM(total_payout), 0)::NUMERIC(78, 0)                         AS total_win,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END                                                             AS win_rate,
        COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::BIGINT               AS blackjack_count
    FROM all_games;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. get_player_stats_enhanced  (streaks, ROI, rank, etc.)
-- ============================================================
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
BEGIN
    -- player_id_val is only needed for single-player joins; may be NULL for multi-only players
    SELECT id INTO player_id_val FROM players WHERE LOWER(wallet_address) = LOWER(player_wallet);

    -- ---- streaks across BOTH game types, ordered by time ----
    WITH ordered_games AS (
        -- single-player
        SELECT g.result, g.created_at
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        WHERE gs.player_id = player_id_val
          AND g.result IS NOT NULL
          AND g.result != 'ongoing'

        UNION ALL

        -- multiplayer
        SELECT s.result, r.created_at
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE LOWER(s.player_address) = LOWER(player_wallet)
          AND s.result IS NOT NULL
          AND r.status = 'completed'

        ORDER BY created_at DESC
    ),
    streak_calc AS (
        SELECT
            result,
            ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn,
            CASE WHEN result IN ('win', 'blackjack') THEN 1 ELSE -1 END AS result_value
        FROM ordered_games
    ),
    streak_groups AS (
        SELECT
            result_value,
            rn - ROW_NUMBER() OVER (PARTITION BY result_value ORDER BY rn) AS streak_group
        FROM streak_calc
    ),
    streak_lengths AS (
        SELECT result_value, COUNT(*) AS streak_length
        FROM streak_groups
        GROUP BY result_value, streak_group
    )
    SELECT
        COALESCE(MAX(CASE WHEN result_value = 1 THEN streak_length END), 0),
        COALESCE(MAX(streak_length), 0)
    INTO current_streak_val, best_streak_val
    FROM streak_lengths;

    -- ---- main stats query ----
    RETURN QUERY
    WITH player_games AS (
        -- single-player
        SELECT g.total_bet_amount,
               g.total_payout,
               g.result,
               g.created_at AS game_time
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        WHERE gs.player_id = player_id_val
          AND g.result IS NOT NULL
          AND g.result != 'ongoing'

        UNION ALL

        -- multiplayer
        SELECT s.bet_amount  AS total_bet_amount,
               s.payout      AS total_payout,
               s.result,
               r.created_at  AS game_time
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE LOWER(s.player_address) = LOWER(player_wallet)
          AND s.result IS NOT NULL
          AND r.status = 'completed'
    ),
    bet_stats AS (
        SELECT
            total_bet_amount,
            total_payout,
            CASE WHEN result IN ('win', 'blackjack') THEN total_payout ELSE 0::NUMERIC END AS win_amount,
            CASE WHEN result = 'loss' THEN total_bet_amount ELSE 0::NUMERIC END             AS loss_amount
        FROM player_games
    ),
    time_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE game_time > NOW() - INTERVAL '24 hours')::BIGINT AS today,
            COUNT(*) FILTER (WHERE game_time > NOW() - INTERVAL '7 days')::BIGINT   AS week
        FROM player_games
    ),
    bet_frequency AS (
        SELECT total_bet_amount, COUNT(*) AS freq
        FROM player_games
        GROUP BY total_bet_amount
        ORDER BY freq DESC
        LIMIT 1
    ),
    -- rank: count wallets with higher total volume (single + multi combined)
    all_wallet_volumes AS (
        SELECT LOWER(p2.wallet_address) AS addr, COALESCE(SUM(g2.total_bet_amount), 0) AS vol
        FROM players p2
        JOIN game_sessions gs2 ON p2.id = gs2.player_id
        JOIN games g2 ON gs2.id = g2.session_id
        WHERE g2.result IS NOT NULL AND g2.result != 'ongoing'
        GROUP BY LOWER(p2.wallet_address)

        UNION ALL

        SELECT LOWER(s2.player_address) AS addr, COALESCE(SUM(s2.bet_amount), 0) AS vol
        FROM blackjack_multi_round_seats s2
        JOIN blackjack_multi_rounds r2 ON s2.round_id = r2.id
        WHERE s2.result IS NOT NULL AND r2.status = 'completed'
        GROUP BY LOWER(s2.player_address)
    ),
    wallet_totals AS (
        SELECT addr, SUM(vol) AS total_vol FROM all_wallet_volumes GROUP BY addr
    ),
    my_total AS (
        SELECT COALESCE(SUM(total_vol), 0) AS val FROM wallet_totals WHERE addr = LOWER(player_wallet)
    ),
    player_rank AS (
        SELECT (COUNT(*) + 1)::BIGINT AS rank_pos
        FROM wallet_totals
        WHERE total_vol > (SELECT val FROM my_total LIMIT 1)
    )
    SELECT
        COUNT(*)::BIGINT                                                       AS total_games,
        COALESCE(SUM(total_bet_amount), 0)::NUMERIC(78, 0)                     AS total_bet,
        COALESCE(SUM(total_payout), 0)::NUMERIC(78, 0)                         AS total_win,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END                                                             AS win_rate,
        COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::BIGINT               AS blackjack_count,
        current_streak_val::INTEGER                                            AS current_streak,
        best_streak_val::INTEGER                                               AS best_streak,
        COALESCE((SELECT MAX(win_amount) FROM bet_stats), 0)::NUMERIC(78, 0)   AS biggest_win,
        COALESCE((SELECT MAX(loss_amount) FROM bet_stats), 0)::NUMERIC(78, 0)  AS biggest_loss,
        CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(total_bet_amount)::DECIMAL, 0) ELSE 0 END AS average_bet,
        CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(total_payout)::DECIMAL, 0) ELSE 0 END     AS average_payout,
        (COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::NUMERIC(78, 0) AS profit_loss,
        CASE WHEN COALESCE(SUM(total_bet_amount), 0) > 0 THEN
            ROUND(((COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::DECIMAL / SUM(total_bet_amount)::DECIMAL) * 100, 2)
        ELSE 0 END                                                             AS roi,
        (SELECT today FROM time_stats LIMIT 1)::BIGINT                         AS games_today,
        (SELECT week FROM time_stats LIMIT 1)::BIGINT                          AS games_this_week,
        COALESCE((SELECT total_bet_amount FROM bet_frequency LIMIT 1), 0)::NUMERIC(78, 0) AS favorite_bet_amount,
        MAX(game_time)                                                         AS last_game_timestamp,
        COALESCE((SELECT rank_pos FROM player_rank LIMIT 1), 0)::BIGINT        AS rank
    FROM player_games;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 3. get_global_analytics  (platform-wide metrics)
-- ============================================================
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
    WITH sp_stats AS (
        -- single-player stats
        SELECT
            COUNT(*)::BIGINT AS total_games,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::BIGINT AS games_1h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT AS games_24h,
            COALESCE(SUM(total_bet_amount), 0) AS total_vol,
            COALESCE(SUM(total_payout), 0)     AS total_pay,
            COALESCE(SUM(total_bet_amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS vol_24h,
            COALESCE(SUM(total_payout) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)     AS pay_24h,
            COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END) AS win_count,
            COUNT(CASE WHEN result = 'blackjack' THEN 1 END) AS bj_count,
            COUNT(CASE WHEN hand_count > 1 THEN 1 END) AS split_count,
            COUNT(CASE WHEN actions::text LIKE '%double_down%' THEN 1 END) AS dd_count,
            COUNT(CASE WHEN actions::text LIKE '%surrender%' THEN 1 END) AS surr_count,
            MAX(total_bet_amount) AS max_bet,
            MAX(total_payout)     AS max_payout,
            COUNT(*) FILTER (WHERE result IN ('win', 'blackjack')) AS wins_count,
            COUNT(*) FILTER (WHERE result = 'loss')                AS losses_count,
            COUNT(*) FILTER (WHERE result = 'push')                AS pushes_count
        FROM games
        WHERE result IS NOT NULL AND result != 'ongoing'
    ),
    mp_stats AS (
        -- multiplayer stats
        SELECT
            COUNT(*)::BIGINT AS total_games,
            COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '1 hour')::BIGINT AS games_1h,
            COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '24 hours')::BIGINT AS games_24h,
            COALESCE(SUM(s.bet_amount), 0) AS total_vol,
            COALESCE(SUM(s.payout), 0)     AS total_pay,
            COALESCE(SUM(s.bet_amount) FILTER (WHERE r.created_at > NOW() - INTERVAL '24 hours'), 0) AS vol_24h,
            COALESCE(SUM(s.payout) FILTER (WHERE r.created_at > NOW() - INTERVAL '24 hours'), 0)     AS pay_24h,
            COUNT(CASE WHEN s.result IN ('win', 'blackjack') THEN 1 END) AS win_count,
            COUNT(CASE WHEN s.result = 'blackjack' THEN 1 END) AS bj_count,
            MAX(s.bet_amount) AS max_bet,
            MAX(s.payout)     AS max_payout,
            COUNT(*) FILTER (WHERE s.result IN ('win', 'blackjack')) AS wins_count,
            COUNT(*) FILTER (WHERE s.result = 'loss')                AS losses_count,
            COUNT(*) FILTER (WHERE s.result = 'push')                AS pushes_count
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE s.result IS NOT NULL AND r.status = 'completed'
    ),
    combined AS (
        SELECT
            (sp.total_games + mp.total_games)::BIGINT AS total_games,
            (sp.games_1h + mp.games_1h)::BIGINT       AS games_1h,
            (sp.games_24h + mp.games_24h)::BIGINT     AS games_24h,
            (sp.total_vol + mp.total_vol)::NUMERIC(78,0) AS total_vol,
            (sp.total_pay + mp.total_pay)::NUMERIC(78,0) AS total_pay,
            (sp.vol_24h + mp.vol_24h)::NUMERIC(78,0)     AS vol_24h,
            (sp.pay_24h + mp.pay_24h)::NUMERIC(78,0)     AS pay_24h,
            (sp.win_count + mp.win_count)                 AS win_count,
            (sp.bj_count + mp.bj_count)                   AS bj_count,
            sp.split_count,  -- multi doesn't track splits separately
            sp.dd_count,     -- multi doesn't track double-downs separately
            sp.surr_count,   -- multi doesn't track surrenders separately
            GREATEST(sp.max_bet, mp.max_bet)::NUMERIC(78,0) AS max_bet,
            GREATEST(sp.max_payout, mp.max_payout)::NUMERIC(78,0) AS max_payout,
            (sp.wins_count + mp.wins_count)     AS wins_count,
            (sp.losses_count + mp.losses_count) AS losses_count,
            (sp.pushes_count + mp.pushes_count) AS pushes_count
        FROM sp_stats sp, mp_stats mp
    ),
    -- player counts: distinct wallets across both game types
    sp_wallets AS (
        SELECT DISTINCT LOWER(p.wallet_address) AS addr
        FROM players p
        JOIN game_sessions gs ON p.id = gs.player_id
        JOIN games g ON gs.id = g.session_id
        WHERE g.result IS NOT NULL AND g.result != 'ongoing'
    ),
    mp_wallets AS (
        SELECT DISTINCT LOWER(s.player_address) AS addr
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE s.result IS NOT NULL AND r.status = 'completed'
    ),
    all_wallets AS (
        SELECT addr FROM sp_wallets UNION SELECT addr FROM mp_wallets
    ),
    sp_active AS (
        SELECT DISTINCT LOWER(p.wallet_address) AS addr
        FROM players p
        JOIN game_sessions gs ON p.id = gs.player_id
        JOIN games g ON gs.id = g.session_id
        WHERE g.result IS NOT NULL AND g.result != 'ongoing'
          AND g.created_at > NOW() - INTERVAL '24 hours'
    ),
    mp_active AS (
        SELECT DISTINCT LOWER(s.player_address) AS addr
        FROM blackjack_multi_round_seats s
        JOIN blackjack_multi_rounds r ON s.round_id = r.id
        WHERE s.result IS NOT NULL AND r.status = 'completed'
          AND r.created_at > NOW() - INTERVAL '24 hours'
    ),
    active_wallets AS (
        SELECT addr FROM sp_active UNION SELECT addr FROM mp_active
    ),
    connection_stats AS (
        SELECT COUNT(*)::BIGINT AS active_conn
        FROM active_connections
        WHERE last_ping > NOW() - INTERVAL '5 minutes'
    )
    SELECT
        (SELECT COUNT(*) FROM all_wallets)::BIGINT          AS total_players,
        (SELECT COUNT(*) FROM active_wallets)::BIGINT       AS active_players,
        c.total_games                                        AS total_games_played,
        c.total_vol                                          AS total_volume,
        c.total_pay                                          AS total_payouts,
        (c.total_vol - c.total_pay)::NUMERIC(78,0)          AS house_profit,
        c.games_1h                                           AS games_last_hour,
        c.games_24h                                          AS games_last_24_hours,
        c.vol_24h                                            AS volume_last_24_hours,
        (c.vol_24h - c.pay_24h)::NUMERIC(78,0)              AS profit_last_24_hours,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.win_count::DECIMAL / c.total_games::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS average_win_rate,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.total_vol / c.total_games)::DECIMAL, 0)
        ELSE 0 END                                           AS average_bet_size,
        CASE WHEN c.total_vol > 0 THEN
            ROUND(((c.total_vol - c.total_pay)::DECIMAL / c.total_vol::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS house_edge,
        COALESCE((SELECT active_conn FROM connection_stats), 0)::BIGINT AS active_connections,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.bj_count::DECIMAL / c.total_games::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS blackjack_rate,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.split_count::DECIMAL / c.total_games::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS split_rate,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.dd_count::DECIMAL / c.total_games::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS double_down_rate,
        CASE WHEN c.total_games > 0 THEN
            ROUND((c.surr_count::DECIMAL / c.total_games::DECIMAL) * 100, 2)
        ELSE 0 END                                           AS surrender_rate,
        0::BIGINT                                            AS pending_settlements,
        0::BIGINT                                            AS failed_settlements,
        c.max_bet                                            AS largest_bet,
        c.max_payout                                         AS largest_payout,
        c.wins_count::BIGINT                                 AS total_wins,
        c.losses_count::BIGINT                               AS total_losses,
        c.pushes_count::BIGINT                               AS total_pushes
    FROM combined c;
END;
$$ LANGUAGE plpgsql;
