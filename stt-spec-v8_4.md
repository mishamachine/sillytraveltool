# Silly Travel Tool — Master Spec v8.3
**Last Updated:** 2026-03-11  
**Version:** v0.18.x (local dev, not yet deployed)  
**Owner:** B&B Project Factory  
**Live URL:** https://sillytraveltool.com  
**Local dev path:** ~/Downloads/stt-fixed  
**Supabase project:** swywrvbuswylvqlktsym  
**Supabase URL:** https://swywrvbuswylvqlktsym.supabase.co  

---

## CRITICAL CONTEXT FOR ANY NEW CHAT SESSION

Read this section first. Do not write a single line of code until:
1. You have read this entire spec
2. The user has clicked the "go ahead" checkbox you present
3. You have done a 2-pass review (UX/UI expert first, CTO + Programmer second) if the user asks for a review

**Rules:**
- Never start coding without explicit user approval via a checkbox widget
- Always do 2-pass reviews when the user asks for review: Pass 1 = world's top UX/UI expert, Pass 2 = CTO-level + hands-on programmer
- Deliver fixes as direct `str_replace` patches with terminal commands — not full zips unless a major refactor
- Never claim a fix is done unless you can show the grep/diff confirming it
- Response style: concise, executive-level. No unnecessary filler
- Terminal commands: one per line, never chained with &&

### Startup command
```bash
cd ~/Downloads/stt-fixed
npm run dev
```
Then hard refresh: **Cmd+Shift+R**

### .env setup (required after every fresh unzip)
```bash
printf 'VITE_SUPABASE_URL=https://swywrvbuswylvqlktsym.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eXdydmJ1c3d5bHZxbGt0c3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTUwMDAsImV4cCI6MjA4Njc3MTAwMH0.NL_i0bTEgWtAr9lqdupHltKWAu8RDZeOSPbZNM48G0o\n' > ~/Downloads/stt-fixed/.env
```

### Build & deploy sequence
```bash
cd ~/Downloads/stt-fixed
npm install
npm run build
# Upload dist/ to Hostinger public_html/ via File Manager or FTP
```

### Edge Function deploy (after any function change)
```bash
supabase functions deploy FUNCTION_NAME --project-ref swywrvbuswylvqlktsym --no-verify-jwt
```

---

## ⚡ NEXT BUILD SESSION — PRIORITY BUG LIST

Work through these in order. Present a go/no-go checkbox before touching any code.

### 🔴 P0 — Blockers

#### P0-B: Inbound Email Pipeline — ✅ CONFIRMED WORKING
**Status as of v8.4:**
- ✅ Resend Pro plan active
- ✅ `bookings.sillytraveltool.com` MX record propagated and verified
- ✅ Resend webhook firing on `email.received`
- ✅ `receive-booking-email` Edge Function receiving webhook payload
- ✅ Email body fetch confirmed: `GET https://api.resend.com/emails/receiving/{email_id}` works with `RESEND_API_KEY`
- ✅ Confirmed live test email received (Delta flight receipt, email_id: `de9ee492-e057-4ee2-9218-0a00d072e90b`, conf# JJREFW, SEA→MAD→SEA, Apr 1–10 2026)
- ✅ Gemini parse confirmed working
- ✅ Booking row written to DB
- ✅ Booking appears in app UI
- ✅ Auto-creates trip if no match found (status: planning)
- ⚠️ Resend retries cause duplicates — stabilizing now that 200 returned consistently
- ❌ Round-trip / multi-leg not handled — receive-booking-email inserts only first item; needs loop over array from parse-booking-email
- ❌ No duplicate prevention — no confirmation_number uniqueness check before insert

**Fixes applied in v8.4 session:**
- Email body fetch via Resend receiving API (body absent from webhook)
- from-email fallback uses get_user_id_by_email() SQL RPC — Admin API filter was broken
- Trip status enum fixed: upcoming → planning
- .catch() → try/catch on RPC call (Deno incompatibility)
- Removed blind trip fallback — auto-creates trip instead
- trip_id made nullable in bookings table
- Trip auto-create errors now surfaced in logs

**DB changes applied:**
- ALTER TABLE bookings ALTER COLUMN trip_id DROP NOT NULL
- DROP FUNCTION / CREATE FUNCTION get_user_id_by_email(p_email text) — SECURITY DEFINER, queries auth.users

**Key architectural facts:**
- Resend's inbound webhook does NOT include email body — body must be fetched separately via `GET https://api.resend.com/emails/receiving/{email_id}` with Bearer auth
- Webhook payload structure:
```json
{
  "type": "email.received",
  "data": {
    "email_id": "...",
    "from": "...",
    "to": ["..."],
    "subject": "...",
    "created_at": "..."
  }
}
```
- Edge function `receive-booking-email` was updated to: parse JSON body → unwrap `body.data` → extract `toAddress` from `payload.to[0]` → extract `emailId` → fetch body via receiving API → call parse-booking-email

**What to do first in new session:**
1. Check Supabase `bookings` table for row with confirmation `JJREFW`
2. Check `receive-booking-email` Edge Function logs for the Mar 11 invocation — did it succeed or error after the fetch step?
3. Check `parse-booking-email` logs — was it called?
4. If booking not in DB, identify the failure point and fix

**User's booking email token:** `6370bcb1` → `6370bcb1@bookings.sillytraveltool.com`  
**Test also works via:** `anything@measira.resend.app` (Resend free inbound)

#### P0-C: Paste-to-parse email also not working
**Additional requirement:** If no active trip exists when parsing, the system should **auto-create a trip** from the destination/dates extracted from the email, then attach the booking to it.  
**Files:** Email import sheet in `TripDetailScreen.jsx` or `TripsScreen.jsx`, `src/store/tripsStore.js`, `supabase/functions/parse-booking-email/index.ts`

### 🔴 P1 — High Priority

#### P1-A: Translate screen hangs / gets stuck
**Files:** `src/screens/toolbox/ToolboxScreen.jsx`, `supabase/functions/generate-phrases/index.ts`

#### P1-B: Profile — Docs and Loyalty tabs get stuck
**Files:** `src/screens/profile/ProfileScreen.jsx`

#### P1-C: Trip sharing flow — full audit and fix
**Audit scope:** invite acceptance, collaborator booking visibility, `is_shared` flag, realtime sync, RLS policies on `bookings` + `trip_activities`

#### P1-D: Move booking between trips
**Requirement:** User must be able to reassign a booking from one trip to another.
**UI:** "Move to trip" action on booking card → bottom sheet with trip picker → updates booking.trip_id.
**Files:** TripDetailScreen.jsx, tripsStore.js

### 🟡 P2 — UX Polish

#### P2-A: Header inconsistency across screens
All screens must match Trips screen header pattern (see §3.4).

#### P2-B: Remove share button from BottomNav; add per-screen share nudge at bottom
Remove 6th nav item. Add subtle pill button at bottom of each screen's scroll content.

#### P2-C: Guide loading — set first-time expectations
"Generating your guide… ~10 seconds the first time" vs "Loading…" for cached.

### 🟢 P3 — Backlog

| # | Item |
|---|---|
| B1 | Auth race condition — `profileReady` flag |
| B2 | Goose stats not incrementing |
| B3 | Add to trip from Guide not saving |
| B4 | PWA icons — rebuild from Goose SVG |
| B5 | Excluded country image slot + neutral copy |
| B6 | Phrase library seed — 120 phrases × 30-40 languages SQL |
| B7 | Translate language box — full box tappable |
| B8 | SOS — address + phone + Maps deep-link, remove Google button |
| B9 | Weather historical dates — patch file delivered in v0.15 outputs, needs applying |
| B10 | Docs and Loyalty add forms (Phase 5) |

---

## 2. Tech Stack — LIVE

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18.2 + Vite 5.0.8 | PWA via vite-plugin-pwa 0.17.4 |
| State | Zustand 4.4.7 | 5 stores + barrel index.js. **react-router-dom in package.json but NOT used** — routing is Zustand state-based via `SCREENS[activeTab]`. Do not use React Router. |
| Backend / DB | Supabase | Auth, Postgres, Realtime, Storage |
| Supabase client | @supabase/supabase-js 2.39 | Singleton: src/lib/supabase.js |
| AI | Gemini 2.0 Flash | Via Supabase Edge Functions only — never client-side |
| City Autocomplete | Photon (Komoot) | `https://photon.komoot.io/api/?q=&limit=8&lang=en&osm_tag=place:city` |
| Currency Rates | open.er-api.com | Free, no key |
| Weather | Open-Meteo API | Forecast + historical via archive-api.open-meteo.com |
| Email | Resend | Outbound: sillytraveltool.com · Inbound: bookings.sillytraveltool.com |
| Hosting | Hostinger | Static Apache. LIVE at sillytraveltool.com |

### 2.1 API Keys & Credentials

| Service | Key | Location |
|---|---|---|
| Supabase URL | https://swywrvbuswylvqlktsym.supabase.co | .env → VITE_SUPABASE_URL |
| Supabase Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eXdydmJ1c3d5bHZxbGt0c3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTUwMDAsImV4cCI6MjA4Njc3MTAwMH0.NL_i0bTEgWtAr9lqdupHltKWAu8RDZeOSPbZNM48G0o | .env → VITE_SUPABASE_ANON_KEY |
| Gemini API Key | Server-side only | Supabase → Secrets → GEMINI_API_KEY |
| Resend API Key | Server-side only | Supabase → Secrets → RESEND_API_KEY |

### 2.2 Supabase Configuration

| Setting | Value |
|---|---|
| Auth: Email confirmation | ON |
| Auth: Site URL | https://sillytraveltool.com |
| Auth: Redirect URLs | https://sillytraveltool.com/**, http://localhost:5173 |
| SMTP | smtp.resend.com:587 · noreply@sillytraveltool.com |
| Google OAuth | NOT configured |

### 2.3 Edge Functions — ALL JWT verify OFF

| Function | Purpose | Version |
|---|---|---|
| `generate-guide` | Section-based AI guide | 18 |
| `goosey-discover` | HONK mood-based discovery | 10 |
| `generate-phrases` | Translate phrase generation | 10 |
| `generate-checklist` | AI packing checklist | 10 |
| `parse-booking-email` | Parse email text → booking | 14 (array response format) |
| `send-invite` | Trip collab invite emails | 11 |
| `receive-booking-email` | Inbound email webhook | latest (body fetch via receiving API) |
| `check-badges` | Badge award logic | 12 |
| `send-welcome-email` | Welcome email on signup | 3 |
| `accept-invite` | Accept trip invite (service role) | 2 |

**CRITICAL:** All functions have JWT verify OFF in Supabase Dashboard. Enabling causes 401 race conditions.

### 2.4 Resend / Email Configuration

| Item | Value | Status |
|---|---|---|
| Outbound domain | sillytraveltool.com | ✅ Verified |
| Inbound subdomain | bookings.sillytraveltool.com | ✅ MX propagated + Verified |
| MX record | inbound-smtp.us-east-1.amazonaws.com, Priority 9 | ✅ |
| Webhook | email.received → receive-booking-email | ✅ Configured + Firing |
| Email body fetch | GET https://api.resend.com/emails/receiving/{id} | ✅ Confirmed working |
| End-to-end test | booking row written to DB + appears in app | ❌ Not yet confirmed |

---

## 3. Design System — CONFIRMED FINAL

### 3.1 Aesthetic: Warm Minimal
Confirmed final. Do not re-propose design system changes.

### 3.2 Color Tokens
```css
/* Light mode */
--bg:           #FAF7F2
--surface:      #FFFFFF
--surface-alt:  #F5F1EB
--border:       #E8E3DB
--border-light: #F0EEEA
--text:         #2A2520
--text-sec:     #6B6355
--text-tert:    #A09688
--primary:      #C4561E   /* terracotta */
--primary-light:#FFF0EB
--success:      #2D8B55
--warning:      #D4910A
--error:        #D93025
--info:         #1A73E8

/* Dark mode ([data-theme="dark"]) */
--bg:           #1A1612
--surface:      #242018
--surface-alt:  #2E2A24
--border:       #3D3830
--primary:      #E8723A
--primary-light:#2A1A10
```

### 3.3 Typography
```
Headings:  Space Grotesk (Google Fonts, 400–700)  → --font-heading
Body:      DM Sans (Google Fonts, 400–700)         → --font-body
Mono:      Space Mono (Google Fonts)               → --font-mono
```

### 3.4 Screen Header Standard — ALL screens must follow this
```jsx
<div className="screen-header" style={{ display:'flex', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
  <h1 className="screen-title">Title</h1>
  {/* optional right action button */}
</div>
```
- `.screen-header`: frosted glass (backdrop-filter: blur(12px)), sticky top:0, z-index:10, min-height:64px, border-bottom
- `.screen-title`: Space Grotesk 700, 22px
- **Exception:** Trip Detail gradient hero header is intentionally different

### 3.5 Share Nudge — Standard (appears at bottom of every main screen)
```jsx
<div style={{ textAlign:'center', padding:'24px 16px 8px', borderTop:'1px solid var(--border-light)' }}>
  <button onClick={handleShare} style={{
    background:'none', border:'1.5px solid var(--primary)', color:'var(--primary)',
    borderRadius:999, padding:'8px 20px', fontSize:13,
    fontFamily:'var(--font-heading)', fontWeight:600, cursor:'pointer'
  }}>
    🪿 Know a traveller? Share the app
  </button>
</div>
```
`handleShare` uses `navigator.share()` with fallback to clipboard copy.

### 3.6 Desktop Wrapper
`#root` capped at 428px, centred. Do not change.

---

## 4. Goose Graphic System

`src/components/goose/Goose.jsx` — 16 variants as inline SVG.  
Usage: `<Goose variant="happy" size={64} animated />`

| Variant | Used Where |
|---|---|
| `happy` | Trips header, Auth hero, Checklist loading |
| `excited` | Auth sent state, Goosey bored button |
| `sleeping` | Offline state |
| `worried` | Error states |
| `lost` | Empty states |
| `hungry` | Goosey "I'm hungry" |
| `fancy` | Goosey "Treat myself", Loyalty empty state |
| `broke` | Goosey "On a budget" |
| `pilot` | Goosey "Be a local", Weather packing tip |
| `sos` | SOS emergency card header |
| `celebrating` | Goosey "Night out", HONK result hero |
| `trophy` | Profile Stats tab |
| `detective` | Goosey "Show me something", Goosey loading |
| `museum` | Goosey "Culture me", Guide See empty state |
| `passport` | Profile Docs empty state, SOS embassy note |
| `icon` | DEPRECATED in-app — only in HONK nav SVG |

---

## 5. Country System

`src/lib/countryColors.js` — `getFlagEmoji(code)`, `COUNTRY_COLORS`, `getCountryColor(code)`  
Israel (`IL`) excluded. Neutral message + large image slot shown when selected.

---

## 6. Database Schema — LIVE

**user_profiles** — id, display_name, avatar_url, home_currency (default 'USD'), passport_country, home_city, timezone, booking_email_token (8-char hex), created_at, updated_at.

**trips** — id, owner_id, title, destination_city, destination_country, destination_country_code (CHAR 2 UPPERCASE), destination_lat, destination_lng, start_date, end_date, status, notes, share_checklist, created_at, updated_at.

**trip_collaborators** — id, trip_id, user_id, email, status, invited_by, invite_token (unique), created_at.

**bookings** — id, trip_id, created_by, type, title, is_shared, flight fields, hotel fields, activity fields, confirmation_number, booking_url, price, currency, notes, source ('manual'|'email_import'), raw_email_id, timestamps.

**trip_activities** — id, trip_id, created_by, title, category, date, time, duration_minutes, location fields, notes, is_completed, completed_by, completed_at, source.

**guide_cache_sections** — destination_key, section, data (JSONB), expires_at. UNIQUE(destination_key, section).

**phrase_cache** — language_code (UNIQUE), language_name, 8 category columns (JSONB), generated_at, expires_at.

**user_stats** — user_id, trips_created, bookings_added, countries_visited, nights_abroad, guides_generated, honks_done, phrases_translated.

**user_badges** — user_id, badge_id, awarded_at.

### 6.1 Booking Data Sanitization (ALWAYS apply before Supabase insert)
- Empty strings → null
- `departure_time` / `arrival_time` → `new Date(v).toISOString()`
- `price` → `parseFloat(v)`

### 6.2 RLS Notes
- `trips` infinite recursion: FIXED (explicit separate policies, no cross-table refs)
- `auth trigger`: REMOVED — replaced by app-level `ensureProfile()`
- **AUDIT NEEDED (P1-C):** `bookings` + `trip_activities` RLS for collaborator read access

---

## 7. File Structure — v0.18.x

```
stt-fixed/
├── index.html
├── package.json
├── vite.config.js
├── .env
├── public/
│   ├── pwa-192x192.png               — ⚠️ NEEDS REBUILD (B4)
│   ├── pwa-512x512.png               — ⚠️ NEEDS REBUILD (B4)
│   ├── favicon.ico                   — ⚠️ NEEDS REBUILD (B4)
│   ├── apple-touch-icon.png          — ⚠️ NEEDS REBUILD (B4)
│   ├── og-image.png                  — ✅
│   └── excluded-country-image.png
├── src/
│   ├── App.jsx
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── gemini.js
│   │   ├── tokens.js
│   │   └── countryColors.js
│   ├── store/
│   │   ├── index.js                  — barrel export
│   │   ├── authStore.js
│   │   ├── tripsStore.js
│   │   ├── uiStore.js
│   │   ├── guideStore.js
│   │   └── collabStore.js
│   ├── styles/global.css
│   ├── components/
│   │   ├── goose/Goose.jsx
│   │   └── layout/BottomNav.jsx      — share button (6th item) to be REMOVED (P2-B)
│   └── screens/
│       ├── AuthScreen.jsx
│       ├── trips/
│       │   ├── TripsScreen.jsx
│       │   ├── TripForm.jsx
│       │   └── TripDetailScreen.jsx
│       ├── guide/GuideScreen.jsx
│       ├── goosey/GooseyScreen.jsx
│       ├── toolbox/ToolboxScreen.jsx — Translate hang (P1-A)
│       └── profile/ProfileScreen.jsx — Docs/Loyalty hang (P1-B)
└── supabase/functions/
    ├── generate-guide/
    ├── goosey-discover/
    ├── generate-phrases/
    ├── generate-checklist/
    ├── parse-booking-email/          — array response format, v14
    ├── send-invite/
    ├── receive-booking-email/        — fetches body via receiving API
    ├── check-badges/
    ├── accept-invite/                — service role, no nested join
    └── send-welcome-email/
```

---

## 8. State Management — Zustand Stores

### useAuthStore
```js
state:   { user, profile, session, loading, profileReady }
actions: { init(), ensureProfile(user, accessToken, shouldCheckBadges), fetchProfile(), updateProfile(updates), signOut() }
```

### useTripsStore
```js
state:   { trips, activeTrip, loading, error, bookings, activities, loadingDetail, pendingInvites }
actions: { fetchTrips(), setActiveTrip(), createTrip(), updateTrip(), deleteTrip(),
           fetchTripDetail(), createBooking(), updateBooking(), deleteBooking(),
           createActivity(), toggleActivity(), deleteActivity(),
           subscribeToTrip(), fetchPendingInvites(), acceptInvite() }
```
- `fetchTrips()`: 3 separate queries (avoids RLS recursion)
- Optimistic update includes `trip_collaborators: []`

### useGuideStore
```js
// Module-level: _inflight plain object keyed "destinationKey:section"
state:   { currentDestination, sections, loadingSections (plain object), error }
actions: { loadGuide(), loadGuideSection(), loadMoreSection(), clearGuide(), getGuideData() }
```

### useUIStore
```js
state:   { activeTab, activeTripTab, activeGuideTab, activeToolboxTab, activeProfileTab,
           showTripForm, darkMode }
```
Screen persistence via sessionStorage.

---

## 9. Known Issues Tracker

| ID | Issue | Priority | Status |
|---|---|---|---|
| P0-B | Inbound email pipeline | 🟢 | ✅ CONFIRMED WORKING |
| P0-C | Paste-to-parse email; no auto-trip-create | 🔴 P0 | OPEN |
| P1-A | Translate tab hangs | 🔴 P1 | OPEN |
| P1-B | Profile Docs + Loyalty tabs hang | 🔴 P1 | OPEN |
| P1-C | Trip sharing — full audit needed | 🔴 P1 | OPEN |
| P1-D | Move booking between trips — UI + DB | 🔴 P1 | OPEN |
| P2-A | Header inconsistency | 🟡 P2 | OPEN |
| P2-B | Share button in nav — move to per-screen bottom | 🟡 P2 | OPEN |
| P2-C | Guide loading first-time copy | 🟡 P2 | OPEN |
| B1 | Auth race condition — profileReady flag | 🟢 P3 | PENDING |
| B2 | Goose stats not incrementing | 🟢 P3 | PENDING |
| B3 | Add to trip from Guide not saving | 🟢 P3 | PENDING |
| B4 | PWA icons | 🟢 P3 | PENDING |
| B5 | Excluded country image slot | 🟢 P3 | PENDING |
| B6 | Phrase library seed SQL | 🟢 P3 | PENDING |
| B7 | Translate language box full tap | 🟢 P3 | PENDING |
| B8 | SOS address + phone + Maps | 🟢 P3 | PENDING |
| B9 | Weather historical dates patch | 🟢 P3 | PENDING |
| B10 | Docs + Loyalty add forms | DEFERRED | Phase 5 |

---

## 10. Navigation & App Shell

```jsx
<>
  <ActiveScreen />
  <BottomNav />
  {activeTrip && <TripDetailScreen />}
  {showTripForm && <TripForm />}
</>
```

BottomNav tabs: Trips · Guide · HONK (raised) · Toolbox · Profile · Share (REMOVE — P2-B)

---

## 11. Email System

### Inbound (booking import)
```
User forwards email → {token}@bookings.sillytraveltool.com
  → Resend webhook → receive-booking-email Edge Function
  → Fetches email body via GET https://api.resend.com/emails/receiving/{email_id}
  → Looks up user by booking_email_token in user_profiles
  → Calls parse-booking-email Edge Function (Gemini)
  → Saves to bookings table (auto-creates trip if none exists)
```

### Outbound
| Type | From | Function |
|---|---|---|
| Welcome | noreply@bookings.sillytraveltool.com | send-welcome-email |
| Trip invite | noreply@bookings.sillytraveltool.com | send-invite |
| Auth emails | noreply@sillytraveltool.com | Supabase native |

---

## 12. Gemini Integration

All calls via `supabase.functions.invoke()` — never client-side.

| Function | Invoke name | Key params |
|---|---|---|
| Guide content | `generate-guide` | city, country, section |
| Email parse | `parse-booking-email` | emailText |
| HONK discovery | `goosey-discover` | city, country, mood |
| Phrases | `generate-phrases` | languageCode, languageName |
| Checklist | `generate-checklist` | trip, bookings, weatherContext |

---

## 13. Build Sequence — Status

| Phase | Features | Status |
|---|---|---|
| 0–4f | Foundation through Badge system | ✅ |
| 4g | **Bug fix batch + UX polish** | 🔴 IN PROGRESS |
| 5 | Profile — Docs/Loyalty forms | ⏳ |
| 6 | Translate — phrase library pre-populated | ⏳ |
| 7 | PWA hardening | ⏳ |
| 8 | SEO | ✅ |

---

## 14. Decisions Log (key entries)

| Decision | Rationale |
|---|---|
| JWT verify OFF on all Edge Functions | Functions self-verify; double-check causes 401 race |
| Guide lazy-loads per section | Single Gemini call timed out |
| fetchTrips split into 3 queries | Nested join caused RLS recursion |
| Resend body not in webhook | Must fetch separately via receiving API |
| parse-booking-email returns array | Consistent multi-booking format |
| accept-invite uses service role | Anon key insufficient for write ops |
| auth trigger removed | Supabase auth role caused DB error → replaced by ensureProfile() |
| createTrip optimistic includes trip_collaborators:[] | Missing key caused crash |
| ScoreBadge uses ⭐ emoji | Previous SVG blob illegible at 12×8px |
| get_user_id_by_email() RPC | Supabase Admin API email filter broken — returns wrong user. SQL RPC with SECURITY DEFINER queries auth.users directly |
| trip auto-create status = planning | trip_status enum: planning/active/completed/cancelled — "upcoming" is invalid |
| trip_id nullable in bookings | Booking survives if auto-create fails; enables Move Booking feature (P1-D) |
| P1-D: Move booking between trips | User must be able to reassign booking to different trip — needed for email import corrections |

---

*Single source of truth. Update before every build session.*  
*Spec v8.4 · 2026-03-12 · P0-B CONFIRMED WORKING ✅ · P1-D added · Multi-leg + dupe prevention gaps noted · Next: P0-C*
