-- 023: Security fixes
-- 1) Prevent negative balances at the DB level
-- 2) Track pending withdrawal signatures to prevent stockpiling

-- Safety: check for negative balances before adding constraint
-- (If any exist, they need to be fixed first — this will error)
ALTER TABLE players ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);

-- Pending withdrawals: tracks signed but not-yet-submitted withdrawal signatures
CREATE TABLE IF NOT EXISTS pending_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce NUMERIC(78, 0) UNIQUE NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_wallet_status
    ON pending_withdrawals(wallet_address, status);
