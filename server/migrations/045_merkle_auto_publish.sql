-- Add auto_publish_onchain setting (default off for safety)
INSERT INTO merkle_settings (key, value) VALUES ('auto_publish_onchain', 'false')
ON CONFLICT (key) DO NOTHING;
