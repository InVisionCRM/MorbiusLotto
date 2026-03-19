-- Migration 074: Seats for multiplayer blackjack tables.
-- One row per seated player. Mirrors poker_seats pattern.
-- consecutive_sit_outs: incremented when player misses betting phase; kicked at 3.

CREATE TABLE IF NOT EXISTS blackjack_multi_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES blackjack_multi_tables(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position IN (0, 1, 2)),
    player_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sitting_out')),
    consecutive_sit_outs INTEGER NOT NULL DEFAULT 0,
    pending_bet NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- bet staged during betting phase; deducted atomically at round start
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(table_id, position),
    UNIQUE(table_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_bj_multi_seats_table_id ON blackjack_multi_seats(table_id);
