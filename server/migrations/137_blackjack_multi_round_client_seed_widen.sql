-- Multiplayer blackjack: round client_seed stores colon-joined per-seat seeds at deal time.
-- Two standard 32-char hex seeds + separator = 65 chars, which exceeded VARCHAR(64) and
-- caused bj_multi_place_bet to fail (startRound runs in the same handler once all seats bet).

ALTER TABLE blackjack_multi_rounds
  ALTER COLUMN client_seed TYPE VARCHAR(255);
