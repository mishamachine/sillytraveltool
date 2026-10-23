# Owner cockpit plan (2026-10-22)

Status: **approved 2026-10-23; step 1 built** (see HANDOFF). Supabase: on the free plan; move to Pro (daily backups, no pausing) before charging. Hostinger stays for static files only. Supersedes PAYWALL_PLAN section 11 (admin area inside the app).

The cockpit is a chief of staff for a one-person company, not a wall of charts. It opens on what needs the owner,
gives each area a verdict against a target, lets the owner act from the page, and writes the briefs.

## 1. Where and who
- **sillytraveltool.com/admin**: its own Vite entry (`admin.html`), its own bundle. Never shipped in the app or the
  Android/iOS build. Works on desktop (main use) and phone (Today, Members, approvals); can be added to the home screen.
- **Access:** STT sign-in + authenticator code (Supabase MFA, required), and the account must be in an `admins` table.
  All data comes from `admin_*` database functions (security definer) that first call `admin_guard()`: the caller
  must be in `admins` and the session must have passed MFA (`aal2`). The browser never reads tables directly.
  Anything that needs a secret (email, store APIs) goes through an Edge Function with the same check. `noindex`, no
  links from the site.
- **Audit log** (`admin_audit`): every member profile opened, every export, every action, with time and what changed.
- **In the app too, simplified ("Owner" view):** Profile → Owner, shown only to admins, loaded as a separate chunk so
  travellers never download it. One screen: Pulse (today vs typical), Needs you (done / snooze), today's brief, the
  live test, and alerts. Look up a member by name or email (summary card only). Approve or decline pending actions.
  Everything else is a link to the full cockpit. Same `admin-*` functions, same MFA rule. Profile files are being
  edited by the user-guide session, so this lands after that work is committed.

## 2. Layout (UX)
Left rail on desktop, bottom bar + "More" on phone. **7 tabs**, ordered by how often a solo owner needs them:

| Tab | Question it answers | Sections |
|---|---|---|
| **Today** | What needs me right now? | Needs you (priority list) · Pulse strip · Today's brief · Live test card · Alerts |
| **Members** | Who are my people and what are they doing? | Member list · Segments · Member profile · Lifecycle board |
| **Product** | What gets used, what doesn't, what breaks? | Feature usage (most/least) · Screens and time · Free vs First Class · Errors in the app |
| **Growth** | Where do people come from and where do they drop? | Funnel · Retention cohorts · Acquisition (sources, UTM campaigns) · Social (Instagram, Facebook, TikTok) |
| **Experiments** | What am I testing and what did I learn? | Live test · Up next · Archive (every past test + learning) |
| **Money** | Am I making more than I spend? | Revenue · Plans and founders sold · Churn and renewals · Costs (AI, Google, hosting) · Unit economics |
| **System** | Is everything healthy? | Edge Function errors and latency · AI provider fallbacks · Releases (web, Android, iOS) · Quotas and flags · Audit log · Settings |

Shared on every tab:
- **One filter bar:** date range, compare to (previous period / same period last year), platform, plan, segment,
  "exclude internal" (on by default). Held in the URL so any view can be bookmarked or shared with Claude.
- **Refresh cadence:** live 30 s / 5 min / hourly / paused, per tab, remembered.
- **Every module card** has: the number, the target, a verdict (on track / watch / off track) and one line of why.
  Click → full-page detail with breakdowns (group by any dimension), period comparison, drill to the member list
  behind any number, **CSV export**, and **Ask** (plain-English question answered from the data, with the query shown).
- **Command bar (Cmd-K):** jump to a member, a tab, a test; ask a question; start an action.
- Small-number honesty: below 30 people a card shows counts and names ("these 4 members"), not percentages.

## 3. Today
- **Needs you:** a ranked list, the cockpit's front page. Items come from **rules first** (thresholds you set,
  week-over-week anomalies, no test running, a test reaching its sample, abuse flags, failed payments, a release
  stuck in review), ranked by estimated impact; Goose writes the one-line explanation and suggests the action.
  You can add your own items, and mark each done / snooze / delegate to Claude. History is kept.
- **Pulse strip:** online now, sign-ups, activated, revenue, AI + Google cost, errors, all for today vs typical.
- **Briefs:** daily (morning), weekly (Monday), monthly (1st). What changed, why, what to do; links into the views.
  Generated once by an Edge Function and **stored permanently** (`admin_briefs`), with an archive. Optional email copy.

## 4. Members (traveller CRM)
Members are travellers, not SaaS seats: going quiet between trips is normal, so the stages follow the trip cycle.

- **List:** name, email, joined, source (first UTM / referrer), platform, plan, trip stage, next trip date, trips per
  year, traveller type, affluence band, home market, tags. Sort, filter, save as a segment.
- **Trip-cycle stages (automatic):**
  - **New:** signed up, no trip yet.
  - **Dreaming:** has a trip with no dates, or with dates more than 60 days away.
  - **Planning:** next trip 8–60 days away.
  - **Getting ready:** next trip within 7 days.
  - **On the road:** inside a trip's dates.
  - **Just back:** 0–14 days after a trip. This is the moment for a recap, a share or a review ask.
  - **Between trips:** nothing planned and still inside their own normal gap. Healthy, not churn.
  - **Lapsed:** no trip planned and quiet for more than twice their own gap between trips (12 months for one-trip
    members, 6 months for new members).
  - **Gone:** account deleted or unsubscribed from everything.
  - The board view shows how many people moved between stages each week. "At risk" means a stage that's later than
    the member's own rhythm, not 14 quiet days.
- **Profile:** trip history (dates, countries, cities, trip type), stage history, segments, affluence band with
  confidence, plan history, emails we sent and opens, your notes and tags, abuse flags, activity timeline. **No booking
  contents** (confirmation numbers, passenger names, addresses, seats) ever reach the cockpit.
- **Actions** (each confirmed, logged): email one member or a segment (Resend, from your words or a draft you approve),
  give First Class free, suspend / clear, export their data, delete on request.
- Opted-out members still appear (account data) but have no behaviour timeline.

## 4a. Traveller segments and the audience profile
Built nightly into `member_profile` (one row per member, derived, rebuildable) and `audience_daily` (aggregates for
marketing). Segments any filter can use:

| Segment | Built from |
|---|---|
| Traveller type: solo, couple, family, group | party size, ticket quantity, travellers on the trip, "kids" signals (child fares, family rooms) |
| Trip style: city break, multi-city, long-haul, road trip, rail, beach, business-like | trip stops, length, distance, transport modes, weekday-only short trips with no activities |
| Rhythm: trips per year, typical gap, typical length, season | trip dates |
| Planning style: early planner, last-minute | days between creating a trip / booking and leaving; ideas saved |
| Where: home market, top regions, repeat countries, first-time vs returning to a country | home city, stops |
| How they book: direct, OTA (Booking.com, Expedia), airline, through email import | sender domain of imported emails, `bookings.source` |
| Loyalty: programmes and tiers held | `loyalty_cards` (program + tier only) |
| What they use STT for: organiser, explorer (guides, HONK), linguist, group planner | feature usage |
| Influence: invites sent, invites accepted, recaps shared | collaborators, share events |
| **Affluence band** | below |

**Affluence band (Value / Comfort / Premium / Luxury), each with a confidence level:**
- **Signals, strongest first:**
  1. Cabin class, mapped from free text to five fare tiers: basic economy, economy, premium economy, business,
     first. Live data: 18 of 19 flights have it; the cheapest fares are clearly marked ("Economy Basic", "Light (E)").
  2. Hotel nightly rate in USD per room, adjusted for the destination's cost level.
  3. Hotel star rating.
  4. Status tier with airlines and hotels.
  5. Room type (suite, club, villa).
  6. Low-cost airline vs full-service airline.
  7. Restaurant price level.
  8. How often they travel and how far.
- **What we have today:** price is on only 5 of 19 flights and 3 of 7 hotels. There's no star rating column. So import
  needs to capture more:
  - **Parser additions:** star rating, total price and nightly rate, currency with the exchange rate on the booking
    date, booking channel, refundable or not, and a normalised fare tier.
  - **Asking travellers:** nothing new to type. Optional fields stay optional.
- **Rules:**
  - The band is for understanding the audience, writing messages and choosing partners.
  - It is never shown to the traveller and never used to change prices or limits.
  - Marketing views show it in aggregate only.
  - The member profile shows it with its signals so you can see why.
- **Google terms:** Places content (price level, rating) can't be stored long-term against a member. Use our own
  booking fields; Google data is read live and never saved into `member_profile`.

**Marketing uses:** who to email for which offer (e.g. "Just back, multi-city, Premium" → recap + First Class),
lookalike descriptions for ads, partner and affiliate pitches ("38% of members fly premium economy or above"), content
ideas by trip style and region, and timing (send when people are Dreaming or Planning, not On the road).

## 4b. Membership, codes and moderation (support console)
Run it like a support desk: every action has a reason, a note, a record, a way back, and shows its impact before you
confirm.

**Roles** (`admins.role`): **owner** can do everything. **support** can add notes, send warnings, give First Class
for up to 30 days, and suspend for up to 7 days. **analyst** is read-only and sees masked emails. Today it's only you;
the roles are there so a helper never needs the owner's powers.

**Membership per member** (Members → profile → Membership):
- **Shows:** current plan and where it comes from (App Store, Play, web, code, or given by you), renewal or end date,
  every grant and code used, and refunds.
- **Actions:**
  - Give First Class for N days, until a date, or for life.
  - Extend or end a grant you gave.
  - Every action needs a reason (support goodwill, bug compensation, partner, influencer, press, beta tester,
    correction, other) and a note. You can also email the member.
- **Grants live in `entitlement_grants`:** many rows per member, never edited, only ended. `entitlement(user)` =
  First Class when a store subscription or a grant is live.
- **Store subscriptions belong to Apple and Google.** They're shown read-only with a link to the RevenueCat customer.
  - Refunds: web (Stripe) and Play can be refunded through RevenueCat. Apple refunds can only be requested by the
    member, from Apple.
  - Until the paywall ships, grants are recorded correctly but unlock nothing.

**Codes** (Money → Codes):
- **Types:**
  1. **First Class codes:** free First Class for N days or for life. They work as soon as we save them.
  2. **Discount codes:** percent or amount off yearly or lifetime, for the first payment or every renewal. These are
     carried out per store: Stripe promotion codes on the web, App Store offer codes, Play promo codes. We create
     and track them here now, and they go live when the paywall does.
- **Options:**
  - One shared code (GOOSE20) or a batch of single-use codes (for partners and influencers, with a CSV export).
  - Who can use it: anyone, new members only, one named member, or a saved segment.
  - Limits: total uses, uses per member (default 1), and start and end dates.
  - Which plans it applies to, a campaign tag (links to UTM campaigns and experiments), and an internal note.
  - Status: active, paused, ended, archived. Pausing stops new uses and keeps the uses already made.
- **Where members redeem:** on the website (Profile → Redeem a code, and sillytraveltool.com/redeem). Apple and
  Google don't allow unlocking paid features with our own codes inside their apps, so the apps link to the website. The
  First Class it unlocks then appears on every device.
- **Rules:**
  - Codes are case-insensitive and avoid look-alike characters (0/O, 1/I).
  - 5 failed attempts per hour per member, so codes can't be guessed.
  - A First Class code adds time after any grant the member already has. A paying member is told they already have
    First Class, and the attempt is recorded.
  - You can end one member's use of a code (with a reason) without touching anyone else.
- **Reports, per code and per campaign:**
  - Attempts (valid and invalid), uses and unique members over time.
  - Still on First Class, and how many paid after their free time ended.
  - Revenue from code users, cost of the discount, and retention compared with other members.

**Moderation** (Members → profile → Account status). A ladder; each step is chosen with a reason (spam or automation,
AI abuse, fraud or chargeback, harassment through invites, scraping, Terms violation, at member's request, other), an
internal note, an optional message to the member from a template, and a length:
1. **Note:** internal only.
2. **Warning:** email sent, recorded.
3. **Restricted:** AI features, email import and invites are off; their trips stay readable. Checked server-side in
   the Edge Functions.
4. **Suspended until a date:** can't sign in (`auth.users.banned_until`), every session is signed out at once, and
   it lifts automatically.
5. **Banned:** permanent, signed out at once. Signing up again with the same email (case and Gmail dots/+tags
   ignored) is blocked.

- **Before you confirm, you see the impact:**
  - Whether they pay, and through which store. A store subscription keeps billing until the member cancels; refunds
    are handled as above, and the Terms must allow ending accounts for abuse.
  - How many shared trips they own and how many travellers are on them. Those travellers keep read access, because
    they're customers too. The member's pending invites are cancelled.
- **Lifting:** lifting or shortening any step needs a reason too. History is kept forever.
- **Safety:** you can't ban yourself or another owner. Data is never deleted by a ban; deletion is only on request.

**Support tools in the profile:** account facts (sign-in method, verified, last sign-in, platform and app version),
pinned notes, tags, emails sent, data export (JSON), and deletion on request (scheduled with 7 days to cancel).

## 5. Product
- **Feature usage, most to least:** users, uses, % of active users, trend. **Measured against exposure** (how many saw
  the entry point), so a buried feature isn't mistaken for an unwanted one.
- **Screens and time:** views, unique users, **active time** per screen and per session, top paths, exit screens.
- **Free vs First Class:** usage, retention and time side by side; also the same members before vs after upgrading,
  which is the fairer comparison.
- **Errors:** app errors by type, screen, version and platform; members affected; trend since each release.

## 6. Growth
- **Funnel** (editable steps): visited site → signed up → created a trip → added a booking → came back in week 1 →
  saw paywall → started checkout → bought. Per platform, source, campaign, test variant.
- **Retention:** weekly cohort grid, week-1 / week-4 return, stickiness (DAU / MAU).
- **Acquisition:** sources and UTM campaigns followed through to sign-ups, activation and revenue (not just clicks).
  Campaign link builder with saved UTMs.
- **Social:** followers, reach, engagement, top posts and link clicks per channel; scheduled posts. Publishing and
  scheduling through Postiz; performance from Postiz analytics where it has them, Meta Graph API and TikTok API where not.

## 7. Experiments (always one running)
- **Live test card:** hypothesis, variants, primary metric + a guardrail (e.g. conversion up, refunds not up), traffic
  split, people per arm, **chance each variant is best**, and **days to a result at current traffic**.
- **Rules:** one test per surface at a time; a test can't start unless it can finish within 6 weeks at current traffic
  (the page shows the required sample before launch); stopping early needs a reason. When a test ends, "no test
  running" goes to the top of Needs you with the next test from **Up next**.
- **Archive:** every test with dates, numbers, decision (shipped / dropped / inconclusive) and the learning, searchable.
- **Engine:** `experiments`, `experiment_assignments` (sticky per member, or per device before sign-up),
  `useVariant('key')` in the app and website; exposure logged once per person.

## 8. Money and System
- **Money:** revenue (web / Play / App Store), yearly vs lifetime, founders sold (to decide when to end the offer),
  renewals, cancellations, refunds, paywall funnel by trigger. **Costs:** AI calls by provider and feature, Google calls
  by endpoint, hosting; cost per active member and per paying member; margin. Controls: founders offer on/off,
  free-plan limits, cost kill switch (confirmed, logged).
- **System:** Edge Function errors and slow calls, DeepSeek → Gemini fallbacks, quota hits, Sentry issues, release
  versions in use, abuse flags.

## 9. Critical assessment (product manager)
1. **Volume is the real constraint.** Live today: 15 members, 3 active in 30 days, 9 sessions. Most charts will be
   noise for months, so the cockpit leans on Members, Needs you and small-number honesty. Conversion tests inside the
   app can't reach a result yet: lifting a 5% conversion to 7.5% needs about 1,500 people per variant. Early tests
   should run where the traffic is (website and store listing) and test big changes, not button colours. The
   "days to a result" estimate stops tests that would take a year.
2. **Session time is wrong today.** The data says 67 minutes average because an idle open tab counts. Fix: an
   active-time event (visible tab, input in the last 60 s), with time per screen.
3. **Free vs First Class is self-selected.** Paying members were more engaged before paying, so the side-by-side shows
   correlation. The before/after view of the same members is the honest one; the page labels which is which.
4. **"Least used" needs exposure data,** or the cockpit will tell you to cut features nobody can find.
5. **Errors are under-counted.** Today only signed-in, opted-in app errors are stored; Edge Function errors aren't
   kept at all and Sentry is off. Add a server-side `function_errors` log and turn Sentry on.
6. **Top of funnel is invisible.** Signed-out visitors never reach `analytics_events`; website visits and sources need
   the GA4 Data API (a service-account key the owner creates in Google Cloud).
7. **Dirty data.** One member logged 154 sign-ins in one hour on 22 Oct (the old double-fire bug), and the owner's
   and test accounts are in the numbers. "Exclude internal" is on by default; known bad rows are filtered.
8. **AI priorities can turn into noise.** Rules decide what goes on the list; AI only explains it. Each rule has a
   threshold you can tune or mute.
9. **The CRM holds personal data.** Required authenticator code, an audit log of every profile view, no booking
   contents, and a line in the privacy page about internal account review.
10. **Actions with a wide blast radius** (emailing a segment, changing limits, kill switch) always show who is
    affected and need a confirm; changes are logged and reversible where possible.
11. **Dependencies.** Money, Free vs First Class and paywall tests need the paywall (RevenueCat entitlements) first.
    Build those parts to show "not live yet" until then.
12. **"Track everything" needs a boundary.** Track every product interaction, and derive as much as we like from
    bookings people give us. The line is consent and disclosure. Profiling (segments, affluence) goes in the privacy
    page with a right to object. Marketing emails need opt-in in the EU, UK and Canada; today there's no
    `marketing_opt_in` field or unsubscribe flow. Sending member lists to ad platforms (Meta / TikTok custom audiences)
    counts as "sharing" under California law and as "tracking" on Apple's privacy label. Keep segments first-party
    unless you decide otherwise.
13. **Cut on purpose:** live session replay, heatmaps, a built-in social post editor (Postiz does it), custom
    dashboard builder, real-time map. Each costs a lot and wouldn't change a decision at this size.

## 9a. Build our own CRM or use HubSpot?
Recommendation: **build the traveller views ourselves, send through Resend, don't use HubSpot.**
- **The part worth having is the traveller intelligence:** trip stages, segments and affluence. No CRM has it. It's
  queries over data already in Supabase, so there's nothing to sync and no second copy of personal data. The "basic
  CRM" parts (notes, tags, saved segments, email log) are four small tables.
- **HubSpot is built for B2B sales.** It's organised around deals, pipelines and sales reps. To use it we'd have to
  push members and trip data into it, add it to the privacy page and sign a data processing agreement, and its
  marketing tier gets more expensive as contacts grow. It would still not understand a trip.
- **Sending:** Resend is already set up, with the domain verified. It handles audiences, broadcasts and unsubscribes
  for one-off sends. Trip-triggered emails ("trip in 7 days", "just back") run from our own Edge Functions, because
  they're product emails anyway.
- **When to revisit:** once there are about 2,000 or more members, or you want a visual journey builder. Then look at
  Customer.io or Loops (consumer lifecycle tools), fed from `member_profile`, not HubSpot.
- **Can one person and Claude keep it good?** Yes, if the scope stays as above. The hard parts are data quality and
  consent, and a bought tool doesn't fix either. The nightly rebuild means a wrong rule is fixed once and everything
  recomputes.

## 10. Build order
1. **Foundation:** `admins`, MFA, audit log, `admin-*` functions, `/admin` shell with the 7 tabs, filter bar, cadence,
   export, Cmd-K. Tracking fixes: active time and time per screen, feature exposure, first-touch UTM at sign-up,
   `function_errors`, internal-member flag.
2. **Today** (rules-based Needs you, Pulse) + **Members** (trip-cycle stages, segments, `member_profile`) + **Product**.
   Parser additions for the affluence signals (fare tier, stars, nightly rate, channel); `marketing_opt_in` +
   unsubscribe. In-app Owner view once the user-guide session's Profile edits are committed.
3. **Growth** (funnel, cohorts, GA4 visits, UTM) + **System**.
4. **Experiments** engine + tab (first test runs on the website).
5. **Briefs** (daily / weekly / monthly, stored) + AI explanations and **Ask**.
6. **Money** (when the paywall is live) + **Free vs First Class**.
7. **Social** (Postiz, Meta, TikTok).

Each step is built and tested here (`npm run build`, browser at desktop and phone size, screenshots), then deployed.

## 11. Owner set-up (when we reach that step)
Authenticator app for MFA · GA4 service-account key (step 3) · Sentry DSN · Postiz API key · Meta Business account
linked to a Facebook Page and Instagram professional account · TikTok developer app (review takes a few days).
