// Mirrors the server's sender check (app_settings.inbox.sender_check, supabase/functions/receive-booking-email/ingest.ts).
// While it is off, Goose reads forwarded mail from any sender, so the "Accept from any sender" switch in Settings would do
// nothing and is hidden. Set this to true in the same release that turns the server switch on.
export const SENDER_CHECK_LIVE = false
