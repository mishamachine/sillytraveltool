-- ============================================================
-- SILLY TRAVEL TOOL — Complete Database Schema v1.0
-- Run this in Supabase SQL Editor to set up fresh
-- ============================================================

-- ============================================================
-- STEP 1: CLEAN SLATE — Drop everything old
-- ============================================================
DO $$ BEGIN
  DROP TABLE IF EXISTS user_badges CASCADE;
  DROP TABLE IF EXISTS user_stats CASCADE;
  DROP TABLE IF EXISTS trip_activities CASCADE;
  DROP TABLE IF EXISTS booking_seats CASCADE;
  DROP TABLE IF EXISTS bookings CASCADE;
  DROP TABLE IF EXISTS trip_collaborators CASCADE;
  DROP TABLE IF EXISTS trips CASCADE;
  DROP TABLE IF EXISTS wallet_documents CASCADE;
  DROP TABLE IF EXISTS loyalty_cards CASCADE;
  DROP TABLE IF EXISTS guide_cache CASCADE;
  DROP TABLE IF EXISTS phrase_cache CASCADE;
  DROP TABLE IF EXISTS user_profiles CASCADE;
  DROP TYPE IF EXISTS trip_status CASCADE;
  DROP TYPE IF EXISTS booking_type CASCADE;
  DROP TYPE IF EXISTS collaborator_role CASCADE;
  DROP TYPE IF EXISTS document_type CASCADE;
  DROP TYPE IF EXISTS badge_tier CASCADE;
END $$;

-- ============================================================
-- STEP 2: CUSTOM TYPES
-- ============================================================
CREATE TYPE trip_status AS ENUM ('planning', 'active', 'completed', 'cancelled');
CREATE TYPE booking_type AS ENUM ('flight', 'hotel', 'activity', 'transport', 'other');
CREATE TYPE collaborator_role AS ENUM ('owner', 'collaborator', 'viewer');
CREATE TYPE document_type AS ENUM ('passport', 'visa', 'insurance', 'id', 'vaccine', 'other');
CREATE TYPE badge_tier AS ENUM ('easy', 'medium', 'hard', 'legendary');

-- ============================================================
-- STEP 3: USER PROFILES
-- Extends Supabase auth.users — created automatically on signup
-- ============================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  home_currency TEXT DEFAULT 'USD',        -- set on first Currency open
  passport_country TEXT,                    -- set on first SOS open
  home_city TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- STEP 4: TRIPS
-- ============================================================
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  destination_country_code CHAR(2),         -- ISO 3166-1 alpha-2 e.g. 'JP'
  destination_lat DECIMAL(9,6),
  destination_lng DECIMAL(9,6),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status trip_status DEFAULT 'planning',
  cover_emoji TEXT DEFAULT '✈️',
  notes TEXT,
  share_checklist BOOLEAN DEFAULT FALSE,    -- include checklist in share link
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "Trip owners have full access" ON trips
  FOR ALL USING (auth.uid() = owner_id);

-- ============================================================
-- STEP 5: TRIP COLLABORATORS
-- ============================================================
CREATE TABLE trip_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT,                       -- for pending invites before account exists
  role collaborator_role DEFAULT 'collaborator',
  status TEXT DEFAULT 'pending'             -- 'pending' | 'active' | 'declined'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  invite_token UUID,                        -- set on invite send, used to accept via URL
  invite_expires_at TIMESTAMPTZ,            -- 7 days from send
  UNIQUE(trip_id, user_id),
  UNIQUE(trip_id, invited_email)
);

ALTER TABLE trip_collaborators ENABLE ROW LEVEL SECURITY;

-- Non-recursive: use invited_by for owner check to avoid trips<->trip_collaborators loop
CREATE POLICY "tc_owner" ON trip_collaborators
  FOR ALL USING (invited_by = auth.uid());

CREATE POLICY "tc_self" ON trip_collaborators
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "tc_self_update" ON trip_collaborators
  FOR UPDATE USING (user_id = auth.uid());

-- Collaborator trip access — non-recursive subquery
CREATE POLICY "collabs_select" ON trips
  FOR SELECT USING (
    auth.uid() = owner_id OR
    auth.uid() IN (
      SELECT user_id FROM trip_collaborators
      WHERE trip_id = id AND status = 'accepted'
    )
  );

-- ============================================================
-- STEP 6: BOOKINGS
-- Flights, hotels, activities — all trip items
-- ============================================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  type booking_type NOT NULL,
  title TEXT NOT NULL,

  -- Shared booking flag — if true, this booking is for all collaborators
  is_shared BOOLEAN DEFAULT FALSE,

  -- Flight specific
  flight_number TEXT,
  airline TEXT,
  departure_airport TEXT,
  arrival_airport TEXT,
  departure_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ,
  flight_class TEXT,                        -- 'economy' | 'business' | 'first'

  -- Hotel specific
  hotel_name TEXT,
  hotel_address TEXT,
  check_in_date DATE,
  check_out_date DATE,
  room_type TEXT,

  -- Activity / general
  activity_date DATE,
  activity_time TIME,
  venue_name TEXT,
  venue_address TEXT,
  duration_minutes INTEGER,

  -- Common
  confirmation_number TEXT,
  booking_url TEXT,
  price DECIMAL(10,2),
  currency CHAR(3) DEFAULT 'USD',
  notes TEXT,

  -- Source of booking (manual, email_import)
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'email_import')),
  raw_email_id TEXT,                        -- reference to parsed email

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anyone in the trip can view bookings
CREATE POLICY "Trip members can view bookings" ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND (
        owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM trip_collaborators
          WHERE trip_id = bookings.trip_id AND user_id = auth.uid() AND status = 'accepted'
        )
      )
    )
  );

-- Collaborators and owners can insert
CREATE POLICY "Trip members can insert bookings" ON bookings
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND (
        owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM trip_collaborators
          WHERE trip_id = bookings.trip_id AND user_id = auth.uid()
            AND role IN ('owner', 'collaborator') AND status = 'accepted'
        )
      )
    )
  );

-- Only creator or owner can update/delete
CREATE POLICY "Booking creator or trip owner can update" ON bookings
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid())
  );

CREATE POLICY "Booking creator or trip owner can delete" ON bookings
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid())
  );

-- ============================================================
-- STEP 7: BOOKING SEATS
-- For shared flights — each user adds their own seat
-- ============================================================
CREATE TABLE booking_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_number TEXT,
  meal_preference TEXT,
  frequent_flyer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, user_id)
);

ALTER TABLE booking_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own seats" ON booking_seats
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Trip members can view all seats" ON booking_seats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN trips t ON t.id = b.trip_id
      WHERE b.id = booking_id AND (
        t.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM trip_collaborators
          WHERE trip_id = t.id AND user_id = auth.uid() AND status = 'accepted'
        )
      )
    )
  );

-- ============================================================
-- STEP 8: TRIP ACTIVITIES (checklist items, notes, day plan)
-- ============================================================
CREATE TABLE trip_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  category TEXT,                            -- 'food' | 'sight' | 'event' | 'note' | 'custom'
  date DATE,
  time TIME,
  duration_minutes INTEGER,
  location_name TEXT,
  location_address TEXT,
  location_lat DECIMAL(9,6),
  location_lng DECIMAL(9,6),
  notes TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',             -- 'manual' | 'guide' | 'goosey'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trip_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view activities" ON trip_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND (
        owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM trip_collaborators
          WHERE trip_id = trip_activities.trip_id AND user_id = auth.uid() AND status = 'accepted'
        )
      )
    )
  );

CREATE POLICY "Trip members can insert activities" ON trip_activities
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND (
        owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM trip_collaborators
          WHERE trip_id = trip_activities.trip_id AND user_id = auth.uid()
            AND role IN ('owner', 'collaborator') AND status = 'accepted'
        )
      )
    )
  );

CREATE POLICY "Activity creator or trip owner can update" ON trip_activities
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid())
  );

CREATE POLICY "Activity creator or trip owner can delete" ON trip_activities
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid())
  );

-- ============================================================
-- STEP 9: WALLET DOCUMENTS
-- Passport, insurance, visa, ID cards etc.
-- ============================================================
CREATE TABLE wallet_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type document_type NOT NULL,
  title TEXT NOT NULL,
  issuing_country TEXT,
  document_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT,
  -- Storage path in Supabase Storage (encrypted bucket)
  file_path TEXT,
  -- Parsed data from AI extraction
  parsed_data JSONB,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'scan', 'email_import')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wallet_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON wallet_documents
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- STEP 10: LOYALTY CARDS
-- ============================================================
CREATE TABLE loyalty_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  card_number TEXT,
  member_name TEXT,
  tier TEXT,                                -- 'Gold', 'Silver', 'Platinum' etc
  points_balance INTEGER,
  points_updated_at TIMESTAMPTZ,
  expiry_date DATE,
  notes TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loyalty_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own loyalty cards" ON loyalty_cards
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- STEP 11: GUIDE CACHE
-- Gemini-generated destination content — cached per city, not per user
-- ============================================================
CREATE TABLE guide_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_key TEXT UNIQUE NOT NULL,     -- e.g. 'tokyo-jp' (city-countrycode, lowercase)
  destination_city TEXT NOT NULL,
  destination_country TEXT NOT NULL,

  -- Know tab
  history_text TEXT,
  wikipedia_url TEXT,
  britannica_url TEXT,

  -- Eat tab (stored as JSONB arrays)
  eat_cheap JSONB,                          -- array of restaurant objects
  eat_mid JSONB,
  eat_splurge JSONB,

  -- See tab
  see_temples JSONB,
  see_neighbourhoods JSONB,
  see_museums JSONB,
  see_parks JSONB,
  see_daytrips JSONB,

  -- Move tab
  move_content JSONB,

  -- Events (date-sensitive — shorter cache TTL)
  events JSONB,
  events_generated_at TIMESTAMPTZ,

  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- Guide cache is readable by any authenticated user
ALTER TABLE guide_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read guide cache" ON guide_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role (Edge Functions) can write guide cache
CREATE POLICY "Service role can write guide cache" ON guide_cache
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- STEP 12: PHRASE CACHE
-- Pre-generated offline phrases per language
-- ============================================================
CREATE TABLE phrase_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT UNIQUE NOT NULL,       -- e.g. 'ja', 'fr', 'es'
  language_name TEXT NOT NULL,
  greetings JSONB DEFAULT '[]',
  food JSONB DEFAULT '[]',
  transport JSONB DEFAULT '[]',
  hotel JSONB DEFAULT '[]',
  shopping JSONB DEFAULT '[]',
  health JSONB DEFAULT '[]',
  social JSONB DEFAULT '[]',
  goose_specials JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

ALTER TABLE phrase_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read phrases" ON phrase_cache
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can write phrases" ON phrase_cache
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- STEP 13: USER STATS
-- Tracked via triggers — never written directly by client
-- ============================================================
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  countries_visited INTEGER DEFAULT 0,
  trips_completed INTEGER DEFAULT 0,
  total_flights INTEGER DEFAULT 0,
  days_abroad INTEGER DEFAULT 0,
  restaurants_added INTEGER DEFAULT 0,
  museums_visited INTEGER DEFAULT 0,
  continents_visited INTEGER DEFAULT 0,
  goose_score INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stats" ON user_stats FOR SELECT USING (user_id = auth.uid());
-- Stats are only written by triggers / Edge Functions, never directly

-- Auto-create stats row on profile creation
CREATE OR REPLACE FUNCTION handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_stats (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON user_profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_profile();

-- ============================================================
-- STEP 14: USER BADGES
-- Written by Edge Function badge engine, not client
-- ============================================================
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,                   -- e.g. 'first_honk', 'ocean_crosser'
  badge_name TEXT NOT NULL,
  badge_tier badge_tier NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT USING (user_id = auth.uid());
-- Badges written only by service role (Edge Function)
CREATE POLICY "Service role writes badges" ON user_badges
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- STEP 15: STATS UPDATE TRIGGERS
-- These fire on key table events and update user_stats
-- Badge evaluation happens in Edge Function, not here
-- ============================================================

-- When a trip is marked completed, increment trips_completed + countries + continents
CREATE OR REPLACE FUNCTION update_stats_on_trip_complete()
RETURNS TRIGGER AS $$
DECLARE
  continent_count INTEGER;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Increment trips completed
    UPDATE user_stats SET
      trips_completed = trips_completed + 1,
      updated_at = NOW()
    WHERE user_id = NEW.owner_id;

    -- Increment countries if this is a new one
    UPDATE user_stats SET
      countries_visited = (
        SELECT COUNT(DISTINCT destination_country_code)
        FROM trips
        WHERE owner_id = NEW.owner_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE user_id = NEW.owner_id;

    -- Recalculate days abroad
    UPDATE user_stats SET
      days_abroad = (
        SELECT COALESCE(SUM(end_date - start_date + 1), 0)
        FROM trips
        WHERE owner_id = NEW.owner_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE user_id = NEW.owner_id;

    -- Recalculate goose score (10 pts per trip + 5 per country + 2 per day)
    UPDATE user_stats SET
      goose_score = (trips_completed * 10) + (countries_visited * 5) + (days_abroad * 2),
      updated_at = NOW()
    WHERE user_id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trip_completed ON trips;
CREATE TRIGGER on_trip_completed
  AFTER UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_stats_on_trip_complete();

-- When a flight booking is added, increment total_flights
CREATE OR REPLACE FUNCTION update_stats_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'flight' THEN
    UPDATE user_stats SET
      total_flights = total_flights + 1,
      updated_at = NOW()
    WHERE user_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_stats_on_booking();

-- When a restaurant activity is added, increment restaurants_added
CREATE OR REPLACE FUNCTION update_stats_on_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category = 'food' THEN
    UPDATE user_stats SET
      restaurants_added = restaurants_added + 1,
      updated_at = NOW()
    WHERE user_id = NEW.created_by;
  ELSIF NEW.category = 'museum' THEN
    UPDATE user_stats SET
      museums_visited = museums_visited + 1,
      updated_at = NOW()
    WHERE user_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_activity_created ON trip_activities;
CREATE TRIGGER on_activity_created
  AFTER INSERT ON trip_activities
  FOR EACH ROW EXECUTE FUNCTION update_stats_on_activity();

-- ============================================================
-- STEP 16: REALTIME
-- Enable manually in Supabase Dashboard → Database → Replication
-- Tables to enable: bookings, trip_activities, trip_collaborators
-- ============================================================

-- ============================================================
-- STEP 17: INDEXES for performance
-- ============================================================
CREATE INDEX idx_trips_owner ON trips(owner_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX idx_collaborators_trip ON trip_collaborators(trip_id);
CREATE INDEX idx_collaborators_user ON trip_collaborators(user_id);
CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_bookings_type ON bookings(type);
CREATE INDEX idx_activities_trip ON trip_activities(trip_id);
CREATE INDEX idx_activities_date ON trip_activities(date);
CREATE INDEX idx_wallet_docs_user ON wallet_documents(user_id);
CREATE INDEX idx_loyalty_user ON loyalty_cards(user_id);
CREATE INDEX idx_badges_user ON user_badges(user_id);
CREATE INDEX idx_guide_cache_key ON guide_cache(destination_key);
CREATE INDEX idx_phrase_cache_lang ON phrase_cache(language_code);

-- ============================================================
-- DONE
-- ============================================================
-- Tables created:
--   user_profiles, trips, trip_collaborators, bookings,
--   booking_seats, trip_activities, wallet_documents,
--   loyalty_cards, guide_cache, phrase_cache,
--   user_stats, user_badges
--
-- Triggers:
--   on_auth_user_created → creates user_profile + user_stats
--   on_trip_completed → updates stats
--   on_booking_created → updates flight count
--   on_activity_created → updates restaurant/museum counts
--
-- Realtime enabled on:
--   bookings, trip_activities, trip_collaborators
-- ============================================================

-- ============================================================
-- PATCH: Allow authenticated clients to write guide_cache
-- (Gemini generation happens client-side, not via Edge Function)
-- Run this if you already have the schema set up:
-- ============================================================
DROP POLICY IF EXISTS "Service role can write guide cache" ON guide_cache;
CREATE POLICY "Authenticated users can write guide cache" ON guide_cache
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- PATCH: Email inbound setup notes
-- For bookings@sillytraveltool.com inbound email → booking parse:
-- 1. Use Resend (resend.com) Inbound feature (beta) or Postmark inbound
-- 2. Configure MX record for your domain to point to provider
-- 3. Webhook fires to a Supabase Edge Function: /functions/v1/parse-email
-- 4. Edge Function calls Gemini with email body, saves to bookings table
-- 5. Each user gets a unique forwarding address: {user_id}@bookings.sillytraveltool.com
--    Parsed from email To: header in the webhook
-- This requires a custom domain — out of scope for local dev.
-- ============================================================

-- ============================================================
-- CRITICAL PATCH: Run this in Supabase SQL Editor NOW
-- Without this, Guide content cannot be saved/cached
-- ============================================================
DROP POLICY IF EXISTS "Service role can write guide cache" ON guide_cache;
DROP POLICY IF EXISTS "Authenticated users can write guide cache" ON guide_cache;
CREATE POLICY "Authenticated users can write guide cache" ON guide_cache
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Phase 5: temp_unit on user_profiles
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS temp_unit TEXT DEFAULT 'C';

-- ============================================================
-- Phase v1.2: city_stats on guide_cache
-- ============================================================
ALTER TABLE guide_cache ADD COLUMN IF NOT EXISTS city_stats JSONB;

-- ============================================================
-- Phase v1.1: inbound email booking token
-- ============================================================
-- Each user gets a unique 8-char hex token — their personal booking inbox address
-- e.g. a3f9b2c1@bookings.sillytraveltool.com
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS booking_email_token TEXT UNIQUE;

-- Generate tokens for all existing users who don't have one
UPDATE user_profiles
SET booking_email_token = lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE booking_email_token IS NULL;

-- Index for fast token lookups on inbound webhook
CREATE INDEX IF NOT EXISTS idx_profiles_booking_email_token ON user_profiles(booking_email_token);

-- ============================================================
-- Phase 6: phrase_cache RLS fix
-- ============================================================
DROP POLICY IF EXISTS "Service role can write phrases" ON phrase_cache;
CREATE POLICY "Authenticated users can write phrases" ON phrase_cache
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Phase 7: Email-based invite lookup RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_id_by_email(email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = $1 LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- Phase 9: Stat increment RPC (avoids race conditions)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_user_stat(
  p_user_id UUID,
  p_field TEXT,
  p_amount INT DEFAULT 1
)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE user_stats SET %I = COALESCE(%I, 0) + $1 WHERE user_id = $2',
    p_field, p_field
  ) USING p_amount, p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upsert visited country count
CREATE OR REPLACE FUNCTION upsert_visited_country(
  p_user_id UUID,
  p_country TEXT
)
RETURNS void AS $$
DECLARE
  v_countries TEXT[];
  v_count INT;
BEGIN
  -- Get current visited_country_codes (stored as JSONB array in user_stats, or count directly)
  -- Simple approach: just count distinct countries from completed trips
  SELECT COUNT(DISTINCT destination_country_code)
  INTO v_count
  FROM trips
  WHERE owner_id = p_user_id
    AND status = 'completed'
    AND destination_country_code IS NOT NULL;

  UPDATE user_stats SET countries_visited = v_count WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

