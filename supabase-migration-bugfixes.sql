-- ============================================================
-- STT Bug Fix Migration — v0.13b
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add trips_created column to user_stats
--    (previously missing — causes first_trip badge to never award)
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS trips_created INTEGER DEFAULT 0;

-- 2. Back-fill trips_created from existing trips data
UPDATE user_stats us
SET trips_created = (
  SELECT COUNT(*) FROM trips t WHERE t.owner_id = us.user_id
);

-- 3. Verify
SELECT user_id, trips_created, trips_completed, goose_score FROM user_stats LIMIT 10;
