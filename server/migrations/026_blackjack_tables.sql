-- Migration 026: Blackjack tables (admin-managed: image/video backgrounds, description, token contract)
-- Used for table picker and DexScreener links. Uploads go to public folder (path stored in src).

CREATE TABLE IF NOT EXISTS blackjack_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('image', 'video')),
  name VARCHAR(255) NOT NULL,
  src VARCHAR(512) NOT NULL,
  description TEXT,
  token_contract_address VARCHAR(42),
  sort_order INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blackjack_tables_enabled_sort ON blackjack_tables(enabled, sort_order);

COMMENT ON TABLE blackjack_tables IS 'Admin-managed table themes (image/video) with optional description and token contract for DexScreener';
