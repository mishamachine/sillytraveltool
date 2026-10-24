# Owner to-do (running list)

Kept by the **owner-todo** session. Tick an item (`[x]` + date) here or in the checklist artifact, or just tell the
owner-todo session it's done: it updates both and tells whichever session is waiting on it.
Checklist artifact: https://claude.ai/artifact/DRNKdNfMLMjfR2zDabz4v8 (collection `todos`, one doc per item).
Other sessions: send new owner items to the owner-todo session rather than editing this file.
Format: what to do · where · what Claude does once it's ticked.

## Apple
- [ ] **Apple Developer Program + App Store Connect:** enroll, sign the Paid Apps agreement, fill in tax and bank
  forms · developer.apple.com, appstoreconnect.apple.com → Business · Claude sets up signing and TestFlight for
  `com.sillytraveltool.app`.
- [ ] **App Store products:** `stt_first_class_yearly` (auto-renewing subscription, $14.99/yr) and
  `stt_first_class_lifetime_founding` (non-consumable, $29.99) · App Store Connect → the app → Monetization · Claude
  maps them in RevenueCat and runs a StoreKit sandbox purchase.

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

## Legal & copy
- [ ] **Business address:** get a PO box or virtual business address to replace the home address on the privacy and
  terms pages · any mailbox provider · Claude swaps it into `public/privacy/` and `public/terms/` and deploys.

## Accounts & settings
_(more items coming from the main session: Sentry / Supabase settings, store privacy forms, Sign in with Apple setup)_

## Claude does when unblocked
- **RevenueCat ticked →** merge PR #3 (iOS, `claude/objective-ptolemy-052302`) and any RevenueCat commits on
  `feat/first-class-paywall` not yet in main, swap in the real store keys, run the iOS and Android cloud checks.
- **Stripe activated →** live product, prices, portal, webhook, keys; one real purchase + refund to confirm.

## Done
_(ticked items move here with the date)_
