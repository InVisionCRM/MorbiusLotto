-- Per-seat client seed preference (updated on place_bet). Combined into round client_seed at deal time.

ALTER TABLE blackjack_multi_seats
  ADD COLUMN IF NOT EXISTS client_seed VARCHAR(255) NOT NULL DEFAULT 'default';
