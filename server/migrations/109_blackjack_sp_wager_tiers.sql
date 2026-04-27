-- Single-player blackjack wager "tables" (min/max per tier). Optional theme overrides player default when selected.
-- Amounts in NUMERIC(78,0) wei. Public API returns enabled rows ordered by sort_order.

CREATE TABLE IF NOT EXISTS blackjack_sp_wager_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(128) NOT NULL,
    min_bet NUMERIC(78, 0) NOT NULL,
    max_bet NUMERIC(78, 0) NOT NULL,
    theme_kind VARCHAR(16)
        CHECK (theme_kind IS NULL OR theme_kind IN ('image', 'video')),
    theme_id VARCHAR(256),
    sort_order INT NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    slug VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blackjack_sp_wager_tiers_enabled_sort
    ON blackjack_sp_wager_tiers (enabled, sort_order, id);

COMMENT ON TABLE blackjack_sp_wager_tiers IS 'Single-player blackjack bet ranges; optional slug for ?tier= links; optional theme applied when tier is chosen.';

-- Seed defaults matching legacy app/BLACKJACK/constants BET_TIERS
INSERT INTO blackjack_sp_wager_tiers (label, min_bet, max_bet, sort_order, enabled, slug)
VALUES
    ('Standard',
     500000000000000000000,
     10000000000000000000000,
     0, TRUE, 'standard'),
    ('High Roller',
     10000000000000000000000,
     50000000000000000000000,
     1, TRUE, 'high')
ON CONFLICT (slug) DO NOTHING;
