# Next session: start here (2026-10-22)

Read in this order: `CLAUDE.md` → `docs/HANDOFF.md` (dated updates at the top are newest) → `docs/brand/BRAND.md`.
Background reports: `docs/PHASE0_REPORT.md`, `docs/PHASE1_REPORT.md`, `docs/CLAY_REPORT.md`, `docs/TESTING_PASS.md`.

## Where things stand

- Phase 0 (security, AI model, stats/badges) and Phase 1 (cache lockdown, AI quotas, passport encryption,
  analytics/GA4/Sentry, restaurant reservations) are live on Supabase `swywrvbuswylvqlktsym`.
- Clay rebuild is done (tokens, custom icons, dark mode, 4 tabs). Testing-pass fixes are in.
- Website deploys over SSH (see HANDOFF "Website deploy"). Android test build 0.20.0 (versionCode 2) exists.
  iOS is waiting on Xcode.
- AI runs DeepSeek first with Gemini as the fallback (`supabase/functions/_shared/gemini.ts`). There are daily
  quotas for general AI and for guide pages.
- Inbound booking email is on: `RESEND_WEBHOOK_SECRET` is set (an unsigned POST returns 401).

## In flight elsewhere (don't collide)

- The **Clay rebuild session** is doing four owner-requested UI changes in Trip detail (Plan) and new-trip creation.
  Avoid those files until its commits land:
  - Trip ideas sit below confirmed bookings.
  - Ideas are grouped by type.
  - Booked and "not booked" items are much clearer apart.
  - The new-trip name field is editable and pre-filled with a suggestion.
- The owner's **User guide and tutorial video** session has uncommitted files: `public/help/`,
  `scripts/build-help.mjs`, `src/lib/helpContent.js`, `src/screens/profile/HelpView.jsx` and Profile edits,
  `video/`. Don't edit, stage or commit them.

## Open items

1. **Paywall: next up, plan first.** Present a plan with an approve option before any code (owner rule). Cover:
   - Free vs paid features.
   - Plans, prices and trial.
   - Stores and payments:
     - Google Play Billing on Android and App Store on iOS. A cross-platform layer such as RevenueCat is the usual
       choice.
     - Web checkout through Stripe or similar, with the store-policy limits on linking out.
   - An entitlement record in Supabase that Edge Functions check server-side (never trust the client). Tie it to
     the existing AI quotas, e.g. higher limits for paid users.
   - Restore purchases, cancellation and grace periods.
   - Paywall screens in Clay style: no emoji, custom icons, light and dark.
   - Analytics events through `track()`.
   - Testing with sandbox or test purchases.
   - Owner inputs needed: Play Console / App Store Connect products, RevenueCat or Stripe accounts, prices.
2. **Booking-email ingestion test.** 14 fixtures in `supabase/tests/fixtures/booking-emails.json`, ready-to-send
   `.eml` files in `supabase/tests/emails/`, and runner `scripts/test-email-ingest.mjs`. The owner's import address
   is `6370bcb1@bookings.sillytraveltool.com` (babar54). **Test with machinemisha@gmail.com → `391fa86a@…`.**
   - A send-capable Gmail connector is now available.
   - The owner earlier asked for these emails to be sent from their Gmail. Confirm before sending; it adds a test
     trip with 14 bookings to their real account.
3. **Owner actions still open:**
   - Leaked-password protection (Supabase → Auth).
   - Sentry DSN.
   - Supabase redirect URL `com.sillytraveltool.app://**` (unconfirmed).
   - The Empire of the Sun booking on "Trip to Bend" has no date. Duplicates were merged 2026-10-22, with a backup
     in `_cleanup_backup_20261021`, reason `bend_dedupe_20261022`.
4. **Phase 2 App Store readiness** (HANDOFF list):
   - Privacy Policy and Terms.
   - Server-side account deletion (the screen exists).
   - AI disclosure and report flow (check what's done).
   - Sign in with Apple.
   - Android App Links (https) to replace the custom scheme for invites.
   - Native Sentry check.
   - Push for flight changes, share sheet, offline.

## Working notes

- Tools live in user space, so put `~/.local/node/bin` and `~/.local/bin` on PATH.
- Use `~/.local/git/bin/git`, not `/usr/bin/git`: the latter is a Command Line Tools stub.
- `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`. Android emulator AVD: `STT_Pixel`.
  It's slow, because the API 37 image uses software rendering.
- Live production changes (migrations, Edge Function deploys) go through the Supabase MCP. Back up before data
  changes and commit the migration files.
- End every commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
