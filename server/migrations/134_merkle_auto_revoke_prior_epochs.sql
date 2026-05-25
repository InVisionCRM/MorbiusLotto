-- Migration 134: Auto-revoke superseded on-chain Merkle roots when a new epoch publishes.
-- Clears stale epochRoots so users claim from the latest tree only (rollup path).

BEGIN;

INSERT INTO merkle_settings (key, value) VALUES
  ('auto_revoke_prior_epochs_on_publish', 'true')
ON CONFLICT (key) DO NOTHING;

INSERT INTO merkle_lp_settings (key, value) VALUES
  ('auto_revoke_prior_epochs_on_publish', 'true')
ON CONFLICT (key) DO NOTHING;

COMMIT;
