-- 080: Multiplayer blackjack audit log for tracking all game actions
CREATE TABLE IF NOT EXISTS blackjack_multi_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  table_id      UUID NOT NULL,
  round_id      UUID,
  player_address TEXT,
  action_type   TEXT NOT NULL,       -- join_table, leave_table, place_bet, hit, stand, double_down, split, auto_stand, deal, settle, disconnect_stand
  payload       JSONB DEFAULT '{}',  -- action-specific data (bet amount, cards, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bj_audit_table_id ON blackjack_multi_audit_log(table_id);
CREATE INDEX IF NOT EXISTS idx_bj_audit_round_id ON blackjack_multi_audit_log(round_id);
CREATE INDEX IF NOT EXISTS idx_bj_audit_player ON blackjack_multi_audit_log(player_address);
CREATE INDEX IF NOT EXISTS idx_bj_audit_created ON blackjack_multi_audit_log(created_at);
