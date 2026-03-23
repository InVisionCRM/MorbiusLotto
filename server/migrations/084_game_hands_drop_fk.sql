-- Migration 084: Drop foreign key on game_hands.game_id so multiplayer blackjack
-- round_seat IDs can be stored as game_id alongside single-player game IDs.
-- The column stays as UUID; only the FK constraint is removed.

ALTER TABLE game_hands DROP CONSTRAINT IF EXISTS game_hands_game_id_fkey;
