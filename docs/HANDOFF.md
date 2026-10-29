# STT Handoff — 2026-10-21

## Update — Google Play: closed beta submitted for review (2026-10-27 08:50 UTC, audit session)
- All four App content declarations are complete and the 15 pending changes were sent to Google: dashboard
  **Update status: In review**, Production inactive. Reviews usually take up to 7 days.
- Done in the owner's Chrome, on the `/console/u/1/` tab (babar54@gmail.com, developer 6830777302621607998):
  Sign in details = "Reviewer account (full access, First Class)", machinemisha@gmail.com, password typed by the owner,
  instructions say Continue with email, no 2-step, First Class already on the account. Target audience 18+ only
  (child-appeal steps skipped). Data safety: the session's draft (17 data types from `docs/STORE_PRIVACY_FORMS.md`)
  given its final Save. Content rating (owner-approved IARC terms): category All Other App Types; user content sharing
  yes (invite-only, no block/report/chat moderation); online content yes (AI-generated guides, nothing ratings-relevant);
  digital goods yes, no loot boxes; everything else no. Ratings: Everyone (NA), PEGI 3, USK all ages, 3+, Brazil 14+.
- Reviewer account: machinemisha has a **lifetime First Class admin grant** (entitlement_grants 7f36d71c, admin_audit
  #43, reason "reviewer"); never end it or "Start fresh" that account while the apps are in review or on sale.
- Why the owner's own clicks never stuck: Chrome's default Google account (/u/0/) is machinemisha, which has no Play
  account; the app is under babar54 at /u/1/. Also every form needs its own Save, and the content-rating Next button
  stays disabled until Save is clicked.
- Still to do: join link after approval (Closed beta → Testers) → `app_settings.beta` + /beta; 12 opted-in testers for
  14 days before production; developer website https://bbprojectfactory.com/ is unverified in Search Console.


## Update — Google Play: app created, closed track ready, waiting on owner clicks (2026-10-27, play-console session)
- Phone verification passed. App **Silly Travel Tool** created in Play Console (developer **Bodhi Studios**, account
  6830777302621607998, app ID 4975168874414148202, package `com.sillytraveltool.app`, free to download, English US).
- **Saved:** privacy policy, ads (none), government (no), financial (none), health (none), advertising ID (no), category
  Travel & Local, contact email + website, default store listing (short + full description, 512 icon, 1024x500 feature
  graphic, four real emulator screenshots 1080x2160; no AI-generated assets).
- **Closed testing track "Closed beta"** (Play refused the name "Beta"): 178 countries, email list "Beta testers"
  (babar54@gmail.com, machinemisha@gmail.com), feedback hello@sillytraveltool.com. Draft release **0.20.0 (5) beta** with
  `app-release.aab` (versionCode 5, from `android-release.yml` run 40433516785) and the beta notes; saved to Publishing
  overview with only symbol-file warnings. No tester cap field was found on the track.
- **Owner clicks left, in order:** (1) Sign in details: decide on a reviewer test account (Play reviewers cannot use their
  own accounts or create new ones; the form also requires ticking "full access to all features incl. premium");
  (2) Content rating: tick the IARC Terms of Use and run the questionnaire (utility, no objectionable content);
  (3) Target audience 18+ (unlocks after Sign in details); (4) Data safety: answers in `docs/STORE_PRIVACY_FORMS.md`
  (the page also has Import from CSV); (5) Publishing overview → "Submit 12 changes for review". The opt-in join link
  appears on the track's Testers tab once Google approves the closed test.
- **Checked 2026-10-27 (read-only):** developer name now saved as **B&B Project Factory** (website shows
  https://bbprojectfactory.com/, Search Console verification still to do). App content: 4 items still need attention:
  Sign in details (not started), Content rating (questionnaire in progress, IARC terms not accepted), Target audience (not
  started), Data safety (not started, flagged overdue). Publishing overview: **not submitted**; "3 issues found" block
  sending. Closed beta shows Active with release 0.20.0 (5) beta "not yet sent for review". The Testers tab still says the
  join link appears once the app is published, so there is no opt-in link yet.
- No RevenueCat Android key secret exists, so this build hides the paywall (fine for a closed beta).
- Gotcha: the Play bundle upload field accepts files over the Chrome tool's 10 MB limit only via a local fetch + DataTransfer.
## Update — owner is now B&B Project Factory (2026-10-27, PR "Ownership: B&B Project Factory replaces Bodhi Studios and personal operator wording"; website deployed from main 0255391 and admin-email redeployed as v8 on 2026-10-27 07:15 UTC)
- Privacy, Terms and Delete-account name **B&B Project Factory** (same Renton address) as the operator; footers read
  "© 2026 B&B Project Factory · Silly Travel Tool"; `index.html` author meta and JSON-LD, the booking/marketing email
  footer (`_shared/emailTemplate.js`; takes effect when the Edge Functions that use it are redeployed), the spec header
  and the App Review checklist follow. Privacy and Terms "Last updated" now 27 October 2026. No entity suffix and no
  claim that the company is registered: its legal registration is pending.
- **TO DO (owner):** "B&B Project Factory: finish the entity switch" in `docs/OWNER_TODO.md` (suffix, Stripe, Play,
  Apple tax/banking, Individual → Organization with D-U-N-S). Store consoles (Play developer name, App Store copyright)
  are changed in the consoles, not in the repo.

## Update — AI reading permission, legal review L1 (2026-10-26, PR "AI reading permission"; NOT deployed)
- **Why:** Apple 5.1.2(i) needs explicit permission before personal data goes to a third-party AI. Owner decision: DeepSeek
  stays for everything (L2 declined, EU risk accepted); the app asks once, plainly and calmly.
- **App (web, iOS, Android, one bundle):** a tour step after location ("Let Goose read your bookings?", Allow / Not now,
  first run only, skipped when already answered); the same words as a sheet (`AiConsentSheet`) opened by
  `useConsentStore().ensure(reason)` from `src/lib/gemini.js` before paste/file import and typed translation; Settings →
  Privacy → **AI reading of imports** switch. Answer stored by `my_record_ai_consent` (cache in `ai_consent_at`, `ai_consent_version`, `ai_consent_routing`; every answer appended to `ai_consent_events`).
- **Forwarded emails before the yes** are held, not read (`ingest.ts`): `held_inbox_emails` keeps the Resend id, sender
  domain and subject only. A bottom toast "N emails waiting · Review" opens the sheet; Allow runs `inbox-release` (3 per
  call, refetches from Resend, files like a new email; emails Resend no longer has are dropped and the member is told).
  pg_cron `purge-held-emails` drops rows after 30 days.
- **Server checks:** `parse-booking-email` and `generate-phrases` (typed text) return 403 `{ code: 'ai_consent' }` without
  the yes (`_shared/consent.ts`); before the migration they behave as today. Older app builds show "Update STT…".
- **Also:** `receive-booking-email/resend.ts` (Resend fetch helpers, shared with `inbox-release`); Toast titles now use
  `ink-inverse` (they were unreadable); privacy page AI section, transfers paragraph and deletion bullet; demo params
  `?demo&askai` (no answer yet) and `&held=N`.
- **Deploy order:** (1) PR #35's `20261026090000_inbox_trust.sql` + `receive-booking-email` if not yet; (2) migration
  `20261026120000_ai_consent.sql`; (3) functions `receive-booking-email`, `inbox-release` (new), `parse-booking-email`,
  `generate-phrases`; (4) website; (5) native 0.20.1 for TestFlight and App Store review. Existing members get the sheet
  at their next import; their forwarded emails are held until they tap Allow.

## Update — Goose inbox trust model, audit S4 (2026-10-26, PR "Inbox: sender check, longer tokens, per-inbox parse budget"; NOT deployed)
- **Sender check before any AI call** (`receive-booking-email/ingest.ts` `senderAllowed`): accepted only from the
  member's account email, an address in `user_profiles.inbox_allowed_senders`, or anyone when `inbox_accept_any` is on.
  Addresses normalised (display name off, lowercase, plus-tag off, Gmail dots off, googlemail → gmail). Others are
  dropped silently with a `function_errors` row (`kind = inbox_rejected_sender`, sender domain only, no body).
  Attachments download only after the check.
- **Per-inbox budget:** `consume_inbox_quota(p_user, p_limit)` (service role), 30 AI reads a day per inbox, counted in
  `ai_usage` as kind `inbox` (separate from the member's in-app `ai` allowance; override with `ai_limits.inbox_daily`).
  Same AI kill switch, member-status check and project-wide `global_usage` AI cap as `consume_ai_quota` (PR #33); fails
  closed like it (`quotaUnavailable`). Needs migration `20261025150000_global_daily_caps` applied first.
- **Cancellation emails** only stamp `bookings.cancellation_received_at` and add a note; the title is no longer changed to
  "Cancelled · …". BookingDetailSheet shows one line asking the traveller to check with the provider.
- **Tokens:** 12 hex (48 bits) from `gen_random_bytes`, made by a trigger on profile insert; clients can't set or change
  them (trigger `guard_booking_email_token`). Settings → Goose inbox → **New address** calls `my_rotate_inbox_token()`.
  The 18 existing 8-hex tokens keep working until rotated; the webhook reads 12- or 8-hex tokens. Client token code in
  `authStore.js` removed. Settings also has **Accept from any sender**.
- **Order matters in the morning:** apply migration `20261026090000_inbox_trust.sql` first, then deploy
  `receive-booking-email`, then ship the web/app build. The live webhook test (`test-email-ingest.mjs webhook`) needs
  `inbox_accept_any = true` on machinemisha (fixtures come from airline addresses).
- **Follow-ups:** a Settings editor for `inbox_allowed_senders` (DB-only today); `From:` can be forged, so a DKIM/SPF
  check on Resend's inbound headers would harden it further; optionally rotate all 8-hex tokens once members are told.
## Update — website deployed from main 1efb131: shared-traveller card, tour plan slide, privacy fixes (2026-10-25)
- Deployed by the audit session with the owner's go-ahead: clean `git archive` of `origin/main` (1efb131), `npm ci && npm run build`
  (dist check passed), no pre-deploy backup (the backup step silently failed in zsh; the nearest earlier one is `~/backups/stt-202610250652-pre-invitefix.tar.gz` from tonight) and a post-deploy backup `~/backups/stt-<timestamp>-post-card.tar.gz`, dry run showed 89 changed files and no deletions,
  rsync **without** `--delete`. Verified: /, /help/, /beta/, /upgrade/, /redeem/, /delete-account/, /privacy/, /terms/, /admin/ all 200;
  live `main-*.js` hash equals the build; the Plan tab chunk with the shared-leg card is served.
- Live since this deploy: shared-traveller card (PR #19), tour plan slide leading with First Class (PR #12), Sentry email scrubbing and
  GA in native builds (PR #13), Tip tool crash fix (PR #14, deployed earlier tonight), cockpit join date (PR #25) and live-only Stripe
  reporting (PR #26) in the admin bundle.
## Update — TestFlight beta group and Beta App Review (2026-10-25, testflight-beta session)
- **State in App Store Connect (checked, nothing re-created):** Test Information is filled (beta description says "Silly
  Travel Tool beta", feedback hello@sillytraveltool.com, marketing https://sillytraveltool.com/, privacy
  https://sillytraveltool.com/privacy/, reviewer sign-in on machinemisha). Build 0.20.0 (5) has "What to Test" (start a
  trip, forward a booking email, paste a confirmation, invite a friend, a city guide, the First Class paywall in
  sandbox; report from Profile > Report an issue) and sits in internal group "Silly Travel Tool internal" (1 tester,
  the owner) and external group "Silly Travel Tool beta". Both were made by the store-setup session; the group names
  differ from the "STT team" wording in the brief.
- **Review status:** build 5 is **Waiting for Review** (Beta App Review) as of this entry.
- **Public link (created 2026-10-25 after the owner approved it in chat):** https://testflight.apple.com/join/rFv9QAA4
  ("Open to Anyone", tester limit 100, 0 joined). It shows "Testers cannot join public link until this group has an
  approved build": it starts working once Beta App Review approves build 5. Paste it into Cockpit → Growth → Beta
  waitlist as the iOS link.
- Not touched: pricing, availability, App Store submission, in-app purchases.

## Update — Stripe web billing is LIVE (2026-10-25, live account `acct_1UTcxRJ3Q35Z71yD`)
- **Owner did:** Supabase org → **Pro**; Stripe activation (business, bank, identity; Payments + Payouts active, no open
  tasks); the restricted key and the three Supabase secrets; the real purchase and refund. Claude filled the public details
  (support email hello@sillytraveltool.com, support URL /help/, privacy + terms URLs; descriptor `SILLY TRAVEL TOOL`).
- **Tax:** owner chose threshold monitoring only (no `automatic_tax`, no code change).
- **Live objects** (dashboard; the Stripe MCP still only sees the sandbox, Workbench shell is read-only in live):
  product `prod_VVMUdDYZ1m1GP0` (dashboard can't set the id `stt_first_class`, so Supabase secret
  `STRIPE_PRODUCT_ID` holds it for admin-stripe's coupon `applies_to`), tax code `txcd_10103001`, metadata `app=stt`;
  prices `price_1UULlzJ3Q35Z71yDHOuJzytY` (`stt_first_class_yearly`, $14.99/yr) and `price_1UULlzJ3Q35Z71yDeB8Qt8S6`
  (`stt_first_class_lifetime_founding`, $29.99 once), both tax-exclusive with `metadata.plan`; default portal
  `bpc_1UULpdJ3Q35Z71yD1SDkNn2G` (cancel at period end + reasons, card update, invoices, email/address, no plan
  switching, return /upgrade/); webhook `we_1UULrbJ3Q35Z71yDpvVuWo8N` → `/functions/v1/stripe-webhook`, same 18 events,
  API `2026-09-30.endive` (= account default). No cockpit codes to recreate (`promo_codes` empty); STTTEST50 stays sandbox.
- **Key:** restricted `stt-supabase-functions` (the account's only secret key), 13 permissions. Write: Customers, Checkout
  Sessions, Customer Portal, Subscriptions (delete-account), Coupons, Promotion Codes. Read: Prices, Products, Charges and
  Refunds, Payment Intents, Invoices, Balance, Payment Disputes.
- **Supabase secrets** (names): `STRIPE_SECRET_KEY` (07:45 UTC), `STRIPE_WEBHOOK_SECRET` (07:52), `STRIPE_PRODUCT_ID` (09:04).
- **Smoke test:** `billing` returned `cs_live_` Checkout for lifetime and yearly; live `customer.created` → `stripe-webhook`
  200 (signature OK); cockpit Sync now OK, `stripe_sync.livemode = true`.
- **Real purchase (owner's card, machinemisha, `/upgrade/`):** sub `sub_1UUMJ6J3Q35Z71yDW35GCTLx`, charge
  `ch_3UUMJ3J3Q35Z71yD0DolPluo` $14.99 (plan yearly, invoice `in_1UUMJ2J3Q35Z71yDzEFg3Gec`, fee $0.73) →
  `entitlement()` first_class; 6/6 webhook deliveries 200. Then cancel now + full refund in the dashboard: refund
  `re_3UUMJ3J3Q35Z71yD0CO9rndV` → entitlement `free`, sub canceled, ledger shows −$14.99 refund. Net cost: the $0.73 fee.
- **Open:** Checkout still offers Link's **Bank** and **Klarna** (not covered by `excluded_payment_method_types`); turn them
  off in Stripe → Settings → Payment methods if wanted. Sandbox webhook `we_1UTo8y…` can be disabled.

## Update — signed Android beta APK for sideloading (2026-10-25, PR "Android release: also build a signed universal APK")
- `android-release.yml` now also runs `./gradlew assembleRelease` (same upload key, same versionCode) and uploads the universal APK as the `android-release-apk` artifact (7-day retention; the AAB artifact is unchanged).
- Private hand-off only: the APK goes to the owner's Google Drive folder "STT Android beta" (not shared) and the Actions artifact (needs GitHub login). Never a public URL.
- This build has no paywall: `VITE_REVENUECAT_ANDROID_KEY` is not set in repo secrets. The earlier debug APK must be uninstalled first (different signing key).
## Update — cockpit Stripe data is live-only (2026-10-25, migration `20261025140000_stripe_live_only`, applied)
- **Why:** Stripe went live tonight; every `stripe_*` row synced before that came from the sandbox.
- **Purged** (`livemode = false`, applied after a rolled-back dry run): balance_txns 8, charges 7, checkouts 8, customers 2,
  invoices 7, promotion_codes 1, subscriptions 5 (38 rows). Live rows untouched. `promo_codes` had no Stripe ids (0 rows in
  total); the migration still nulls any sandbox coupon/promo ids with a note so codes re-push to live from Codes.
  `admin_audit`, `entitlement_grants`, `code_redemptions` untouched.
- **`stripe_sync`:** last_sync/counts/balance cleared (livemode stays true); the sync is a full pull, so the next one is
  unthrottled. A forced "Sync now" then pulled live only: 1 charge, 1 invoice, 2 checkouts, 1 customer, 1 sub, 1 balance txn.
- **Filters added** (`livemode = stripe_sync.livemode`): `admin_code_stripe` (Codes Stripe stats), `experiment_traffic`
  (checkout counts), `member_rows_plus` (customer country). Already filtered: `admin_stripe`, `admin_financials`,
  `admin_costs`, `admin_insight_rows`, `my_entitlement`, `stripe_first_class`.
- **Verified** on /admin Money: Statement $14.99 gross, −$0.73 fees, $14.26 net, badge Live; Cash pending $14.26.
- **Sandbox can't come back:** `stripe-webhook` checks signatures with the live `STRIPE_WEBHOOK_SECRET`, so sandbox events get
  a 400 and write nothing, and the sync uses the live key. If the sandbox endpoint is still enabled in Stripe (test mode →
  Webhooks), disable it so Stripe stops retrying and emailing about failed deliveries.

## Update — trip-list invite Accept/Decline fixed (2026-10-25, accept-invite **v14**)
- **Bug:** after the RLS hardening (PR #16) clients may only `UPDATE (role)` on `trip_collaborators`, so the trip-list
  "Join trip"/"Decline" buttons failed with 42501 (a silent no-op before that). Also, the Invites list was always empty:
  `send-invite` never sets `user_id`, and invitees can only SELECT their rows where `user_id = auth.uid()`.
- **Fix:** `accept-invite` (service role) now also takes `{ action: 'list' }` (the caller's pending, unexpired invites, with
  trip title/place/dates) and `{ collaboratorId, accept }` (same email binding as the token path; accept sets
  accepted/user_id/accepted_at, decline sets declined). `{ token }` is unchanged. `collabStore` uses both; `InviteRow` shows
  a busy state and an error line, and the invite stays listed until the function confirms.
- **Tested live** (local build against live Supabase, machinemisha, fixture trips owned by test@test.com, deleted after):
  list, accept, decline, replay, someone else's invite, bad body, no auth, expired invite in the UI. v12 backed up to
  `~/backups/accept-invite-v12-2026-10-25/`. **The client half needs a web deploy** before it works on sillytraveltool.com.

## Update — Edge Functions deployed from the repo with the CLI (2026-10-25)
- **Live = repo for all 23 functions.** The CLI is logged in and linked (`supabase functions deploy <fn> --no-verify-jwt --use-api`,
  no Docker, no more MCP bundles). New versions: accept-invite v11, admin-email v3, admin-experiment-ai v4, admin-stripe v11,
  beta-invite v2, beta-signup v3, billing v9, check-badges v20, cost-alert v4, delete-account v3, email-unsubscribe v3,
  generate-checklist v22, generate-guide v36, generate-phrases v24, goosey-discover v24, parse-booking-email v32, places v11,
  receive-booking-email v50, resolve-timezone v10, send-invite v19, send-welcome-email v10, store-webhook v5, stripe-webhook v10.
  All `verify_jwt` false. `@supabase/supabase-js` pinned to `2.118.0` in every function.
- **Backup of everything that was live (25 functions): `~/backups/functions-2026-10-25/<slug>/`** (+ `MANIFEST.md` with old versions).
- **Behaviour that changed on deploy:** places and resolve-timezone now count Google calls (`consume_api_call`),
  receive-booking-email checks `email_import_locked`, admin-email passes the "why you got this" line. Nothing else.
- **store-webhook:** live (v4) was ahead of main (owner made the shared secret optional on 2026-10-24); the repo file now
  matches live, so the deploy did not revert it. Unauthenticated empty POST returns 200 `{ok:true}` by design.
- **Deleted live (2026-10-25):** `gemini-proxy` and `receive-booking-email-staging` (both now 404). Live has exactly the 23 functions.

## Update — onboarding tour + Guide and FAQ live on the website (2026-10-24, PR #11)
- **Website deployed from `release/tour-and-shared-trips` `8016137`** (= live `fix/homepage-meta` + shared-trip email
  fix + tour). Clean `git archive` build; dry run deleted only the old `workbox-*.js`; homepage meta, privacy, terms,
  llms.txt, redeem, unsubscribe identical to live; /, /help/, /admin/, /beta/, /upgrade/, /delete-account/ all 200.
  Backup `~/backups/stt-202610240711-pre-tour.tar.gz`. PR #11 to main is open, not merged.
- **Local `main` was 63 commits behind `origin/main`** (other sessions merge PRs on GitHub). Always `git fetch` and
  build from what's live (`origin/main` + any deployed branch) before deploying; a sync from stale main would have
  deleted /upgrade, /beta, /delete-account and restored the old "Free AI Travel Planner" meta.
- **Tour:** `src/screens/auth/Onboarding.jsx` + `TourArt.jsx` + `tour.css`; replay via `useUIStore().openTour()`
  (Profile, Guide and FAQ). Dev: `?demo&onboarding`. Report an issue: `src/lib/reportIssue.js`, `BetaCard.jsx`.
- **Android:** debug APK from this branch installed on the emulator (machinemisha), not uploaded. iOS not tested.

## Update — shared trips get travellers' forwarded emails (2026-10-24, receive-booking-email **v49**)
- **Fix (`ingest.ts`):** a traveller who joined a trip with **Can edit** (accepted `trip_collaborators`, role
  `collaborator`) now has their forwarded booking emails filed in that shared trip. Before, matching only looked at
  trips the sender owned, so it made them a new "Trip to X". Viewers and pending invites still go to their own trips.
- **Rules:** a shared trip must be on the booking's route (date overlap alone isn't enough); when a shared trip and
  the sender's own trip both fit, the shared trip wins; the function never re-dates, folds, renames or repoints a
  trip someone else owns (a booking outside its dates still lands; the app's outside-dates sheet handles it).
- **Second fix:** the flight/train duplicate check only counts the sender's own legs, so two travellers on the same
  flight both keep their booking (it used to drop the second as a duplicate).
- **Tests:** 6 shared-trip cases in `scripts/test-email-match-sim.mjs`; all existing sims unchanged vs main.
  Staging copy (`receive-booking-email-staging`, now a 410 stub: delete it in the dashboard) tested on machinemisha
  with a test@test.com trip; then live: two real emails to machinemisha's inbox (391fa86a) landed in the shared
  trip, dates unchanged. Test data deleted.
- **Deploy:** v48 backed up to `~/backups/receive-booking-email-v48-index.js` (= build of main `731ffa8`, byte for
  byte). v49 deployed via the MCP (esbuild bundle with `--external:node:*` too, since `_shared/google.ts` imports
  `node:async_hooks`), verified byte-for-byte (SHA-256 2a2e2be7…). JWT verify still off.
- **Note:** the paywall branch adds `email_import_locked` to the same insert; merge both before the next deploy.
## Update — beta waitlist at /beta (2026-10-24, branch feat/beta-waitlist)
- **Live: https://sillytraveltool.com/beta** (the one link for every social bio/post; `/beta?utm_…` 301s to `/beta/` with
  the query kept). Own Vite entry (`beta/index.html`, `src/beta/`), no supabase-js. Form: email, platform, optional travel
  frequency; UTM + referrer saved; honeypot `website` + 2 s minimum; "Get it now" (web app live; iPhone/Android "Coming
  soon" until a link is shown); success state with "Start now on the web". Also writes `stt_first_touch` like the app.
- **Database (live, migration `20261024060039_beta_waitlist` + `beta_public_links`):** `beta_waitlist` (RLS, no grants),
  `beta_signup_hits` (hashed IP, kept a day). `beta_signup` (service role only: dedupe by email, 5/IP/hour, 300/hour
  overall), `beta_page_config()` (anon: redirect + links shown on the page), `admin_beta`, `admin_beta_rows`,
  `admin_beta_settings_set` (owner), `admin_beta_claim` / `admin_beta_mark` / `admin_beta_release_stuck` (owner).
  `email_unsubscribe` also unsubscribes waitlist tokens (returns `beta: true`; /unsubscribe/ shows beta wording).
  Settings `app_settings.beta`: ios_url, android_url, web_url (set to the site), show_ios/show_android/show_web, redirect_on/url.
- **Edge Functions (MCP esbuild bundles, verify_jwt off):** `beta-signup` v2 (Resend "You're on the list", List-Unsubscribe),
  `beta-invite` v1 (owner only: test send to self, send by platform ≤100 per click, release stuck). Never double-sends:
  claim (waiting|failed → sending) before the email, mark sent/failed after.
- **Cockpit → Growth → Beta waitlist:** totals, per day, platform / utm_source / frequency, CSV, invites, links +
  "Show on /beta", launch redirect. Send buttons stay off for a platform with no link.
- **Tested:** SQL (rolled back): dedupe, rate limit, unsubscribe, claim never re-sends, failed retried, anon can't read.
  Live function: honeypot/fast/bad email/bad platform, real sign-ups (machinemisha+…; Resend accepted; rows deleted after).
  Live page on desktop + 375 px, light/dark, no console/CSP errors. Not tested: an owner invite/test send (needs the owner's
  Google session).
- **Service worker fix:** Workbox tests `navigateFallbackDenylist` against path + query, so `/beta?utm_source=…` (and
  `/redeem?code=…`) got the app shell. The pattern now ends `(\/|\?|$)`.
- **Deployed** from this branch rebased on origin/main `0e0ab62` (clean worktree, `npm ci`), rsync **without** `--delete`
  (old hashed assets kept for open tabs). Backup `~/backups/stt-202610240616-pre-beta.tar.gz`. **Merge this branch before the
  next deploy from main**, or a `--delete` sync removes /beta.
- **Resend free plan = 100 emails/day:** confirmations count too. Upgrade Resend before a big social push.

## Update — iOS app builds and runs on GitHub Actions (2026-10-23, branch claude/objective-ptolemy-052302)
- **`ios/`** (Capacitor 8.5.3, Swift Package Manager, no CocoaPods), generated with `npx cap add ios` (works on any Mac,
  no Xcode needed). App id `com.sillytraveltool.app`, 0.20.0 (4) like Android (bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj` with Android). Icon + light/dark splash from `assets/`
  (`npx @capacitor/assets generate --ios`). `Info.plist`: URL scheme `com.sillytraveltool.app` (magic link, Google,
  invites — Google sign-in needs nothing else on iOS), camera / photo library / location prompts, arm64.
  `npm run build:ios` = native web build + `cap sync ios`.
- **Run it:** Actions → "iOS simulator" → Run workflow (or `gh workflow run ios.yml --ref <branch>`), then
  `gh run download <id>`. macOS 26 Apple-silicon runner, latest Xcode, builds for the Simulator, launches on iPhone 17 Pro,
  plus the smallest and largest iPhones (signed-out + Trips) to check the layout fits every size. ~8 min, free (public repo).
  Pushes to the branch run signed-out only. Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Signed-in run:** put a fresh session for the TEST account in secret `IOS_TEST_DEEPLINK`
  (`com.sillytraveltool.app://auth-callback#access_token=…&refresh_token=…`: POST `/auth/v1/otp?redirect_to=com.sillytraveltool.app%3A%2F%2Fauth-callback`
  for machinemisha, read the link in its Gmail, `curl -w "%{redirect_url}"` the verify link, `gh secret set IOS_TEST_DEEPLINK < file`).
  Valid ~1 h. Never pass tokens as workflow inputs (repo is public). Screenshots: Trips, trip (Plan tab), import sheet.
  Taps are coordinates (`taps` input, iPhone 17 Pro points): AXe can't see WKWebView content in the accessibility tree.
- **Checked (run 40042063517, green):** starts cleanly, no crash; signed-out, Trips, Plan tab, import sheet on iPhone 17 Pro, and
  signed-out + Trips on iPhone 16e (smallest) and 17 Pro Max (largest) all fit with safe areas. Proof: `docs/screenshots/ios/`.
  The test trip used ("Lisbon long weekend" on machinemisha) and the `IOS_TEST_DEEPLINK` secret were removed afterwards;
  set both up again for the next signed-in run. Extra simulators boot slowly (~7 min each); a size that won't boot is skipped with a warning.
- **Not done:** TestFlight / signing / Apple Developer account (needs the owner's OK); Google sign-in tapped through on iOS.

## Update — launch readiness: deletion, Apple sign-in, paid copy, store forms (2026-10-24, branch chore/launch-readiness)
- **In-app account deletion (Apple 5.1.1(v), Play):** `delete-account` Edge Function v1 (verify_jwt off, checks the
  caller's JWT, body `{confirm:'DELETE'}`) cancels any live Stripe subscription (on failure: `admin_tasks` row
  `cancel-sub-<id>`), then `public.delete_account(user)` (migration `20261024030000`, service role only): hands the
  member's bookings/ideas on others' trips to the trip owner, deletes their trips, folds `api_usage` into the zero user,
  nulls `ai_calls`, deletes function_errors/ingest_locks/former_members rows, deletes the auth user (rest cascades;
  Stripe ledger rows keep with user_id null). Owner admins are refused. Tested rolled back on a real non-owner account
  (15 → 14 users, profile and 2 trips gone; owner refused). Not tested end to end with a live session (no throwaway
  account). Screen: Profile → Settings → Delete account (`DeleteAccountView.jsx`). Public page `/delete-account/` (Play URL).
- **Sign in with Apple:** "Continue with Apple" on the welcome screen, shown only when Supabase reports the Apple
  provider on (`/auth/v1/settings`), so it appears by itself once the owner sets it up (`docs/OWNER_TODO.md`).
- **Paid, not free:** Terms get "8. Plans and payments" (free plan limits, First Class yearly auto-renew + lifetime,
  Stripe on web / stores in apps, 14-day web refunds, codes), governing law Washington; index.html title/meta and
  llms.txt no longer say free; privacy lists RevenueCat and Apple sign-in.
- **Checkout:** `billing` v7 excludes Cash App, Klarna and Pay by Bank (`excluded_payment_method_types`; checked in the
  sandbox: card, Link, Amazon Pay remain). The sandbox promo code STTTEST50 can't be switched off through the Stripe
  connector; it dies with the sandbox at go-live.
- **Sentry:** DSN of project `silly-travel-tool/silly-travel-tool` in `.env.local` (`VITE_SENTRY_DSN`); web builds now
  report errors. CI builds (iOS/Android workflows) need the same value as a repo secret to report from the apps.
- **Store forms:** answers for Play Data safety and App Store privacy labels in `docs/STORE_PRIVACY_FORMS.md`.

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
- **Bugs found, fixed in `10bf844`:** (1) rename-from-stops now re-runs while the title is still the one the stops
  gave it (was stuck on "Madrid & Granada"); (2) airports named after the city they serve (`AIRPORT_CITY` in
  `_shared/route.js`: LHR London, BER Berlin, JFK New York, SEA Seattle…); (3) Plan cards show the confirmation once;
  (4) "Final destination" only for a ticket of legs. The clipped import buttons looked like an emulator drawing glitch
  (normal flex row in code), not changed; (5) Android `versionName` now reads `package.json` (bump the version there);
  (6) connecting-flight emails: the email prompt returns `more_legs` and each leg is filed (live as
  receive-booking-email **v45**, verified byte-for-byte; live test filed DL 263 LIS→JFK and DL 416 JFK→SFO with local
  zones). The function's version numbers jump by two per MCP deploy (logs show v42 and v43 starting a minute apart).
- **Website deployed from main `be14c3b` (2026-10-23, owner OK, includes the cockpit work):** backup
  `~/backups/stt-202610232156-pre-main.tar.gz`; dry run showed no deletions outside `assets/`; /, /admin/, /redeem/,
  /unsubscribe/, /privacy/, /terms/ all 200; live index identical to the build. Earlier the same day a deploy of
  `fd8b93c` + fixes deleted /admin, /redeem, /unsubscribe (rsync `--delete`) and was rolled back within ~3 minutes:
  always read the dry run (`-n -i`) for deletions outside `assets/` before the real sync.
- **Fixed:** the Trips list climate hint asked Open-Meteo's archive for `monthly=` data (400). It now averages the
  `daily=` highs and lows of the trip's months over the last two complete years, in the user's °C/°F.
- **Android:** debug APK versionCode 4 (versionName 0.20.0 from package.json) built from `fd8b93c` + fixes and installed;
  the emulator (Intel host) is too slow to finish loading even with `-gpu swiftshader_indirect`, so it is not rechecked
  on device. Not uploaded.


## Update — Money → Free plan dashboard (2026-10-23, migration `20261024010000_free_plan_dashboard`)
- **One place for the free-plan limits:** `app_settings.free_limits` = `enabled` (master switch, **off**: the apps can't
  take payment yet), `trips_on` / `reservations_on` / `imports_on` (per-limit switches) and the three numbers (whole
  numbers ≥ 1). `billing_settings` (the paywall branch's on/off row) is folded in and **dropped**; `free_limits_on()`
  keeps its name and reads the setting; new `free_limit_cap(key)` (null = not enforced) is used by
  `enforce_trip_limit`, `enforce_reservation_limit` and `email_import_locked`; `my_entitlement().limits_on` reads
  `free_limits_on()`. Tested rolled back: off → nothing blocked; on with 1 trip → 3rd… insert refused `upgrade:trips`;
  trips limit switched off → allowed.
- **Cockpit card (Money → Free plan):** master switch (confirm shows how many free members are already at/over), per
  limit a Limit/No limit switch, − / + stepper and a histogram of today's free members by usage (bars at or past the
  limit highlighted, "N at the limit, M over" updates as you change the number), Save/Undo, audited.
  `admin_free_plan()` returns the histograms, free/First Class counts, paywall views and `limit_hit` events (30 days).
  The paywall branch's migration files still describe `billing_settings`: its session was told.
- **Admins (owner request):** machinemisha@gmail.com added with the owner role (Google sign-in; audited). Both owners
  get the (rare) spike emails.
- **Alerts, owner request "no emails unless a crazy spike"** (migration `20261024020000_alert_levels`): dashboard levels
  (`cost_alert.daily_usd` $10, `flag_*` 300 / 150 / 1,500) show a red banner on every cockpit page (`AlertBanner`,
  `admin_alerts()`, refreshed each minute) and in Needs you. Email only past `email_usd` ($50 a day) or a member past
  `email_ai` 1,000 / `email_guide` 400 / `email_google` 5,000 (PAYWALL_PLAN runaway levels). All eight are in
  Money → Controls → Alerts. Tested rolled back: 350 AI calls → banner, no email; 1,200 → email.

## Update — Money → Statement: gross, fees, net, exact AI cost (2026-10-23, commits b62f2af, a8ccd8a)
- **Statement card (top of Money, `admin_financials(from, to)`, migrations `20261024000000_financials` +
  `20261024000100_cost_rows_switchover`):** Stripe gross → refunds → disputes → Stripe fee lines → net, from Stripe's
  ledger (`stripe_balance_txns`, synced by admin-stripe v8+ with `balance_transactions` + `GET /v1/balance`), then AI,
  guides, Google, Supabase, hosting → profit. Sandbox check: $59.97 − $29.99 − $2.63 fees = $27.35 net = Stripe pending.
  Placeholders (shown as "Not connected / Not tracked yet"): App Store + Google Play revenue and fees, Google Cloud's
  actual bill, Resend. Cash card: payouts, Stripe available/pending, discounts given, DeepSeek balance.
- **AI priced from tokens:** `_shared/usage.ts` (request scope: member + feature, `serviceRpc`, `logAiCall`);
  `_shared/gemini.ts` logs provider, model and tokens of every answered DeepSeek/Gemini call → `log_ai_call` →
  `ai_calls` (priced with `cost_rates.ai_prices` per million tokens, editable in Controls). `checkAiQuota` sets the
  member. Days before logging keep the flat per-call estimate; the switchover day uses the higher of the two.
  DeepSeek answers as model `deepseek-flash` (priced with deepseek-chat rates until the owner sets its own).
  Real cost is ~10× under the old flat estimate (a booking parse ≈ $0.0004).
- **DeepSeek balance:** cost-alert v2 saves `GET api.deepseek.com/user/balance` hourly → `provider_balances`
  ($19.79 at first read); the statement compares balance drop with the token-priced total.
- **Redeployed from b62f2af:** generate-phrases v22, generate-checklist v20, admin-experiment-ai v2, goosey-discover v22,
  generate-guide v34, parse-booking-email v30, receive-booking-email v47 (byte-identical), admin-stripe v8 (then v9 by
  the billing session, ledger code included), cost-alert v2. places and resolve-timezone were not redeployed after
  the `google.ts` refactor (same behaviour; their live bundles still hold the older equivalent code).
- **Google's actual bill — later (owner):** Cloud Billing → BigQuery export (dataset `stt_billing`), a service account
  with BigQuery Data Viewer + Job User, then Supabase secrets `GCP_BILLING_SA` (JSON key) and `GCP_BILLING_TABLE`.
  Nothing reads them yet; the reader is the next step once they exist.

## Update — Money → Costs and Controls (2026-10-23, commits 64b4814, 85b616d)
- **Settings (live, migration `20261023190000_costs_controls`):** `app_settings` (key, value jsonb): `founders_offer`
  {active}, `free_limits` {upcoming_trips, reservations_per_trip, email_imports}, `ai_limits` {ai_daily 100, guide_daily
  40}, `google_limits` {per_user_daily 5000}, `kill` {ai_paused, google_paused}, `cost_alert` {daily_usd 10, flag_ai 300,
  flag_guide 150, flag_google 1500, last_sent_day}, `cost_rates` (AI call, guide section, Google per endpoint, Supabase +
  hosting monthly). `public_settings()` (anon) returns only founders_offer + free_limits, for the paywall (billing
  session told). `admin_settings()` / owner-only `admin_setting_set(key, patch)` (merges, validates, audited).
- **AI enforcement without redeploys:** `consume_ai_quota` returns false when `kill.ai_paused`, and `ai_limits` override
  the limit the functions pass.
- **Google counted:** every billed call in `_shared/google.ts` (`call()`, static maps) and `_shared/timezones.ts`
  (time zone, geocode) goes through `allowGoogle(endpoint)` → `consume_api_call` → `api_usage` (day, user, endpoint);
  false when Google is paused or the member hit the daily cap (callers fall back; fails open on errors). The member comes
  from `withGoogleScope` (AsyncLocalStorage per request) + `setGoogleUser`. Redeployed from 64b4814: places v9,
  resolve-timezone v8, goosey-discover v21, generate-guide v33, parse-booking-email v29, receive-booking-email v46
  (byte-identical to the local bundle); each tested live with the owner's session (counts landed on babar54).
- **Costs (`admin_costs(from, to, exclude_internal)`):** estimated spend per day (AI, guides, Google), per active and
  paying member, margin vs Stripe gross − refunds − all costs (fixed costs prorated), top 25 members (click → member page),
  Google by endpoint, usage flags. Estimates ignore Google's monthly free usage.
- **Controls card (Money tab):** kill switches and founders switch (confirm with last-24h impact), free/AI/Google limits,
  alert levels, cost rates, "Send a test alert". Analysts see read-only.
- **Alerts:** Needs you gets "spend today over $X", "kill switch on" and per-member abuse items (`cost_needs_items()`,
  patched into `admin_needs_you`). `cost-alert` Edge Function v1 emails the owner (Resend) at most once a day for spend
  and once per member/day/kind for flags (`usage_flags`); pg_cron `cost-alert` at :05 every hour via pg_net with the
  Vault secret `cost_alert_token` (no owner secret needed). Proof: cron call with a $0.10 threshold sent (Resend id
  01a16ae4-3a99-7ca9-b39f-5e72b62a0148), second call same day didn't, wrong token 401; threshold restored to $10 and
  last_sent_day cleared. Owner test send from the live cockpit also sent. `purge-old-costs` cron keeps 25 months.
- **Cockpit deployed** (admin/index.html + admin-*.js/css only, from a clean worktree of 85b616d+; backup
  `~/backups/stt-202610232236-pre-costs-admin.tar.gz`).

## Update — Stripe web billing (2026-10-23, branch `feat/stripe-web-billing`, PR #1; full notes: `docs/STRIPE_BILLING.md`)
- **Web buys First Class straight through Stripe** (owner decision: no RevenueCat on the web; apps still use store
  billing later). Page **/upgrade/** (own Vite entry like /redeem/, website only): sign in → Yearly $14.99 or Founders
  lifetime $29.99 → Stripe-hosted Checkout (promotion codes allowed, so cockpit discount codes work) → back to
  `/upgrade/?paid=…`, which polls `my_entitlement()` until First Class shows. **Manage billing** opens the Stripe
  customer portal (cancel at period end, card, invoices).
- **Functions:** `billing` (POST `{action:'checkout', plan}` / `{action:'portal'}`, signed-in caller, one Stripe customer
  per member tagged `metadata.user_id`, refuses a second purchase) and `stripe-webhook` (checks Stripe-Signature,
  re-fetches each object, upserts the cockpit's `stripe_*` tables). Helpers + row mappers: `_shared/stripe.ts`
  (same columns as admin-stripe's sync). Tests: `node scripts/test-stripe.mjs`.
- **Migration `20261023140100_stripe_web_billing`:** `stripe_first_class(user)`; `entitlement()` counts Stripe rows only
  in the site's current mode (`stripe_sync.livemode`, set by the webhook), so sandbox purchases stop counting at go-live;
  `my_entitlement()` adds `web {lifetime, subscription, customer}`.
- **Stripe sandbox:** product `stt_first_class`, prices `stt_first_class_yearly` / `stt_first_class_lifetime_founding`,
  portal configuration `bpc_1UTdLhR315zoHnpnVGMVz3v6`, webhook `we_1UTo8yR315zoHnpnfvqgc3qn` →
  `/functions/v1/stripe-webhook` (18 events). Tax: threshold monitoring only (no registrations yet).
- **Live (2026-10-23):** migration applied, `billing` v5 (redeployed 21:1x with current `_shared/stripe.ts`) + `stripe-webhook` v5 deployed (MCP; verify_jwt off). Secrets
  STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET set (sandbox). Checkout metadata follows the cockpit spec (user_id, plan,
  price_key, platform, app_version, trigger from `/upgrade/?from=`, code from `?code=` (pre-applied), first-touch UTM,
  experiment, variant); the webhook writes each object's metadata jsonb (charges merge their payment intent's).
- **Sandbox test (machinemisha):** yearly $14.99 via hosted Checkout + test card → `first_class` until 2027-10-23;
  cancel at period end → still First Class, `canceling`; cancel now → `free`; lifetime $29.99 → `first_class`;
  refund → `free`. Not tested end to end: the `billing` function itself from a signed-in browser (sessions were made
  with the same parameters through the Stripe API) and the `/upgrade/` page signed in; the page goes live with the
  next website deploy.
- **`/upgrade/` is on the live site** (21:17, added on top of the main deploy; backup `stt-202610232117-pre-upgrade`).
  Live `sw.js` patched to skip `/upgrade/`. **Full deploys from main delete `/upgrade/` until PR #1 merges** (happened
  once at 21:22, restored). Google sign-in now always shows the account chooser (`prompt: 'select_account'`). Signed-in end-to-end test waits on the owner signing in as machinemisha.
- **Plans for approval** (owner wants paywall on web, iOS and Android): `docs/STRIPE_BILLING.md` → "Plans for approval"
  A (one PaywallSheet everywhere; web → Stripe, apps → StoreKit / Play Billing via RevenueCat) and B (server limits
  behind a kill switch until every platform can pay).
- **Paywall on every platform + free limits built** (branch `feat/first-class-paywall`): PaywallSheet, Settings → Plan,
  `store-webhook` v1, migration `first_class_everywhere` applied with limits **OFF** (`billing_settings`). Details and
  the owner's App Store / Play / RevenueCat steps: `docs/STRIPE_BILLING.md` → "Built".
- **Cloud device checks:** `.github/workflows/android.yml` (GitHub Linux emulator, demo APK, 8 paywall checks, all pass)
  and the iOS session's `ios.yml` (paywall checked on the iPhone Simulator via throwaway branch `ci/paywall-iphone`).
  Use these instead of the shared local emulator. See `docs/STRIPE_BILLING.md` → "Cloud devices".
- **Not done:** store products + RevenueCat keys (owner), `receive-booking-email`
  deploy, `subscription_status` analytics from the webhook, admin-stripe
  reusing `_shared/stripe.ts`.

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
