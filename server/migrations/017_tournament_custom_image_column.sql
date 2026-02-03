-- Add custom_image column if missing (from 014; may have been skipped)
-- and ensure list_active_tournaments returns it.
-- Also ensure prize_token columns exist (from 016) so this migration is safe if 016 was skipped.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS custom_image TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_token_address VARCHAR(42) DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_token_decimals INT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_prize_token ON tournaments(prize_token_address) WHERE prize_token_address IS NOT NULL;

-- Must drop before changing return type (PostgreSQL doesn't allow CREATE OR REPLACE to change columns)
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
    prize_token_decimals INT
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
        t.prize_token_decimals
    FROM tournaments t
    WHERE t.status = 'active'
      AND (include_private OR t.is_private = FALSE)
      AND (t.ends_at IS NULL OR t.ends_at > NOW())
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;
