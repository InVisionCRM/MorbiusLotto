-- Migration 027: Admin game config (key-value for min/max bet, fee %, feature flags)
-- Server/games read these; admin UI writes via /api/admin/config.

CREATE TABLE IF NOT EXISTS admin_game_config (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_game_config IS 'Admin-editable game parameters (min/max bet, fee %, flags). Keys e.g. blackjack_min_bet, blackjack_max_bet, blackjack_fee_percent.';
