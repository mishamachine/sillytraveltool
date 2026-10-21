# Clay rebuild report (2026-10-21)

The whole app is rebuilt on the signed-off Clay design, committed stage by stage on `main`
(`d0e108a` → final commit). The web build, the Android debug build and the emulator all run it. The live Supabase project was not touched.

## Status

| Check | Result |
|---|---|
| `npm run build` | Passes; postbuild check confirms no demo fixtures in `dist/` |
| `npm run lint` | 0 errors, 27 warnings (hook-dependency and fast-refresh notes, see below) |
| `npm run check:clay` | Passes: no emoji, raw colours or inline styles anywhere in `src/` |
| Android | `npm run build:native` + `assembleDebug`, installed on `STT_Pixel`; launcher icon, cream splash, welcome screen verified |
| Android back button | Verified on the emulator: closes trip → Today; tool → Tools hub → Trips tab → minimises the app |
| Screenshots | 97 in `docs/screenshots/clay/`, every screen in light and dark (`NN-area-view-light|dark.jpg`) |

## What changed

**Foundations (stage 0)**
- `npm run tokens` generates `src/styles/tokens.css` (light + dark) from `docs/brand/brand-tokens.json` and the proposed
  `docs/brand/dark-tokens.json`; `--report` prints every contrast pair.
- 124 custom stroke icons (24px grid, 1.8 stroke, round caps) behind one `<Icon name>`; no icon library.
- `src/ui/`: Button, IconButton, Card (raised/inverse/group/tile), ListRow, IconTile + booking categories,
  SegmentedControl, BottomNav, Sheet, Dialog, Field, Chip, Banner, EmptyState, ErrorState ("Goose lost the plot"),
  Loading (text + progress bar), Switch, Toast, Screen/Header/Section, Text, Stack, GooseMark (master Goose, expression
  changes only), Logo (luggage tag + stacked wordmark).
- `src/lib/tokens.js` is now a thin layer over CSS variables; badge icons are icon names.
- Dev only: `?gallery` component gallery; `?demo` offline fixtures (`?demo&fail=guide|ai`, `&slow=1`, `&empty=1`,
  `&signedout=1`) used for every screenshot. A `VITE_DEMO=1` build makes a demo APK.

**Logo and icons (stage 1):** favicon (svg/ico/png), apple-touch, PWA 192/512 + maskable, Android adaptive launcher
icon, light/dark splash, offline page, app loading splash, lockup on welcome and Settings. `scripts/build-icons.mjs`
regenerates them all.

**Shell (stage 2):** four tabs Trips · Explore · Tools · Profile, no centre HONK button, no counters; routing is still
`SCREENS[activeTab]`.

**Screens (stage 3)**
- *Auth + onboarding:* welcome with the lockup, Google/email, Terms + Privacy links and the AI line; all email flows;
  one-time onboarding (Goose inbox step + location pre-prompt) replaces the permanent inbox banner.
- *Trips:* Today view during a trip (real local weekday, next-up hero that opens the booking, weather + hint, tomorrow,
  HONK, later today); list with on-the-road hero, upcoming countdowns, invites; empty state; past trips open a recap
  (archive weather, badges earned, share, go again); trip form and paste-a-confirmation sheet.
- *Trip detail:* the 1,479-line screen is now a container over `src/screens/trips/detail/*` (Plan · Weather · Pack,
  add-booking sheet incl. restaurant reservations and transport details, booking detail, travelers, AI loading/error).
- *Explore:* city guide (Know · Eat · See · Move · Events, still lazy per section) and HONK in one tab, with
  "Suggested by Goose (AI)" + report on every AI surface.
- *Tools:* hub, Currency, SOS (112 shown as all emergencies), Translate (cache order unchanged), Tip & split.
- *Profile:* Goose score hero, badges, travel documents with masked passport + Reveal, loyalty cards, Settings
  (System · Light · Dark), delete-account screen (UI only, see below).

**Dark mode:** follows the phone by default; Settings can force Light or Dark. Every value and contrast ratio is in
`docs/brand/DARK_MODE.md` for sign-off.

## Two-pass review

Both passes ran on the finished build. Fixed in `Clay review fixes`:
- **Security:** data-driven links (booking URLs from email, AI/maps URLs) only render as `http(s)` (`src/lib/safeUrl.js`).
  Demo code can't reach production (no import-time side effects + postbuild check).
- **Android:** hardware back button handled via a shared back stack (`src/lib/backStack.js`, `src/native/backButton.js`);
  Escape closes only the top modal; dialogs trap focus; sheets don't pop the keyboard on open.
- **Bugs:** trip phase checks the end date before status; Weather and wallet no longer refetch on every token refresh;
  realtime refresh ordered by an existing column and guarded against the wrong trip; Today/restored-trip race;
  HONK no longer triggers a guide load; DST-safe "tomorrow"; null airport in directions; onboarding never shown without a
  profile row; currency rates cached offline (correct host in the service worker).
- **UX:** 44px hit areas on small links, neutral rating chips (no colour-only meaning), selected chips as an accent ring
  in both themes, sentence-case badge copy and "Goose" naming, inbox address wraps only before "@", wind unit follows
  the temperature unit, 24-hour times, password hint stays visible.

## Needs your decision

1. **Dark palette sign-off** — `docs/brand/DARK_MODE.md`.
2. **Past trips are read-only** (no add/delete/tick). The design asks for a recap instead of an edit screen, but it's a
   behaviour change from before.
3. **Account deletion** is UI only: after typing DELETE the user is asked to send a pre-filled email
   (hello@sillytraveltool.com). Real deletion (Edge Function) is Phase 2 and required by Apple 5.1.1(v) / Google Play.
4. **Terms and Privacy pages**: done in `public/terms`, `public/privacy`; legal name, address and governing law still to fill in.
5. **Booking time zones**: fixed. Every booking shows the local time where it happens (`docs/LOCAL_TIME.md`). Older
   flight rows were fixed on live by `docs/local-time-backfill.sql` (21 Oct 2026, owner OK).

## Known issues

- **Emulator rendering:** on the software-rendered `STT_Pixel`, the WebView doesn't paint the strip above the first
  drop-shadowed card on scrolling tab screens (Today, Tools). A DevTools capture of the same page is correct, the DOM is
  correct, and removing that card's shadow makes the strip paint. It looks like a SwiftShader raster bug; please check
  once on a real Android phone. If it shows there too, the fix is to drop the outer shadow on the first card.
- Status-bar strip on Android 15+ stays system grey (edge-to-edge ignores `setBackgroundColor`); a native edge-to-edge
  pass belongs in Phase 3.
- Not built from the boards: free-text translation (no backend), SOS "Share location" and medical card, live rate on the
  Tools hub, "Trusted traveler" documents, data export.
- Lint warnings left on purpose: hook-dependency warnings that match the original fetch-once patterns, and
  fast-refresh notes on files that export helpers next to components.
- `react-router-dom` is still a dead dependency; several unused `uiStore` fields remain (store code was kept unchanged).
- iOS not built (Xcode not installed).

## How to check it yourself

```bash
npm run dev
```
Then open `http://localhost:5173/?demo` (any screen, offline) or `http://localhost:5173/?gallery` (components).
