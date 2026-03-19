-- 079: Multiplayer blackjack reliability improvements
-- 1) Action idempotency: last_action_id on round_seats
-- 2) Double-settlement guard: settled column already exists; add CHECK constraint

-- Idempotency: store last processed action ID per seat per round
ALTER TABLE blackjack_multi_round_seats
  ADD COLUMN IF NOT EXISTS last_action_id TEXT DEFAULT NULL;
