-- Migration: Fix Blackjack provably-fair seed storage and per-draw nonce
-- Adds:
--  - game_sessions.server_seed (actual server seed, hex string)
--  - games.rng_counter (how many RNG draws have been consumed)
--
-- Notes:
-- - server_seed_hash remains the public commitment (sha256(server_seed) hex).
-- - Existing sessions will have NULL server_seed until refreshed; the server code
--   will create a new session if required or regenerate as needed.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS server_seed VARCHAR(64);

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS rng_counter INTEGER DEFAULT 0;

