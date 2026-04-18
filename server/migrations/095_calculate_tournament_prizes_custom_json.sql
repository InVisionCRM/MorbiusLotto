-- Restore custom prize splits: read prize_percentages JSONB when prize_distribution_type = 'custom'.
-- Preset types unchanged. Return all ranked entries (prize 0 for unpaid ranks).

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
    prize_percentages_json JSONB;
    percentages INT[];
    total_fee INT := 5;  -- Hardcoded: 3% protocol + 2% creator
BEGIN
    SELECT t.prize_pool, t.prize_distribution_type, t.prize_percentages
    INTO total_pool, prize_type, prize_percentages_json
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
            IF prize_percentages_json IS NULL
               OR jsonb_typeof(prize_percentages_json) != 'array'
               OR jsonb_array_length(prize_percentages_json) = 0 THEN
                percentages := ARRAY[56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
            ELSE
                percentages := ARRAY(
                    SELECT COALESCE((j::text)::int, 0)
                    FROM jsonb_array_elements_text(prize_percentages_json) AS t(j)
                );
            END IF;
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
            WHEN COALESCE(percentages[re.rank_pos], 0) > 0
            THEN (distributable_pool * percentages[re.rank_pos]) / 100
            ELSE 0::NUMERIC(78, 0)
        END AS prize
    FROM ranked_entries re;
END;
$$ LANGUAGE plpgsql;
