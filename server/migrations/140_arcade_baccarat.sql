-- 140_arcade_baccarat.sql — MORBIUS Arcade: Baccarat (Punto Banco).
--
-- One row per hand. All bets, the dealt cards, and the per-zone payouts are
-- captured in a single INSERT inside the same transaction that charges the
-- wager and credits the payout, so a round is atomic — bets are never
-- half-settled.
--
-- The deck is committed at play time (output of
-- ProvablyFairService.fisherYatesShuffle(server_seed, client_seed, 0)). The
-- verify endpoint publishes server_seed + the dealt cards so anyone can re-run
-- the shuffle and confirm the hand wasn't moved mid-round.
--
-- Baccarat's third-card rules are deterministic — there are no player
-- decisions after the deal — so the entire hand is fixed once the deck is.

CREATE TABLE IF NOT EXISTS arcade_baccarat_hands (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Amounts wagered per zone in chips.
  -- Schema: { player, banker, tie, playerPair, bankerPair } (each a non-negative integer).
  bets                JSONB NOT NULL,
  total_bet           BIGINT NOT NULL,
  -- Full shuffled 52-card deck (indices 0..51). Cards are dealt in order:
  -- P1 = deck[0], B1 = deck[1], P2 = deck[2], B2 = deck[3],
  -- P3 = deck[4] (if drawn), B3 = deck[5] (if drawn).
  deck                JSONB NOT NULL,
  player_cards        JSONB NOT NULL,
  banker_cards        JSONB NOT NULL,
  player_total        SMALLINT NOT NULL,
  banker_total        SMALLINT NOT NULL,
  result              VARCHAR(8) NOT NULL,
  player_pair         BOOLEAN NOT NULL,
  banker_pair         BOOLEAN NOT NULL,
  -- Per-zone payouts (gross chips credited on a win, includes returned stake).
  -- Mirrors `bets`. Sum equals total_payout.
  payouts             JSONB NOT NULL,
  total_payout        BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_baccarat_hands_wallet
  ON arcade_baccarat_hands (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_baccarat_hands IS
  'MORBIUS Arcade Baccarat — one row per hand; deck committed, server_seed revealed for verify.';
