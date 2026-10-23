# STT Handoff — 2026-10-21

## Update — multi-city shipped; emailed trips never named after home (2026-10-23)
- **Website live** with multi-city (`fd8b93c`), built from a clean `git archive` copy so uncommitted local edits don't
  ship (`npx vite build` there skips the help prebuild). Server backup `~/backups/stt-202610230731-pre-multicity.tar.gz`.
  CSP has `https://flagcdn.com`; no console errors on the live site.
- **receive-booking-email v42 (live):** `repointAutoTrip` in `ingest.ts`. After each booking, an auto-named email trip
  whose destination is home (profile `home_city`, else where its first leg leaves from) moves to the longest hotel stay
  away from home, else the first leg's arrival. Never when a hotel night is at the destination, never for a typed name,
  guests or manual bookings. Sim cases added (`scripts/test-email-match-sim.mjs`). Live test on machinemisha: Delta
  flight home sent first → "Trip to San Francisco"; after the other 13 → one trip "Trip to London", 10–20 Apr, 14
  bookings. Backup of v40 was taken before deploying.
- **Known bug (not fixed):** the single-email parser keeps only the first leg of a multi-leg flight email (Delta
  LIS→JFK→SFO saved as LIS→JFK only). The attachment/itinerary path already returns every leg.
- **Deploying Edge Functions:** the CLI isn't logged in, so v41/v42 went through the MCP as one esbuild bundle
  (`esbuild index.ts --bundle --format=esm --platform=neutral --minify --charset=utf8 --external:'jsr:*'`) and were
  checked byte-for-byte with `get_edge_function`. A one-time `supabase login` (or `SUPABASE_ACCESS_TOKEN`) makes this
  `supabase functions deploy receive-booking-email --no-verify-jwt`.
- **Android:** versionCode 3 / 0.21.0 debug APK built from the same clean copy and installed on `STT_Pixel` (not
  uploaded). The AVD is slow to boot ("System isn't responding" twice) and was signed in as babar54, so new screens
  are not yet checked on it.
- **iOS:** Xcode is not installed (only Command Line Tools), there is no `ios/` folder, and `@capacitor/ios` isn't in
  `package.json`. This Mac is Intel (i7-9750H, macOS 26.7.1): the App Store's Xcode 27 runs on Apple silicon only.
- **FIXED, production (2026-10-23):** Supabase auth emails failed (`550 The sillytraveltool.com domain is not verified`):
  Supabase SMTP sent from `noreply@sillytraveltool.com`, but Resend (free plan, one domain) only has
  `bookings.sillytraveltool.com` verified. Sender is now `noreply@bookings.sillytraveltool.com` (Auth → SMTP); a magic
  link to machinemisha was delivered. The templates are still Supabase's defaults ("Your Magic Link").
- **Emulator check (machinemisha, 0.21.0):** emailed trip → "United Kingdom, France & Portugal", route strip, stop
  headers, booking times in local zones; import sheet shows Handwritten locked (First Class); XLSX upload → 11 bookings,
  one trip, 8 stops. Today per stop not checkable (no trip in progress). Test trips deleted afterwards.
- **Bugs found (not fixed):** (1) rename-from-stops runs once on partial stops and never again: the XLSX trip stayed
  "Madrid & Granada" with Spain, Germany and Italy stops (`tripsStore._refreshStops` only renames "Trip to X" titles);
  (2) stops/day headers use the airport's town: Hounslow, Roissy-en-France, Schönefeld, SeaTac, Queens County;
  (3) booking cards print the confirmation twice ("Conf. X · 2 guests · Conf. X"); (4) import result buttons clipped
  (left one shows "…ip"); "Final destination: Madrid" for an 11-stop sheet; (5) Settings footer says v0.20.0 in the
  0.21.0 APK; (6) single-email parser keeps only the first leg of multi-leg flights (see above).


## Update — owner cockpit, build step 1 (2026-10-23, plan: `docs/ADMIN_PLAN.md`)
- **/admin/** (own Vite entry `admin/index.html`, bundle `src/admin/`, never in the app or native build or the service
  worker precache). Sign-in (existing session on the same origin, Google or magic link) → **authenticator (TOTP) set-up,
  then a code each session** → 7 tabs: Today (Pulse, rule-based Needs you with done/snooze/own items), Members (trip-cycle
  stages, list, support panel), Product (features most→least, screens, active time, errors, free vs First Class),
  Growth (funnel from our data, sources, stages), Experiments (placeholder, step 4), Money (codes), System (function
  errors, AI usage, admins, audit log). Filters (range, exclude internal) in the URL hash; refresh cadence; Cmd-K; CSV.
  Dev check without signing in: `/admin/?demo` (fixtures in `src/admin/demo.js`, dev only).
- **Database (live):** migrations `20261023100000_admin_cockpit` + `20261023100100_admin_functions`. Every `admin_*`
  function calls `admin_guard()` = row in `admins` + JWT `aal2`. Owner seeded (babar54@gmail.com); 7 owner/test
  accounts in `internal_members`. Tables: admin_audit, member_notes/tags, member_attribution, function_errors,
  promo_codes, entitlement_grants (`entitlement(user)`), code_redemptions, code_attempts, member_moderation,
  blocked_identities, admin_tasks. Tested in SQL (rolled back): MFA/non-admin refused, codes, redeem limits, ban signs out
  + blocks AI + blocks re-sign-up (Gmail dots/+tags), lift restores.
- **Moderation enforcement:** suspended/banned set `auth.users.banned_until` and delete sessions; restricted+ get no AI
  (`consume_ai_quota` returns false, so the user sees the quota message) and can't invite (trigger). Member emails
  for warnings are saved but not sent yet (copy button; Resend sending is next).
- **Codes:** First Class codes redeem at **/redeem/** (website only; Apple/Google rules). Grants are recorded but unlock
  nothing until the paywall reads `entitlement()`. Discount codes are stored for the paywall's checkout.
- **Tracking:** `active_time {path, seconds}` (visible + input in last 60 s) and first-touch UTM/referrer →
  `member_attribution` on `sign_up` (`src/lib/analytics.js`). Live once the website is redeployed.
- **Change 2026-10-23 (owner):** no authenticator. `admin_guard` now needs an `admins` row **and a Google sign-in**
  (JWT `amr` method `oauth`, migration `20261023120000`). Email-link or password sessions are told to continue with Google.
- **Stripe feed** (migration `20261023120100`, function `admin-stripe` v1, verify_jwt off, checks `admin_guard` with the
  caller's token): copies customers, subscriptions, charges, checkout sessions, invoices and promotion codes into
  `stripe_*` tables on each cockpit refresh (at most every 2 min) or "Sync now". **Needs the secret `STRIPE_SECRET_KEY`**
  (owner adds a restricted key; the Money tab shows the steps). Account today: sandbox "Silly Travel Tool sandbox",
  product `stt_first_class`, prices `stt_first_class_yearly` $14.99 and `stt_first_class_lifetime_founding` $29.99.
  `entitlement()` now also counts live Stripe subscriptions and paid charges with plan `lifetime` (checkout
  metadata.plan). Discount codes created in the cockpit are pushed to Stripe as coupon + promotion code (same code,
  limits, end date, first-time-only for "new members"); pause/resume/end toggle the promotion code; the code report shows
  Stripe uses, revenue, discount given, subscriptions kept.
- **Member insights** (migration `20261023120200`): `admin_insight_rows()` per member: traveller type, trips/yr, trip
  length, lead time + planning style, trip style, regions (from trip time zones), booking channel (booking URL / source),
  affluence band + score + signal list (fare tier, hotel USD/night at fixed approximate rates, room type, low-cost
  airline, loyalty tier), persona, 30-day engagement, Stripe lifetime value, health 0-100, next best action. Members tab:
  new columns + Audience view (distributions, click to filter, CSV). Profile: Traveller profile section.
- **More tracking:** `session_start {lang, tz, os, display: app|installed|browser, screen, theme, net, returning,
  days_since}` once per session (opt-out respected). Product → Devices and context (`admin_context`, migration
  `20261023120300`). **Privacy page, Play Data safety and App Store labels need updating** for profiling + device data.
- **Deployed 2026-10-23 08:54** from a clean worktree (HEAD fd8b93c + cockpit files only; other sessions' uncommitted work
  not included). Backup: `~/backups/stt-202610230854-pre-cockpit.tar.gz`. Browsers with the old service worker show the
  app at /admin once, then the cockpit after the worker updates.
- **Privacy (2026-10-23, owner sign-off, `docs/PRIVACY_UPDATE_DRAFT.md`):** policy rewritten (DeepSeek in China
  disclosed, Google Maps, Stripe, traveller profiles, session data, account decisions, retention); Settings → Tailored
  offers (`user_profiles.tailored_offers`); `purge-old-usage` pg_cron job deletes usage events, code attempts and function
  errors older than 25 months, nightly 03:17 UTC. Deployed 2026-10-23 19:32 (backup `stt-202610231932-pre-privacy.tar.gz`); operator name and
  address filled in on privacy and terms (backup `stt-202610231936-legal-pages.tar.gz`).
- **Fresh start + Stripe metadata (2026-10-23):** `former_members` holds the name and email of every account except
  babar54@gmail.com and machinemisha@gmail.com (13 saved, marketing_consent 'unknown'). The owner removes those accounts
  with System → Former members → Start fresh (owner-only `admin_fresh_start('START FRESH')`; dry-run tested and rolled
  back: 13 removed, owner's 5 trips kept). `recompute_user_stats` skips deleted users (account deletion used to fail).
  Stripe objects' full `metadata` jsonb is stored (migration `20261023140000`, admin-stripe v3); web billing
  (branch feat/stripe-web-billing) sets user_id, plan, price_key, platform, app_version, trigger, code, utm_*, experiment,
  variant on checkout, subscription and payment intent.
- **Member emails (2026-10-23):** `admin-email` v1 (Resend batch, from goose@bookings.sillytraveltool.com, reply-to
  hello@sillytraveltool.com; template rendering in `_shared/emailTemplate.js`, tested by `node scripts/test-email-template.mjs`)
  and `email-unsubscribe` v1 (RFC 8058 one-click POST; GET redirects to `/unsubscribe/?t=`). Migration
  `20261023160000_member_emails`: `user_profiles.marketing_emails` (Settings → Travel tips by email, off by default) +
  `email_token`, `email_templates` (9 seeded: recap, win_back, welcome, first_class, relaunch, notice_*), `email_sends`
  log, `email_unsubscribe(token)` (anon). Rules: account notices (service) to any member; marketing owner-only, opted-in
  members only, former members only with consent or the owner's per-send confirmation, never the unsubscribed or
  suspended. Cockpit: Email button on member pages, "Do it" on the next best action, "Email these N" on any filtered
  list (≤200), Members → Emails (templates, send log), status changes email the member notice, former members "Email
  them". Not tested with a real send (needs the owner's Google session); open/click tracking not built.
- **Date windows + experiments (2026-10-23):** top bar picks Today / 7 / 30 / 90 days, a calendar Day, Week (Mon–Sun) or
  Month with back/forward arrows, or a Custom range (`src/admin/DateWindow.jsx`, in the URL hash: range, at, from, to).
  Experiments (migration `20261023170000`): `experiments` table (design, variants, baseline + lift, ICE, queue_position,
  status draft → queued → running/paused → done, result/decision/learnings, design_chat), `experiment_traffic()` (daily
  people per surface, last 28 days), owner-only save/status/reorder/delete. `admin-experiment-ai` v1: Goose designs
  with the owner (DeepSeek → Gemini), told our traffic and the computed sample size (`_shared/experimentMath.js`,
  two-proportion test, alpha .05, power .8; never AI-guessed). Experiments tab: Live, Queue (reorder, order by ICE,
  "can run alongside" check: same surface = waits, same metric + overlapping audience = caution), Drafts, Archive.
  Assigning people to versions (useVariant + exposure) is the next step; "running" is a manual record until then.
- **Assignment, cohorts, locations (2026-10-23, migrations `20261023180000_tz_country`, `20261023180100_assignment_cohorts_locations`):**
  experiments get `metric_event` and a key on start; `my_experiments()` gives each signed-in member a stable version
  (md5 hash of key + user, traffic share and weights), `experiment_exposed(key)` marks when it's shown, readout counts
  exposed members who did the metric event afterwards (cockpit shows rate, lift, chance-best). App hook:
  `useVariant(key)` / `exposeVariant(key)` in `src/lib/experiments.js` (not used by any screen yet: each test's UI
  change is built per test). Cohorts: `cohorts` (rules or fixed list), `member_matches()`, nightly `snapshot-cohorts`
  pg_cron → `cohort_snapshots`; Members → Cohorts (create, preview count, track, members, email, fixed-list add/remove),
  "Save as cohort" on any filtered list. `member_rows_plus()` adds country (time zone of the first session via
  `tz_country`, else profile zone, else Stripe billing country), area, platforms ordered by sessions (main first),
  platform mix; Members columns + Audience cards. The signed-in admin always shows in Members ("You") and the rail
  links to your member page.
- **TO DO SOON (owner, 2026-10-23):** the privacy page and Terms show the owner's **home address** (402 Grandey Way NE,
  Renton). Fine for now; replace it with a PO box or virtual business address soon, in `public/privacy/` and `public/terms/`.
- **Not done yet:** in-app Owner view (Profile files belong to the user-guide session),
  function_errors writes from Edge Functions, exposure events, GA4/social/briefs/experiments (later steps).

## Update — multi-city trips (2026-10-22, commits 6cdc2e9 … eafd519)
Built per `docs/MULTI_CITY_PLAN.md`, all five phases. Proof: `docs/screenshots/multicity/`, tests in `scripts/test-*.mjs`
(run with `node`; 12 + 10 + 6 + sheet + 7-replay email sim, all passing).
- **One rule for "which trip":** `supabase/functions/_shared/tripMatch.js` (app + Edge Functions): dates overlap
  (nearest wins), else within 3 days on the route (≤ 75 km of a stop) which extends the trip, else an undated trip
  nearby. Never city names. Email import (`receive-booking-email`, logic in `ingest.ts`) extends trips, folds two
  auto-made trips linked by a flight/train, ignores home (`user_profiles.home_city`), dedupes re-forwarded legs.
- **Saving from the guide/HONK:** one tap goes to the fitting trip (live trip within 500 km, else one passing within
  75 km) with **Change**; with no fit the **Save to** picker (`TripPickerSheet`) lists every editable trip + New trip.
  Never auto-creates a city trip. Paste import uses the same rule.
- **Outside the dates:** a booking > 1 day outside a dated trip asks Extend / Move to another trip / New trip / Keep
  (`OutsideDatesSheet`, `tripsStore.datePrompt`); undated trips still fill in silently.
- **Stops:** `_shared/route.js` derives stops from all bookings (hotels, legs, nights on board, nights after an
  arrival, day trips > 30 km, home both ends). Saved in **`trip_stops`** (migration `20261022200000`, live, RLS like
  bookings), loaded with trips (`trip_stops(*)`), re-derived by `tripsStore.refreshStops` after booking changes, on
  opening a trip and for the trip in progress. `source='manual'` rows are never overwritten (no editing UI yet).
- **Where am I today:** `placeOn` / `src/lib/stops.js#tripPlace|currentPlace` drive Today (title, weather, "Madrid →
  Granada" on travel days), header clock, On the road card, Tools banner ("Germany · stop 5 of 8"), currency, tip,
  SOS/embassy, Translate and Explore's default city + chips. **Today and Day n of N use today's stop's zone** (owner
  sign-off; `docs/LOCAL_TIME.md` updated).
- **Plan tab:** route strip, stop headers, travel/day-trip day titles, ideas by stop, non-blocking checks
  (`src/lib/conflicts.js`: two hotels, overlaps, tight connections, missing nights, duplicates). Auto-named trips
  ("Trip to X") are renamed from stops ("Spain, Germany & Italy"). Weather/Pack use the saved stops.
- **Import any format:** paste sheet → Upload a file (PDF, screenshot, photo, CSV, XLSX); inbox attachments too
  (Resend attachments API; 2 per email, 6 MB). `parse-booking-email` v26 takes `{ file, transcribe }`. Spreadsheets
  are read by `_shared/sheet.js` (no npm dependency). **Handwritten agenda = First Class**, behind
  `src/lib/firstClass.js` (off; dev: `localStorage.stt_first_class=1`, build: `VITE_FIRST_CLASS=1`); shows "What
  Goose read" before saving. The server doesn't check entitlement yet (paywall task).
- **Live deploys:** `receive-booking-email` v36 (backup = git `de58425` source, was v34), `parse-booking-email` v26
  (was v25 = `de58425` source). Both boot (unsigned/unauth requests get 401).
- **Demo:** `?demo&flagship=<0-18>` = Seattle → Madrid → Granada → Seville → Barcelona → Berlin → Dresden → Munich →
  night train → Rome → Seattle, on that trip day. Demo geocoding: `src/dev/demoGeo.js`.
- Free-plan limits for files = same as emails (paywall task).
- **Loyalty by email (owner request):** a statement / membership email forwarded to the inbox adds or updates the
  card in Loyalty (matched by member number, else program; tier, points + as-of date, expiry); newsletters are
  ignored instead of becoming bookings. `receive-booking-email` v37. **Passport flag** on the passport card
  (`src/components/shared/Flag.jsx`, flagcdn.com, added to the CSP `img-src` in `public/.htaccess`). Program logos:
  dropped (owner).
- **Email safety (live test, 2026-10-23):** emails arriving together are filed one at a time per traveller
  (`take_ingest_lock`), trip dates only grow (`widen_trip`) — migration `20261022210000`. The same reservation again is
  skipped; a changed one (same confirmation + service) is updated in place with a note; a cancellation marks it
  "Cancelled · …". The webhook answers Resend at once and files in the background (`EdgeRuntime.waitUntil`); a
  retried delivery (same Svix id, table `ingest_seen`) is skipped — slow answers had made Resend resend emails.
  `receive-booking-email` v40. **Live test 2026-10-23 (machinemisha):** 14 fixture emails sent at once → one trip,
  14 bookings, Apr 10–20; identical re-forward skipped; change email updated the Hoxton (check-out 15 Apr, £916).
  Test data deleted. Known: with no home city on the profile, the trip may keep "Trip to <home city>" until the
  app renames it from its stops.
- **Test accounts:** testing uses **machinemisha@gmail.com** (STT inbox `391fa86a@bookings.sillytraveltool.com`).
  `6370bcb1@…` is the babar54 account — don't send test emails there.
- **Open:** stop editing sheet (manual stops), per-leg travellers, Today's day buckets for bookings still use each
  booking's own zone (unchanged rule).

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

## Website deploy (2026-10-21)
- **sillytraveltool.com is live with the Clay build** (main `e823545`; it had been the 12 Mar 2026 build). Verified on the live
  site: no console/CSP errors, service worker active, manifest, GA hits to `G-H7ZP1DBHN3`, HTTPS redirect, `/privacy`.
- **Deploy over SSH** (owner-approved; Hostinger SSH enabled, key `stt-deploy (Claude Code, Mac)` = `~/.ssh/stt_hostinger`;
  it reaches every site on the hosting account; remove it in hPanel → Advanced → SSH Access to revoke):
  `npm run build && rsync -az --delete -e "ssh -i ~/.ssh/stt_hostinger -p 65002" dist/ u880786000@217.196.54.17:domains/sillytraveltool.com/public_html/`
  Back up first: `ssh -i ~/.ssh/stt_hostinger -p 65002 u880786000@217.196.54.17 'tar -czf ~/backups/stt-$(date +%Y%m%d%H%M).tar.gz -C ~/domains/sillytraveltool.com public_html'`
- Backups on the server: `~/backups/sillytraveltool-public_html-20261021-clay.tar.gz` (this deploy). The March build was
  overwritten without a backup (a failed backup step during the first deploy).
- CSP in `public/.htaccess` now allows `*.googleusercontent.com` (Google place and cover photos). Any new client-side host
  must be added there too, or it works on localhost and breaks live.

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
- **GA ID:** the script and config use the stream's **Google tag ID `GT-PHRN37HF`** (GA Admin → Data streams →
  Configure tag settings), which forwards to the property's measurement ID `G-H7ZP1DBHN3`. Google answers 404 for
  `gtag/js?id=G-H7ZP1DBHN3`. Don't use the tag's other ID `G-KRXDJXZ4SS`: it is an old measurement ID and configuring it
  also sends hits there. That old destination was moved off this tag on 2026-10-21 (to a new tag "STT old destination
  (unused)"). Verified: `/g/collect` hits only to `G-H7ZP1DBHN3`, events in DebugView. Override with `VITE_GA_ID`.
  GA custom dimensions (created 2026-10-21): user `app_platform`; event `via`, `type`, `source`, `section`, `feature`,
  `kind`, `country`, `method`, `language`, `from`, `stage`, `reason`, `error_type`, `screen`, `dated`, `ride`,
  `matched_trip`, `bookings`. New event props need a matching dimension in GA (Admin → Custom definitions) to show in reports.
  Test with `stt-dev-ga` in `.claude/launch.json` (VITE_GA_DEV=1, debug_mode → DebugView).
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
- Public Supabase storage bucket `releases` (APK files only) hosts test builds; owner-approved. Current (debug build,
  versionCode 2, 2026-10-22, same code as the website):
  `https://swywrvbuswylvqlktsym.supabase.co/storage/v1/object/public/releases/SillyTravelTool-0.20.0.apk`.
  0.19.0 is still in the bucket. Bump `versionCode` in `android/app/build.gradle` each build so it installs over the last.
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
