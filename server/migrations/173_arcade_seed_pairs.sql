-- 173_arcade_seed_pairs.sql — MORBIUS Arcade: persistent provably-fair seed pairs.
--
-- WHY THIS EXISTS
-- The instant, one-shot arcade games (Dice, Limbo, Roulette, …) previously
-- minted a FRESH server seed inside the same /play request that settled the
-- bet and revealed it immediately. That makes each row self-consistent
-- (sha256(seed) === hash) but proves nothing about ordering: the seed was
-- never committed to the player BEFORE the bet, so a dishonest server could
-- grind seeds at settlement time. There is no player decision between commit
-- and reveal in a one-shot game, so a per-round commitment has no teeth.
--
-- THE FIX (Stake-standard, and identical in spirit to arcade_craps_sessions):
--   * Each wallet has exactly ONE active server seed. Its SHA-256 commitment
--     (server_seed_hash) is published up front — before any bet — while the
--     plaintext stays hidden in arcade_seed_pair_pending.
--   * Every bet consumes the active pair at a monotonically-increasing nonce
--     (die/roll derived from HMAC(serverSeed, clientSeed, nonce)). The nonce
--     advances by exactly 1 per bet, so the sequence is gap-free and auditable.
--   * The plaintext server seed is revealed only when the player ROTATES the
--     seed (or it is otherwise retired). Rotation moves the plaintext into
--     arcade_seed_pairs.server_seed, marks the pair 'revealed', and commits a
--     fresh active pair. This is the exact lifecycle craps already ships.
--
-- Each bet row snapshots the server_seed_hash, client_seed and nonce it used,
-- and links to the seed pair via seed_pair_id. Verification returns the
-- plaintext server seed ONLY once its pair has been revealed — until then a
-- round exposes just the commitment, which is the whole point.

-- ─── Active + revealed seed pairs (one active row per wallet) ────────────────
CREATE TABLE IF NOT EXISTS arcade_seed_pairs (
  id                UUID PRIMARY KEY,
  wallet_address    VARCHAR(42) NOT NULL,
  server_seed_hash  TEXT NOT NULL,
  -- NULL while active/committed; filled with the plaintext on reveal (rotation).
  server_seed       TEXT,
  client_seed       TEXT NOT NULL,
  -- Next bet's nonce. Starts at 0; incremented after every consumed bet.
  nonce_counter     INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revealed_at       TIMESTAMPTZ,
  CONSTRAINT arcade_seed_pairs_status_chk
    CHECK (status IN ('active', 'revealed'))
);

-- At most one ACTIVE pair per wallet. Revealed pairs accumulate as history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_seed_pairs_active_per_wallet
  ON arcade_seed_pairs (wallet_address)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_arcade_seed_pairs_wallet
  ON arcade_seed_pairs (wallet_address, created_at DESC);

-- Plaintext server seed hidden during active play. One row per active pair;
-- deleted when the pair is revealed (plaintext then lives on arcade_seed_pairs).
CREATE TABLE IF NOT EXISTS arcade_seed_pair_pending (
  seed_pair_id  UUID PRIMARY KEY
    REFERENCES arcade_seed_pairs(id) ON DELETE CASCADE,
  server_seed   TEXT NOT NULL
);

COMMENT ON TABLE arcade_seed_pairs IS
  'MORBIUS Arcade — persistent per-wallet PF seed pairs. One active pair holds the published commitment; revealed pairs are the reveal history. Plaintext stays in arcade_seed_pair_pending until rotation.';
COMMENT ON TABLE arcade_seed_pair_pending IS
  'Plaintext server seed for the active pair; moved onto arcade_seed_pairs.server_seed and deleted on rotation.';

-- ─── Link one-shot game rows to the pair that produced them ──────────────────
-- The bet rows already snapshot server_seed_hash / client_seed / nonce. Add a
-- seed_pair_id link so verify can fetch the plaintext once the pair is revealed,
-- and drop the NOT NULL on the legacy server_seed column: going forward the
-- plaintext is NOT written onto the bet row (it must stay hidden until reveal).
ALTER TABLE arcade_dice_rounds     ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_limbo_rounds    ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_roulette_spins  ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);

ALTER TABLE arcade_dice_rounds     ALTER COLUMN server_seed DROP NOT NULL;
ALTER TABLE arcade_limbo_rounds    ALTER COLUMN server_seed DROP NOT NULL;
ALTER TABLE arcade_roulette_spins  ALTER COLUMN server_seed DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arcade_dice_rounds_seed_pair    ON arcade_dice_rounds (seed_pair_id);
CREATE INDEX IF NOT EXISTS idx_arcade_limbo_rounds_seed_pair   ON arcade_limbo_rounds (seed_pair_id);
CREATE INDEX IF NOT EXISTS idx_arcade_roulette_spins_seed_pair ON arcade_roulette_spins (seed_pair_id);
