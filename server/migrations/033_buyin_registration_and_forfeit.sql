-- Migration 033: Buy-in tournament registration phase, forfeit logic, activated_at
-- Adds 'registration' status for tournaments, 'forfeited' for entries, activated_at timestamp.
-- Updates calculate_tournament_prizes to exclude forfeited entries from ranking.

-- Tournaments: add 'registration' to status
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('registration', 'active', 'completed', 'cancelled'));

-- Tournaments: add activated_at (when registration -> active)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Tournament entries: add 'forfeited' to status
ALTER TABLE tournament_entries DROP CONSTRAINT IF EXISTS tournament_entries_status_check;
ALTER TABLE tournament_entries ADD CONSTRAINT tournament_entries_status_check
  CHECK (status IN ('playing', 'busted', 'completed', 'forfeited'));

-- Update calculate_tournament_prizes: exclude forfeited from ranking (only rank completed + busted)
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
    prize_type VARCHAR(30);
    percentages INT[];
    total_fee INT := 5;  -- Hardcoded: 3% protocol + 2% creator
BEGIN
    SELECT t.prize_pool, t.prize_distribution_type
    INTO total_pool, prize_type
    FROM tournaments t
    WHERE t.id = tournament_id_param;

    IF total_pool IS NULL OR total_pool = 0 THEN
        RETURN;
    END IF;

    distributable_pool := (total_pool * (100 - total_fee)) / 100;

    CASE prize_type
        WHEN 'winner_takes_all' THEN
            percentages := ARRAY[100, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3' THEN
            percentages := ARRAY[50, 30, 20, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3_steep' THEN
            percentages := ARRAY[50, 30, 20, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_5' THEN
            percentages := ARRAY[40, 25, 15, 12, 8, 0, 0, 0, 0, 0];
        WHEN 'custom' THEN
            percentages := ARRAY[56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
        ELSE
            percentages := ARRAY[56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
    END CASE;

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
          AND te.status != 'forfeited'
    )
    SELECT
        re.eid,
        re.addr,
        re.rank_pos,
        CASE
            WHEN re.rank_pos <= 10 AND percentages[re.rank_pos] > 0
            THEN (distributable_pool * percentages[re.rank_pos]) / 100
            ELSE 0::NUMERIC(78, 0)
        END AS prize
    FROM ranked_entries re
    WHERE re.rank_pos <= 10 OR percentages[re.rank_pos] > 0;
END;
$$ LANGUAGE plpgsql;

-- Update list_active_tournaments to include registration tournaments and add status, min_players
DROP FUNCTION IF EXISTS list_active_tournaments(BOOLEAN);

CREATE OR REPLACE FUNCTION list_active_tournaments(
    include_private BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    creator_address VARCHAR(42),
    buy_in_amount NUMERIC(78, 0),
    starting_chips BIGINT,
    max_hands INT,
    min_players INT,
    prize_pool NUMERIC(78, 0),
    entry_count BIGINT,
    max_players INT,
    time_limit_minutes INT,
    ends_at TIMESTAMPTZ,
    rebuy_config JSONB,
    table_theme JSONB,
    is_private BOOLEAN,
    prize_distribution_type VARCHAR(30),
    created_at TIMESTAMPTZ,
    custom_image TEXT,
    prize_token_address VARCHAR(42),
    prize_token_decimals INT,
    tournament_type VARCHAR(20),
    scheduled_start_at TIMESTAMPTZ,
    registration_opens_at TIMESTAMPTZ,
    current_phase VARCHAR(30),
    duration_minutes INT,
    on_chain_tournament_id BIGINT,
    creator_fee_percent SMALLINT,
    platform_fee_percent SMALLINT,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.creator_address,
        t.buy_in_amount,
        t.starting_chips,
        t.max_hands,
        COALESCE(t.min_players, 2),
        t.prize_pool,
        (SELECT COUNT(*) FROM tournament_entries te WHERE te.tournament_id = t.id)::BIGINT,
        t.max_players,
        t.time_limit_minutes,
        t.ends_at,
        t.rebuy_config,
        t.table_theme,
        t.is_private,
        t.prize_distribution_type,
        t.created_at,
        t.custom_image,
        t.prize_token_address,
        t.prize_token_decimals,
        t.tournament_type,
        t.scheduled_start_at,
        t.registration_opens_at,
        t.current_phase,
        t.duration_minutes,
        t.on_chain_tournament_id,
        COALESCE(t.creator_fee_percent, 0)::SMALLINT,
        COALESCE(t.platform_fee_percent, 16)::SMALLINT,
        t.status
    FROM tournaments t
    WHERE t.status IN ('registration', 'active')
      AND (include_private OR t.is_private = FALSE)
      AND (t.ends_at IS NULL OR t.ends_at > NOW())
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;
