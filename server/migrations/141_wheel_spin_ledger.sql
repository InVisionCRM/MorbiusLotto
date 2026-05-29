-- Daily Wheel spin ledger
-- Earns spins from BJ / BJ-multi / Poker (cash) wager volume + tournament buy-ins.
-- Mirrors player_poker_chips + poker_chip_ledger pattern.

CREATE TABLE IF NOT EXISTS wheel_spin_wallets (
    wallet_address          VARCHAR(42)   PRIMARY KEY
                            CHECK (wallet_address = LOWER(wallet_address)),
    spins_available         INTEGER       NOT NULL DEFAULT 0
                            CHECK (spins_available >= 0),
    spins_lifetime_earned   BIGINT        NOT NULL DEFAULT 0,
    spins_lifetime_used     BIGINT        NOT NULL DEFAULT 0,
    wager_credit_remainder  NUMERIC(78, 0) NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wheel_spin_ledger (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  VARCHAR(42) NOT NULL,
    delta           INTEGER     NOT NULL,
    reason          VARCHAR(64) NOT NULL,
    balance_after   INTEGER     NOT NULL,
    ref_type        VARCHAR(32),
    ref_id          TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spin_ledger_wallet
    ON wheel_spin_ledger (wallet_address, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wheel_spin_ledger_ref_uniq
    ON wheel_spin_ledger (reason, ref_type, ref_id)
    WHERE ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wheel_spin_rules (
    rule_key   VARCHAR(64) PRIMARY KEY,
    rule_value TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wheel_daily_state (
    wallet_address VARCHAR(42) NOT NULL
                   CHECK (wallet_address = LOWER(wallet_address)),
    day            DATE        NOT NULL,
    milestones     TEXT[]      NOT NULL DEFAULT '{}',
    loss_streak    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (wallet_address, day)
);

CREATE TABLE IF NOT EXISTS wheel_spins (
    id                  BIGSERIAL PRIMARY KEY,
    wallet_address      VARCHAR(42)   NOT NULL,
    segment_index       INTEGER       NOT NULL,
    prize_value         VARCHAR(32)   NOT NULL,
    prize_morbius       NUMERIC(78, 0) NOT NULL DEFAULT 0,
    server_seed_commit  VARCHAR(64)   NOT NULL,
    server_seed         VARCHAR(64),
    client_seed         VARCHAR(64)   NOT NULL,
    nonce               BIGINT        NOT NULL,
    payout_tx_hash      VARCHAR(66),
    status              VARCHAR(16)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','settled','paid','failed')),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_wallet
    ON wheel_spins (wallet_address, created_at DESC);

-- Default rules. Thresholds are in MORBIUS wei (1 MORBIUS = 1e18 wei).
-- 1 spin per 2500 MORBIUS wagered = 2500 * 1e18.
-- Tournament: 1 spin per 5000 MORBIUS of buy-in.
INSERT INTO wheel_spin_rules (rule_key, rule_value) VALUES
    ('wager_wei_per_spin.blackjack',        '2500000000000000000000'),
    ('wager_wei_per_spin.blackjack_multi',  '2500000000000000000000'),
    ('wager_wei_per_spin.poker',            '2500000000000000000000'),
    ('tournament_wei_per_spin',             '5000000000000000000000'),
    ('daily_first_game_spins',              '1'),
    ('loss_streak_pity_threshold',          '5'),
    ('loss_streak_pity_daily_cap',          '3'),
    ('poker_chip_to_wei_ratio',             '1000000000000000000')
ON CONFLICT (rule_key) DO NOTHING;
