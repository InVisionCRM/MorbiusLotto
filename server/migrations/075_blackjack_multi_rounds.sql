-- Migration 075: Rounds for multiplayer blackjack.
-- One round = one shared dealer hand + one hand per betting seat.
-- acting_seat_position: which seat's turn it currently is (NULL during betting/dealer phases).
-- turn_started_at: set whenever acting_seat_position changes; drives the 30s auto-stand timer.
-- server_seed revealed at round completion for provably-fair verification.

CREATE TABLE IF NOT EXISTS blackjack_multi_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES blackjack_multi_tables(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    dealer_cards JSONB NOT NULL DEFAULT '[]',
    dealer_total INTEGER NOT NULL DEFAULT 0,
    dealer_has_ace BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'betting'
        CHECK (status IN ('betting', 'playing', 'dealer_turn', 'completed')),
    acting_seat_position INTEGER,
    turn_started_at TIMESTAMP WITH TIME ZONE,
    server_seed VARCHAR(64) NOT NULL,
    server_seed_hash VARCHAR(64) NOT NULL,
    client_seed VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_table_id ON blackjack_multi_rounds(table_id);
