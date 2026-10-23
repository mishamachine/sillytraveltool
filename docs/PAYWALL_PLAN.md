# Paywall plan (2026-10-22)

Status: **approved with changes 2026-10-22**; second round of owner changes folded in (free limits, past-trip lock, founders lifetime offer at $29.99 (no cap), yearly $14.99, no Plus caps, dashboard). Awaiting go-ahead to build.

## What the code has today (research)
- **Auth:** Supabase email / magic link / Google. `authStore.js` fires `sign_in` / `sign_up` through `track()`.
  No Sign in with Apple yet (required on iOS once Google sign-in ships there).
- **AI quotas:** `consume_ai_quota(user, limit, kind)` (service role only) counts `ai_usage` per user/day/kind.
  `_shared/gemini.ts#checkAiQuota` applies `AI_DAILY_LIMIT` (100) or `GUIDE_DAILY_LIMIT` (40), fails open.
  Called by generate-checklist, generate-guide, generate-phrases, goosey-discover, parse-booking-email,
  receive-booking-email. **`places` (Google Maps, billed per call) has no per-user limit.**
- **Real usage (live DB):** 15 users, 3 active in 30 days. AI calls/day: avg 20, p90 42, max 52. Guide sections/day:
  avg 8, max 11. The current limits are generous; nobody hits them.
- **Analytics:** `track(event, props)` → `analytics_events` + GA4, `cleanProps()` privacy guard, opt-out respected.
  `ai_quota_hit {feature}` already fires on any 429.
- **Android:** Capacitor 8, `com.sillytraveltool.app`, 0.20.0 (versionCode 2), debug APK only. **No release signing,
  no Play Console listing yet.** iOS waits on Xcode.
- **Web:** static `dist/` on Hostinger over SSH. No server of our own, so web checkout must be hosted (Stripe) with
  webhooks landing on a Supabase Edge Function.
- **"Free" copy still live:** `index.html` title/meta, `public/llms.txt`, `public/terms/` ("free of charge"). Must change
  before charging; Terms is legal copy and needs the owner's sign-off.

## 1. Free vs Plus (owner direction, 2026-10-22)
Rule: be generous with AI and exploring; Plus pays for scale (more trips, bookings, email import) and for memories
(past trip details).

| | Free | First Class |
|---|---|---|
| Upcoming dated trips (undated trips don't count) | 2 | Unlimited |
| Reservations per trip (restaurants, tickets, activities; flights, trains, hotels, cars and ideas don't count) | **5** | Unlimited |
| Past trips | Locked **the day after the trip ends**: listed, tapping opens the recap teaser (stats + badges, details blurred); Share recap stays free | Always viewable, shown greyed/compact in a "Past" section |
| Forward-to-inbox email import | **5 emails** (account total); later emails are still saved to the trip but locked, with an in-app alert and a reply email | Unlimited; locked emails unlock on upgrade |
| Paste import, AI packing lists, HONK, guides (Goose's writing), new phrasebook languages, typed translate | Yes, generous fair use (today's limits: 100 AI calls + 40 guide sections a day) | **No cap**; abuse safety net only (section 10) |
| City guide facts (Google places, ratings, hours, Get there) | Yes | Yes |
| Toolbox: currency, tips, SOS, documents wallet, loyalty | Yes | Yes |
| Travel companions | Viewers and editors; limits follow the **trip owner's** plan | Same; everyone on a Plus owner's trip gets Plus on that trip |
| Offline (tickets, confirmations, plan) | **Core, everyone** (separate build, not a perk) | Same |

- **Legal guard on the past-trip lock:** privacy law (GDPR, UK, California) gives users a right to a copy of their
  own data, so Settings keeps a free **"Download my data"** export. The lock sells convenience (recap, details on
  the phone), not access to the data itself. Nothing is ever deleted when a plan ends.
- Downgrade: a lapsed Plus user keeps every trip and booking and can still edit upcoming ones; only *adding* past the
  free limits is blocked.

## 2. Plans and prices (owner direction)
- **No trial.** Free plan from day one; Plus unlocks the rest.
- **First Class yearly: $14.99 / year.** No monthly plan. (Owner confirmed $14.99 / $29.99.)
- **Founders offer: lifetime $29.99 once**, announced at launch as a founders offer with **no stated cap or end date**
  ("Founders offer, for a limited time"). The owner ends it whenever they choose: one switch (server setting) moves
  the paywall from `stt_plus_lifetime_founding` to a regular lifetime product at a price set then. Founders keep a badge.
- Same prices on web and in the stores (Apple/Google convert locally).
- Store type: yearly = auto-renewing subscription; lifetime = one-time non-consumable (RevenueCat entitlement with
  no expiry).
- **Paywall message:** "We keep STT as affordable as we can so more people travel, well informed and organised.
  Your subscription keeps the lights on (and the dog fed)."

## 3. Payment stack (recommendation: RevenueCat)
- **Android:** Google Play Billing. **iOS:** StoreKit 2. **Web:** Stripe Checkout via **RevenueCat Web Billing**
  (Stripe is the processor; RevenueCat merges web + store subscriptions per user).
- **Client:** `@revenuecat/purchases-capacitor` in the app, RevenueCat Web SDK / hosted purchase link on the website.
  RevenueCat `appUserID` = Supabase user UUID, so a purchase on any platform unlocks every platform.
- **Why RevenueCat:** one SDK for Play + App Store + web, receipt validation, grace/billing retry, refunds, and one
  webhook. Free until $2.5k/month tracked revenue, then 1%. Alternative (Play Billing + StoreKit + Stripe direct with
  our own receipt validation) saves 1% but is weeks more work and more to break.
- **Store rules:** in the apps, digital subscriptions are sold only through store billing. **No "cheaper on the
  web" link inside the apps**, except later in the US where both stores now allow external links (Google charges a
  fee for that program; re-check before using). The website sells via Stripe freely; signing in on the app picks it up.

## 4. Entitlement: Supabase is the source of truth
- New table `subscriptions` (one row per user): `plan` (`free`|`plus`), `status` (`trialing`|`active`|`grace`|
  `billing_retry`|`cancelled`|`expired`|`refunded`), `store` (`play`|`app_store`|`stripe`|`promo`), `product_id`,
  `expires_at` (null = lifetime), `will_renew`, `updated_at`, raw last event id. RLS: user can **select** own row; **no
  client writes**.
- Function `public.entitlement(user_id)` → `plus` when status in (trialing, active, grace, cancelled-but-not-expired)
  and `expires_at > now()`, else `free`. Security definer, service role.
- **Writer:** new Edge Function `revenuecat-webhook` (shared-secret Authorization header, idempotent on event id;
  verify_jwt off in `config.toml` like the rest). Handles INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION,
  BILLING_ISSUE (grace), EXPIRATION, PRODUCT_CHANGE, REFUND, TRANSFER. On any doubt it re-fetches the subscriber
  from the RevenueCat REST API rather than trusting the payload.
- **Enforcement (server):**
  - Free: trigger on `trips` insert (2 upcoming), trigger on `bookings` insert (5 reservations per trip; transport and stays exempt), `email_imports`
    counter checked by `receive-booking-email` (5 per account; the 6th+ is parsed and saved to the trip as a
    **locked** booking, the app shows "New email received, free limit reached", and a reply goes to the sender only
    when the sender is the account's own verified address, to avoid emailing strangers), past-trip bookings/activities hidden by RLS for free users. AI keeps today's daily fair-use limits.
  - Plus: `checkAiQuota` skips the product limits and applies only the safety net (section 10).
  - Every limit error returns `{ error, code: 'upgrade', feature }` so the app opens the paywall instead of a dead end.
  - **Per-user daily counter on `places`** (Google is billed per call): free gets a generous fair-use cap, Plus the
    safety net.
- **Client:** reads its own `subscriptions` row for UI only (badges, locks). Never decides access on its own.

## 5. Restore, cancel, grace, refunds
- **Restore:** "Restore purchases" on the paywall and in Settings → calls RevenueCat `restorePurchases`, then
  re-reads the Supabase row. Same Supabase account on any device = same plan, no restore needed.
- **Cancel:** link to the store's subscription page (Play / App Store) or Stripe customer portal (web). Access
  runs to `expires_at`.
- **Grace / billing retry:** keep Plus for the store grace period (Play 7 days configurable, Apple up to 16), show a
  gentle "Update payment" banner.
- **Refund / chargeback:** webhook sets `refunded`, access ends at once; data stays.
- **Account deletion:** delete row, tell user that store subscriptions must be cancelled in the store (Apple rule).

## 6. Screens (Clay)
- **Paywall sheet** (bottom sheet, same as other sheets): luggage-tag header, 4 benefit rows with custom 24px stroke
  icons (guide pen, inbox arrow, compass/HONK, checklist), yearly / lifetime cards (yearly pre-selected),
  the affordability line from section 2, terracotta `#B24A17` primary button, restore + terms + privacy links, price and renewal terms in
  plain text (store requirement). Light + dark tokens, rem type, large-text safe.
- **Triggers:** a free-limit error (`code: 'upgrade'`), tapping a locked past trip, 3rd upcoming trip, 6th
  reservation, 6th forwarded email, Settings → "First Class".
  Soft, never on first launch; one show per session from automatic triggers.
- **Plan screen** in Profile → Settings: current plan, renewal date, manage/cancel, restore.
- **Locked states:** small lock chip on Plus-only actions with the free allowance left ("3 of 5 email imports left", "3 of 5 reservations").

## 7. Analytics (`track()`, short codes only)
`paywall_view {trigger}`, `paywall_dismiss {trigger}`, `plan_selected {plan}`, `purchase_started {plan, store}`,
`purchase_completed {plan, store}`, `purchase_failed {store, reason}`, `restore {result}`,
`subscription_status {status}` (server-side from the webhook into `analytics_events`),
`limit_hit {feature}` (rename of `ai_quota_hit` for free limits). GA4: matching `purchase` event with value +
currency for revenue reporting; add custom dimensions `trigger`, `plan`, `store`, `result`, `status`.

## 8. Testing (I do this, with proof)
- **Web:** Stripe test mode + RevenueCat sandbox; test cards for success, decline, 3DS; webhook rows checked in SQL.
- **Android emulator:** needs a **signed release/internal-testing build uploaded to Play Console** and a Google
  account on the emulator that is a **license tester** (test cards, accelerated renewals: 5-minute months). Test
  buy yearly, buy lifetime, cancel, grace (decline card), refund, restore on a reinstall, cross-platform unlock (buy on web →
  Plus in app).
- **Server:** scripted webhook events against the Edge Function (all 9 types, duplicates, out-of-order).
- **iOS:** StoreKit sandbox once Xcode is installed.

## 9. What the owner needs to provide / do
1. **Daily cost alert amount** (section 10) and the email address for alerts.
2. **Google Play Console** ($25 one-off): app listing for `com.sillytraveltool.app`, payments profile, merchant
   account, **Small Business Program** enrolment, an **upload keystore** (I can generate it; you store the backup),
   internal-testing track, license-tester Gmail(s). Subscriptions `stt_plus_yearly` + one-time product `stt_plus_lifetime`
   (I'll give the exact fields).
3. **Apple** (when iOS starts): Developer Program ($99/yr), Paid Apps agreement + banking + tax, Small Business
   Program, same product IDs.
4. **RevenueCat** account (free): create project; give me the Android public SDK key, web billing key, secret API
   key, and connect Play (service-account JSON) — I'll walk you through each screen.
5. **Stripe** account: business details, bank, tax (Stripe Tax recommended), connect to RevenueCat.
6. **Copy sign-off:** remove "free" from site title/meta, `llms.txt`, and **new Terms** (subscription, auto-renewal,
   refunds) + Privacy update (RevenueCat, Stripe, Google/Apple as processors).

## 10. Abuse safety net (Plus) and alerts
- Plus has **no product caps**. A safety net counts the same AI and Google calls per user per day:
  - **Flag** at clearly-not-human levels: 300 AI calls, 150 guide sections or 1,500 Google calls in a day (about
    6x the heaviest real day so far). Usage continues; a row goes into `usage_flags`, the owner gets an email
    (Resend, at most one per user per day) and sees it on the dashboard.
  - **Hard stop** only at runaway levels (1,000 AI / 400 guide / 5,000 Google calls in a day), to stop scripts
    and stolen accounts running up the bill; the user sees "Unusual activity, contact us".
  - Thresholds live in Supabase secrets, so they change without a deploy.
- Cost alert: email when the estimated Google + AI spend for a day passes a set amount (owner picks, e.g. $10).

## 11. Owner dashboard (analytics + monitoring)
- **Where:** an **Admin** area inside the app (web and phone), shown only to accounts in a new `admins` table.
  Data comes from an `admin-stats` Edge Function that checks admin status server-side. GA4 stays for marketing.
- **Today / 7 / 30 days:**
  - Growth: sign-ups, daily/weekly/monthly active users, week-1 retention, web / Android / iOS split.
  - Product: trips, bookings by type and source, imports (paste / email), guide cities, HONK, translate.
  - Money: Plus members (yearly / lifetime), **founders lifetime sold** (count, to decide when to end the offer), revenue, renewals, cancellations,
    refunds; paywall funnel by trigger (view, start, purchase) and conversion rate.
  - Costs: AI calls by provider and feature, Google calls by endpoint, estimated $ per day and per active user.
  - Health: Edge Function errors, app errors, limit hits, slow functions.
  - **Flagged users:** who, what, when, with suspend / clear actions.
- Alerts by email: abuse flags (immediately), daily cost over threshold, payment webhook failures.

## 12. Build order (after go-ahead)
1. DB: `subscriptions`, `entitlement()`, free limits (trips, bookings, email imports, past-trip RLS), plan-aware
   quotas + safety net, `usage_flags`, `admins`, `places` counter (migration, backup first).
2. `revenuecat-webhook` Edge Function (incl. founders count) + scripted tests; abuse and cost alert emails.
3. Paywall, Plan screen, locked past trips, limit chips, "Download my data"; analytics events.
4. Admin dashboard (`admin-stats` + Admin area).
5. Web purchase via RevenueCat/Stripe test mode, end to end.
6. Android: release signing, RevenueCat Capacitor plugin, Play internal test, emulator purchase tests.
7. Copy/Terms changes (after owner sign-off), deploy web, new Android build.
Steps 1–5 need only RevenueCat + Stripe test accounts; step 6 needs Play Console.

## 13. Traveller walk-through: recommended changes (2026-10-22)
Walked the app at phone size in demo mode (Today, trips list, trip plan, past-trip recap, Explore, HONK, Tools,
Profile), replayed the 10 personas from `docs/TESTING_PASS.md` against the new limits, and checked the live data
(largest real trip: 15 bookings, 19 of 34 bookings are flights; max 6 restaurants/activities in one trip).

| # | Scenario | Problem with the plan as written | Recommendation |
|---|---|---|---|
| R1 | Sam's 10-day Madrid → Granada → Sevilla trip (demo) | Round-trip flights + 3 hotels + 2 trains + 3 tickets = 10. A normal trip hits the cap on day one; the biggest real trip has 15. Blocking a train ticket mid-trip abroad is the worst moment to say no. | Count only **reservations** (restaurants, tickets, activities, "other") toward the 10. Flights, trains, hotels and cars stay unlimited. Real max today is 6, so 10 stays generous. |
| R2 | Ben forwards his first trip's emails | Round-trip flight + hotel + 2 dinners = 5: the free allowance is gone after one trip, and the 6th email just bounces. | Keep 5 total, but **hold** the 6th+ email instead of rejecting it: reply "Saved. Upgrade to add it to your trip", show it in the app as "1 waiting", and import it automatically the moment they upgrade. Show "3 of 5 left" on the inbox card. |
| R3 | Lucas taps "+" on guide places in 3 cities | One-tap save creates an undated trip per city; with "2 upcoming trips" the 3rd city hits a paywall while just exploring (owner: exploring is fine). | **Undated trips don't count** toward the 2. The limit applies when a trip gets dates. |
| R4 | Priya, the day after her London trip ends | The trip locks the next morning, just when she needs the hotel invoice and confirmation numbers for expenses or a dispute. That feels punitive and invites bad reviews. | Lock **30 days after the trip ends**. In the last week show "Lisbon moves to your memories in 3 days. Keep it with Plus." Best upgrade moment of all. |
| R5 | Margaret opens a locked past trip | A blank lock wastes the "killer feature": nothing to want. | Tapping a locked trip opens the **recap teaser**: nights, bookings count, countries and badges visible, with the detail list blurred under "Unlock your trip history with Plus". **Share recap stays free**: every share advertises STT. |
| R6 | Jordan's group trip (free organiser, Plus friend, or the other way) | It isn't defined whose plan applies to a shared trip. | **Limits follow the trip owner's plan**: a Plus owner's trip is fully unlocked for every traveller. Allow free users to invite **editors** too: each invite is a likely new user, and couples plan together. |
| R7 | Free user already over a limit (lapsed Plus, or past cap from before launch) | | Nothing is hidden or deleted: existing items stay readable and editable; only adding more is blocked. Existing users get a **grandfather notice** in the app and by email before launch. |
| R8 | Anyone, any screen | There's no visible "membership" home. | Add a **First Class** row at the top of Profile (plan, renewal, founding badge, "Restore purchases") and a "Founding member" badge next to the Goose score. |
| R9 | Mai, at the airport with no signal | No offline mode yet (Phase 2 list). | Later, a strong Plus perk: **offline trip pack** (tickets, confirmations, maps). Not in this build. |

Smaller things seen on the walk (not paywall, fix alongside):
- Today header says "Granada" while the 07:05 train from Madrid hasn't left yet (header uses the night's city).
- Past-trip recap "Weather was –, Looking it up" never fills in (demo; check live).
- Site title still "Free AI Travel Planner" (`index.html`), see section 9.

Unchanged by the walk: guide, HONK, packing, phrasebooks and translate stay generous for free users (current
fair-use), Toolbox/SOS/documents free, Plus uncapped with the safety net.

**Owner decisions on R1–R9 (2026-10-22):** R1 yes, but **5** reservations per trip. R2 yes: save the email into
the trip (locked), alert in the app, reply to the sender about the free cap. R3 yes. R4 changed: free locks **the next
day**; Plus keeps past trips greyed/compact but always viewable. R5–R7 yes. R8: needs a better name than "First Class"
(options pending). R9 changed: **offline is a core capability for everyone**, planned as its own build.
Multi-city trip model is being reviewed separately (`multi-city-analysis.md` in the shared notes) and may change how
"upcoming trips" and "reservations per trip" are counted.

**Owner decisions (2026-10-22, later):** paid plan is named **First Class** (store products keep ids
`stt_plus_yearly` / `stt_plus_lifetime*`, display name "First Class"). Founders offer has no cap or end date.
**Multi-city trip fixes go before the paywall build** (see `docs/MULTI_CITY_PLAN.md`), because free limits count
trips and reservations per trip. Import of spreadsheets, PDFs and photos of handwritten agendas joins that work;
handwritten agendas are a First Class feature.
