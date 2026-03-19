-- Migration 076: Per-seat hand state for each multiplayer blackjack round.
-- hands: JSONB array of hand objects — supports split (one seat can have multiple hands).
-- Each hand object: { cards, total, hasAce, isBlackjack, isBust, betAmount, result, payout,
--                    canHit, canStand, canDoubleDown, canSplit }
-- active_hand_index: which hand within the hands array the player is currently acting on.
-- settled: set true after balance has been credited/debited for this seat.

CREATE TABLE IF NOT EXISTS blackjack_multi_round_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES blackjack_multi_rounds(id) ON DELETE CASCADE,
    seat_position INTEGER NOT NULL CHECK (seat_position IN (0, 1, 2)),
    player_address VARCHAR(42) NOT NULL,
    bet_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    hands JSONB NOT NULL DEFAULT '[]',
    active_hand_index INTEGER NOT NULL DEFAULT 0,
    result VARCHAR(20),  -- overall result after all hands settle
    payout NUMERIC(78, 0) NOT NULL DEFAULT 0,
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(round_id, seat_position)
);

CREATE INDEX IF NOT EXISTS idx_bj_multi_round_seats_round_id ON blackjack_multi_round_seats(round_id);
