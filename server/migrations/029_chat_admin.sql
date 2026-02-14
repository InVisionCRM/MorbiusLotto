-- Chat admin: soft-delete messages, blocked addresses

-- Soft-delete for chat messages (admin delete)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(42) NULL;

COMMENT ON COLUMN chat_messages.deleted_at IS 'When set, message is hidden from clients; set by admin delete.';
COMMENT ON COLUMN chat_messages.deleted_by IS 'Wallet address of admin who deleted the message.';

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_not_deleted
  ON chat_messages(room_id, created_at DESC) WHERE deleted_at IS NULL;

-- Blocked addresses (cannot send chat messages)
CREATE TABLE IF NOT EXISTS chat_blocked_addresses (
  wallet_address VARCHAR(42) PRIMARY KEY,
  blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE chat_blocked_addresses IS 'Wallet addresses blocked from sending chat messages (admin-managed).';
