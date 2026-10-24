# Owner to-do (running list)

Kept by the **owner-todo** session. Tick an item (`[x]` + date) here or in the checklist artifact, or just tell the
owner-todo session it's done: it updates both and tells whichever session is waiting on it.
Checklist artifact: https://claude.ai/artifact/DRNKdNfMLMjfR2zDabz4v8 (collection `todos`, one doc per item).
Other sessions: send new owner items to the owner-todo session rather than editing this file.
Format: what to do · where · what Claude does once it's ticked.

## Review & merge
- [ ] **Review and merge PR #5** (launch readiness: Sentry, account deletion, Apple button, Terms/meta copy, checkout
  methods) · https://github.com/mishamachine/sillytraveltool/pull/5 · Claude deploys the website from main (backup +
  dry run first).
- [ ] **Confirm the Terms choices in PR #5:** governing law = State of Washington; 14-day refund on website purchases
  · PR #5 → `public/terms/` · Claude adjusts the wording if you pick differently.

## Apple
- [ ] **Apple Developer Program + App Store Connect:** enroll, sign the Paid Apps agreement, fill in tax and bank
  forms · developer.apple.com, appstoreconnect.apple.com → Business · Claude sets up signing and TestFlight for
  `com.sillytraveltool.app`.
- [ ] **App Store products:** `stt_first_class_yearly` (auto-renewing subscription, $14.99/yr) and
  `stt_first_class_lifetime_founding` (non-consumable, $29.99) · App Store Connect → the app → Monetization · Claude
  maps them in RevenueCat and runs a StoreKit sandbox purchase.
- [ ] **Sign in with Apple:** create a Services ID (e.g. `com.sillytraveltool.web`) with Sign in with Apple, return URL
  `https://swywrvbuswylvqlktsym.supabase.co/auth/v1/callback`, and a Sign in with Apple key (.p8); then Supabase →
  Authentication → Providers → Apple: on, client IDs `com.sillytraveltool.app,<services id>`, team ID, key ID, .p8 ·
  developer.apple.com → Identifiers / Keys; Supabase dashboard · the button appears by itself; Claude tests Apple
  sign-in on web and iOS.

## Google Play
- [ ] **Play Console:** developer account, payments profile, tax and bank forms · play.google.com/console · Claude
  uploads the first signed build to internal testing.
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
- [ ] **Real store SDK keys** (iOS `appl_…`, Android `goog_…`) shared with Claude before any release build (the Test
  Store key crashes release builds) · RevenueCat → API keys · Claude puts them in the builds.

## Stripe go-live
- [ ] **Activate the Stripe account:** business details, bank account, identity · dashboard.stripe.com → Activate ·
  Claude recreates the product, both prices, portal and webhook in live mode and sets the live key + webhook secret in
  Supabase.
- [ ] **Sales tax decision:** register where needed or stay on threshold monitoring · Stripe → Tax · Claude turns on
  Stripe Tax in Checkout if you choose to collect.
- [ ] **Stripe key permission:** if the key in Supabase is a restricted key, give it "Subscriptions: write" (the live
  key too) · Stripe → Developers → API keys · account deletion then cancels web subscriptions itself (otherwise it
  raises a cockpit task to cancel by hand).

## Legal & copy
- [ ] **Business address:** get a PO box or virtual business address to replace the home address on the privacy and
  terms pages · any mailbox provider · Claude swaps it into `public/privacy/` and `public/terms/` and deploys.

## Accounts & settings
- [ ] **Leaked-password protection:** one toggle · Supabase → Authentication → Attack Protection · nothing further.
- [ ] **Supabase Pro plan** before launch · Supabase → Billing · nothing further.
- [ ] **Supabase CLI access:** run `supabase login` once in Terminal, or create a token (Supabase → Account → Access
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
- **PR #5 merged →** deploy the website from main (backup + dry run).
- **Stripe activated →** live product, prices, portal, webhook, keys; one real purchase + refund to confirm.

## Done
_(ticked items move here with the date)_
