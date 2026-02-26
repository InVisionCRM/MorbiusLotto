-- Migration 044: Merkle drop schedule & default reward settings
--
-- schedule_type:     'manual' | 'weekly' | 'biweekly' | 'monthly'
-- schedule_day:      0=Sun..6=Sat for weekly/biweekly; 1–28 for monthly
-- schedule_hour_utc: 0–23 UTC hour when the cron fires
-- default_reward_wei: amount of NEW MORBIUS (in wei) to distribute each auto epoch;
--                     '0' means the admin must enter it manually per epoch.

CREATE TABLE IF NOT EXISTS merkle_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO merkle_settings (key, value) VALUES
  ('schedule_type',      'manual'),
  ('schedule_day',       '5'),
  ('schedule_hour_utc',  '12'),
  ('default_reward_wei', '0')
ON CONFLICT (key) DO NOTHING;
