-- Phase 1: restaurant reservations as a first-class booking type.
-- Kept in its own migration: a new enum value can't be used in the
-- transaction that adds it.
alter type public.booking_type add value if not exists 'restaurant';
