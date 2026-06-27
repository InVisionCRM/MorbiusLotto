-- Migration 170: raise the referral welcome bonus 100 → 1000 chips.
--
-- welcome_bonus_chips is the one-time bonus credited to a referee when they
-- bind a referrer's code. Migration 169 originally seeded it at 100; this bumps
-- it to 1000. Idempotent: applies whether or not 169 had already run with the
-- old default. (Still runtime-tunable — change referral_config any time.)

BEGIN;

UPDATE referral_config
SET welcome_bonus_chips = 1000,
    updated_at = NOW()
WHERE id = 1;

-- Ensure the row exists even if 170 somehow runs before 169 seeded it.
INSERT INTO referral_config (id, welcome_bonus_chips)
VALUES (1, 1000)
ON CONFLICT (id) DO NOTHING;

COMMIT;
