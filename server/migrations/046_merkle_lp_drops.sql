-- Migration 046: Merkle LP Drop system tables
-- Epoch-based off-chain snapshot + on-chain Merkle claim for MORBIUS LP holders.
-- Rewards any wallet directly holding LP tokens from supported MORBIUS-paired pools.

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_lp_pairs
-- Supported LP pair contracts (any MORBIUS pair on PulseChain DEXes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_lp_pairs (
  id           SERIAL PRIMARY KEY,
  pair_address TEXT NOT NULL UNIQUE,   -- LP token contract address (lowercase)
  label        TEXT NOT NULL,          -- e.g. 'MORBIUS/WPLS V1'
  dex_name     TEXT,                   -- e.g. 'PulseX', '9mm'
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-populate all known MORBIUS pairs (from DexScreener, 2026-03)
INSERT INTO merkle_lp_pairs (pair_address, label, dex_name, active) VALUES
  ('0x81acd0aa872675678a25fbb154992a2bad4f6cef', 'MORBIUS/WPLS',   'PulseX',  true),
  ('0x3484d2589bbd7957c217c04eb48837a5cde1434b', 'MORBIUS/UFO',    'PulseX',  true),
  ('0x3208788cf9beaedf8107ebb321b3890a3bd72ce7', 'MORBIUS/HEX',    'PulseX',  true),
  ('0xde5cda61eac2962e142db8f29e45254f916ad35c', 'MORBIUS/LBRTY',  'PulseX',  true),
  ('0xc71e3c8a6db933f827fcbbea174a79e088be2c5c', 'MORBIUS/EMIT',   'PulseX',  true),
  ('0x5586956d3f1af639d54a7aca9992ac1a9449edc6', 'MORBIUS/ZAP',    'PulseX',  true),
  ('0xb876257c7550010f14a527d2bf8fda9360f8597b', 'MORBIUS/WPLS V2','PulseX',  true),
  ('0x1f5374aee6d97ee8d39a9885f73475a49926bed9', 'MORBIUS/WPLS',   '9mm',     true),
  ('0xa17bd0c64a2f3de9131c310ad6fd26bbc7af09dd', 'MORBIUS/SCADA',  'PulseX',  false),
  ('0x05d35f5972f34218ca3a65ca246765e184542f71', 'pSSH/MORBIUS',   'PulseX',  false),
  ('0x922f5d2560a3addab83cc856161b8d04c8dcb093', 'WICK/MORBIUS',   '9mm',     false),
  ('0xdbed78e14e230158ec01e534749bd5ae5ed0816f', 'RICH/MORBIUS',   'PulseX',  false),
  ('0xa1c6c4d6a7d167b60cfd80cc29ca3e93aa60faf5', 'DHEART/MORBIUS', 'PulseX',  false),
  ('0x6081ebffaf442d4e51f9dab689c7d66882edaa69', 'MORBY/MORBIUS',  'PulseX',  false),
  ('0x3f5f5b5b1c6e15522b15ee6303a484ad6e235e29', 'NOAH/MORBIUS',   'PulseX',  false)
ON CONFLICT (pair_address) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_lp_epochs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_lp_epochs (
  id                     SERIAL PRIMARY KEY,
  epoch_number           INT UNIQUE NOT NULL,
  snapshot_block         BIGINT,
  total_holders          INT DEFAULT 0,
  total_balance          NUMERIC DEFAULT 0,     -- sum of all holders' morbius_equivalent (18-dec)
  total_reward_amount    NUMERIC DEFAULT 0,     -- total MORBIUS to distribute (new + rollup, 18-dec)
  new_reward_amount      NUMERIC DEFAULT 0,
  rollup_amount          NUMERIC DEFAULT 0,
  merkle_root            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  cron_triggered         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_at            TIMESTAMPTZ,
  calculated_at          TIMESTAMPTZ,
  finalized_at           TIMESTAMPTZ,
  published_at           TIMESTAMPTZ,

  CONSTRAINT merkle_lp_epochs_status_check
    CHECK (status IN ('pending','snapshot','calculated','finalized','published'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_lp_snapshots
-- One row per eligible wallet per epoch (aggregated MORBIUS equivalent across all LP pairs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_lp_snapshots (
  id                     SERIAL PRIMARY KEY,
  epoch_id               INT NOT NULL REFERENCES merkle_lp_epochs(id) ON DELETE CASCADE,
  wallet_address         TEXT NOT NULL,
  morbius_equivalent     NUMERIC NOT NULL DEFAULT 0,  -- total MORBIUS value across all LP positions (18-dec)
  reward_amount          NUMERIC NOT NULL DEFAULT 0,  -- allocated reward (18-dec)
  merkle_proof           JSONB,
  superseded_by_epoch_id INT REFERENCES merkle_lp_epochs(id),
  claimed_at             TIMESTAMPTZ,

  UNIQUE (epoch_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_merkle_lp_snapshots_epoch_wallet
  ON merkle_lp_snapshots (epoch_id, wallet_address);

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_lp_blocklist
-- Addresses excluded from LP holder snapshots (burn addresses, staking contracts, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_lp_blocklist (
  id          SERIAL PRIMARY KEY,
  address     TEXT NOT NULL UNIQUE,
  reason      TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO merkle_lp_blocklist (address, reason) VALUES
  ('0x0000000000000000000000000000000000000000', 'zero address'),
  ('0x000000000000000000000000000000000000dead', 'burn address'),
  ('0x742389696fb4c311cddd30d3ceae6697c7d238aa', 'morbius lp staking v3 (stakers earn streaming rewards)')
ON CONFLICT (address) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- merkle_lp_settings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merkle_lp_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO merkle_lp_settings (key, value) VALUES
  ('schedule_type',       'manual'),
  ('schedule_day',        '5'),
  ('schedule_hour_utc',   '14'),
  ('schedule_interval',   '60'),
  ('default_reward_wei',  '0'),
  ('auto_publish_onchain','false')
ON CONFLICT (key) DO NOTHING;
