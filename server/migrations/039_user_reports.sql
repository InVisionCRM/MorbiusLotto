-- User-submitted bug/issue reports with auto-captured debug context
SET lock_timeout = '3s';
SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS user_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT,
  category    TEXT        NOT NULL,
  description TEXT        NOT NULL,
  page_url    TEXT,
  user_agent  TEXT,
  balance_snapshot NUMERIC(78, 0),
  recent_errors    JSONB,
  status      TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status     ON user_reports (status);
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at ON user_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_wallet     ON user_reports (LOWER(wallet_address));
