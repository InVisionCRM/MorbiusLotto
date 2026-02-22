-- Migration 036: Poker tables for MVP multiplayer Texas Hold'em.
-- Chip amounts in NUMERIC(78,0). Card indices 0-51 (rank = idx%13+1, suit = idx/13).

-- Poker tables (one per physical table)
CREATE TABLE IF NOT EXISTS poker_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    small_blind NUMERIC(78, 0) NOT NULL,
    big_blind NUMERIC(78, 0) NOT NULL,
    max_seats INTEGER NOT NULL DEFAULT 6,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing')),
    hand_number INTEGER NOT NULL DEFAULT 0,
    button_position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seats at a table (one row per seated player)
CREATE TABLE IF NOT EXISTS poker_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    player_address VARCHAR(42) NOT NULL,
    stack NUMERIC(78, 0) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('sitting_out', 'active', 'in_hand')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(table_id, position),
    UNIQUE(table_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_poker_seats_table_id ON poker_seats(table_id);

-- Hands (one per deal)
CREATE TABLE IF NOT EXISTS poker_hands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    button_position INTEGER NOT NULL,
    server_seed_hash VARCHAR(64) NOT NULL,
    server_seed VARCHAR(64),
    client_seed VARCHAR(64) NOT NULL,
    community_cards JSONB NOT NULL DEFAULT '[]',
    pot_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    result JSONB,
    street VARCHAR(20) NOT NULL DEFAULT 'preflop' CHECK (street IN ('preflop', 'flop', 'turn', 'river', 'showdown')),
    acting_position INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_poker_hands_table_id ON poker_hands(table_id);

-- Actions within a hand (for replay and verification)
CREATE TABLE IF NOT EXISTS poker_hand_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hand_id UUID NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
    player_address VARCHAR(42) NOT NULL,
    street VARCHAR(20) NOT NULL CHECK (street IN ('preflop', 'flop', 'turn', 'river')),
    action VARCHAR(20) NOT NULL CHECK (action IN ('fold', 'check', 'call', 'bet', 'raise')),
    amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_poker_hand_actions_hand_id ON poker_hand_actions(hand_id);

-- Hole cards per player per hand (server-only until showdown)
CREATE TABLE IF NOT EXISTS poker_hand_hole_cards (
    hand_id UUID NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
    player_address VARCHAR(42) NOT NULL,
    cards JSONB NOT NULL,
    PRIMARY KEY (hand_id, player_address)
);
