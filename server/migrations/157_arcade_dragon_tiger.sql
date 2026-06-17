-- 157_arcade_dragon_tiger.sql — MORBIUS Arcade: Dragon Tiger (provably-fair, one-shot).
--
-- The fastest card game on the floor: one card to Dragon, one to Tiger, higher
-- rank wins (Ace is LOW). Like Baccarat (154) and Dice x2 (155) the entire round
-- is decided at /play time and inserted in a single transaction alongside the
-- chip moves, so a round is always either (bet charged + cards dealt + payout
-- applied) or nothing at all — never half-settled, never paid twice.
--
-- Deck is a Fisher-Yates shuffle:
--   deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce)  → 52 indices 0..51.
--   dragonCard = deck[0], tigerCard = deck[1].
--   rank0 = idx % 13  (0 = Ace .. 12 = King); higher rank0 wins, equal = tie.
-- The server_seed is committed (hashed) and stored in the same insert, which
-- makes every round independently verifiable.
--
-- Bets are stored per-zone as a jsonb object { dragon, tiger, tie } (chips, each
-- an integer ≥ 0). Per-zone payouts are stored the same way. result is one of
-- 'dragon' | 'tiger' | 'tie'.

CREATE TABLE IF NOT EXISTS arcade_dragon_tiger_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Per-zone wagers in chips: { "dragon": n, "tiger": n, "tie": n }.
  bets                JSONB NOT NULL,
  total_bet           BIGINT NOT NULL,
  -- Dealt cards as 0..51 deck indices. rank0 = idx % 13 (Ace low), suit = idx/13.
  dragon_card         INTEGER NOT NULL,
  tiger_card          INTEGER NOT NULL,
  result              TEXT NOT NULL,
  -- Per-zone payouts in chips (gross, includes stake on a win): same shape as bets.
  payouts             JSONB NOT NULL,
  total_payout        BIGINT NOT NULL,
  won                 BOOLEAN NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_dragon_tiger_rounds_wallet
  ON arcade_dragon_tiger_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_dragon_tiger_rounds IS
  'MORBIUS Arcade Dragon Tiger — one card each, higher rank wins (Ace low); one row per round; provably fair via committed server seed.';
