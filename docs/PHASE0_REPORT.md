# Phase 0 report (2026-10-21)

## Status at a glance

| Area | State |
|---|---|
| Toolchain (Node 24.22, Supabase CLI 2.121, Android SDK + emulator, git) | Installed (user space, no sudo) |
| Git | Repo initialised; baseline commit + one commit per work chunk |
| Client fixes (dates, AI timeouts/error UI, stats calls, currency, SOS) | Done, committed, `npm run build` passes |
| Backend fixes C1–C4, Gemini swap, badges/stats | **Live** (applied with owner approval, 2026-10-21) |
| Capacitor Android app | Builds, installs and runs on the `STT_Pixel` emulator |
| iOS | Skipped (Xcode still downloading) |

## Live changes (project `swywrvbuswylvqlktsym`)

Migration `phase0_security_and_stats` applied; Edge Functions deployed:

| Function | Version | Change |
|---|---|---|
| gemini-proxy | v9 | 410 tombstone (C1) — delete when convenient: `supabase functions delete gemini-proxy` |
| receive-booking-email | v27 | Svix signature required, From: fallback removed (C2) |
| check-badges | v13 | JWT user only, `unlocked_at`, checked inserts, real Ocean Crosser (C4) |
| generate-guide / -checklist / -phrases, goosey-discover, parse-booking-email | v19 / v11 / v11 / v11 / v18 | Shared Gemini helper (gemini-2.5-flash, fallback gemini-flash-latest), 25s timeout, input caps |
| send-invite | v12 | HTML escaping, stored trip name, viewer/collaborator only, email check, 20/hour |
| accept-invite | v4 | Bound to the invited email |

Verified on live after deploy:
- All 8 user-facing functions return 401 without a valid user token (anon key included).
- Unsigned booking webhook is rejected; `gemini-proxy` returns 410.
- Anon calls to `increment_user_stat` and `get_user_id_by_email` → `permission denied`.
- `trip_collaborators` policies are owner-only; old double-counting triggers gone.
- Stats recomputed for all 14 users from real data (e.g. one user's flights 22 → 11, confirming the double count).
- Security advisor: no new findings; remaining warnings are pre-existing (`search_path`, `get_shared_trip`, leaked-password protection).

Rollback material: `supabase/backups/2026-10-21-pre-phase0.md`.

## Action needed from you

1. **Set `RESEND_WEBHOOK_SECRET`** — booking-email import now returns 503 until it's set (it fails closed by design).
   Resend dashboard → Webhooks → inbound webhook → Signing secret (`whsec_…`), then Supabase dashboard → Edge Functions → Secrets
   (or `supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...`).
2. **Try one AI feature while signed in** (Guide for any trip, or Translate). Claude can't sign in to the live app on your behalf, so the
   end-to-end Gemini call is the one thing not yet exercised. If it fails, the error card now shows the server's message.

## What the backend changes do

- **C1** `gemini-proxy` → 410 tombstone.
- **C2** `receive-booking-email` → verifies the Resend/Svix signature (HMAC-SHA256, 5-minute replay window); only the recipient token maps to a user.
- **C3** `trip_collaborators` → owner-only select/insert/update/delete via an RLS-safe `is_trip_owner()` helper (no trips↔collaborators recursion); role `owner` can't be inserted; invitees can read and leave, not edit. Broken `collabs_select` dropped.
- **C4** `increment_user_stat` → caller's own row only, only `honks_used` / `currency_lookups` / `packing_completed`; `get_user_id_by_email` server-only; trigger functions not API-callable; `check-badges` uses the JWT user only.
- **AI** → `_shared/gemini.ts`: model from `GEMINI_MODEL` (default `gemini-2.5-flash`) with 404 fallback to `gemini-flash-latest`, 25s timeout, key in header, JSON mode, thinking off for 2.5.
- **Stats/badges** → one `recompute_user_stats()` derives everything from trips/bookings/activities/badges, fired by triggers; one goose_score formula (badge points included); a trip counts as completed once `end_date < today` unless cancelled.

## Android

- Capacitor 8.5.3, appId `com.sillytraveltool.app`, compile/target SDK 36, Gradle 9.1 (runs on Android Studio's JDK 25).
- `npm run build:native` builds without the service worker and syncs to `android/`; `npm run android` builds and runs.
- Emulator `STT_Pixel` (Pixel 7, API 37 Play Store image). Screenshots in `docs/screenshots/`.
- No JS errors in logcat; one harmless Capacitor safe-area injection warning.
- **Native sign-in links (added after Phase 0):** magic link, sign-up confirmation, password reset and Google return to the app via
  `com.sillytraveltool.app://auth-callback` (PKCE; handler in `src/native/deepLinks.js`). Requires the Supabase redirect URL
  `com.sillytraveltool.app://**` (Authentication → URL Configuration). Emulator-tested with simulated links; a real email/Google
  round trip still needs the owner. Android App Links (https) planned for Phase 2.
- Emulator note: the API 37 image forces software rendering on this Mac, so the emulator is slow and can show "isn't responding"
  dialogs under load. Not an app issue; an API 36 image or a real device avoids it.
- Placeholder adaptive icon from `app-icon-tag.svg`; splash is still Capacitor's default.

## Known gaps

- `npm run lint` has never worked: the repo has no ESLint config.
- Phase 1 still open: shared-cache write lockdown (client writes `phrase_cache` directly, so it needs an Edge Function write path first),
  Gemini rate limits, passport-number encryption, duplicate/orphan booking cleanup, `get_shared_trip`, `search_path` on old functions,
  leaked-password protection, `.htaccess`, Sentry/GA4.
- Weather/geocoding fetches (Nominatim, Open-Meteo) still have no timeout.
