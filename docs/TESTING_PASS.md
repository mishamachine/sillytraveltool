# Testing pass: 10 personas (2026-10-22)

Build tested: `main` at 94696d3, web dev server (localhost:5173, phone width 375 px, light and dark) and the
Android debug APK on the `STT_Pixel` emulator. Signed-in flows ran on the owner's live account; everything created
was deleted afterwards (see "Cleanup"). No code was changed.

Screenshots: `docs/screenshots/testing/` (file names start with the persona, e.g. `p9-…`).

## Executive summary

- **What works well:** one-tap save from the guide (creates an undated trip, toast with "Add dates"), Confirm a
  visit → simple reservation → undated trip takes its dates, trips widen when a later booking is added, per-venue
  time zones (Lisbon/Porto "Portugal Time", Madrid "Spain Time" in one trip), flight zones auto-filled from airport
  codes and stored correctly, Google place search + live place card, cached guide and phrasebooks load in 0.3–2 s,
  HONK returns a real open place in about 2 s, Grab offered in Thailand, accessible names and 44 px touch targets
  are clean on every tab, Escape/back closes sheets and returns focus.
- **What breaks:** email import treats the home airport as the destination of a round trip (whole trip filed under
  San Francisco), and dates a connecting leg a day early; creating any trip quietly spends ~11 of the user's 100
  daily AI calls; bookings cannot be edited; °F users are told 49° is "Hot"; Android back on the sign-in screen
  minimises the app.
- **What feels wrong:** multi-city trips are single-city everywhere except booking times (Weather, Pack, Get there
  ride apps, Today); HONK promises "5 min walk" for a 23-minute walk; Translate only works from English; group
  organisers can't remove anyone or change access.

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 11 |
| Minor | 22 |
| Polish | 16 |

## Fix status (updated 2026-10-22)

Fixed, deployed and re-tested on the live account (screenshots `fix-*.jpg`):

| Item | Result after the fix |
|---|---|
| B1 import destination | Same Lufthansa + hotels email → "Final destination: Athens", default "Trip to Athens", Destination editable on New trip (`fix-b1-*.jpg`) |
| M1 overnight leg | MUC → ATH now Sun 15 Nov 13:20, after SFO → MUC lands (`fix-m1-muc-ath-sun-15-nov.jpg`) |
| B2 quota | Import + new trip used 1 AI call (the parse); warming wrote Google facts for 6 sections with 0 AI; guide AI now counts in its own `guide` allowance (40/day) |
| M6 °F advice (Q1) | 47 °F → "Cold later, bring a jacket", same as 8 °C |
| M8 Android back (Q2) | Emulator: Continue with email → back → welcome screen, app stays open (`fix-q2-android-*.jpg`) |
| M4 ride apps (Q3) | Singapore hotel in a Greek trip → Grab (`fix-q3-singapore-hotel-grab.jpg`) |
| m3 Guests (Q4) | Restaurant form starts with 2 |
| m4 trip tab (Q5) | Opening a trip starts on Plan after switching tabs on another visit |
| M2 edit bookings | "Edit booking" on the detail sheet reopens the form pre-filled in each place's local time; saved arrival 07:30 → 08:05 London, departure unchanged (`fix-m2-m3-edit-flight-time-check.jpg`) |
| M3 time check | Arrival before departure is blocked: "Arrives before it leaves. Overnight flights land the next day"; the error scrolls into view |
| M4 multi-city Weather / Pack | London trip with a Singapore hotel: 13–14 Nov show Singapore 30–31°, tips per city; Pack gets separate London and Singapore sections (`fix-m4-weather-london-singapore.jpg`) |
| M5 HONK walk time | Final pick uses Google Routes walking time; if over 20 min it tries the next two picks. Bangkok now returns a 3-min (235 m) walk |
| M7 view only | Viewers get the read-only trip with a "View only" note; no add, edit or delete (`fix-m7-view-only.jpg`, simulated in demo) |
| M11 travellers | Organiser can switch Can edit / View only and remove or cancel an invite; a traveller can leave the trip (`fix-m11-manage-traveler.jpg`) |
| M9 Translate | "From" language picker (Japanese → Turkish phrasebook, written once and saved for everyone), "Say anything" free text kept on the phone only, all 35 languages listed (`fix-m9-*.jpg`) |
| M10 large text | Type in rem; buttons wrap instead of cutting off; Today's buttons stack at large sizes; nothing overflows at 150 % or 200 %, default size unchanged (`fix-m10-*.jpg`) |

Still open: everything else below, in the recommended order.

## The 10 personas

| # | Persona | Cities | Goals tested | Where | Result |
|---|---|---|---|---|---|
| P1 | Mai, solo backpacker on a budget | Bangkok → Chiang Mai → Hanoi → Hoi An | HONK "On a budget"/"hungry", Get there with Grab, Thai + Vietnamese phrases | Live (GPS simulated in Bangkok) | Works; HONK walk time wrong (M5) |
| P2 | The Okafors, family of four from the US | Orlando → New York (demo trip used for Today/Weather) | Today, Weather in °F, dark mode, Pack | Demo | °F hint bug (M6) |
| P3 | Priya, business traveller | Seattle → London → Singapore | Dated trip, flights across zones, hotel via place search, Weather, Pack, Get there | Live | Times correct; no edit (M2), no time validation (M3), single-city Weather/Pack/ride apps (M4) |
| P4 | Lucas & Ana, foodie couple | Lisbon → Porto → Madrid | Guide Eat bands, one-tap save, Confirm a visit, reservations in 3 cities | Live | Core flow works; Cheap band shows $$ (m2), Guests not saved (m3) |
| P5 | Margaret, retiree planning a Mediterranean hop | Barcelona → Marseille → Rome → Athens (undated) | "Not sure of the dates", Weather/Pack without dates, Add dates | Demo + live (undated Lisbon) | Works; "Add dates" opens with dates disabled (m14) |
| P6 | Jordan, group trip organiser | Berlin → Prague (demo Spain trip with a collaborator) | Share sheet, invite validation, view-only role | Demo + live (no invite sent) | Viewer role not enforced in UI (M7); no remove/role change (M11) |
| P7 | Daniel, screen-reader and large-text user | Kyoto → Osaka (demo) | Accessible names, headings, touch targets, reduced motion, 150 % text | Demo | Semantics good; fixed px type, truncation at large text (M10) |
| P8 | Zoe, last-minute and spontaneous | Mexico City → Oaxaca | HONK only, Another spot, Get there | Live (GPS simulated in Roma Norte) | Works; transit = walk duplicate, no DiDi, "Another spot" goes back to moods |
| P9 | Ben, forwards messy emails | San Francisco → Munich → Athens → Santorini | Paste multi-leg Lufthansa + 2 hotels; paste a ferry e-ticket | Live | **Wrong destination (B1)**, connecting leg a day early (M1) |
| P10 | Yuki, Japanese speaker abroad | Istanbul → Cappadocia | Translate (cached languages), Show big, SOS, Settings | Live + demo | English-only source (M9); SOS mislabel (m11) |

Android spot-check (P7, P9, P10 paths available while signed out): cold start, sign-in screens, back button.

## Findings

Each item: persona · steps · expected vs actual · screenshot.

### Blockers

**B1. Email import files a round trip under the traveller's home city.** P9.
Steps: Trips → paste icon → paste a Lufthansa confirmation SFO→MUC→ATH and ATH→FRA→SFO plus two Greek hotels →
Read it → New trip.
Expected: trip to Athens (or Athens & Santorini). Actual: "Final destination: San Francisco (SFO)", default name
"Trip to San Francisco", saved with `destination_city` San Francisco, `destination_tz` America/Los_Angeles, so the
header says "United States · 17:59 in San Francisco" and Weather, Pack, the guide and SOS all follow SF. The import
also warmed the San Francisco guide (~10 AI calls). The "New trip" step only lets you rename, not change the city.
Round-trip flight confirmations are the most common thing people forward.
Screenshots: `p9-import-preview-wrong-date-final-dest.jpg`, `p9-import-trip-to-san-francisco.jpg`,
`p9-trip-plan-sf-header-order.jpg`.

**B2. Every new trip spends ~11 of the user's 100 daily AI calls in the background.** P3, P9.
Steps: create a dated trip to London (no guide open). `ai_usage` went 14 → 25 calls within a minute (network log:
15 `generate-guide` calls, 1.3–14 s each). The paste import above did the same for San Francisco (+10).
Expected: background warming either free for the user (Google facts only, or not counted against `AI_DAILY_LIMIT`)
or limited to the section the user opens. Actual: about 9 new cities a day exhausts the quota, after which Pack,
import, HONK and Translate fail with "You have reached today's AI limit". Over this pass the owner's count went
14 → 45, about 21 of those from warming. Cost scales the same way. (The cache lasts 7 days, so popular cities are
cheap, but every first visitor pays.)

### Major

**M1. Import dates the next leg of an overnight connection a day early.** P9. SFO 15:50 → MUC 11:35 **+1**, then
"MUC 13:20 → ATH 16:45" under the same Sat 14 Nov heading. Saved as departing 12:20Z on the 14th, 23 hours *before*
the previous leg lands. The Plan shows MUC→ATH above SFO→MUC on Sat 14 Nov. `p9-import-preview-wrong-date-final-dest.jpg`.

**M2. Bookings cannot be edited.** P3. Booking detail sheet offers only "Delete booking" (`BookingDetailSheet.jsx`
has no edit path; `BookingFormSheet` only creates). A typo means delete and re-enter. `p3-hotel-detail-price-format.jpg`.

**M3. No check that a flight lands after it leaves.** P3. LHR 11:35 → SIN 07:50 same day (should be +1) saved
without warning: arrival 8 h before departure, card shows "arr. 07:50" with no -1 or warning.
`p3-arrival-before-departure-saved.jpg`.

**M4. Multi-city trips are single-city outside booking times.** P3, P4.
- Get there picks ride apps from the **trip's** country, not the place's: the Singapore hotel in a UK trip offers
  Uber and Bolt (neither operates in Singapore), no Grab (`getThere.js` uses `countryCode` of the trip).
  `p3-getthere-singapore-uk-apps.jpg`.
- Weather shows London only for 9–15 Nov although 13–15 Nov is Singapore (~31 °C); packing tip "Jeans and a light
  jacket". `p3-weather-london-only.jpg`.
- Pack says "For London" and ignores the Singapore hotel booking ("from your bookings"). `p3-pack-london-only.jpg`.
- Today/"Day x of y"/header clock follow one `destination_tz` (by design per LOCAL_TIME.md), so a London trip
  with Singapore days shows London's date while the traveller is in Singapore.

**M5. HONK "N min walk" is straight-line, not a route.** P1. Bangkok "I'm hungry" → "Savio · 5 min walk"; Get there
for the same place: "Walk 23 min · 1.7 km". `goosey-discover` computes `walk_min = distance_m / 80` as the crow flies.
For a "walkable right now" feature this breaks trust. `p1-honk-5min-vs-getthere-23min.jpg`.

**M6. °F users get Celsius advice.** P2. Settings → °F → Today: "49° · Hot, stay hydrated" (high 71 °F).
`weatherHint()` in `src/lib/weather.js` compares to 30 and 8 as if Celsius. `p2-fahrenheit-49-hot-stay-hydrated.jpg`.

**M7. "View only" is not enforced in the trip screen.** P6. Verified from code and RLS, not live (needs a second
account). `TripDetailScreen` sets `readOnly` only for past trips; a viewer sees "Add to plan", the FAB, paste,
pack checkboxes and delete. RLS blocks viewer inserts (bookings/activities `role in (owner, collaborator)`), so
they would hit errors instead of a read-only view. (Ideas already exclude viewers, `ideasStore.js:18`.)

**M8. Android back on the sign-in sub-screens minimises the app.** P7/P10 (Android). Continue with email → back →
launcher. `backButton.js` has no case for the auth views and falls through to `minimizeApp()`.
`android-email-login-before-back.jpg`, `android-back-exits-app.jpg`.

**M9. Translate works only from English, phrasebook only.** P10. Source language is a static "English" label
(`TranslateTool.jsx:208`); no free-text translation for "my wallet was stolen" etc. The picker lists 30 languages
while `phrase_cache` holds 35: Bengali, Croatian, Icelandic, Tamil and Urdu are pre-written but unreachable, and
there is no way to request a new language. `p10-translate-english-fixed.jpg`.

**M10. Text does not scale with the user's text size.** P7. All 60 `font-size` declarations and the type tokens
are px, so iOS Dynamic Type / browser font size have no effect. At 150 % zoom Today truncates "Show tickets" to
"Sho…", the title collides with header buttons and the Tomorrow card clips. `p7-large-text-150-truncation.jpg`.
(Reduced motion is handled globally in `ui.css`; accessible names, headings and 44 px targets passed.)

**M11. Group organiser can't manage travellers.** P6. Travelers sheet: invite by email only. No remove, no change
Can edit ↔ View only, no cancel/resend invite, no share link for a group chat. `p6-travelers-no-remove-or-role-change.jpg`.

### Minor

| # | Persona | Issue | Screenshot |
|---|---|---|---|
| m1 | P3 | Flight form requires a title even with From/To filled; the error appears at the top of the sheet while Save is at the bottom, so Save looks dead. Auto-title (as restaurants do) would remove the step. | `p3-flight-title-required.jpg`, `p3-flight-save-no-feedback.jpg` |
| m2 | P1, P4 | Eat "Cheap" band in Lisbon shows 13 of 15 places at $$; top "Eat" pick for London is Pizza Union, for Lisbon a burger chain. | `p4-eat-cheap-shows-dollar-dollar.jpg` |
| m3 | P4 | Reservation "Guests" shows 2 as a placeholder; left alone it saves `party_size` null. | `p4-reservation-guests-placeholder.jpg` |
| m4 | P4 | Trip detail opens on the last-used tab across trips; opening a new trip landed on Pack and started an AI packing run nobody asked for. | `p4-opens-on-pack-autogenerates.jpg` |
| m5 | P4 | Layout shift on Pack: the cover photo collapses after the list loads, the tabs jump up and a tap meant for "Plan" ticked a packing item. | `p4-layout-shift-misclick-packed.jpg` |
| m6 | P3 | Trip list climate chip never shows: Open-Meteo archive rejects `monthly=` (HTTP 400 "Cannot initialize ForecastVariableMonthly") in `TripList.jsx:33`; failure is silent. | n/a (network) |
| m7 | P2 | Weather "Updated 18:09" is the phone's clock (Granada was 03:09), against the local-time rule. | n/a |
| m8 | P8, P1 | Goose copy ignores local time: "beat the lunch rush" at 19:00 in Mexico City, "that's lunch" at 08:00 in Bangkok. | n/a |
| m9 | P3 | Guide Events lists Notting Hill Carnival (August) for a November trip. | n/a |
| m10 | P8 | Get there shows "Public transport 2 min · 160 m" identical to walking; Mexico has no DiDi option (HANDOFF lists DiDi as planned). | `p8-getthere-cdmx-transit-equals-walk.jpg` |
| m11 | P10 | SOS UK: "Tourist help 101" is the police non-emergency number. SOS has no country switch, so a traveller without a trip there gets the next trip's country. | `p10-sos-uk-tourist-help-101.jpg` |
| m12 | P8 | HONK "Another spot" returns to the mood picker instead of showing another spot. | n/a |
| m13 | P3 | "Search hotels" near London returns TWG Tea shops among hotels. | n/a |
| m14 | P5 | "Add dates" opens Edit trip with Depart/Return disabled because "Not sure of the dates" is still on. | `p5-add-dates-fields-disabled.jpg` |
| m15 | P5 | Pack runs for an undated trip with no season; should ask for dates first. | n/a |
| m16 | P9 | Import drops "late arrival from 23:30" (hotels have no time fields) and the flight total "USD 1.284,60" (European number format). | n/a |
| m17 | P9 | Trip list showed no booking count for the imported trip until reload ("Nov 14 – 22 · 8 nights"). | n/a |
| m18 | P3 | Delete confirmation says "Travelers on this trip lose it too" on a solo trip. | n/a |
| m19 | P10 | Passport country is a free-text "2-letter code"; no app language setting for non-native users. | n/a |
| m20 | Android | Cold start ≈ 12 s: 6 s splash, then ~5 s blank cream screen before sign-in. Warm start ≈ 4 s. | `android-auth-cold-start-12s.jpg` |
| m21 | Android | The PWA service worker runs inside the native app and fails precaching (`favicon.ico` 404 → `bad-precaching-response`). | n/a (logcat) |
| m22 | P6 | Once, the first tap after closing a sheet was swallowed by the closing scrim (Share button). | n/a |

### Polish

| # | Issue | Screenshot |
|---|---|---|
| p1 | One-day trip reads "Dec 4 – 4 · 0 nights". | `p4-trip-list-dec4-4-0-nights.jpg` |
| p2 | Prices unformatted: "SGD 1250.5". | `p3-hotel-detail-price-format.jpg` |
| p3 | Titles inconsistent: "Dinner at Solar dos Presuntos" (Confirm a visit) vs "Cantinho do Avillez" vs "BOTIN" (picked "Sobrino de Botín"). | `p4-three-cities-zones-botin-title.jpg` |
| p4 | Imported titles use "->" and ALL CAPS ("PIRAEUS (PIR) -> THIRA / SANTORINI (JTR)"); manual ones use "→". Seats show as bare "2104-2105". | `p9-trip-plan-sf-header-order.jpg` |
| p5 | FAB covers the "Copy" link on the forward-to-inbox card. | `p4-plan-ideas-fab-covers-copy.jpg` |
| p6 | Currency placeholder "EUR" on a UK trip for a USD user. | n/a |
| p7 | HONK result: the tagline chip squeezes the place name into a narrow column. | `p8-honk-title-squeezed.jpg` |
| p8 | "Show big" opens a short bottom sheet; not big enough to show a driver. | `p10-show-big-small-sheet.jpg` |
| p9 | Goose copy: "peak Lisbon foreplay" (SUD Lisboa), "aged refers to the meat and not the clientele" (ageist, retiree persona). | n/a |
| p10 | Today heading order h1 → h3 → h2. | n/a |
| p11 | Disabled date fields look identical to enabled ones. | `p5-undated-toggle-dates-look-enabled.jpg` |
| p12 | Google address with a stray "(": "Pavilhão Poente (ao lado do MAAT, Av. Brasília". | `p4-plan-ideas-fab-covers-copy.jpg` |
| p13 | Plan day order puts an all-day hotel between two flights. | `p9-trip-plan-sf-header-order.jpg` |
| p14 | Transit copy: "Metro (London Underground)"; Lisbon trams/buses credited to "Carris Metropolitana" (suburban). | n/a |
| p15 | Demo Pack fixture shows "Alhambra tickets" for every city (demo only). | n/a |
| p16 | Two add buttons on an empty trip ("Add to plan" and the FAB). | `p3-trip-detail-empty.jpg` |

## Timings

The Browser pane was hidden during the run, which can slow timers; treat these as upper bounds.

| Action | Time |
|---|---|
| Cached guide (Lisbon) after picking the city | 2.0 s |
| `generate-guide` voice calls during warming | 1.3–14.4 s each, 15 calls |
| Booking save / Google hotel search / restaurant search | < 1 s / ~1–3 s / ~1–3 s |
| Pack list (AI) | ~10–15 s |
| Paste import: 6-item email / 1-item ferry | 10 s / 8 s |
| HONK: Google facts / full Goose text | 1.8 s / 4.3 s (first run in a new city ~15 s) |
| Get there with travel times | 2.0 s |
| Phrasebook, cached language | 0.25–0.5 s |
| Android cold start to sign-in / warm start | ~12 s / ~4 s |

## Not covered

- Native signed-in flows: the emulator was signed out and passwords are never typed; Android checks were limited
  to launch, sign-in screens and the back button.
- Today across zones for a live future trip (needs the clock moved); verified on the demo trip instead
  ("04:27 Spain Time" with the phone on Pacific time).
- Forwarding by email: `receive-booking-email` is not deployed. Sending a real invite (no external email sent).
- iOS Simulator, Google sign-in, Delete account.

## Recommended fix order

1. **Import (B1, M1):** pick the destination as the place you stay (hotels / longest stay / outbound arrival), not the
   last arrival; carry "+1" into later legs and reject legs that leave before the previous one lands; let the user
   change the city on "New trip"; don't warm a guide until the trip is saved.
2. **AI quota (B2):** don't count background warming against `AI_DAILY_LIMIT`, or warm Google facts only and write
   the Goose text when a section is first opened.
3. **Quick wins, one line each:** °F thresholds in `weatherHint` (M6); auth views in the Android back handler (M8);
   ride apps from the place's country (M4, first bullet); default Guests to 2 (m3); open trips on Plan (m4).
4. **Booking edit + time sanity checks (M2, M3).**
5. **Viewer role in the UI (M7) and traveller management (M11).**
6. **HONK walking time from Routes** (M5), and hide transit when it equals walking (m10).
7. **Multi-city:** weather and packing per city from bookings; Today zone from today's booking location (M4).
8. **Translate:** source language, free-text translation, expose all 35 languages (M9).
9. **Large text:** move type tokens to rem and test at 200 % (M10).
10. Minor and polish batch, including Goose copy review (local time, events in season, tone).

## Cleanup

Baseline before testing (owner account): 0 trips, 0 bookings, 0 trip_activities, 0 collaborators, 4 badges,
goose score 55, AI calls today 14. Created during the pass: 3 trips, 12 bookings, 1 trip idea, plus a
"First Honk" badge and `honks_used` 3 from HONK tests. All deleted / restored; final query:

```
trips 0 · bookings 0 · trip_activities 0 · collaborators 0 · booking_seats 0
badges 4 · honks_used 0 · goose_score 55 · profile unchanged (USD, °C, tz UTC)
```

Left in place: shared caches (`guide_cache_sections` for London and San Francisco, `google_cache`), analytics
events, and today's AI usage (45 of 100 calls; resets at midnight UTC).
