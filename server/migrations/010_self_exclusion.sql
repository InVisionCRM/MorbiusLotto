-- Self-exclusion and responsible gaming
-- Supports temporary timeouts and permanent self-exclusion

CREATE TABLE IF NOT EXISTS player_exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,

    -- 'timeout' for temporary, 'permanent' for self-exclusion
    exclusion_type VARCHAR(20) NOT NULL CHECK (exclusion_type IN ('timeout', 'permanent')),

    -- For timeouts: when the exclusion expires (NULL for permanent)
    expires_at TIMESTAMP WITH TIME ZONE,

    -- When the exclusion was set
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Optional reason provided by user
    reason TEXT,

    -- Duration label for display (e.g., '24h', '7d', '30d', '6m', '1y', 'permanent')
    duration_label VARCHAR(20),

    -- Whether this exclusion is currently active
    is_active BOOLEAN DEFAULT TRUE,

    -- If deactivated early (only for admin override in extreme cases)
    deactivated_at TIMESTAMP WITH TIME ZONE,
    deactivated_reason TEXT
);

-- Index for fast lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_player_exclusions_wallet ON player_exclusions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_player_exclusions_active ON player_exclusions(wallet_address, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_player_exclusions_expires ON player_exclusions(expires_at) WHERE is_active = TRUE AND expires_at IS NOT NULL;

-- Function to check if a player is currently excluded
CREATE OR REPLACE FUNCTION is_player_excluded(p_wallet_address VARCHAR(42))
RETURNS TABLE (
    is_excluded BOOLEAN,
    exclusion_type VARCHAR(20),
    expires_at TIMESTAMP WITH TIME ZONE,
    duration_label VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE as is_excluded,
        pe.exclusion_type,
        pe.expires_at,
        pe.duration_label,
        pe.created_at
    FROM player_exclusions pe
    WHERE pe.wallet_address = LOWER(p_wallet_address)
      AND pe.is_active = TRUE
      AND (pe.expires_at IS NULL OR pe.expires_at > NOW())
    ORDER BY pe.created_at DESC
    LIMIT 1;

    -- If no rows returned, return a "not excluded" row
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(20), NULL::TIMESTAMP WITH TIME ZONE, NULL::VARCHAR(20), NULL::TIMESTAMP WITH TIME ZONE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Automatically deactivate expired timeouts (can be run periodically or on-demand)
CREATE OR REPLACE FUNCTION cleanup_expired_exclusions()
RETURNS INTEGER AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE player_exclusions
    SET is_active = FALSE,
        deactivated_at = NOW(),
        deactivated_reason = 'Timeout expired'
    WHERE is_active = TRUE
      AND exclusion_type = 'timeout'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW();

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;
