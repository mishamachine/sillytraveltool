# STT Handoff — 2026-10-21

## Update — second fix batch from the testing pass (2026-10-22)
- **Edit bookings:** `BookingFormSheet` takes `booking` (edit mode, times shown via `toWallInput` in each zone);
  `PlanTab` saves with `updateBooking` + `fillDatesIfUndated`. Creator or trip owner can edit (same rule as RLS).
  Travel times are checked: arrival must be after departure.
- **View only + travellers:** `TripDetailScreen` treats `_myRole === 'viewer'` as read-only with a note.
  `TravelersSheet`: owner changes access / removes / cancels invites (`collabStore.setCollaboratorRole`,
  `removeCollaborator`); a collaborator can leave. Share links are still not built.
- **HONK:** `goosey-discover` (live v17) gets the real walking time from Routes (`_shared/google.ts#routeOne`) for
  the pick, trying up to 3 when the first is over 20 min.
- **Multi-city:** `src/lib/stays.js` finds each night's city from hotel bookings (50 km+ from the destination).
  Weather fetches per city and labels days; Pack sends `stops` to `generate-checklist` (live v16).
- **Translate:** migration `20261022040000_phrase_source_language.sql` (applied): `phrase_cache.source_code`,
  unique (source_code, language_code). `generate-phrases` (live v18) writes phrasebooks for any from→to pair (the
  `english` field holds the meaning in the traveller's language) and has `mode: 'text'` for typed sentences, which
  are cached on the phone only (`stt_translations`), never server-side.
- **Large text:** all font sizes and type tokens in rem; `.c-btn` uses min-height and wraps. iOS Dynamic Type is not
  wired yet (no iOS build); add `font: -apple-system-body` on the native iOS shell when it exists.

## Update — analytics: GA4 web + app, funnel events, opt-out (2026-10-21)
- **One pipe:** `track()` (`src/lib/analytics.js`) writes `analytics_events` (signed in) and sends the same event to GA4
  (`src/lib/ga.js`), web and Capacitor app. GA: Consent Mode with ads storage/signals denied, Google signals off, IP
  anonymised, `user_id` = Supabase UUID, user property + param `app_platform`. In the app GA gets a device-held
  `client_id` with `cookie_storage: 'none'` (WebView origin can't keep cookies) and `page_location` on sillytraveltool.com.
- **Screen views** from the stores (`src/lib/screenTracking.js`): `sign_in`, `trips`, `trip_form`, `trip/<tab>`,
  `explore/guide|honk`, `tools`, `profile` → GA `page_view` + Supabase `screen_view`.
- **New events:** `sign_up {provider}`; `sign_in` only on a real sign-in (Supabase re-sends SIGNED_IN on restore, which
  doubled it); `trip_created {dated, via: form|import|one_tap, country}`; `booking_added {type, source: manual|
  paste_import|idea|email_import}`, `booking_edited/deleted {type}`; `import_parsed/import_saved {bookings}`,
  `import_failed {stage, reason}`; `guide_load_more {section}`; `get_there {kind, ride, country}`; `phrases_loaded
  {language, from: cache|device|new}`; `invite_accepted`, `invite_accept_failed`; `ai_quota_hit {feature}` (any 429 from
  an Edge Function); `app_error {kind: js|promise|render, error_type}` (max 5/session, never the message).
- **Privacy guard:** `cleanProps()` drops keys like email/name/title/text/address/lat/lng/confirmation and strings over
  40 chars, with `@` or 5+ digit runs. **Opt-out:** Settings → "Share usage stats" (localStorage `stt_analytics`); off by
  default under Do Not Track / Global Privacy Control; off stops GA and Supabase events. Privacy page updated to match.
- **BLOCKER (owner):** `https://www.googletagmanager.com/gtag/js?id=G-H7ZP1DBHN3` returns **404** (other IDs return 200),
  so GA receives nothing today. Check GA Admin → Data streams (stream deleted, or ID mistyped?). A new ID can go in
  `VITE_GA_ID` with no code change. Then register custom dimensions in GA for `app_platform`, `via`, `type`, `source`,
  `section`, `feature`, `kind`. Test with `stt-dev-ga` in `.claude/launch.json` (VITE_GA_DEV=1, debug_mode → DebugView).
- Play Data safety form must now declare Analytics (app interactions, device IDs), not shared, optional.

## Update — fixes from the testing pass (2026-10-22, see docs/TESTING_PASS.md)
- **Import destination + leg dates** (B1, M1): `parse-booking-email` (live v24) prompt says the destination is never
  the home city of a round trip and "+1" carries into the next leg; `_shared/itinerary.ts` then checks it without the
  AI: `fixConnectingLegs` moves a leg that leaves before the previous one lands, `pickDestination` = longest hotel
  stay, else the turnaround of a round trip. The "New trip" step in `ImportSheet.jsx` has an editable Destination.
  `receive-booking-email` parses one booking per email, so it doesn't need this.
- **AI quota kinds** (B2, migration `20261022030000_ai_quota_kinds.sql`, applied): `ai_usage.kind` ('ai' | 'guide'),
  `consume_ai_quota(p_user_id, p_limit, p_kind default 'ai')`. `generate-guide` (live v29) counts against
  `GUIDE_DAILY_LIMIT` (secret, default 40 sections/user/day, about 3–4 new cities), not the 100 personal calls.
  `warmGuide` (new trip, import, one-tap save) now fetches Google facts only: no AI until someone opens the guide.
- **Quick wins:** `weatherHint(today, unit)` compares in °C; Android back on the email / forgot / magic-link sign-in
  screens steps back (`AuthScreen.jsx` `useBackHandler`); `places` (live v5) returns `country_code` in place
  details and Get there uses it for ride apps; restaurant Guests starts at 2; opening a different trip resets the
  tab to Plan (`tripsStore.setActiveTrip`).
- Functions were deployed through the MCP tool as esbuild bundles of the repo code (CLI not logged in); a later
  `supabase functions deploy` from the repo gives the same code.

## Android test builds (2026-10-22)
- Public Supabase storage bucket `releases` (APK files only) hosts test builds; owner-approved. Current:
  `https://swywrvbuswylvqlktsym.supabase.co/storage/v1/object/public/releases/SillyTravelTool-0.19.0.apk`.
- Download page: claude.ai artifact "Silly Travel Tool for Android" (https://claude.ai/artifact/KXBjjavcDsSnjbTJR8jm75).
- The bucket has no upload policy: to publish a new build, add a temporary insert policy for the bucket, upload,
  drop the policy (or upload from the Supabase dashboard), then update the artifact's link and version.

## Update — undated trips, one-tap save, simple reservations (2026-10-22, early)
- **Trips without dates** (migration `undated_trips`: dates nullable, both-or-neither, end >= start). Helpers in
  `src/lib/trips.js`: `isUndated`, `tripDates` ("Dates to be decided"), `compareTripStart` (undated last),
  `bookingDates`. Screens show "Planning" + an "Add dates" chip; Weather/countdowns hide until dates exist.
  New trip form has "Not sure of the dates yet".
- **One tap from the guide/HONK** (`src/screens/explore/saveIdea.js`): saves to the city's trip, or creates an undated
  trip for the city (with its zone) and offers "Add dates" in the toast. No form.
- **No conflicts:** `tripsStore.fillDatesIfUndated` gives an undated trip its bookings' dates and widens a dated trip to
  cover any booking added to it; imports match an undated trip by city; creating a dated trip for a city that already
  has an undated one fills that trip in. `receive-booking-email` does the same (repo; not yet deployed).
- **Simple reservations:** restaurant / ticket form is place, date + time, guests, confirmation (optional); title is
  automatic; address, zone, price and notes sit under "More details".

## Update — Get there, trip ideas, preloading, auth deadlock fix (2026-10-21, late night)
- **Auth deadlock fixed** (`src/store/authStore.js`): the `onAuthStateChange` callback awaited Supabase queries while
  Supabase held its auth lock, so after sign-in / the hourly token refresh every data call could hang until restart.
  The callback is now synchronous and defers profile work with `setTimeout(0)`. Never await Supabase inside it.
- **Get there** (`src/components/shared/GetThereSheet.jsx`, `src/lib/getThere.js`): navigation-arrow button under "+"
  on guide cards, on HONK and in booking details. Walk / transit / drive with times (Google Routes, `places` action
  `routes`), each opening the default maps app (Apple Maps on iOS, Google Maps elsewhere); ride apps by country
  (Uber, Lyft US/CA, Grab SE Asia, Bolt Europe/Africa) with the drop-off filled in. `AFFILIATE` in getThere.js holds
  partner IDs for later. Grab/Bolt use app schemes with a store fallback; not verified on a device with those apps.
- **Trip ideas** (`src/store/ideasStore.js`, `src/screens/explore/IdeaSheet.jsx`, migration `trip_ideas`:
  `trip_activities.is_idea`, `place_id`): "+" saves a guide/HONK place to the trip for that city in one tap (or starts
  a trip with dates if none). Cards show + / shortlisted (outlined check, "In your trip ideas") / booked (calendar,
  "Booked · Wed 11 Nov, 13:30"). "Confirm a visit" opens the booking form pre-filled (place, address, place's zone);
  the booking replaces the idea. Plan tab has a "Trip ideas" section.
- **15 per batch** everywhere; Eat price bands enforced server-side (Google ignores `priceLevels` at times).
- **Background preloading:** picking a city loads every guide section at once (Google facts in parallel, AI-only
  sections two at a time); creating a trip (form, import, guide) warms its city's guide cache (`warmGuide`).
- Deployed `generate-guide` v28 has a compacted copy of `buildPrompt` (same prompts) and trimmed `_shared` copies;
  redeploy from the repo with the CLI to sync.

## Update — Google Maps, DeepSeek, phrasebooks (2026-10-21, night)
- **Google Maps Platform** (server-side only; `GOOGLE_MAPS_SERVER_KEY` secret; client calls the `places` Edge Function,
  helpers in `src/lib/places.js` + `supabase/functions/_shared/google.ts`; responses cached in `public.google_cache`):
  - Guide Eat / Temples / Museums / Parks = real Google places (rating, reviews, hours, photo, Maps link), kept within
    40 km of the city. The AI only writes the Goose's words. **Two stages:** `facts` (Google, ~2-4 s, no AI) then
    `voice` (AI, ~8-10 s) which "inks in" on the same cards (`guideStore.loadVoice`, `.ink-wait` / `.ink-in`).
  - HONK = places open now within walking distance of the user's GPS; same facts → voice stages.
  - City search (Google autocomplete + details: coords, zone, cover photo), geocoding everywhere (weather, pack,
    import, SOS, translator country), booking form place search (hotel/restaurant/venue → address, place_id, zone),
    booking detail live card (map, rating, open now, today's hours, call, website), SOS nearest hospital/police/
    pharmacy + Google embassy lookup, trip cover photos (backfilled when a trip is opened), email import matches
    hotels/restaurants to their Google place. Attribution "Places data from Google Maps" shown under Places lists.
  - Migration `20261022000000_google_places.sql` (applied): `google_cache`; bookings `place_id/place_lat/place_lng`;
    trips `destination_place_id/cover_photo`.
- **AI provider: DeepSeek** (owner decision; `DEEPSEEK_API_KEY` secret). `_shared/gemini.ts#geminiFetch` calls DeepSeek
  first (one retry on 429/5xx), Gemini as fallback. **Gemini prepaid credits are depleted** (402), so the fallback does
  nothing until the owner tops up AI Studio. Privacy page must name DeepSeek as a processor (servers in China) before launch.
- **Phrasebooks are permanent:** `phrase_cache.expires_at = infinity`; generate-phrases saves only complete replies.
  35 languages × 8 categories × 8 phrases pre-written with Claude (top 20 by international arrivals + 15 already there).
- **Guide tab "Move" renamed "Transit".**
- **Not yet redeployed:** `receive-booking-email` (repo has DeepSeek + place matching; live v30 still Gemini-only). It
  is dormant until `RESEND_WEBHOOK_SECRET` is set; redeploy it first. The other functions were deployed through the MCP
  tool with trimmed copies of `_shared/*`; run `supabase functions deploy` from this repo once the CLI is logged in so
  live matches the repo exactly.
- **Next (owner request): "Get there"** on any place/booking: walking / driving / transit times (Google Routes API) +
  ride-hailing deep links chosen by country (Uber, Lyft, Grab, Bolt, DiDi), affiliate IDs later. Also worth doing:
  "leave by" times on Today, air-quality/pollen card. Set a Google Cloud budget alert.

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
