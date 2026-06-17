-- 158_arcade_andar_bahar.sql — MORBIUS Arcade: Andar Bahar (provably-fair card match).
--
-- Sibling of Baccarat (arcade-baccarat) and Dice x2 (155). One row per round; the
-- whole round is decided at /play time and inserted in a single transaction
-- alongside the chip moves, so a round is always either (bet charged + cards
-- dealt + payout applied) or nothing at all — never half-settled, never paid twice.
--
-- Rules: a provably-fair Fisher-Yates shuffle (ProvablyFairService.fisherYatesShuffle,
-- 52 card indices 0..51) seeds the deck. The JOKER is deck[0]; its rank0 = deck[0] % 13.
-- Cards deck[1], deck[2], … are then dealt alternately to ANDAR (first) then BAHAR
-- until a dealt card's rank0 equals the joker's. The side that received the matching
-- card wins. Andar is dealt first (so it wins slightly more often) and pays 0.9:1;
-- Bahar pays 1:1. The server_seed is committed (hashed) and stored in the same
-- insert, which makes the round independently verifiable.

CREATE TABLE IF NOT EXISTS arcade_andar_bahar_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Side the player bet on: 'andar' | 'bahar'.
  side                TEXT NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Joker card index 0..51 (deck[0]); its rank0 (idx % 13) drives the match.
  joker_card          INTEGER NOT NULL,
  -- Cards dealt to each pile, in deal order. Arrays of card indices 0..51.
  andar_cards         JSONB NOT NULL,
  bahar_cards         JSONB NOT NULL,
  -- Winning side ('andar' | 'bahar') and the alternating deal position (0-based)
  -- at which the match landed — match_index 0 = the very first Andar card.
  winning_side        TEXT NOT NULL,
  match_index         INTEGER NOT NULL,
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_andar_bahar_rounds_wallet
  ON arcade_andar_bahar_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_andar_bahar_rounds IS
  'MORBIUS Arcade Andar Bahar — cut a joker, deal both sides until a rank matches; one row per round; provably fair via committed server seed.';
