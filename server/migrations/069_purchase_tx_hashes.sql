-- Migration 069: Track used purchase tx hashes for replay protection

CREATE TABLE IF NOT EXISTS purchase_tx_hashes (
  tx_hash        VARCHAR(66)  PRIMARY KEY,          -- 0x + 64 hex chars
  wallet_address VARCHAR(42)  NOT NULL,
  item_key       VARCHAR(100) NOT NULL,
  currency       VARCHAR(10)  NOT NULL DEFAULT 'PLS', -- PLS | MORBIUS
  recorded_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_tx_wallet ON purchase_tx_hashes(wallet_address);
