# Owner to-do (running list)

Kept by the **owner-todo** session. Tick an item (`[x]` + date) here or in the checklist artifact, or just tell the
owner-todo session it's done: it updates both and tells whichever session is waiting on it.
Checklist artifact: https://claude.ai/artifact/DRNKdNfMLMjfR2zDabz4v8 (collection `todos`, one doc per item).
Other sessions: send new owner items to the owner-todo session rather than editing this file.
Format: what to do · where · what Claude does once it's ticked.

## Review & merge
- [ ] **Beta links (2026-10-25):** (1) approve hosting the Android APK in the public `releases` bucket (the session's
  temporary insert policy was refused by the permission check; or upload `SillyTravelTool-0.20.0-5-beta.apk` yourself in
  Supabase → Storage → releases) · Claude then sets `android_url` + `show_android` · the GitHub artifact copy expires about
  2026-11-01. (2) When Apple approves build 0.20.0 (5), run the one-line `show_ios` SQL in `docs/HANDOFF.md` ("Beta links").
  Note (2026-10-29): the Play closed beta is now in review and may replace (1); decide which route you want.
- [x] **Confirm the Terms choices in PR #5:** governing law = State of Washington; 14-day refund on website purchases
  · PR #5 merged 2026-10-24 (`aad8a07`), Terms live with section 8 "Plans and payments". A lawyer's read of the Terms is still open.

## Apple
- [x] **Apple Developer Program + App Store Connect:** enroll, sign the Paid Apps agreement, fill in tax and bank
  forms · developer.apple.com, appstoreconnect.apple.com → Business · Claude sets up signing and TestFlight for
  `com.sillytraveltool.app`. Done by 2026-10-25: enrolled as Individual (team RG3Y77A9ZZ), Paid Apps Agreement, bank and W-9
  active (`docs/APP_REVIEW_CHECKLIST.md`), TestFlight build approved. Individual → Organization is a separate open item below.
- [x] **App Store products:** `stt_first_class_yearly` (auto-renewing subscription, $14.99/yr) and
  `stt_first_class_lifetime_founding` (non-consumable, $29.99) · App Store Connect → the app → Monetization · Claude
  maps them in RevenueCat and runs a StoreKit sandbox purchase. Both products exist with 175 territories, prices and review
  screenshots (`docs/APP_REVIEW_CHECKLIST.md`); the RevenueCat mapping is still open under RevenueCat below.
- [ ] **Sign in with Apple:** create a Services ID (e.g. `com.sillytraveltool.web`) with Sign in with Apple, return URL
  `https://swywrvbuswylvqlktsym.supabase.co/auth/v1/callback`, and a Sign in with Apple key (.p8); then Supabase →
  Authentication → Providers → Apple: on, client IDs `com.sillytraveltool.app,<services id>`, team ID, key ID, .p8 ·
  developer.apple.com → Identifiers / Keys; Supabase dashboard · the button appears by itself; Claude tests Apple
  sign-in on web and iOS.

- [ ] **TestFlight link on /beta:** once Beta App Review approves build 0.20.0 (5), paste
  https://testflight.apple.com/join/rFv9QAA4 into Cockpit → Growth → Beta waitlist as the iOS link (the link exists, limit
  raised to 1,000; it only works after approval) · Claude can do it when you say so.
- [ ] **Submit the App Store version 0.20.0:** everything else is filled, iPad screenshots included. (1) Set a password on
  machinemisha@gmail.com, then App Store Connect → the app → iOS 0.20.0 → App Review Information: tick Sign-in required, type the
  email and password, Save. (2) "Add for Review" with both in-app purchases, then "Submit for Review" · appstoreconnect.apple.com ·
  Claude updates HANDOFF with the review state. (Build 6 is the attached build; see HANDOFF "App Store version 0.20.0".)

## Google Play
- [x] **Play phone verification** done 2026-10-27; app and closed track "Closed beta" created (see HANDOFF). This closes the
  2026-10-25 "waiting on Google's identity check" note and the package-id question: the app was created with `com.sillytraveltool.app`.
- [ ] **Back up** `~/.stt/upload-keystore.jks` and `~/.stt/keystore.env` (Play app signing keeps the upload key recoverable only
  via support).
- [x] **Play app content and review** submitted 2026-10-27 08:50 UTC: Sign in details (machinemisha reviewer account,
  lifetime First Class grant), Content rating (IARC: Everyone / PEGI 3 / USK all ages / 3+ / Brazil 14+), Target audience
  18+, Data safety, then Publishing overview → "Send 15 changes for review". Dashboard shows **In review**.
- [ ] **After Google approves the closed test:** copy the join link from Closed beta → Testers, put it in `app_settings.beta`
  (android_url, show_android = true) and on /beta. Production needs 12 opted-in testers for 14 days first.
- [ ] **Search Console:** verify https://bbprojectfactory.com/ (the developer-account website) or switch it to
  https://sillytraveltool.com/.
- [ ] **Play products:** `stt_first_class_yearly` (subscription, $14.99/yr) and `stt_first_class_lifetime_founding`
  (one-time product, $29.99) · Play Console → the app → Monetize · Claude maps them in RevenueCat and runs a Play
  internal-testing purchase.

## RevenueCat
- [ ] **Map store products** to entitlement `silly_travel_tool_pro` (offering packages Annual + Lifetime) and set the
  Test Store prices to $14.99 / $29.99 · app.revenuecat.com → Product catalog · Claude re-runs the paywall checks.
- [ ] **Server keys:** Supabase secrets `REVENUECAT_API_KEY` (secret v1 key) and `REVENUECAT_WEBHOOK_SECRET`; RevenueCat
  webhook → `https://swywrvbuswylvqlktsym.supabase.co/functions/v1/store-webhook` with that secret as the
  Authorization header · Supabase → Edge Functions → Secrets; RevenueCat → Integrations → Webhooks · Claude tests a
  purchase end to end (store → webhook → `store_entitlements`).
- [ ] **If the secret key is V2** (Customer information: Read only), send Claude the RevenueCat project ID ·
  RevenueCat → Project settings · Claude switches `store-webhook` to the V2 API.
- [ ] **Real store SDK keys** (iOS `appl_…`, Android `goog_…`) shared with Claude before any release build (the Test
  Store key crashes release builds) · RevenueCat → API keys · Claude puts them in the builds.

## Legal & copy
- [ ] **B&B Project Factory: finish the entity switch (added 2026-10-27):** the company was set up on 2026-10-27 but
  its legal registration is still pending, so the repo says "B&B Project Factory" with no entity suffix. Once it
  completes: (1) add the suffix to `public/privacy/`, `public/terms/`, `public/delete-account/`, the email footer
  (`supabase/functions/_shared/emailTemplate.js`), `index.html` and the © lines; (2) Stripe business profile (name,
  tax ID, bank); (3) Google Play payments profile and developer legal name; (4) Apple agreements, tax and banking;
  (5) decide whether to convert the Apple Individual enrollment to an Organization (needs a D-U-N-S number) so the
  App Store "Seller" line reads B&B Project Factory · Claude does the repo part and `BRAND.md` if it names the owner.
- [ ] **Business address:** get a PO box or virtual business address to replace the home address on the privacy and
  terms pages · any mailbox provider · Claude swaps it into `public/privacy/` and `public/terms/` and deploys.

## Accounts & settings
- [ ] **Leaked-password protection:** one toggle · Supabase → Authentication → Attack Protection · nothing further.
- [x] **Supabase CLI access (done 2026-10-25, HANDOFF "Edge Functions deployed from the repo with the CLI"):** run `supabase login` once in Terminal, or create a token (Supabase → Account → Access
  Tokens) and put it in `.env.local` as `SUPABASE_ACCESS_TOKEN` · Claude deploys Edge Functions straight from the repo.
- [ ] **Google's real bill (later):** Cloud Billing → BigQuery export (dataset `stt_billing`), a service account with
  BigQuery Data Viewer + Job User, Supabase secrets `GCP_BILLING_SA` (JSON key) + `GCP_BILLING_TABLE` · Google Cloud
  console; Supabase secrets · Claude builds the reader for the Money tab.

## Store forms
- [ ] **Store privacy forms:** paste `docs/STORE_PRIVACY_FORMS.md` into Play Console (Data safety) and App Store
  Connect (App Privacy) once the accounts exist; decide the items marked (check). Play deletion URL:
  `https://sillytraveltool.com/delete-account/` · Play Console → App content; App Store Connect → App Privacy ·
  Claude checks the answers match the app.

## Claude does when unblocked
- **RevenueCat ticked →** (you're generating the V1 secret key now) once the secrets and webhook are set, send a
  RevenueCat test event, then merge PR #3 (iOS, `claude/objective-ptolemy-052302`) and any RevenueCat commits on
  `feat/first-class-paywall` not yet in main, swap in the real store keys, run the iOS and Android cloud checks.

## Done
- [x] **App Store listing for 0.20.0** · 2026-10-25 · metadata, age rating (13+), content rights, $0 price in 175 countries, iPhone
  screenshots, build 6 (replaced build 5 on 2026-10-26), review contact and notes, both products' review screenshots (HANDOFF
  2026-10-25, asc-submission). Reviewer sign-in still open (above).
- [x] **Stripe go-live** · 2026-10-25 · account activated, tax = threshold monitoring, restricted live key (incl.
  Subscriptions: write) + webhook secret in Supabase; live product/prices/portal/webhook; real $14.99 purchase + refund
  passed (HANDOFF 2026-10-25).
- [x] **Supabase Pro plan** · 2026-10-25.
- [x] **Review and merge PR #5** (launch readiness) · 2026-10-24 · merged as `aad8a07`; website deployed from it
  (backup `stt-202610240302-pre-launch-readiness.tar.gz`).
