-- Cash poker tables: store creating wallet for lobby display (nullable for legacy rows).
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS creator_address VARCHAR(42);

COMMENT ON COLUMN poker_tables.creator_address IS 'Wallet that created this cash table; NULL for rows created before this column.';

CREATE INDEX IF NOT EXISTS idx_poker_tables_creator_lower ON poker_tables (LOWER(creator_address));
