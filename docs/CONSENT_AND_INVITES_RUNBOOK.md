# Runbook: staged deploy of the AI consent PR (#56) and the invite fix PR (#57)

Written 29 Oct 2026 from the two branches (`cto/ai-consent-rebased`, `cto/invite-hardening`). Neither is merged. Current
heads: see the PRs. Everything here is read from the code; nothing was run against production. Migrations and function
deploys are done by the owner (or by a session the owner has told to do it), never by a build agent.

## A. AI consent (#56)

### What it changes
- Migration `20261026120000_ai_consent.sql`: `user_profiles.ai_consent_at` / `ai_consent_version`; table
  `held_inbox_emails` (Resend email id, sender domain, subject; no body; own-row select/delete only; purged after 30
  days by cron job `purge-held-emails`); first version of the consent function.
- Migration `20261029100000_ai_consent_hardening.sql` (apply right after the first, same session):
  - `user_profiles.ai_consent_routing`, and a trigger `guard_ai_consent` so the app cannot write the consent columns.
  - Table `ai_consent_events` (append-only log, see C) and function `my_record_ai_consent` (replaces
    `my_set_ai_consent`, which is dropped).
  - `admin_member_export` now includes the consent events.
  - `held_inbox_emails.attempts` and `claim_held_emails` (hands each held email to one release call).
- App: Allow sheet, onboarding step, Settings toggle, wording v4 (DeepSeek first, with the China-risk sentence; Google as
  fallback and for PDFs/images).
- Functions: new `inbox-release`; `parse-booking-email`, `generate-phrases` and `receive-booking-email` check consent
  (`_shared/consent.ts`). Without a current yes, `parse-booking-email` and `generate-phrases` refuse with code
  `ai_consent`, and forwarded emails are held instead of read. `supabase/config.toml` gets `[functions.inbox-release]`.
- Deploying `receive-booking-email` from this branch also switches on the 26 Oct sender check (`senderAllowed`, per-inbox
  30/day budget), which the deployed v56 lacks. That is an owner decision still pending.

### Order
1. Apply both migrations, in file order. Before the first, nothing changes: `aiConsentGiven` answers "yes" while the
   column is missing (a marked TODO in `_shared/consent.ts` to remove once applied, so a missing column fails closed).
2. Deploy the website (consent sheet; older app builds do not have it).
3. Ship native build 0.20.1 and wait until it is live on both stores.
4. Deploy the enforcing functions LAST: `parse-booking-email`, `generate-phrases`, `receive-booking-email`,
   `inbox-release`. Enforcing earlier would block imports for installed builds that cannot show the Allow sheet (they only
   see a message telling them to update).

### Rollback
- Functions: redeploy the previous versions of the four functions (the consent check goes away; the migrations can stay).
- Website: redeploy the previous build.
- Migrations: additive. Leave them in place. Do not drop `ai_consent_events` (it is the record). To stop enforcing, roll
  the functions back; do not edit consent rows.

### Check afterwards (test account only)
1. Fresh account: onboarding shows the Allow step; Settings shows the toggle.
2. Allow: one row in `ai_consent_events` (`granted`, `v4-2026-10-29`), and `user_profiles` shows time, version and routing.
   Turn it off in Settings: a `withdrawn` row, profile fields cleared.
3. Before allowing: forward a booking email to the test account's address. Expect a `held_inbox_emails` row and no booking.
   Allow, and the app calls `inbox-release`: the email is filed and the held row is gone. An email Resend no longer
   has is dropped and counted (the app says to forward it again).
4. Before allowing: an import or a translate of typed text returns `ai_consent` and the app opens the sheet.
5. As the signed-in member in SQL: update/delete/insert on `ai_consent_events` and writes to the consent columns of
   `user_profiles` do nothing or fail.

## B. Invite hardening (#57)

### What it changes
- Migration `20261029120000_invite_hardening.sql`:
  - `invite_sends`: send log, service role only, recipients stored as a hash of a normalised address (lower case, `+tag`
    removed, dots removed for gmail). Limits: 20 per sender per hour, 50 per sender per day, 3 per recipient per day
    across senders, 500 per day project-wide (override with `app_settings.global_limits.invite_daily`). Kept 14 days (cron
    `purge-invite-sends`).
  - `invite_send_check()`; tightened policies on `booking_seats` (writes only on bookings of a trip the caller owns or
    has accepted a place on) and `bookings` update (only the trip owner may change `created_by`).
- Functions: `send-invite` (uses the limits and the log), `accept-invite` (verified-email check; no token handed back to
  the inviter), `receive-booking-email` (logs only the last 4 characters of the token; no recipient address in logs).
- App: confirmation sheet before joining a trip.

### Order
1. Apply `20261029120000_invite_hardening.sql`.
2. Deploy `send-invite`, `accept-invite`, `receive-booking-email`.
3. Deploy the website LAST (the new join screen calls the updated `accept-invite`).

### Rollback
- Website and functions: redeploy the previous versions. The migration is additive apart from the two policy changes;
  to revert those, restore the previous `booking_seats` and `bookings` policies from earlier migrations.
- Not verified: no rollback SQL file exists in the branch.

### Check afterwards (test accounts only)
1. Owner sends an invite: one `invite_sends` row; the response does not contain the invite token.
2. Open the link as the invitee: a preview/confirmation screen appears; nothing is joined until the invitee confirms.
3. Confirm: the collaborator row becomes `accepted`. A different, or unverified, email cannot accept.
4. Repeat sends hit `recipient_limit` on the 4th within a day.
5. A removed member cannot write a `booking_seats` row for that trip.

## C. Consent-log facts
- Table `ai_consent_events`: one row per answer (`granted`, `declined`, `withdrawn`), with `wording_version`,
  `provider_routing`, server time, and informational `platform`, `app_version`, `source`.
- Written only by `my_record_ai_consent` (security definer; signed-in members only). Members can select their own rows;
  no insert, update, delete or truncate grants for `anon` or `authenticated`.
- Accepted wording versions: `v4-2026-10-29` (current), `v3-2026-10-29`, `v2-2026-10-29`. Only the current version and
  routing count as a yes; older answers are asked again. When the wording changes, put the new version first in the list
  and update `AI_CONSENT_VERSION` / `AI_CONSENT_ROUTING` in the app and `_shared/consent.ts`.
- Append-only: update is refused, delete is refused unless the member's `auth.users` row is already gone (account
  deletion cascades through), TRUNCATE is refused and revoked from `service_role`.
- Per the migration comments, the append-only behaviour was run on PGlite on 29 Oct by the reviewer and was to be re-run
  after the last commit.

## Not verified
- No migration, function or app run against production or a staging database by the author of this runbook.
- The PGlite re-run after the last #56 commit, and the live Edge Function runtime of both PRs.
- Whether other deployed functions match `main`.
