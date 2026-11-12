-- 202_poker_cash_bot_seven.sql
--
-- Kyle (Nov 12 2026): run the always-open cash table with seven bots. The cash roster had six
-- (b081–b086); add a seventh so POKER_BOT_CASH_MIN_BOTS=7 can always be met. Idempotent.

BEGIN;

INSERT INTO poker_bot_accounts (wallet_address, display_name, personality, role) VALUES
  ('0x000000000000000000000000000000000000b087', 'Ungar', '{"tightness":0.40,"aggression":0.80,"bluff":0.10}', 'cash')
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO players (wallet_address, balance)
VALUES ('0x000000000000000000000000000000000000b087', '0')
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO player_poker_chips (wallet_address, balance)
VALUES ('0x000000000000000000000000000000000000b087', 0)
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO chat_display_names (wallet_address, display_name)
VALUES ('0x000000000000000000000000000000000000b087', 'Ungar')
ON CONFLICT (wallet_address) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW();

COMMIT;
