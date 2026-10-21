# 🪿 Silly Travel Tool

Your cheeky but genuinely useful travel companion.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Setup Checklist

### 1. Environment Variables
Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
- `VITE_GEMINI_API_KEY` — your Google AI Studio key
- Google Maps/Places and TripAdvisor keys — leave blank for now

### 2. Database Migration
Run `supabase-migration.sql` in your Supabase SQL Editor.
This drops all old tables and creates the full schema from scratch.

### 3. Supabase Auth Setup
In Supabase Dashboard → Authentication → Providers:
- Enable Email (enabled by default)
- Enable Google (add OAuth credentials from Google Console)
- Set site URL to `https://sillytraveltool.com`
- Add `https://sillytraveltool.com` to redirect URLs

### 4. Deploy to Hostinger
```bash
npm run build
# Upload contents of /dist to Hostinger public_html
```
Or point Hostinger to the dist folder via their file manager.

## Architecture

```
src/
  components/
    goose/         — Goose SVG component (22 variants)
    layout/        — BottomNav
    ui/            — Shared UI components (Phase 2+)
  screens/
    trips/         — Trip list, trip form, trip detail (Phase 1)
    guide/         — Destination guide (Phase 3)
    goosey/        — Goosey HONK discovery (Phase 8)
    toolbox/       — Currency, Tip, SOS, Translate (Phase 4, 6)
    profile/       — Docs, Loyalty, Stats, Settings (Phase 5, 9)
  hooks/           — Custom React hooks (Phase 2+)
  lib/
    supabase.js    — Supabase client singleton
    gemini.js      — Gemini API wrapper (all AI functions)
    tokens.js      — Design tokens, badge definitions
  store/
    index.js       — Zustand stores (auth, trips, UI, guide)
  styles/
    global.css     — CSS variables, reset, shared styles
```

## Database Schema

All 12 phases designed upfront — schema won't require migration mid-build.

### Tables
- `user_profiles` — extends auth.users, created by trigger on signup
- `trips` — core trip data
- `trip_collaborators` — shared trips, invite system
- `bookings` — flights, hotels, activities
- `booking_seats` — per-person seat data for shared flights
- `trip_activities` — checklist, day planner items
- `wallet_documents` — passport, visa, insurance (encrypted storage)
- `loyalty_cards` — frequent flyer, hotel programs
- `guide_cache` — Gemini-generated destination content (city-scoped, not user-scoped)
- `phrase_cache` — offline phrases per language
- `user_stats` — trip counts, countries, score (managed by triggers)
- `user_badges` — unlocked badges (written by Edge Function only)

### Key Design Decisions
- **RLS on every table** — no exceptions
- **Stats via triggers** — never written directly by client
- **Badges via Edge Function** — badge evaluation server-side only
- **Guide cache is city-scoped** — one cached guide per destination, shared by all users
- **Realtime on** bookings, trip_activities, trip_collaborators

## Build Phases

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | Schema + Scaffold + Design System | ✅ Done |
| 1 | Auth + Trip CRUD | 🔨 Active |
| 2 | Itinerary + Bookings | ⬜ Queued |
| 3 | Guide (Gemini) | ⬜ Queued |
| 4 | Toolbox: Currency + Tip + SOS | ⬜ Queued |
| 5 | Profile: Docs + Loyalty | ⬜ Queued |
| 6 | Translate (offline phrases) | ⬜ Queued |
| 7 | Collaboration + Realtime | ⬜ Queued |
| 8 | Goosey + AI Discovery | ⬜ Queued |
| 9 | Gamification: Stats + Badges | ⬜ Queued |
| 10 | PWA Hardening + Offline | ⬜ Queued |
| 11 | Wallet Camera Scan | ⬜ v1.1 |
| 12 | Wallet Email Import | ⬜ v1.1 |

## Design System

**Colors:** `#FAF7F2` bg · `#C4561E` primary terracotta · warm earth tones
**Fonts:** Space Grotesk (headings) · DM Sans (body) · Space Mono (data/mono)
**The Goose:** 22 SVG bust variants · viewBox 0 0 100 100 · thick outline · bold graphic

All design tokens in `src/lib/tokens.js` and `src/styles/global.css`.

---
Made with 🪿 and questionable judgment
