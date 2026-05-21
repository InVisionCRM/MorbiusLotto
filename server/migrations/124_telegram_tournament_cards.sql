-- Migration 124: Telegram group "Rail" card tracking
--
-- Stores the message id of the tournament card the bot posts into the Telegram
-- group, so the card can be edited in place (editMessageText) as seats fill,
-- the tournament starts, etc. One card per tournament.
--
-- Isolated: new table only, no changes to any existing table. One-shot event
-- dedup (filled / started / completed / cancelled) reuses the existing
-- telegram_tournament_pings table from migration 122.

CREATE TABLE IF NOT EXISTS telegram_tournament_cards (
  tournament_id    TEXT PRIMARY KEY,
  group_message_id BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
