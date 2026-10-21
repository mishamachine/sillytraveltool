-- Guide cache sections table
-- Stores each guide section independently for lazy loading
CREATE TABLE IF NOT EXISTS guide_cache_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  destination_key text NOT NULL,
  destination_city text NOT NULL,
  destination_country text NOT NULL,
  section text NOT NULL, -- 'overview' | 'eat' | 'see' | 'move' | 'events'
  data jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(destination_key, section)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS guide_cache_sections_key_section ON guide_cache_sections(destination_key, section);
CREATE INDEX IF NOT EXISTS guide_cache_sections_expires ON guide_cache_sections(expires_at);

-- RLS: anyone authenticated can read, only service role can write
ALTER TABLE guide_cache_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read guide cache" ON guide_cache_sections FOR SELECT USING (true);
CREATE POLICY "Service role can write guide cache" ON guide_cache_sections FOR ALL USING (auth.role() = 'authenticated');
