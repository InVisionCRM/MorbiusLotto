-- Editable display names for chat (per wallet address)

CREATE TABLE IF NOT EXISTS chat_display_names (
    wallet_address VARCHAR(42) PRIMARY KEY,
    display_name VARCHAR(32) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_display_names_wallet ON chat_display_names(wallet_address);

COMMENT ON TABLE chat_display_names IS 'User-editable display names shown in chat instead of truncated address';
