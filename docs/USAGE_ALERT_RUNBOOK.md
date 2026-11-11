# Email-volume gauge and usage alert

Why: Resend Free allows 100 emails a day and 3,000 a month, with overage off (mail stops past that). This watches the volume without anyone reading member data.

## Pieces
- `usage_reader`: a Postgres role with NOLOGIN and no password, ever. It can read only `created_at` of `email_sends` and `invite_sends`, `confirmation_sent_at` and `invited_at` of `beta_waitlist`, and a view of four auth timestamps (`usage_private.auth_email_stamps`: no id, no email). No writes.
- `public.stt_email_usage_counts()`: one row of eleven integers (today and month-to-date, UTC). Owned by usage_reader. Only the service role (and postgres, for the check below) can run it. **The nightly health task calls only this function** for email volume.
- `public.stt_usage_check()`: compares the counts with the levels (40 a day, 1,500 a month; two constants at the top of the function) and, when crossed, posts once per day / once per month to the `cost-alert` Edge Function (dedupe table `public.usage_alerts`). Owner addresses come from `public.usage_alert_recipients()` (service role only).
- `cost-alert`: the `{ kind: "usage" }` branch emails the owner counts and the levels only (`supabase/functions/_shared/usageAlert.js`).

## Secrets (names and places only, no values)
- Vault secret `cost_alert_token`: already exists (created by migration 20261023190000, read by the hourly cost-alert cron). Reused as the `x-cron-token` header. Nothing new to create.
- Function secrets `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MEMBER_EMAIL_FROM`: already set on the Edge Functions (existing cost-alert uses them). Nothing new.
- usage_reader has no password and no stored secret.

## Owner apply steps (in this order)
1. Apply `supabase/migrations/20261110110000_usage_reader.sql`.
2. Deploy the `cost-alert` Edge Function (before any schedule, so the first alert has somewhere to go).
3. pg_cron: already enabled on the live project (the hourly cost-alert job runs on it). On another project, enable it first (Database > Extensions). Then run `supabase/optional-steps/20261110110100_usage_check_schedule.sql` by hand: hourly at minute 5, one alert per day and per month at most. It is not under `migrations/`, so `db push` never runs it.
4. Check: as the service role, `select * from public.stt_email_usage_counts();` returns one row; as a signed-in test user it returns "permission denied".

## Raise or change the levels
Edit `v_day_limit` and `v_month_limit` (for example 60 and 2,000) and re-run the `create or replace function public.stt_usage_check()` statement.

## Limits of the counts
- auth.users keeps only the latest send time per kind, so repeat sends to one member count once.
- email_sends is counted without its status (not granted), so skipped and failed rows are included: an upper bound.
- Alerts are fire-and-forget through pg_net: a failed delivery is not retried that period.

## Roll back
`select cron.unschedule('stt-usage-check');` then run `supabase/rollbacks/20261110110000_usage_reader_down.sql`. The cost-alert branch is inert without the check.
