-- 131_arcade_hilo.sql — MORBIUS Arcade: Hi-Lo (provably-fair card game).
--
-- One row per round. Like Mines this is stateful: the row is INSERTED at
-- /start with status='active', UPDATED on each /pick (cards JSONB grows and
-- multiplier_x100 advances), then FINAL-UPDATED to 'cashed_out' or 'busted'
-- on /cashout or a wrong guess. The server seed is only revealed once the
-- round is finalized — that's what makes the round verifiable.
--
-- cards is a chronological JSON array of card *indices* in [0, 52). Index 0
-- is the base card dealt at /start; subsequent entries are the next card for
-- each pick. The matching `picks` array records the player's direction
-- ('hi' or 'lo') for each pick — picks.length === cards.length - 1.
-- On 'busted', the last pick lost and the last card in `cards` is the losing
-- reveal; on 'cashed_out' every pick in `picks` won.

CREATE TABLE IF NOT EXISTS arcade_hilo_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Chronological deck draw (card indices in [0, 52)). cards[0] is the base
  -- card; cards[1..] are the next-card reveals for each pick.
  cards               JSONB NOT NULL,
  -- Chronological list of player directions: 'hi' or 'lo'. Length always
  -- equals cards.length - 1 once at least one pick has been made.
  picks               JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Current ×100 multiplier (100 = 1.00x, before any pick).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still picking; 'cashed_out' → player banked the win; 'busted'
  -- → made a wrong pick and lost the bet. Once final, no more updates.
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'cashed_out', 'busted')),
  -- Final payout in chips (0 while active and on bust; bet × multiplier on cashout).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_hilo_rounds_wallet
  ON arcade_hilo_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; prevents the UI from
-- accidentally leaking chips by starting a second round on top of the first
-- (which would orphan the original bet).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_hilo_active_per_wallet
  ON arcade_hilo_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_hilo_rounds IS
  'MORBIUS Arcade Hi-Lo — one row per round, stateful via cards/picks JSONB; provably fair via committed server seed.';
