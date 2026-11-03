# Next session: start here (2026-10-22)

> **Partly historical (written 2026-10-22).** The to-do lists below predate the Stripe, store and Play work. For current state read `docs/HANDOFF.md` (newest entries on top) and `docs/OWNER_TODO.md`. The working notes at the bottom are still useful.

Read in this order: `CLAUDE.md` → `docs/HANDOFF.md` (dated updates at the top are newest) → `docs/brand/BRAND.md`.
Background reports: `docs/PHASE0_REPORT.md`, `docs/PHASE1_REPORT.md`, `docs/CLAY_REPORT.md`, `docs/TESTING_PASS.md`.

## Current list (29 Oct 2026)

**a. App Review readiness and the staged deploy of the two draft PRs**
- #56 (AI consent, guideline 5.1.2(i)) and #57 (invite hardening). Deploy order and checks:
  `docs/CONSENT_AND_INVITES_RUNBOOK.md`. Current heads: see the PRs.
- #56: migrations, website, native 0.20.1 build, then the enforcing functions LAST (once 0.20.1 is live on both stores).
- #57: migration `20261029120000`, then `send-invite`, `accept-invite`, `receive-booking-email`, then the website LAST.
- App Review checklist: `docs/APP_REVIEW_CHECKLIST.md`. State of production: top of `docs/HANDOFF.md`.

**b. Owner decisions pending**
- Inbox sender check: the code is on `main` but the deployed function (v56) predates it.
- Viewer redaction of booking details (confirmation numbers are visible to all accepted members).
- Remaining items from the invite review, L5 and L7 (L5 is covered by the #57 migration; L7 is not defined in this repo).

**c. Build 6 (0.20.1)**
- Waits on the consent PR (#56). Then: version bump, native build for iOS and Android, TestFlight and Play upload,
  and the iPad screenshot 5 swap (Travel documents screen). See `docs/NATIVE_RELEASE.md`.

**d. Items not yet logged elsewhere (from `docs/OWNER_TODO.md`)**
- Store privacy forms (`docs/STORE_PRIVACY_FORMS.md`) into Play Data safety and App Store Connect.
- Play closed-beta join link after approval, into `app_settings.beta`; Search Console verification of the developer site.
- Sign in with Apple setup; RevenueCat product mapping and server keys; leaked-password protection toggle.
- Business address for the privacy policy and Terms; keystore backup.

## Working notes

- Tools live in user space, so put `~/.local/node/bin` and `~/.local/bin` on PATH.
- `/usr/bin/git` (Apple git 2.50.1) is the git; the old `~/.local/bin/git` shortcut was removed 2026-10-28.
- `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`. Android emulator AVD: `STT_Pixel`.
  It's slow, because the API 37 image uses software rendering.
- Live production changes (migrations, Edge Function deploys) go through the Supabase MCP. Back up before data
  changes and commit the migration files.
- End every commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
