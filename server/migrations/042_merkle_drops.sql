-- Migration 042: Merkle Drop system tables
-- Epoch-based off-chain snapshot + on-chain Merkle claim for MORBIUS holders

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_epochs
-- Tracks each distribution epoch (snapshot → calculation → finalization → published)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_epochs (
  id                     SERIAL PRIMARY KEY,
  epoch_number           INT UNIQUE NOT NULL,   -- human-readable epoch counter (1, 2, 3, …)
  snapshot_block         BIGINT,                -- PulseChain block at which the snapshot was taken
  total_holders          INT DEFAULT 0,         -- number of eligible wallets after filtering
  total_balance          NUMERIC DEFAULT 0,     -- sum of all eligible holder balances at snapshot
  total_reward_amount    NUMERIC DEFAULT 0,     -- MORBIUS to distribute (set by admin)
  merkle_root            TEXT,                  -- 0x-prefixed hex root; NULL until finalized
  status                 TEXT NOT NULL DEFAULT 'pending',
    -- pending   = created, snapshot not yet taken
    -- snapshot  = snapshot done, rewards not yet calculated
    -- calculated = rewards assigned to each holder
    -- finalized = Merkle tree built, root stored here
    -- published = root set on-chain; users can claim
  min_holding_threshold  NUMERIC NOT NULL DEFAULT 1000, -- minimum MORBIUS to be eligible
  cron_triggered         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_at            TIMESTAMPTZ,
  calculated_at          TIMESTAMPTZ,
  finalized_at           TIMESTAMPTZ,
  published_at           TIMESTAMPTZ,

  CONSTRAINT merkle_epochs_status_check
    CHECK (status IN ('pending','snapshot','calculated','finalized','published'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_snapshots
-- One row per eligible wallet per epoch: balance + calculated reward + proof
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_snapshots (
  id               SERIAL PRIMARY KEY,
  epoch_id         INT NOT NULL REFERENCES merkle_epochs(id) ON DELETE CASCADE,
  wallet_address   TEXT NOT NULL,               -- lowercase 0x address
  morbius_balance  NUMERIC NOT NULL DEFAULT 0,  -- balance at snapshot (in MORBIUS, 18-dec)
  reward_amount    NUMERIC NOT NULL DEFAULT 0,  -- allocated reward (in MORBIUS, 18-dec)
  merkle_proof     JSONB,                        -- array of 0x-prefixed hex strings

  UNIQUE (epoch_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_merkle_snapshots_epoch_wallet
  ON merkle_snapshots (epoch_id, wallet_address);

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_blocklist
-- Addresses excluded from all epoch snapshots (burn addresses, contracts, LP pairs, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_blocklist (
  id          SERIAL PRIMARY KEY,
  address     TEXT NOT NULL UNIQUE,   -- lowercase 0x address
  reason      TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-populate known exclusions
INSERT INTO merkle_blocklist (address, reason) VALUES
  -- Burn / zero addresses
  ('0x0000000000000000000000000000000000000000', 'zero address'),
  ('0x000000000000000000000000000000000000dead', 'burn address'),

  -- MORBIUS/WPLS PulseX V1 LP pair (holds MORBIUS as liquidity, not a real holder)
  ('0x81acd0aa872675678a25fbb154992a2bad4f6cef', 'morbius/wpls v1 lp pair'),

  -- Staking contracts (MORBIUS locked here earns staking rewards, not holder drops)
  ('0xcc54f6d7ff847ab4ab4f10314ebf84486921368b', 'morbius staking contract v2'),
  ('0x6ae7e27cf0ee10516737d7416ef3178cb09d89cf', 'morbius lp staking contract v2'),

  -- HolderDistributor (protocol contract, not a real holder)
  ('0x0416947cd08fc3cd8923dd857c58472f337aa42b', 'morbius holder distributor v3'),

  -- Game contracts
  ('0xd66b4489fbff99a8d62f969203899840f2ec69c5', 'lottery v2 contract'),
  ('0x734a1460b4131f8cfe4950894be89d1a852c957a', 'keno contract'),
  ('0x37b1db8f06870bffefed862c06535befc4383ff8', 'plinko contract'),
  ('0x53331b63ef24904ea470cf07b924c7c13a699d8f', 'bigwheel contract'),
  ('0x1b38626a12085547c35bd80455d054950ad72cde', 'blackjack v3 contract'),

  -- Tournament contracts
  ('0x52cbf18a8ae0fd4324b045e13532d35cf05af3e1', 'tournament prize escrow v2'),
  ('0x1f30aa16b4da0124308e33b8650c351bbca70704', 'morbius tournament contract'),
  ('0xa114a8974d4478b09fe9d2e2bf1bdcf28de5bd25', 'tournament prize escrow v3')
ON CONFLICT (address) DO NOTHING;
