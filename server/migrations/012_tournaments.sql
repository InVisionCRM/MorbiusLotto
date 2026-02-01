-- Tournament Mode for Blackjack
-- 100,000 MORBIUS buy-in, 5,000 starting chips, 50-hand sprint format

-- Tournament definitions
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    buy_in_amount NUMERIC(78, 0) NOT NULL DEFAULT 100000000000000000000000, -- 100,000 MORBIUS (18 decimals)
    starting_chips BIGINT NOT NULL DEFAULT 5000,
    max_hands INT NOT NULL DEFAULT 50,
    min_players INT NOT NULL DEFAULT 2, -- Minimum players to start prize distribution
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    prize_pool NUMERIC(78, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Tournament entries (players who bought in)
CREATE TABLE IF NOT EXISTS tournament_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_address VARCHAR(42) NOT NULL,
    chips_remaining BIGINT NOT NULL,
    hands_played INT NOT NULL DEFAULT 0,
    highest_chip_count BIGINT NOT NULL,
    final_rank INT,
    prize_won NUMERIC(78, 0) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'busted', 'completed')),
    bought_in_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE(tournament_id, player_address)
);

-- Tournament game history (links to existing games table)
CREATE TABLE IF NOT EXISTS tournament_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    hand_number INT NOT NULL,
    bet_amount BIGINT NOT NULL,
    chips_before BIGINT NOT NULL,
    chips_after BIGINT NOT NULL,
    result VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_player ON tournament_entries(player_address);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_status ON tournament_entries(status);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_chips ON tournament_entries(tournament_id, chips_remaining DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_games_entry ON tournament_games(entry_id);
CREATE INDEX IF NOT EXISTS idx_tournament_games_tournament ON tournament_games(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

-- Leaderboard view for efficient ranking queries
CREATE OR REPLACE VIEW tournament_leaderboard AS
SELECT
    te.id AS entry_id,
    te.tournament_id,
    te.player_address,
    te.chips_remaining,
    te.hands_played,
    te.highest_chip_count,
    te.status,
    te.prize_won,
    te.bought_in_at,
    te.finished_at,
    t.max_hands,
    t.starting_chips,
    RANK() OVER (
        PARTITION BY te.tournament_id
        ORDER BY
            CASE WHEN te.status = 'busted' THEN 0 ELSE 1 END DESC,
            te.chips_remaining DESC,
            te.highest_chip_count DESC,
            te.bought_in_at ASC
    ) AS current_rank
FROM tournament_entries te
JOIN tournaments t ON te.tournament_id = t.id;

-- Function to get or create the current active tournament
CREATE OR REPLACE FUNCTION get_or_create_active_tournament()
RETURNS UUID AS $$
DECLARE
    active_id UUID;
BEGIN
    -- Check for existing active tournament
    SELECT id INTO active_id
    FROM tournaments
    WHERE status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no active tournament, create one
    IF active_id IS NULL THEN
        INSERT INTO tournaments (name)
        VALUES ('Tournament #' || (SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(name, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1 FROM tournaments))
        RETURNING id INTO active_id;
    END IF;

    RETURN active_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate prize distribution
-- 1st: 40%, 2nd: 20%, 3rd: 10%, 4th-10th: 2% each (14%), House: 16%
CREATE OR REPLACE FUNCTION calculate_tournament_prizes(tournament_id_param UUID)
RETURNS TABLE (
    entry_id UUID,
    player_address VARCHAR(42),
    final_rank INT,
    prize_amount NUMERIC(78, 0)
) AS $$
DECLARE
    total_pool NUMERIC(78, 0);
    distributable_pool NUMERIC(78, 0);
BEGIN
    -- Get prize pool
    SELECT prize_pool INTO total_pool
    FROM tournaments
    WHERE id = tournament_id_param;

    IF total_pool IS NULL OR total_pool = 0 THEN
        RETURN;
    END IF;

    -- 84% goes to players, 16% to house (for burn/keeper/deployer split)
    distributable_pool := (total_pool * 84) / 100;

    RETURN QUERY
    WITH ranked_entries AS (
        SELECT
            te.id AS eid,
            te.player_address AS addr,
            RANK() OVER (
                ORDER BY
                    CASE WHEN te.status = 'busted' THEN 0 ELSE 1 END DESC,
                    te.chips_remaining DESC,
                    te.highest_chip_count DESC,
                    te.bought_in_at ASC
            )::INT AS rank_pos
        FROM tournament_entries te
        WHERE te.tournament_id = tournament_id_param
    )
    SELECT
        re.eid,
        re.addr,
        re.rank_pos,
        CASE re.rank_pos
            WHEN 1 THEN (distributable_pool * 40) / 100  -- 40%
            WHEN 2 THEN (distributable_pool * 20) / 100  -- 20%
            WHEN 3 THEN (distributable_pool * 10) / 100  -- 10%
            WHEN 4 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 5 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 6 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 7 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 8 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 9 THEN (distributable_pool * 2) / 100   -- 2%
            WHEN 10 THEN (distributable_pool * 2) / 100  -- 2%
            ELSE 0::NUMERIC(78, 0)
        END AS prize
    FROM ranked_entries re
    WHERE re.rank_pos <= 10;
END;
$$ LANGUAGE plpgsql;

-- Function to get tournament leaderboard with limit
CREATE OR REPLACE FUNCTION get_tournament_leaderboard(
    tournament_id_param UUID,
    limit_count INT DEFAULT 50
)
RETURNS TABLE (
    entry_id UUID,
    player_address VARCHAR(42),
    chips_remaining BIGINT,
    hands_played INT,
    highest_chip_count BIGINT,
    status VARCHAR(20),
    current_rank BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tl.entry_id,
        tl.player_address,
        tl.chips_remaining,
        tl.hands_played,
        tl.highest_chip_count,
        tl.status,
        tl.current_rank
    FROM tournament_leaderboard tl
    WHERE tl.tournament_id = tournament_id_param
    ORDER BY tl.current_rank ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get player's tournament stats
CREATE OR REPLACE FUNCTION get_player_tournament_stats(player_addr VARCHAR(42))
RETURNS TABLE (
    total_tournaments_played BIGINT,
    total_buy_ins NUMERIC(78, 0),
    total_prizes_won NUMERIC(78, 0),
    best_finish INT,
    avg_finish DECIMAL,
    total_hands_played BIGINT,
    win_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH player_entries AS (
        SELECT
            te.*,
            tg.result
        FROM tournament_entries te
        LEFT JOIN tournament_games tg ON tg.entry_id = te.id
        WHERE LOWER(te.player_address) = LOWER(player_addr)
    ),
    game_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE result IN ('win', 'blackjack')) AS wins,
            COUNT(*) AS total_games
        FROM player_entries
        WHERE result IS NOT NULL
    )
    SELECT
        COUNT(DISTINCT pe.tournament_id)::BIGINT,
        COUNT(DISTINCT pe.tournament_id)::NUMERIC * 100000000000000000000000::NUMERIC, -- buy_in * count
        COALESCE(SUM(pe.prize_won), 0)::NUMERIC(78, 0),
        MIN(pe.final_rank)::INT,
        AVG(pe.final_rank)::DECIMAL,
        SUM(pe.hands_played)::BIGINT,
        CASE WHEN gs.total_games > 0
             THEN (gs.wins::DECIMAL / gs.total_games::DECIMAL) * 100
             ELSE 0::DECIMAL
        END
    FROM (SELECT DISTINCT ON (tournament_id) * FROM player_entries ORDER BY tournament_id, bought_in_at DESC) pe
    CROSS JOIN game_stats gs
    GROUP BY gs.wins, gs.total_games;
END;
$$ LANGUAGE plpgsql;

-- Insert default active tournament
INSERT INTO tournaments (name) VALUES ('Tournament #1')
ON CONFLICT DO NOTHING;
