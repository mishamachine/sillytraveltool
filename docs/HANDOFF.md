# STT Handoff — 2026-10-21

## Update — Clay rebuild done (2026-10-21, evening)
- Clay redesign is on `main`; see `docs/CLAY_REPORT.md`. Dark palette **signed off** (`docs/brand/DARK_MODE.md`).
- Owner decisions:
  - **Past trips are read-only** (recap + read-only plan). Approved.
  - **Account deletion is UI only for now.** The Delete account screen sends a pre-filled email request to
    hello@sillytraveltool.com. **Phase 2 MUST ship real in-app deletion** (Edge Function that erases the auth user,
    trips they own, bookings, documents, loyalty cards, badges, stats, inbox token, analytics rows) before App Store /
    Play submission (Apple 5.1.1(v); Google Play account-deletion policy, and the Data safety form needs a deletion URL).
  - **Bookings are always shown in the local time of the place they happen** (departure in the origin's zone, arrival in
    the destination's zone, hotel/restaurant/tickets in the venue's zone), never the phone's zone.
  - Terms and Privacy pages: static pages at /terms and /privacy (owner fills in legal-entity details).
- Google Maps key: owner has it; it goes into Supabase Edge Function secrets (`GOOGLE_MAPS_SERVER_KEY`), never the client.

## Update — source prepared for Claude Code (2026-10-21, late)
- This folder = `stt-v0_18_3.zip` + `stt-v0183-patch.zip` merged. The patch was missing from the zip; the live DB already has its `passenger_name` column, so the patch is the newer code. `npm ci && npm run build` passes.
- Patch SQL kept at `supabase-add-passenger-name.sql` (already applied on live).
- Deployed `receive-booking-email` (v26) differs slightly from both source and patch (its prompt lacks `passenger_name`). Redeploy from this folder during Phase 0.
- **Goal: native iOS + Android apps via Capacitor** (wraps this Vite build). The web build stays as the shared codebase.
- **Owner's working style:** fastest path. Claude Code edits files directly, runs builds, and tests in the browser, iOS Simulator and Android emulator itself. No zips or manual file placement. The checkbox go-ahead before each coding phase still applies.
- Brand system copied into `docs/brand/` (BRAND.md, brand-tokens.json, component guidelines, logos). The design canvas and brand system also live as claude.ai artifacts ("STT Design Directions", "STT Brand — Warm Minimal Clay").

## Design session results (2026-10-21)
- **Clay design set: SIGNED OFF.** 29 screens on the "STT Design Directions" canvas: onboarding/auth, trips list/empty/recap, trip Weather/Pack/add-booking/AI loading/AI error, Tools hub/Currency/SOS/Translate/Tip, Profile/Docs/Settings/Delete account.
- **Mascot:** keep the existing outlined Goose unchanged.
- **Logo: luggage tag (chosen).** The Goose in an `#B24A17` luggage tag with an ink string. Stacked lowercase wordmark in Space Grotesk 700: "silly" in accent, "travel tool" in ink. App icon: cream tag on terracotta (`docs/brand/logos/app-icon-tag.svg`). Favicon 16–48px: `favicon-tag.svg`.
- **Brand tokens:** `docs/brand/brand-tokens.json` is the token source for the Clay rebuild.
- **Small design fixes:** the Today board says "Day 4 · Thursday", but Apr 4 is a Saturday. The permanent inbox banner on Trip goes away. Dark mode is not designed yet.
- **App and PWA icons:** regenerate from `app-icon-tag.svg` / `favicon-tag.svg`. They replace everything currently in `public/`.

## Decisions made
- **Design direction: Clay** (warm off-white, ultra-rounded, tactile). Terracotta `#B24A17` for text and fills; `#C4561E` fails 4.5:1 on white for small text. Fonts stay Space Grotesk + DM Sans. Real stroke icons, no emoji.
- **IA:** 4 tabs — Trips · Explore · Tools · Profile.
  - During an active trip, Trips opens on a **Today** view: next booking, weather, tomorrow, HONK.
  - Guide + HONK merge into **Explore**.
  - Past trips become a **recap**, not an edit screen.
  - The email-forward inbox becomes a one-time onboarding step plus a small hint, not a permanent banner.
  - Share nudge: once, contextual.
- **Tracking:** a Supabase `analytics_events` table (user_id, session_id, event, screen, props jsonb, app_version, platform, ts; insert-own RLS; rollup views), **plus GA4** for acquisition only.
- **Google Maps/Places:** replaces Nominatim/Photon (usage-policy issue). Places runs through an Edge Function with a server key and cache. Client keys are restricted to domain and bundle IDs.

## Critical (Phase 0 — first coding run)
- **C1** `gemini-proxy`: an unauthenticated, open Gemini/TTS proxy the client doesn't use → delete.
- **C2** `receive-booking-email`: no Resend/Svix signature check, and the From:-email fallback lets anyone inject bookings into any account → verify the signature, drop the fallback.
- **C3** RLS `trip_collaborators.tc_owner` (ALL, `invited_by = auth.uid()`): any user can insert themselves as an accepted collaborator on any trip → owner-only insert, via a trip-ownership check.
- **C4** Three related holes → revoke anon, enforce `auth.uid()`, use the JWT user only:
  - `increment_user_stat`: anon-executable SECURITY DEFINER, no auth check, dynamic column.
  - `get_user_id_by_email`: anon-executable.
  - `check-badges`: trusts `body.user_id`.
- **AI is down:** all 6 AI functions call `gemini-2.0-flash`, which Google shut down from 2026-06-01. Guide returns 502; the checklist hangs. Swap the model and add timeouts and error UI.

## High
- Shared caches (`guide_cache`, `guide_cache_sections`, `phrase_cache`, `checklist_cache`) are writable and deletable by any authenticated user → server-only writes.
- `send-invite`: unescaped trip name in the HTML email, unlimited sends, and it accepts role `owner`.
- No rate limits or input caps on the Gemini functions.
- `accept-invite` doesn't bind to the invited email.
- `wallet_documents.document_number` (passport numbers) is stored in plaintext → encrypt and mask.

## Broken features / bugs
- **Dates show one day early** for US users: `YYYY-MM-DD` is parsed as UTC in the TripsScreen and TripDetail headers. Weather already uses `T12:00:00` correctly.
- **Badges:** 0 rows ever written.
  - The insert uses `awarded_at`; the column is `unlocked_at`.
  - The insert error is unchecked, so goose_score re-inflates on every call.
  - The `flight_duration_hours` column doesn't exist, so Ocean Crosser is unreachable.
  - Recompute all scores after the fix.
- **Stats double-count:** the trigger `update_stats_on_trip_complete` and the client RPCs both increment, and there are two goose_score formulas. Trip `status` never leaves `planning`, so the date-derived "Completed" label contradicts the stats.
- **Weather on past trips** shows today's live forecast labeled as the trip (`daysUntilTrip <= 16` includes negatives).
- `get_shared_trip` references a missing `shared_trips` table and columns that don't exist. `user_activity` is missing (`handle_new_activity`, `increment_activity`).
- The checklist auto-generates for past trips (wasted AI).
- SOS falls back to the passport country instead of the current location. The US "Tourist Help" number is 1-800-CALL-FBI (wrong).
- Currency: the result card is stuck on "…", there's no search, and it defaults to USD instead of the trip's currency.
- An email auto-created trip "Trip to New York" with start = end (0 nights, 7 flights).
- `collabs_select` policy typo: `trip_collaborators.trip_id = trip_collaborators.id`.
- 8 duplicate booking groups (March, before the guard) and 2 orphan bookings (null trip_id).
- A PostgREST `.or()` filter is built by string interpolation with an email.
- Profile version label shows "v0.1.0".

## Ops / hosting
- The source `.htaccess` (security headers, cache rules) is **not active on live**; likely never uploaded because it's a dotfile. Re-upload.
- Sentry and GA4 were never wired in the source.
- Low priority at 14 users:
  - 52 `console.*` calls in the prod bundle.
  - Leaked-password protection is off.
  - 12 functions have no `search_path`.
  - 32 RLS initplan warnings.
- Inline styles bypass tokens (TripDetail 203, Guide 167, Profile 148). TripDetailScreen.jsx is 1,370 lines.

## App Store readiness (Capacitor)
- Privacy Policy and Terms pages.
- In-app account deletion (Apple guideline 5.1.1(v)). **Still open: UI only; deletion is by email request until Phase 2.**
- AI disclosure and a way to report AI content.
- Sign in with Apple alongside Google (guideline 4.8).
- Deep links for OAuth and magic link.
- Replace the free tiers of Nominatim and Open-Meteo for commercial use.
- Native Sentry.
- Native value: push for flight changes, share sheet, offline.
- Disable the service worker in the native build.

## Coding order
1. Phase 0: security fixes, Gemini model swap, date fix, badges/stats fix. Backend first.
2. Phase 1: remaining High items and bugs, `analytics_events` schema, GA4, Sentry.
3. Clay rebuild screen by screen on a token-driven component set from `docs/brand/` (remove inline styles). Google Places integration. New logo and app icons.
4. Phase 2: App Store prerequisites. Phase 3: Capacitor scaffold, iOS + Android builds, simulator testing, store submission.

## Inputs
- Supabase project `swywrvbuswylvqlktsym` (us-east-2).
- Google Maps API key (when ready), restricted.
- Apple Developer and Google Play Console accounts (owner).
