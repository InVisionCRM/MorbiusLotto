-- Migration 025: Creator Dashboard — function to get all tournaments for a creator
-- Returns active + completed tournaments with entry counts and computed creator fee earned.

CREATE OR REPLACE FUNCTION get_creator_tournaments(creator_addr VARCHAR)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    status VARCHAR,
    buy_in_amount NUMERIC,
    prize_pool NUMERIC,
    entry_count BIGINT,
    creator_fee_percent SMALLINT,
    platform_fee_percent SMALLINT,
    creator_fee_earned NUMERIC,
    prize_distribution_type VARCHAR,
    created_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    custom_image TEXT,
    is_private BOOLEAN,
    tournament_type VARCHAR,
    max_hands INT,
    starting_chips BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.status,
        t.buy_in_amount,
        t.prize_pool,
        COALESCE(ec.cnt, 0)::BIGINT AS entry_count,
        COALESCE(t.creator_fee_percent, 0)::SMALLINT AS creator_fee_percent,
        COALESCE(t.platform_fee_percent, 16)::SMALLINT AS platform_fee_percent,
        CASE
            WHEN t.status = 'completed' AND COALESCE(t.creator_fee_percent, 0) > 0
            THEN (t.prize_pool * COALESCE(t.creator_fee_percent, 0)) / 100
            ELSE 0::NUMERIC
        END AS creator_fee_earned,
        t.prize_distribution_type,
        t.created_at,
        t.ended_at,
        t.custom_image,
        t.is_private,
        COALESCE(t.tournament_type, 'standard')::VARCHAR AS tournament_type,
        t.max_hands::INT,
        t.starting_chips
    FROM tournaments t
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM tournament_entries te WHERE te.tournament_id = t.id
    ) ec ON TRUE
    WHERE LOWER(t.creator_address) = LOWER(creator_addr)
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
