-- Migration 024: Add configurable tournament fees (platform + creator)
-- Platform fee: replaces hardcoded 16%, set per-tournament at creation time from env
-- Creator fee: set by tournament creator (0-5%), paid to creator wallet

-- Add fee columns to tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS creator_fee_percent SMALLINT DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS platform_fee_percent SMALLINT DEFAULT 16;

-- Update calculate_tournament_prizes to use per-tournament fee percentages
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
    creator_fee SMALLINT;
    platform_fee SMALLINT;
    total_fee INT;
BEGIN
    -- Get prize pool, distribution settings, and fee percentages
    SELECT t.prize_pool, t.prize_distribution_type, t.prize_percentages,
           t.creator_fee_percent, t.platform_fee_percent
    INTO total_pool, prize_type, custom_percentages, creator_fee, platform_fee
    FROM tournaments t
    WHERE t.id = tournament_id_param;

    IF total_pool IS NULL OR total_pool = 0 THEN
        RETURN;
    END IF;

    -- Calculate distributable pool using per-tournament fees (backward compatible: defaults to 16+0=16%)
    total_fee := COALESCE(platform_fee, 16) + COALESCE(creator_fee, 0);
    distributable_pool := (total_pool * (100 - total_fee)) / 100;

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
