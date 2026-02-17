-- Migration 032: Hardcode protocol 3% + creator 2%, fix prize percentages to sum to 100%
-- No env/config, no remainders. Protocol fee 3%, creator fee 2%, total 5%. Distributable 95%.
-- Prize distribution: Top 1, Top 3, Top 5, Top 10 only. Legacy custom/top_3_steep map to top_10/top_3.

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
