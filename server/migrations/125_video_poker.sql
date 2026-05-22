-- 125_video_poker.sql — MORBIUS Arcade: Video Poker (Jacks or Better).
--
-- One row per dealt hand. A row is created at deal time with status 'dealt'
-- and finalised at draw time with status 'resolved'. The full shuffled deck is
-- committed at deal, which is what makes every hand provably fair: once a hand
-- is 'resolved' the server_seed is published, and anyone can re-run
-- fisherYatesShuffle(server_seed, client_seed, nonce) to confirm the deck.

CREATE TABLE IF NOT EXISTS video_poker_hands (
  id                TEXT PRIMARY KEY,
  wallet_address    TEXT NOT NULL,
  bet               BIGINT NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'dealt',
  server_seed       TEXT NOT NULL,
  server_seed_hash  TEXT NOT NULL,
  client_seed       TEXT NOT NULL,
  nonce             INTEGER NOT NULL DEFAULT 0,
  deck              JSONB NOT NULL,
  dealt_hand        JSONB NOT NULL,
  holds             JSONB,
  final_hand        JSONB,
  result_category   VARCHAR(24),
  payout            BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_poker_hands_wallet
  ON video_poker_hands (wallet_address, created_at DESC);

COMMENT ON TABLE video_poker_hands IS
  'MORBIUS Arcade video poker — one row per hand; provably fair via the committed deck.';
