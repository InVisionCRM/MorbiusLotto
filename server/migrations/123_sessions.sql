-- SIWE (Sign-In With Ethereum) auth: nonces + sessions
-- Apply: node server/run-migration.js migrations/123_sessions.sql

-- One-time nonces issued by GET /api/auth/nonce, consumed by POST /api/auth/verify.
-- Used_at is set when the nonce is exchanged for a session; once set the row can't be reused.
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce         TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at       TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces (expires_at);

-- Server-side session records keyed by an opaque random token kept in an httpOnly cookie.
-- wallet_address is stored lowercased for fast equality lookup; UI should show the
-- checksummed form via getAddress() when displaying.
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL UNIQUE,
  wallet_address  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  ip              TEXT,
  user_agent      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions (LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at) WHERE revoked_at IS NULL;
