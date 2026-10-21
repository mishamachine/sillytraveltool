-- ============================================================
-- STT Fix — Drop broken on_auth_user_created trigger
-- Run this FIRST in Supabase Dashboard → SQL Editor
--
-- Root cause: trigger fires as auth role which cannot INSERT
-- into user_profiles — silently blocks all new signups.
-- Profile creation is handled client-side in authStore.js
-- ensureProfile() instead.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Verify it's gone
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Should return 0 rows
