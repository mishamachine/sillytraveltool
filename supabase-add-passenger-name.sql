-- Add passenger_name to bookings table
-- Run in Supabase SQL Editor before deploying this build

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_name TEXT;

-- seat_number and ticket_quantity should already exist from the previous session,
-- but adding IF NOT EXISTS guards here for safety:
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat_number TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_quantity INT;
