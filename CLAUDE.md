# Silly Travel Tool (STT) — working notes for Claude

Read `docs/HANDOFF.md` first (state, decisions, bug list, coding order), then `docs/brand/BRAND.md` before touching UI.

## Goal
Ship STT as native iOS and Android apps with Capacitor, wrapping this React 18 + Vite app. The web build at sillytraveltool.com stays as the shared codebase.

## Owner's rules
- **No code changes without explicit go-ahead.** At the start of each phase, present the plan and ask for approval with a clickable checkbox/option.
- **Fastest path:** edit files directly, run commands yourself, never ask the owner to move files, unzip or paste code.
- **Test it yourself before calling anything done:** `npm run build`, run the app in a browser, and for native work run it in the iOS Simulator and Android emulator. Show proof (build output, screenshots, grep/diff) rather than claiming success.
- Concise, executive-level updates. Flag when a session is getting long.
- Reviews of the app: two passes — first as a top UX/UI expert, then as CTO + senior programmer.

## Architecture rules (don't break)
- Gemini only via Supabase Edge Functions; never call it from the client.
- `fetchTrips()` uses 3 separate queries to avoid RLS recursion between `trips` and `trip_collaborators`. Don't consolidate.
- Sanitize booking data before insert: empty strings → null, datetime-local → ISO, price → float.
- Routing is Zustand state (`SCREENS[activeTab]`). `react-router-dom` is a dead dependency.
- `check-badges` fires on `SIGNED_IN`, not `INITIAL_SESSION`.
- Resend inbound webhook has no body. Fetch it with `GET https://api.resend.com/emails/receiving/{email_id}`.
- `trip_status` enum: `planning` / `active` / `completed` / `cancelled`.
- Guide content loads per section (lazy) to avoid Edge Function timeouts.
- Analytics: call `track(event, props)` only (it feeds Supabase `analytics_events` and GA4). Props are short codes/counts/booleans; `cleanProps()` drops anything personal. Respect the Settings opt-out.
- Translate: `phrase_cache` table → localStorage → Gemini last.
- Edge Functions currently deploy with JWT verify OFF; lock this in `supabase/config.toml` as part of Phase 0.

## Stack
React 18.2 + Vite · Zustand · Supabase (project `swywrvbuswylvqlktsym`, us-east-2: auth, DB, Edge Functions) · Resend (email) · Hostinger static hosting (upload `dist/`) · GA4 (Google tag `G-KRXDJXZ4SS` → property `G-H7ZP1DBHN3`, web + app, fed by `track()` in `src/lib/analytics.js`) · Sentry in code, inactive until `VITE_SENTRY_DSN` is set.

## Design
Clay design system: tokens in `docs/brand/brand-tokens.json`. Use `#B24A17` for terracotta text and fills (`#C4561E` is decorative only). Space Grotesk headings, DM Sans body, 24px stroke icons, no emoji. Logo is the luggage tag (`docs/brand/logos/`).
