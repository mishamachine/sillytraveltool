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
- **Supabase** (`swywrvbuswylvqlktsym`): migration `stripe_web_billing` applied; `billing` v3, `stripe-webhook` v5
  deployed through the Supabase MCP (the local CLI isn't logged in). Secrets: `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` (both **sandbox**), `APP_URL`.
- **Stripe sandbox** "Silly Travel Tool sandbox" (`acct_1UTTUsR315zoHnpn`):
  - product `stt_first_class`
  - prices `stt_first_class_yearly` (`price_1UTdLWR315zoHnpnFI8aGg87`) and `stt_first_class_lifetime_founding`
    (`price_1UTdLYR315zoHnpnPAooflyw`)
  - portal config `bpc_1UTdLhR315zoHnpnVGMVz3v6` (cancel at period end with reasons, card update, invoices, email/address)
  - webhook `we_1UTo8yR315zoHnpnfvqgc3qn` → `/functions/v1/stripe-webhook`, 18 events. Its signing secret is under
    Developers → **Workbench → Webhooks** (not Settings).
- **Not live:** the `/upgrade/` page. It ships with the next website deploy (Hostinger `dist/`, needs the owner's OK).
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
- The first webhook secret saved in Supabase was wrong, so every delivery got 400 "Bad signature". Check
  `stripe-webhook` logs first if rows stop arriving. Both functions trim whitespace from the secrets.
- Supabase MCP deploys: files go in as `source/index.ts` + `_shared/stripe.ts`, entrypoint `source/index.ts`.
- `billing` v3 was deployed before `customerRow` started writing `metadata`. The webhook's `customer.created` fills it,
  but redeploy `billing` with the current `_shared/stripe.ts` next time.
- The migration was renumbered from `140000` to `140100`, because `140000` is the cockpit's `stripe_metadata`.
- The restricted key needs: write customers, Checkout sessions, portal sessions; read prices, promotion codes,
  subscriptions, invoices, charges, payment intents (plus the cockpit's coupon/promotion-code writes).

## Next steps
1. Owner reviews and merges PR #1; remove the worktree.
2. Redeploy `billing` with the current `_shared/stripe.ts`.
3. Website deploy (owner OK) → signed-in end-to-end test on `/upgrade/`: yearly, portal cancel, lifetime, `?code=`,
   declined card, 3DS.
4. In the **web** app (not native), link limit hits and Settings to `/upgrade/?from=<trigger>`. PAYWALL_PLAN
   section 6 screens.
5. Server-side free-plan limits that call `entitlement()` (PAYWALL_PLAN section 4: trips, reservations, email imports,
   past trips).
6. `subscription_status` analytics from the webhook into `analytics_events`.
7. Have `admin-stripe` reuse `_shared/stripe.ts` mappers.
8. Go-live (owner): Stripe account activation (business, bank), live product/prices/portal/webhook recreated in live mode,
   live restricted key + webhook secret in Supabase, Stripe Tax decision, Terms/"free" copy, Supabase Pro.
