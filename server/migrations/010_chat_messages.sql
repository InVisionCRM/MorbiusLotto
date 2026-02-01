-- Chat messages for main lobby and per-game rooms (persistent history)

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(64) NOT NULL,
    sender_address VARCHAR(42),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC);

COMMENT ON TABLE chat_messages IS 'Community chat: main (lobby) and per-game rooms (blackjack, plinko, keno, etc.)';
