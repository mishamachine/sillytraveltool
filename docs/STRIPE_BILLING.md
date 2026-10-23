# Stripe web billing — handoff (2026-10-23)

Branch `feat/stripe-web-billing` → PR https://github.com/mishamachine/sillytraveltool/pull/1 (open, merges cleanly).
Worktree used to build it: `../silly-travel-tool-stripe` (remove after merge: `git worktree remove ../silly-travel-tool-stripe`).
Related plans: `docs/PAYWALL_PLAN.md` (product rules, prices, screens), `docs/ADMIN_PLAN.md` (cockpit, Money tab).

## Decisions (owner)
- **Web sells First Class straight through Stripe**, no RevenueCat on the web. The apps will use Google Play Billing /
  StoreKit later; Apple/Google rules forbid linking to web checkout from inside the apps.
- **Stripe products:** Billing + Checkout + customer portal. **No Connect**: nobody else is paid through STT.
- **Prices:** First Class yearly $14.99 (no monthly, no trial), Founders lifetime $29.99 once (no cap; owner ends it).
- **Tax:** no registrations yet → Stripe Tax threshold monitoring only (no tax collected). Prices are `tax_behavior:
  exclusive`, product tax code `txcd_10103001` (SaaS, personal use). Turn on Stripe Tax collection once registered.
- **Checkout metadata:** the owner cockpit's spec (agreed with the admin-dashboard session, "richer, more flexible").

## How it works
1. Member opens **`sillytraveltool.com/upgrade/`** (website only; own Vite entry `upgrade/index.html`,
   `src/upgrade/main.jsx`, styles from `src/admin/admin.css`). Optional `?from=<trigger>` (e.g. `limit_trips`) and
   `?code=<CODE>` (pre-applies a Stripe promotion code).
2. Page calls Edge Function **`billing`** `{action:'checkout', plan:'yearly'|'lifetime', trigger, code, app_version}`
   → Stripe-hosted Checkout URL. One Stripe customer per member and mode (`metadata.user_id`); refuses a second
   purchase when `stripe_first_class(user)` is already true.
3. Stripe calls **`stripe-webhook`**, which checks `Stripe-Signature`, re-fetches the object from the API, and upserts
   `stripe_customers / stripe_subscriptions / stripe_checkouts / stripe_charges / stripe_invoices` (same columns as the
   cockpit's `admin-stripe` sync, plus each object's `metadata` jsonb; charges merge their payment intent's metadata).
4. **`entitlement(user)`** = live grant (codes/admin) OR `stripe_first_class(user)`: an active/trialing/past_due
   subscription before its period end, or a paid, unrefunded, undisputed charge with plan `lifetime`. Only rows in the
   site's current Stripe mode count (`stripe_sync.livemode`, set by the webhook and the cockpit sync).
5. Back on `/upgrade/?paid=…` the page polls `my_entitlement()` (plan, until, `web {lifetime, subscription, customer}`)
   for up to 30 s. **Manage billing** → `billing {action:'portal'}` → Stripe customer portal.

Analytics (`track()`): `paywall_view {trigger, store}`, `purchase_started {plan, store, trigger}`,
`purchase_completed {plan, store}`.

## Files
| File | What |
|---|---|
| `supabase/functions/billing/index.ts` | checkout + portal |
| `supabase/functions/stripe-webhook/index.ts` | webhook → `stripe_*` tables |
| `supabase/functions/_shared/stripe.ts` | fetch client, signature check, row mappers |
| `supabase/migrations/20261023140100_stripe_web_billing.sql` | `stripe_first_class`, `entitlement`, `my_entitlement` |
| `upgrade/index.html`, `src/upgrade/main.jsx` | the page |
| `scripts/test-stripe.mjs` | 13 helper checks (`node scripts/test-stripe.mjs`) |
| `supabase/config.toml` | `verify_jwt = false` for both functions (they authenticate themselves) |

## What's live
- **Supabase** (`swywrvbuswylvqlktsym`): migration `stripe_web_billing` applied; `billing` v5 (2026-10-23 21:1x, current
  `_shared/stripe.ts`; unauthenticated and bad-token calls answer 401), `stripe-webhook` v5
  deployed through the Supabase MCP (the local CLI isn't logged in). Secrets: `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` (both **sandbox**), `APP_URL`.
- **Stripe sandbox** "Silly Travel Tool sandbox" (`acct_1UTTUsR315zoHnpn`):
  - product `stt_first_class`
  - prices `stt_first_class_yearly` (`price_1UTdLWR315zoHnpnFI8aGg87`) and `stt_first_class_lifetime_founding`
    (`price_1UTdLYR315zoHnpnPAooflyw`)
  - portal config `bpc_1UTdLhR315zoHnpnVGMVz3v6` (cancel at period end with reasons, card update, invoices, email/address)
  - webhook `we_1UTo8yR315zoHnpnfvqgc3qn` → `/functions/v1/stripe-webhook`, 18 events. Its signing secret is under
    Developers → **Workbench → Webhooks** (not Settings).
- **Sign-in fixes (2026-10-23, owner report: Google signed straight into the last account):** every Google button
  (app, `/upgrade/`, `/redeem/`, cockpit) passes `prompt: 'select_account'`, so Google always shows its account
  chooser; `/upgrade/` and `/redeem/` show "Not you? Use another account" (local sign-out). Upgrade + redeem pages are
  live; the app and cockpit buttons ship with the next full deploy.
- **Live `sw.js` patched (owner OK, 21:27):** `upgrade` added to its skip list (backup `~/backups/sw-pre-upgrade.js`);
  verified a returning browser now gets the page. **Another session's full deploy at 21:22 deleted two of the page's
  files** (rsync `--delete` from a main build without `/upgrade/`); restored. Until PR #1 is in main, any full deploy
  breaks `/upgrade/` again: merge PR #1 first, or re-upload `dist/upgrade/` + its assets after each deploy.
- **Website (2026-10-23 21:17, owner OK):** `/upgrade/` added **on top of** the live site (only `upgrade/index.html` +
  4 new assets uploaded, no `--delete`; the rest is the 19:53 deploy from main). Backup:
  `~/backups/stt-202610232117-pre-upgrade.tar.gz`. **Catch:** the live `sw.js` (built from main before PR #1) doesn't skip
  `/upgrade/`, so anyone who has opened the site before gets the app instead of the page until their service worker
  updates. Fix: add `upgrade` to `navigateFallbackDenylist` in live `sw.js` (one word), or the next full deploy after
  PR #1 merges. A new visitor / cleared browser sees the page.
- Publishable key: not needed (hosted Checkout, no Stripe.js).

## Tested (sandbox, test account machinemisha `c447b10f-…`)
| Step | Result |
|---|---|
| Yearly $14.99, hosted Checkout + card 4242… | `first_class` until 2027-10-23 |
| Cancel at period end | still `first_class`, `canceling: true` |
| Cancel now | `free` |
| Lifetime $29.99 | `first_class`, charge `plan=lifetime` with metadata |
| Refund | `free` |

**Not yet tested:** the `billing` function from a signed-in browser (the test sessions were created through the Stripe
API with the same parameters), the signed-in `/upgrade/` page, the portal session, a pre-applied `?code=`, a declined
card / 3DS (`4000 0000 0000 0002`, `4000 0025 0000 3155`), and `past_due` grace.

## Gotchas
- `stripe-webhook` v7 sets `stripe_charges.plan` and `.invoice` by the cockpit sync's rule: charge/payment metadata →
  invoice found through `/v1/invoice_payments` (first subscription payment = its plan, `subscription_cycle` = `renewal`)
  → charge description. Subscription charges have no `charge.invoice` or metadata on this API version. Tested: a new
  yearly charge came in as `plan=yearly` with its invoice. The restricted key needs read access to invoices, which
  covers invoice payments.
- `stripe-webhook` v6 only trusts a `metadata.user_id` / `client_reference_id` that matches an existing account
  (`existing()`), like the cockpit sync. A removed member's id used to break the `stripe_*` foreign keys and make
  Stripe retry for days. Tested: unknown id → row saved with `user_id` null. Sandbox test customer
  `cus_VUq3QbTbi8wvk8` (fk-test@example.com) was left in Stripe from that test.
- The first webhook secret saved in Supabase was wrong, so every delivery got 400 "Bad signature". Check
  `stripe-webhook` logs first if rows stop arriving. Both functions trim whitespace from the secrets.
- Supabase MCP deploys: files go in as `source/index.ts` + `_shared/stripe.ts`, entrypoint `source/index.ts`.
- The migration was renumbered from `140000` to `140100`, because `140000` is the cockpit's `stripe_metadata`.
- The restricted key needs: write customers, Checkout sessions, portal sessions; read prices, promotion codes,
  subscriptions, invoices, charges, payment intents (plus the cockpit's coupon/promotion-code writes).

## Next steps
1. Owner reviews and merges PR #1; remove the worktree. Then a full website deploy from main (fixes the `sw.js` catch).
2. ~~Redeploy `billing`~~ done (v5).
3. ~~Website deploy~~ done (additive) → signed-in end-to-end test on `/upgrade/`: yearly, portal cancel, lifetime, `?code=`,
   declined card, 3DS.
4. In the **web** app (not native), link limit hits and Settings to `/upgrade/?from=<trigger>`. PAYWALL_PLAN
   section 6 screens.
5. Server-side free-plan limits that call `entitlement()` (PAYWALL_PLAN section 4: trips, reservations, email imports,
   past trips).
6. `subscription_status` analytics from the webhook into `analytics_events`.
7. Have `admin-stripe` reuse `_shared/stripe.ts` mappers.
8. Go-live (owner): Stripe account activation (business, bank), live product/prices/portal/webhook recreated in live mode,
   live restricted key + webhook secret in Supabase, Stripe Tax decision, Terms/"free" copy, Supabase Pro.

## Plans for approval (2026-10-23, owner: "integrations on all platforms: web, Android, Apple")

### A. Paywall entry points on every platform (step 4)
One paywall, three ways to pay. Same triggers and screen everywhere; only the Buy button differs.
- **Shared code:** `src/lib/paywall.js` `openPaywall(trigger)` + a Clay `PaywallSheet` (PAYWALL_PLAN section 6: luggage
  tag, 4 benefits, yearly / lifetime cards, price and renewal text, terms + privacy). `hasFirstClass()` in
  `src/lib/firstClass.js` switches from the dev flag to `my_entitlement()`, read at sign-in and after a purchase.
- **Triggers (all platforms):** a server limit error (`code: 'upgrade'` / `upgrade:<feature>`), 3rd upcoming trip,
  6th reservation, 6th forwarded email, a locked past trip, the handwritten-import lock (replaces "coming soon"),
  Settings → First Class row. Soft: never on first launch, one automatic show per session. `paywall_view {trigger, store}`.
- **Buy button by platform:**
  | Platform | How they pay | Status |
  |---|---|---|
  | Web | `/upgrade/?from=<trigger>` → Stripe Checkout | built, live in sandbox |
  | iOS | StoreKit 2 in-app purchase (Apple 3.1.1: digital unlocks bought in the app must use it) | to build |
  | Android | Google Play Billing (Play Payments policy, same rule) | to build |
  Native purchases go through **RevenueCat** (PAYWALL_PLAN section 3: one Capacitor SDK, receipt checks, grace,
  refunds). A new `store-webhook` Edge Function writes an `entitlement_grants`-style row (`store: app_store|play`), so
  `entitlement()` stays the one answer. A member who bought on the web is First Class in the apps (and vice versa)
  with no restore.
- **What the apps must not do:** link to or mention the web price outside the US. In the US both stores now allow an
  external purchase link (Apple: link entitlement; Google: external offers, with a fee). Recommendation: **not at
  launch**; store billing only, revisit once there's revenue to compare.
- **Settings → Plan screen:** plan, renewal date, and "Manage": web → Stripe portal; App Store / Play purchases →
  the store's subscription page; a web subscriber inside the apps sees the plan and date only (no link out).
- **Owner to provide for native:** App Store Connect + Play Console products (`stt_first_class_yearly`, auto-renew
  $14.99; `stt_first_class_lifetime_founding`, non-consumable $29.99), paid-apps agreements / tax + bank forms in both
  stores, a RevenueCat account (free under $2.5k/month).
- **Order:** (1) PaywallSheet + triggers + Plan screen, with the web Buy working and native showing "coming soon";
  (2) RevenueCat + StoreKit/Play products + `store-webhook`, tested in the iOS Simulator (StoreKit config file) and a
  Play internal-testing track. Settings/Profile files are also edited by other sessions: check
  `list_sessions` and rebase onto main before touching `SettingsView.jsx`.

### B. Free-plan limits on the server (step 5)
Server decides, app only displays. Limits follow the **trip owner's** plan. Nothing is ever deleted on downgrade;
only adding past a limit is blocked.
- **Migration `…_free_plan_limits`:**
  - `is_first_class(uid)` = `entitlement(uid) = 'first_class'` (wraps grants + Stripe + later store rows).
  - `trips` BEFORE INSERT / UPDATE OF start_date, end_date: free owner with 2 upcoming dated trips
    (`end_date >= current_date`, status `planning|active`) → `raise exception 'upgrade:trips'`. Undated trips don't count.
  - `bookings` BEFORE INSERT: reservations (`restaurant`, `activity`, `other`; flights, hotels, transport don't count)
    ≥ 5 on a free owner's trip → `upgrade:reservations`. **Owner (2026-10-23): trip ideas without a confirmed
    reservation never count.** Ideas are rows in `trip_activities` (`is_idea`), not `bookings`, so only confirming an idea
    ("Confirm a visit" → a booking) can hit the limit; that moment opens the paywall.
  - `app_config.free_limits_on` kill switch (default **off**).
- **Email import (`receive-booking-email`):** count the account's imported emails; the 6th+ is parsed and saved with
  a new `bookings.locked` flag, the app shows "New email received, free limit reached", and a reply goes only to the
  account's own verified address. `stripe-webhook` / grants unlock (`locked = false`) when First Class starts.
- **Past trips:** locked the day after the trip ends (recap teaser stays free). Recommend doing this as a later step
  through a `trip_details(trip_id)` RPC rather than new RLS, so `fetchTrips()`'s 3-query rule and performance stay intact.
- **AI:** `checkAiQuota` keeps today's daily fair-use for free; First Class gets the safety net only (section 10).
- **Errors:** triggers raise `upgrade:<feature>`; Edge Functions return `{ error, code: 'upgrade', feature }`.
  `src/lib/paywall.js` reads both and opens the paywall instead of an error toast.
- **Rollout:** keep the switch off until members on **every** platform can pay (web now, apps after RevenueCat), or
  native members would hit a wall with no way through. Turning it on early for web-only accounts isn't possible
  (the server can't tell the platform reliably).
- **Tests:** SQL checks per limit with a free test user and machinemisha (First Class on/off), then the app on web,
  the iOS Simulator and the Android emulator showing the paywall at each limit.

## Built (2026-10-23, branch `feat/first-class-paywall`, on top of PR #1; owner approved plans A and B)
**Database** (migration `20261023170000_first_class_everywhere`, applied):
- `store_entitlements` (one row per member, written only by `store-webhook`; members can read their own).
  `entitlement()` = grants OR Stripe OR stores. `my_entitlement()` adds `store {store, product, expires_at, will_renew}`
  and `limits_on`.
- Limits: triggers `free_trip_limit` (2 upcoming dated trips) and `free_reservation_limit` (5 restaurant/activity/other
  bookings per trip; trip owner's plan), `bookings.locked` + `email_import_locked(user)` (6th+ forwarded email).
  Server-side inserts (email import, service role) skip the triggers. **Switch: `billing_settings.free_limits_on`,
  OFF.** Turn on only when the apps can sell: `update billing_settings set free_limits_on = true where id = 1;`
- Tested in one rolled-back transaction as machinemisha: 3rd trip → `upgrade:trips`; 6th reservation →
  `upgrade:reservations`; hotel after the limit OK; First Class lifts both; switch off → no limits.

**App (web, Android, iOS share it):**
- `src/store/planStore.js`: plan from `my_entitlement()` at sign-in; `openPaywall(trigger)`; `upgradeError()` turns
  `upgrade:<feature>` into the paywall + a calm form message (`limit_hit {feature}` analytics).
- `src/components/shared/PaywallSheet.jsx` (+ `paywall.css`): tag logo, 4 benefits, yearly / founders cards, the
  affordability line, renewal terms, Terms/Privacy, Restore (apps). Mounted once in `App.jsx`.
- `src/lib/purchases.js`: web → `/upgrade/?from=<trigger>`; apps → RevenueCat (`@revenuecat/purchases-capacitor`
  13.7.3, appUserID = Supabase user id, packages `$rc_annual` / `$rc_lifetime`). No key in the build → "First Class in
  the app is coming soon." Never links to web checkout from the apps.
- Settings → **Plan**: free → "Get First Class"; First Class → "Renews / Ends <date>" or "For life", and "Manage
  subscription" (web: Stripe portal; App Store / Play purchases: the store's page; a web plan inside the apps: date only).
- Triggers wired: trip and booking saves (`createTrip`, `updateTrip`, `createBooking`, `moveBookings`), handwritten
  import, locked email bookings (detail sheet → paywall), Settings.
- `hasFirstClass()` now reads the real plan (dev flags still work).
- Demo mode: `?demo&plan=first_class`, `?demo&limits=1`.
- Tested in the browser (demo, phone size): Settings row → paywall; new trip with limits on → paywall with the trips
  line + form message; pay button → `/upgrade/?from=limit_trips`; First Class Settings shows renewal + Manage.
- **Cloud devices (owner, 2026-10-23: "use a cloud emulator for both"):** the repo is public, so GitHub Actions
  runners are free.
  - **Android:** `.github/workflows/android.yml` builds a demo APK (`VITE_DEMO=1`, `VITE_DEMO_PARAMS=limits=1`, no
    secrets), boots an emulator on Linux (API 34, Pixel 7) and runs `scripts/android-emu-shots.mjs`, which drives the
    WebView through Chrome DevTools: Settings → Get First Class → paywall, "coming soon" without a store key, no web
    checkout inside the app, founders plan selectable, a 3rd trip opens the paywall. Screenshots + `results.json` in the
    `android-emulator-shots` artifact. Runs on pushes to this branch (or by hand). The system image download glitches
    now and then ("ZipFile unknown archive"): re-run the job.
  - **iPhone:** uses the iOS session's project and `ios.yml` (branch `claude/objective-ptolemy-052302`, not merged).
    Checked on a throwaway branch `ci/paywall-iphone` (that branch + this one, demo build with `paywall=settings`):
    the paywall renders on the iPhone Simulator, light and dark. First start on the runner takes 20–30 s.
  - Demo options reach app builds through `VITE_DEMO_PARAMS`; `?demo&paywall=<trigger>` opens the paywall at launch.

**`store-webhook`** v1 deployed (verify_jwt off; 401 without the secret). Reads the member from RevenueCat on every
event and upserts `store_entitlements` (entitlement id `first_class`).
**`receive-booking-email`**: repo marks the 6th+ email `locked` (via `email_import_locked`); **not deployed** (other
sessions own live changes there; it only matters once the switch is on). Reply email to the sender: not built.

**Owner to do for in-app purchases:**
1. App Store Connect + Play Console: products `stt_first_class_yearly` (auto-renew, $14.99/yr) and
   `stt_first_class_lifetime_founding` (non-consumable, $29.99); paid-apps agreements, tax and bank forms.
2. RevenueCat (free under $2.5k/month): project with both apps, entitlement `first_class` on both products, an
   offering with packages Annual + Lifetime.
3. Keys: app builds get `VITE_REVENUECAT_ANDROID_KEY` / `VITE_REVENUECAT_IOS_KEY` (public SDK keys). Supabase secrets
   (owner sets): `REVENUECAT_API_KEY` (secret v1 key), `REVENUECAT_WEBHOOK_SECRET`. RevenueCat webhook →
   `https://swywrvbuswylvqlktsym.supabase.co/functions/v1/store-webhook` with that secret as the Authorization header.
4. Then: test purchases (Play internal testing, StoreKit sandbox), deploy `receive-booking-email`, turn the switch on.
