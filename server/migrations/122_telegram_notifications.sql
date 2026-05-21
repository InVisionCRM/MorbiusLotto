-- Migration 122: Telegram bot notifications
--
-- Adds the storage needed for the Telegram notification feature so poker
-- tournament players can get a heads-up (via a single shared Telegram bot)
-- shortly before their game starts.
--
-- Design note: this migration is intentionally fully ISOLATED — it creates new
-- tables only and does NOT alter `players`, `tournaments`, or any other core
-- table. That keeps the Telegram feature impossible to break the rest of the
-- platform with, and trivially reversible (just DROP the 3 tables below).

-- ---------------------------------------------------------------------------
-- 1. telegram_links — one row per wallet that has linked a Telegram account.
--    `telegram_chat_id` is the NUMERIC chat id Telegram gives us (store the id,
--    never the username — usernames can change). It is UNIQUE so one Telegram
--    account cannot be linked to two wallets at once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_links (
  wallet_address        TEXT PRIMARY KEY,                 -- lowercase 0x address
  telegram_chat_id      BIGINT UNIQUE,                    -- numeric Telegram chat id
  telegram_username     TEXT,                             -- @handle at link time (display only)
  linked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_chat_id ON telegram_links(telegram_chat_id);

-- ---------------------------------------------------------------------------
-- 2. telegram_link_codes — short-lived one-time codes used to connect a wallet
--    to a Telegram account. The web UI generates a code; the player sends it to
--    the bot; the webhook consumes it. Codes expire (default 10 min) and are
--    single-use (`consumed_at`).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code           TEXT PRIMARY KEY,                        -- 6-char uppercase, no ambiguous chars
  wallet_address TEXT NOT NULL,                           -- lowercase 0x address
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_wallet  ON telegram_link_codes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires ON telegram_link_codes(expires_at);

-- ---------------------------------------------------------------------------
-- 3. telegram_tournament_pings — dedup ledger so the scheduler does not re-send
--    the same notification on every poll. One row per (tournament, kind).
--    kind: 'starting_soon' (~60s before start) | 'final_call' (~10-15s before).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_tournament_pings (
  tournament_id TEXT NOT NULL,
  kind          TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, kind)
);
