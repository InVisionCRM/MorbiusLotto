-- Migration 101: Per-player-per-hand denormalized poker stats.
-- One row per player per completed hand. Populated at hand completion.
-- Enables cheap aggregate queries for VPIP, PFR, AF, BB/100, positional win rate, etc.
-- Chip amounts are whole-chip integers in NUMERIC(78,0), matching poker_hands.

CREATE TABLE IF NOT EXISTS poker_hand_players (
    hand_id UUID NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
    player_address VARCHAR(42) NOT NULL,
    seat_position INTEGER NOT NULL,

    -- Positional role flags (derivable from button + seat, stored for query speed)
    is_button BOOLEAN NOT NULL DEFAULT FALSE,
    is_small_blind BOOLEAN NOT NULL DEFAULT FALSE,
    is_big_blind BOOLEAN NOT NULL DEFAULT FALSE,

    -- Chip flow (whole-chip integers)
    starting_stack NUMERIC(78, 0) NOT NULL DEFAULT 0,
    ending_stack NUMERIC(78, 0) NOT NULL DEFAULT 0,
    contributed NUMERIC(78, 0) NOT NULL DEFAULT 0,     -- total chips put into the pot (includes blinds)
    won_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,      -- net chips received from pot (rake already deducted)
    rake_paid NUMERIC(78, 0) NOT NULL DEFAULT 0,       -- this player's share of the hand's rake

    -- Participation flags per street
    saw_flop BOOLEAN NOT NULL DEFAULT FALSE,
    saw_turn BOOLEAN NOT NULL DEFAULT FALSE,
    saw_river BOOLEAN NOT NULL DEFAULT FALSE,
    saw_showdown BOOLEAN NOT NULL DEFAULT FALSE,

    -- Outcome
    folded BOOLEAN NOT NULL DEFAULT FALSE,
    folded_street VARCHAR(20) CHECK (folded_street IN ('preflop', 'flop', 'turn', 'river')),
    won BOOLEAN NOT NULL DEFAULT FALSE,               -- won any chips from any pot
    hand_name VARCHAR(64),                            -- showdown hand description if shown down

    -- Preflop behavior (standard poker HUD metrics)
    vpip BOOLEAN NOT NULL DEFAULT FALSE,              -- voluntarily put $ in pot preflop (excludes posted blinds)
    pfr BOOLEAN NOT NULL DEFAULT FALSE,               -- made at least one preflop raise
    three_bet BOOLEAN NOT NULL DEFAULT FALSE,         -- raised after an existing preflop raise

    -- Per-street action counts (bet/raise/call/check only; fold/blind excluded)
    preflop_bets INTEGER NOT NULL DEFAULT 0,
    preflop_raises INTEGER NOT NULL DEFAULT 0,
    preflop_calls INTEGER NOT NULL DEFAULT 0,
    preflop_checks INTEGER NOT NULL DEFAULT 0,
    flop_bets INTEGER NOT NULL DEFAULT 0,
    flop_raises INTEGER NOT NULL DEFAULT 0,
    flop_calls INTEGER NOT NULL DEFAULT 0,
    flop_checks INTEGER NOT NULL DEFAULT 0,
    turn_bets INTEGER NOT NULL DEFAULT 0,
    turn_raises INTEGER NOT NULL DEFAULT 0,
    turn_calls INTEGER NOT NULL DEFAULT 0,
    turn_checks INTEGER NOT NULL DEFAULT 0,
    river_bets INTEGER NOT NULL DEFAULT 0,
    river_raises INTEGER NOT NULL DEFAULT 0,
    river_calls INTEGER NOT NULL DEFAULT 0,
    river_checks INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (hand_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_poker_hand_players_address
    ON poker_hand_players (LOWER(player_address));

CREATE INDEX IF NOT EXISTS idx_poker_hand_players_hand
    ON poker_hand_players (hand_id);
