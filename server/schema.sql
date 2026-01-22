-- Blackjack Server Database Schema
-- Using Neon PostgreSQL

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    balance NUMERIC(78, 0) DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    -- Provably-fair server seed (secret) + commitment (public)
    -- server_seed_hash is SHA-256(server_seed) in hex
    server_seed VARCHAR(64),
    server_seed_hash VARCHAR(64) NOT NULL,
    client_seed VARCHAR(64),
    nonce BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    total_bet NUMERIC(78, 0) DEFAULT 0, -- in wei
    total_win NUMERIC(78, 0) DEFAULT 0, -- in wei
    game_count INTEGER DEFAULT 0
);

-- Individual games within a session
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    game_number INTEGER NOT NULL,
    total_bet_amount NUMERIC(78, 0) NOT NULL, -- in wei (sum of all hands)
    dealer_cards JSONB NOT NULL DEFAULT '[]',
    dealer_total INTEGER,
    dealer_actions JSONB DEFAULT '[]', -- array of dealer actions
    result VARCHAR(20) CHECK (result IN ('win', 'loss', 'push', 'blackjack', 'ongoing')),
    total_payout NUMERIC(78, 0) DEFAULT 0, -- in wei (sum of all hands)
    actions JSONB DEFAULT '[]', -- array of player actions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    server_seed_revealed BOOLEAN DEFAULT FALSE,
    client_seed_commitment VARCHAR(64), -- for strategy commitment
    dealer_seed VARCHAR(64), -- for dealer actions
    hand_count INTEGER DEFAULT 1, -- number of hands (for splits)
    current_hand_index INTEGER DEFAULT 0, -- current active hand
    -- Number of provably-fair draws already consumed in this game.
    -- We derive unique nonces as: baseNonce = game_number * 1_000_000; nonce = baseNonce + rng_counter (+ i)
    rng_counter INTEGER DEFAULT 0
);

-- Individual hands within a game (for splitting)
CREATE TABLE IF NOT EXISTS game_hands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    hand_index INTEGER NOT NULL,
    cards JSONB NOT NULL DEFAULT '[]',
    total INTEGER,
    has_ace BOOLEAN DEFAULT FALSE,
    is_blackjack BOOLEAN DEFAULT FALSE,
    is_bust BOOLEAN DEFAULT FALSE,
    bet_amount NUMERIC(78, 0) NOT NULL, -- in wei
    result VARCHAR(20) CHECK (result IN ('win', 'loss', 'push', 'blackjack', 'ongoing')),
    payout NUMERIC(78, 0) DEFAULT 0, -- in wei
    actions JSONB DEFAULT '[]', -- array of actions for this hand
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Server seed reveals for verification
CREATE TABLE IF NOT EXISTS seed_reveals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    server_seed_hash VARCHAR(64) NOT NULL,
    server_seed VARCHAR(64) NOT NULL,
    revealed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Active connections for WebSocket management
CREATE TABLE IF NOT EXISTS active_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    connection_id VARCHAR(100) UNIQUE NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_player_id ON game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_games_session_id ON games(session_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(result);
CREATE INDEX IF NOT EXISTS idx_game_hands_game_id ON game_hands(game_id);
CREATE INDEX IF NOT EXISTS idx_game_hands_result ON game_hands(result);
CREATE INDEX IF NOT EXISTS idx_active_connections_player_id ON active_connections(player_id);
CREATE INDEX IF NOT EXISTS idx_players_wallet_address ON players(wallet_address);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old active connections
CREATE OR REPLACE FUNCTION cleanup_old_connections()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM active_connections
    WHERE last_ping < NOW() - INTERVAL '5 minutes';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get player statistics
CREATE OR REPLACE FUNCTION get_player_stats(player_wallet VARCHAR(42))
RETURNS TABLE (
    total_games BIGINT,
    total_bet BIGINT,
    total_win BIGINT,
    win_rate DECIMAL,
    blackjack_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(g.*)::BIGINT as total_games,
        COALESCE(SUM(g.total_bet_amount), 0)::BIGINT as total_bet,
        COALESCE(SUM(g.total_payout), 0)::BIGINT as total_win,
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

-- Enhanced function to get comprehensive player statistics
CREATE OR REPLACE FUNCTION get_player_stats_enhanced(player_wallet VARCHAR(42))
RETURNS TABLE (
    total_games BIGINT,
    total_bet BIGINT,
    total_win BIGINT,
    win_rate DECIMAL,
    blackjack_count BIGINT,
    current_streak INTEGER,
    best_streak INTEGER,
    biggest_win BIGINT,
    biggest_loss BIGINT,
    average_bet DECIMAL,
    average_payout DECIMAL,
    profit_loss BIGINT,
    roi DECIMAL,
    games_today BIGINT,
    games_this_week BIGINT,
    favorite_bet_amount BIGINT,
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
                ELSE 0
            END as win_amount,
            CASE 
                WHEN result = 'loss' THEN total_bet_amount
                ELSE 0
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
        COALESCE(SUM(total_bet_amount), 0)::BIGINT as total_bet,
        COALESCE(SUM(total_payout), 0)::BIGINT as total_win,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END as win_rate,
        COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::BIGINT as blackjack_count,
        current_streak_val::INTEGER as current_streak,
        best_streak_val::INTEGER as best_streak,
        COALESCE(MAX((SELECT MAX(win_amount) FROM bet_stats)), 0)::BIGINT as biggest_win,
        COALESCE(MAX((SELECT MAX(loss_amount) FROM bet_stats)), 0)::BIGINT as biggest_loss,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND(AVG(total_bet_amount)::DECIMAL, 0)
        ELSE 0 END as average_bet,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND(AVG(total_payout)::DECIMAL, 0)
        ELSE 0 END as average_payout,
        (COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::BIGINT as profit_loss,
        CASE WHEN COALESCE(SUM(total_bet_amount), 0) > 0 THEN
            ROUND(((COALESCE(SUM(total_payout), 0) - COALESCE(SUM(total_bet_amount), 0))::DECIMAL / SUM(total_bet_amount)::DECIMAL) * 100, 2)
        ELSE 0 END as roi,
        (SELECT today FROM time_stats) as games_today,
        (SELECT week FROM time_stats) as games_this_week,
        COALESCE((SELECT total_bet_amount FROM bet_frequency), 0)::BIGINT as favorite_bet_amount,
        MAX(game_time) as last_game_timestamp,
        COALESCE((SELECT rank_pos FROM player_rank), 0)::BIGINT as rank
    FROM player_games;
END;
$$ LANGUAGE plpgsql;

-- Function to get global analytics
CREATE OR REPLACE FUNCTION get_global_analytics()
RETURNS TABLE (
    total_players BIGINT,
    active_players BIGINT,
    total_games_played BIGINT,
    total_volume BIGINT,
    total_payouts BIGINT,
    house_profit BIGINT,
    games_last_hour BIGINT,
    games_last_24_hours BIGINT,
    volume_last_24_hours BIGINT,
    profit_last_24_hours BIGINT,
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
    largest_bet BIGINT,
    largest_payout BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH game_stats AS (
        SELECT 
            COUNT(*)::BIGINT as total_games,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::BIGINT as games_1h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT as games_24h,
            COALESCE(SUM(total_bet_amount), 0)::BIGINT as total_vol,
            COALESCE(SUM(total_payout), 0)::BIGINT as total_pay,
            COALESCE(SUM(total_bet_amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::BIGINT as vol_24h,
            COALESCE(SUM(total_payout) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::BIGINT as pay_24h,
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
            MAX(total_bet_amount)::BIGINT as max_bet,
            MAX(total_payout)::BIGINT as max_payout
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
        ((SELECT total_vol FROM game_stats) - (SELECT total_pay FROM game_stats))::BIGINT as house_profit,
        (SELECT games_1h FROM game_stats) as games_last_hour,
        (SELECT games_24h FROM game_stats) as games_last_24_hours,
        (SELECT vol_24h FROM game_stats) as volume_last_24_hours,
        ((SELECT vol_24h FROM game_stats) - (SELECT pay_24h FROM game_stats))::BIGINT as profit_last_24_hours,
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