# Silly Travel Tool — Deploy Checklist

## 1. Supabase — Add Secrets
In Supabase Dashboard → Settings → Edge Functions → Secrets, add:
```
GEMINI_API_KEY      = your_gemini_api_key
RESEND_API_KEY      = your_resend_api_key  
APP_URL             = https://sillytraveltool.com
STRIPE_SECRET_KEY   = rk_test_… (restricted key; billing, stripe-webhook, admin-stripe)
STRIPE_WEBHOOK_SECRET = whsec_… (Stripe → Developers → Webhooks → stripe-webhook endpoint → Signing secret)
```

## 2. Deploy Edge Functions (run from project root)
The repo is the source of truth: live must equal `supabase/functions/`. All 23 functions run with `verify_jwt = false`
(locked in `supabase/config.toml`; each function checks its caller itself), so always pass `--no-verify-jwt`.
```bash
supabase login                      # once; opens the browser (SUPABASE_ACCESS_TOKEN in .env.local also works, never commit it)
supabase link --project-ref swywrvbuswylvqlktsym
```
Back up what is live first (outside the repo), then deploy. `--use-api` bundles on Supabase's side, so Docker isn't needed.
```bash
mkdir -p ~/backups/functions-$(date +%F) && cd ~/backups/functions-$(date +%F)
for f in $(supabase functions list --project-ref swywrvbuswylvqlktsym -o json | python3 -c "import json,sys;print(' '.join(x['slug'] for x in json.load(sys.stdin)['functions']))"); do
  supabase functions download $f --use-api --project-ref swywrvbuswylvqlktsym; done   # lands in ./supabase/functions/<slug>/
cd - >/dev/null
```
One function:
```bash
supabase functions deploy receive-booking-email --no-verify-jwt --use-api
```
All 23 (the full list: accept-invite, admin-email, admin-experiment-ai, admin-stripe, beta-invite, beta-signup, billing,
check-badges, cost-alert, delete-account, email-unsubscribe, generate-checklist, generate-guide, generate-phrases,
goosey-discover, parse-booking-email, places, receive-booking-email, resolve-timezone, send-invite, send-welcome-email,
store-webhook, stripe-webhook):
```bash
for f in $(ls supabase/functions | grep -v '^_shared$'); do supabase functions deploy $f --no-verify-jwt --use-api; done
```
Never use `--prune` (it deletes live functions that aren't in the repo). Check what is live: `supabase functions list`.
Probe afterwards without real data: an unauthenticated `POST {}` to a user function must return 401; `stripe-webhook`
without a signature 400; `receive-booking-email` without a Svix signature 401; `email-unsubscribe?t=bad` 400.
`@supabase/supabase-js` is pinned to one exact version in every function (`esm.sh/@supabase/supabase-js@2.118.0`): bump
it everywhere in one commit (`grep -rl "supabase-js@2\." supabase/functions`), never back to `@2`.
Retired functions (`gemini-proxy`, `receive-booking-email-staging`) are deleted from the repo; remove one live with
`supabase functions delete <name>`.

## 3. Supabase Dashboard
- Settings → Auth → Site URL: change to `https://sillytraveltool.com`
- Settings → Auth → Redirect URLs: add `https://sillytraveltool.com/**`

## 4. Patch trip_collaborators (run in SQL Editor if NOT running fresh migration)
```sql
-- Add invite columns
ALTER TABLE trip_collaborators 
  ADD COLUMN IF NOT EXISTS invite_token uuid,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

-- Add invited_email unique constraint (needed for upsert on re-invite)
ALTER TABLE trip_collaborators 
  ADD CONSTRAINT IF NOT EXISTS trip_collaborators_trip_id_invited_email_key 
  UNIQUE (trip_id, invited_email);

-- Expand status constraint to include 'accepted'
ALTER TABLE trip_collaborators DROP CONSTRAINT IF EXISTS trip_collaborators_status_check;
ALTER TABLE trip_collaborators ADD CONSTRAINT trip_collaborators_status_check 
  CHECK (status IN ('pending', 'active', 'accepted', 'declined'));

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_collab_invite_token ON trip_collaborators(invite_token);
```

## 5. OG Image
- Replace `public/og-image-placeholder.svg` with `public/og-image.png` (1200×630 PNG)
- See OG_IMAGE_BRIEF.md for generation prompt

## 6. Build + Upload to Hostinger
```bash
npm run build
```
Upload contents of `dist/` to Hostinger public_html via File Manager or FTP.
The `.htaccess` in `public/` copies automatically into `dist/`.

## 7. Gemini API Key — Add Referrer Restriction
In Google Cloud Console → Credentials → your Gemini key:
- Add HTTP referrer: `https://sillytraveltool.com/*`
- This step is now less critical (key is server-side) but good hygiene.

## 8. Inbound Email (Goose Inbox) — one-time setup

### a) Add MX record on Hostinger
In Hostinger DNS Manager, add a record for the `bookings` subdomain:
```
Type:     MX
Name:     bookings
Value:    feedback-smtp.us-east-1.resend.com
Priority: 10
TTL:      3600
```

### b) Configure Resend inbound routing
1. Resend Dashboard → Domains → Add Domain: `bookings.sillytraveltool.com`
2. Verify the MX record (up to 24h to propagate)
3. Resend → Inbound → Create Route:
   - Pattern: `*@bookings.sillytraveltool.com`
   - Webhook URL: `https://swywrvbuswylvqlktsym.supabase.co/functions/v1/receive-booking-email`
4. Deploy the Edge Function:
   ```bash
   supabase functions deploy receive-booking-email --no-verify-jwt --use-api
   ```

### c) Run SQL patch for existing users
```sql
UPDATE user_profiles
SET booking_email_token = lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE booking_email_token IS NULL;
```

### d) Test it
Forward any hotel or flight confirmation to your personal address (shown in Profile → Settings). It should appear in the matching trip within 30 seconds.

---

## 9. Smoke Test
- Sign up with a new account
- Create a trip
- Open HONK and test Goosey
- Open Guide and generate content for a city
- Open Toolbox → Translate and load a language
- Create a trip, open Checklist tab, generate checklist
- Invite a collaborator (check email arrives)
