-- Tournament Creator Feature
-- Adds support for custom tournaments with configurable settings

-- Add new columns to tournaments table for custom tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS creator_address VARCHAR(42);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS time_limit_minutes INT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rebuy_config JSONB DEFAULT '{"enabled": false, "maxRebuys": 0}';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS table_theme JSONB DEFAULT '{"kind": "image", "id": "BigRich"}';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pin_code VARCHAR(4);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_distribution_type VARCHAR(30) DEFAULT 'top_10';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_percentages JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_players INT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Add rebuy tracking to tournament_entries
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS rebuy_count INT DEFAULT 0;
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS total_buy_in NUMERIC(78, 0) DEFAULT 0;

-- Index for private tournament lookups
CREATE INDEX IF NOT EXISTS idx_tournaments_is_private ON tournaments(is_private);
CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(creator_address);
CREATE INDEX IF NOT EXISTS idx_tournaments_ends_at ON tournaments(ends_at);

-- Prize distribution presets reference (stored as type + optional custom percentages)
-- Types: winner_takes_all, top_3, top_3_steep, top_5, top_10, custom
-- Percentages stored in prize_percentages column when type is 'custom'

-- Update calculate_tournament_prizes to support custom prize distributions
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
    custom_percentages JSONB;
    percentages INT[];
BEGIN
    -- Get prize pool and distribution settings
    SELECT prize_pool, prize_distribution_type, prize_percentages
    INTO total_pool, prize_type, custom_percentages
    FROM tournaments
    WHERE id = tournament_id_param;

    IF total_pool IS NULL OR total_pool = 0 THEN
        RETURN;
    END IF;

    -- 84% goes to players, 16% to house (for burn/keeper/deployer split)
    distributable_pool := (total_pool * 84) / 100;

    -- Determine percentages based on prize type
    CASE prize_type
        WHEN 'winner_takes_all' THEN
            percentages := ARRAY[100, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3' THEN
            percentages := ARRAY[50, 30, 20, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3_steep' THEN
            percentages := ARRAY[60, 25, 15, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_5' THEN
            percentages := ARRAY[40, 25, 15, 12, 8, 0, 0, 0, 0, 0];
        WHEN 'custom' THEN
            -- Parse custom percentages from JSONB
            SELECT ARRAY(SELECT (elem::int) FROM jsonb_array_elements_text(custom_percentages) AS elem)
            INTO percentages;
            -- Pad to 10 elements if needed
            WHILE array_length(percentages, 1) < 10 LOOP
                percentages := array_append(percentages, 0);
            END LOOP;
        ELSE -- 'top_10' or default
            percentages := ARRAY[40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
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

-- Function to list active public tournaments
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
    prize_pool NUMERIC(78, 0),
    entry_count BIGINT,
    max_players INT,
    time_limit_minutes INT,
    ends_at TIMESTAMPTZ,
    rebuy_config JSONB,
    table_theme JSONB,
    is_private BOOLEAN,
    prize_distribution_type VARCHAR(30),
    created_at TIMESTAMPTZ
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
        t.prize_pool,
        (SELECT COUNT(*) FROM tournament_entries te WHERE te.tournament_id = t.id)::BIGINT,
        t.max_players,
        t.time_limit_minutes,
        t.ends_at,
        t.rebuy_config,
        t.table_theme,
        t.is_private,
        t.prize_distribution_type,
        t.created_at
    FROM tournaments t
    WHERE t.status = 'active'
      AND (include_private OR t.is_private = FALSE)
      AND (t.ends_at IS NULL OR t.ends_at > NOW())
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if player can rebuy in tournament
CREATE OR REPLACE FUNCTION can_player_rebuy(entry_id_param UUID)
RETURNS TABLE (
    can_rebuy BOOLEAN,
    reason TEXT,
    current_rebuys INT,
    max_rebuys INT
) AS $$
DECLARE
    entry_record RECORD;
    tournament_record RECORD;
    rebuy_enabled BOOLEAN;
    rebuy_max INT;
BEGIN
    -- Get entry details
    SELECT * INTO entry_record FROM tournament_entries WHERE id = entry_id_param;

    IF entry_record IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Entry not found'::TEXT, 0, 0;
        RETURN;
    END IF;

    -- Get tournament details
    SELECT * INTO tournament_record FROM tournaments WHERE id = entry_record.tournament_id;

    -- Parse rebuy config
    rebuy_enabled := COALESCE((tournament_record.rebuy_config->>'enabled')::BOOLEAN, FALSE);
    rebuy_max := COALESCE((tournament_record.rebuy_config->>'maxRebuys')::INT, 0);

    IF NOT rebuy_enabled THEN
        RETURN QUERY SELECT FALSE, 'Rebuys not enabled for this tournament'::TEXT, entry_record.rebuy_count, 0;
        RETURN;
    END IF;

    IF entry_record.status != 'busted' AND entry_record.chips_remaining > 0 THEN
        RETURN QUERY SELECT FALSE, 'Player still has chips'::TEXT, entry_record.rebuy_count, rebuy_max;
        RETURN;
    END IF;

    -- maxRebuys of 0 means unlimited
    IF rebuy_max > 0 AND entry_record.rebuy_count >= rebuy_max THEN
        RETURN QUERY SELECT FALSE, 'Maximum rebuys reached'::TEXT, entry_record.rebuy_count, rebuy_max;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT, entry_record.rebuy_count, rebuy_max;
END;
$$ LANGUAGE plpgsql;
