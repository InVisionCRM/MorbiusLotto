-- Add on_chain_tournament_id and fee columns to list_active_tournaments
-- so the client can know when to use on-chain create/join flow.

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
    platform_fee_percent SMALLINT
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
        COALESCE(t.platform_fee_percent, 16)::SMALLINT
    FROM tournaments t
    WHERE t.status = 'active'
      AND (include_private OR t.is_private = FALSE)
      AND (t.ends_at IS NULL OR t.ends_at > NOW())
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;
