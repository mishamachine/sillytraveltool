# Phase 1 report (2026-10-21)

Everything below is live on `swywrvbuswylvqlktsym` and committed. Rollback material: migration files in
`supabase/migrations/2026102118*` and the backup table `public._cleanup_backup_20261021`.

## Backend (live)

| Item | What changed | Verified on live |
|---|---|---|
| Shared caches | Clients read only; `generate-guide` / `generate-phrases` read the cache first and write it themselves | Anonymous write to `phrase_cache` → RLS violation; 0 non-SELECT cache policies |
| AI limits | `consume_ai_quota()` — 100 AI calls per user per day (`AI_DAILY_LIMIT` secret overrides); cached guide/phrases don't count; friendly 429 message | Anonymous RPC → permission denied |
| Passport numbers | Encrypted at rest (pgcrypto, key in Supabase Vault, BEFORE trigger). Profile shows `•••• 1234` + Reveal (owner-only RPC) | Existing row: plaintext null, ciphertext present, last 4 stored |
| Function cleanup | Dropped `get_shared_trip`, `handle_new_activity`, `increment_activity`, `generate_referral_code`, 3 old stats functions; `search_path` pinned | Advisor: no `search_path` or anon SECURITY DEFINER findings |
| Restaurant reservations | `booking_type` gains `restaurant`; `bookings.party_size`, `bookings.transport_mode`; restaurant bookings count toward the foodie stat | Enum + columns present |
| Email parsing | Prompts recognise restaurant reservations (OpenTable, Resy, Tock, SevenRooms, TheFork), rail/bus/ferry/car, museum and event tickets; webhook inserts only real columns | Deployed (parse v19, receive v28) |
| Analytics | `analytics_events` (insert-own RLS) + `analytics_daily_events`, `analytics_daily_active` views (service role only) | Anonymous insert/read → permission denied |

## Data cleanup (live, backed up)

| Row | Action |
|---|---|
| 5 duplicate bookings (one user, March, before the dedupe guard) | Deleted; oldest copy of each kept |
| 1 orphan "Event Ticket" (no trip, no date) | Deleted |
| "Trip to New York" `de24f54d` | End date 2026-04-15 → 2026-04-25 (its flights run to the 25th) |
| "Trip to New York" `117926c2` | Left alone — genuine one-day, one-way trip |

Restore a row: see the header of `supabase/migrations/20261021180200_phase1_data_cleanup.sql`.

## Client

- SOS: current location → active/next trip → passport, with the source shown; Android location permissions added.
- Currency search; 8s timeouts on every weather, geocoding and rates call.
- Restaurant reservations in the booking sheet (name, address, date, time, guests) and on booking cards; transport form
  now has mode, operator, service number, stations and departure/arrival times.
- Production/native builds strip `console.log/info/debug`; ESLint config added (`npm run lint`: 0 errors, 28 old warnings).
- `public/.htaccess`: CSP, HSTS, Permissions-Policy (upload with the next `dist/`).
- Analytics: `track()` for 13 events (sign_in, sign_out, trip_created/deleted, booking_added, guide_viewed,
  checklist_generated, translate_used, honk_used, currency_converted, sos_opened, ai_error, invite_sent). No PII.
- GA4 `G-H7ZP1DBHN3`: production web only. Sentry (web + Android): inactive until `VITE_SENTRY_DSN` is set.
- Android build with the Sentry module installs and launches on the emulator: no crashes, no ANRs
  (`docs/screenshots/android-phase1-launch.png`).

## Ingestion tests

- `supabase/tests/fixtures/booking-emails.json`: 14 confirmations for one April 2027 trip (SFO → London → Paris →
  Lisbon → SFO): 3 flights incl. a 2-leg return, 3 hotels (Booking.com, Airbnb, Expedia), Eurostar train, Hertz car,
  2 museums, a GetYourGuide show, and 4 restaurant reservations (OpenTable, TheFork, SevenRooms, plus Resy-style rules
  in the prompt). Each lists the fields the parser must extract.
- `scripts/test-email-ingest.mjs`:
  - `parse` mode checks `parse-booking-email` output field by field (needs `STT_TEST_JWT`, a signed-in test user's token).
  - `webhook` mode signs each fixture like Resend and posts it to `receive-booking-email` (needs `RESEND_WEBHOOK_SECRET`).
  - Signature logic checked offline: valid accepted, tampered body and wrong secret rejected.
- `supabase/tests/emails/*.eml`: the same 14 emails as forwarded messages addressed to your import address
  `6370bcb1@bookings.sillytraveltool.com`, ready to open in Mail and send.

**Not run yet:** no live ingestion — inbound email is off until `RESEND_WEBHOOK_SECRET` is set, Claude can't create a
test account or sign in on production, and the Gmail connector failed to authorise ("Incompatible auth server").

## Waiting on you

1. **`RESEND_WEBHOOK_SECRET`** (Resend → Webhooks → signing secret, then Supabase → Edge Functions → Secrets).
   Then either send the `.eml` files, or run
   `RESEND_WEBHOOK_SECRET=whsec_… STT_BOOKING_ADDRESS=6370bcb1@bookings.sillytraveltool.com node scripts/test-email-ingest.mjs webhook`.
   This adds the test trip and 14 bookings to your own account (delete the "Trip to London" etc. afterwards).
2. **Leaked-password protection:** Supabase → Authentication → Policies (one switch).
3. **Sentry DSN** when ready (`VITE_SENTRY_DSN` in `.env.local`).
4. **Redirect URL** `com.sillytraveltool.app://**` in Supabase Auth, if not done yet.
5. **Hostinger:** upload the next `dist/` including `.htaccess`.
