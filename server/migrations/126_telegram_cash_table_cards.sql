-- Migration 126: Telegram group "Rail" — cash-table card tracking
--
-- Stores the message id of the live cash-table card the bot posts into the
-- Telegram group, so the card can be edited in place (editMessageText) as
-- players join and big pots are won. One card per cash table.
-- `biggest_pot` is the largest pot (in chips) seen at the table, shown on the
-- card.
--
-- Isolated: new table only, no changes to any existing table. Mirrors
-- telegram_tournament_cards (migration 124).

CREATE TABLE IF NOT EXISTS telegram_cash_table_cards (
  table_id         TEXT PRIMARY KEY,
  group_message_id BIGINT NOT NULL,
  biggest_pot      BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
