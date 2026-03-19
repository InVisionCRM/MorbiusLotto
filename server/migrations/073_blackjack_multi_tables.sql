-- Migration 073: Multiplayer blackjack tables.
-- 3 fixed seats per table (position 0, 1, 2). Dealer is server-side only.
-- Amounts in NUMERIC(78,0) (wei). Card indices 0-51 (rank = idx%13, suit = floor(idx/13)).

CREATE TABLE IF NOT EXISTS blackjack_multi_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'betting', 'playing', 'dealer_turn', 'completed')),
    min_bet NUMERIC(78, 0) NOT NULL DEFAULT 1000000000000000000,      -- 1 MORBIUS
    max_bet NUMERIC(78, 0) NOT NULL DEFAULT 100000000000000000000000, -- 100,000 MORBIUS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
