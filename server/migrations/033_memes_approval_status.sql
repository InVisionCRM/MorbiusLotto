-- Memes approval workflow: new memes require admin approval before appearing in gallery

-- Add approval_status to memes (if table exists from app/api/memes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memes') THEN
    ALTER TABLE memes ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending';
    UPDATE memes SET approval_status = 'approved' WHERE approval_status IS NULL;
  END IF;
END $$;
