# Multi-city trips in STT: analysis and recommended model

Read-only analysis, 2026-10-22, against `main` at 43567c7 (no repo files changed). Line refs are to that commit.

## 1. How it works today

### 1a. What a trip knows about its cities

| Fact | Where | Notes |
|---|---|---|
| One city per trip: `destination_city/_country/_country_code/_tz/_place_id/_lat/_lng` | schema; `TripForm.jsx:124` (city required) | No list of stops, no home/origin on the trip. `user_profiles.home_city` exists (fixtures) but nothing in `src/` reads it. |
| Extra cities are inferred, never stored | `src/lib/stays.js:7,23-36` | Only **hotel** bookings with `check_in_date`, geocoded (reverse-geocode per hotel, every call), kept if >= 50 km from the destination. Trains, flights, rental cars, activities never make a stop. Undated trip: no stops (`stays.js:24`). |
| Day-by-day city | `stays.js:42-58` `tripSegments` | Each day = the hotel stop covering it, else the destination. Travel days, overnight trains/flights and nights at home fall back to the destination city. |
| Trip dates | `tripsStore.js:186-195` `fillDatesIfUndated` | Called after every manual / idea / paste booking (`:203`, `ImportSheet.jsx:148`). Undated trip takes the bookings' span; a dated trip **widens** to cover any booking, with no limit or question. |

### 1b. How a new item picks a trip

| Entry point | Rule | Ref |
|---|---|---|
| Guide "+" / HONK "+" (save idea) | `tripForCity(trips, city)`: exact, case-insensitive match of `destination_city`, not ended, not viewer; live one first, else earliest. No match -> `NewTripNameSheet` -> **creates an undated "Trip to <city>"**. No picker, no date/route/distance check. | `ideasStore.js:15-21`, `saveIdea.js:6,13-29`, `ExploreScreen.jsx:85,99`, `HonkView.jsx:98,108` |
| Guide context (which trip the guide "belongs to") | Same `tripForCity`; Explore defaults to the first upcoming trip's destination | `ExploreScreen.jsx:85`, `useCityGuide.js:37-43` |
| Manual booking (Plan tab "+") | Always the open trip. Venue zone defaults to the trip's zone, place search biased to the destination | `BookingFormSheet.jsx:74-78,92-94` |
| Paste import | Requires city match with `ultimate_destination` **and** dates within +-7 days; else proposes "Create new trip". "Change trip" lets you pick any trip | `ImportSheet.jsx:16-57,126,249` |
| Paste import destination | `pickDestination`: longest hotel stay, else turnaround of round trip | `_shared/itinerary.ts:59-79` |
| Email import (forward to inbox) | One booking per email. `matchTrip`: (1) start date within +-2 days of an upcoming dated trip, (2) city substring match, (3) undated trip for the city, (4) else **auto-create "Trip to <city>"** dated to that one booking. Only an undated trip gets dates from a booking; a dated trip is **not** widened | `receive-booking-email/index.ts:89-138,357-390,459-465` |
| New trip via form | If an undated trip for the same city exists, it is dated instead of creating a twin | `TripForm.jsx:80-86` |

### 1c. What each surface keys off

| Surface | Keys off | Multi-city aware? | Ref |
|---|---|---|---|
| Trips tab auto-open | exactly one trip with `tripPhase === 'active'` | n/a | `TripsScreen.jsx:21-24` |
| Trip list card / On the road card | `destination_country || destination_city`, title, date range | No | `TripList.jsx:78-79` |
| Trip header | title, "<time> in <destination_city>" clock | No | `TripHeader.jsx:48,64` |
| Today: title, "Day n of N", weekday, today/tomorrow buckets | `destination_city`, `destination_tz` | No (by design in LOCAL_TIME.md) | `TodayView.jsx:74-94` |
| Today weather tile | `tripCoords(trip)` = destination | No | `TodayView.jsx:66` |
| Plan tab | items grouped by `bookingDay` in each booking's own zone; section header = date only; ideas below, grouped by kind | Times yes, city no | `PlanTab.jsx:147-215` |
| Weather tab | `tripSegments` (hotel stops) | Partly (hotels only) | `WeatherTab.jsx:62,90` |
| Pack tab | `tripSegments` -> `stops` to `generate-checklist`; header still "For <destination>"; weather context is destination-only | Partly | `PackTab.jsx:107-109,187`, `generate-checklist/index.ts:41-52` |
| Guide / HONK | Explore city (default: next trip's destination); HONK: GPS city | Separate from trip | `useCityGuide.js:37-43` |
| SOS numbers | device location, else current/next trip's country | Good when GPS on | `SosTool.jsx:225-237` |
| Embassy, currency, tipping, Tools banner | `findCurrentOrNextTrip(trips).destination_country_code` | No | `dates.js:59-67`, `ToolboxScreen.jsx:25-27`, `CurrencyTool.jsx:58`, `TipTool.jsx:13-14` |
| Translate default language | active trip's country | No | `TranslateTool.jsx:98` |
| Get there ride apps | live place's `country_code`, else trip country | Yes (fixed 22 Oct) | `BookingDetailSheet.jsx:146` |

## 2. Scenarios (30)

Code = verified in code; Inf = inferred from code (not run). Severity: B blocker, Mj major, Mn minor, OK.

| # | Scenario | What the app does today | Src | Traveller expects | Sev |
|---|---|---|---|---|---|
| 1 | **Flagship:** Seattle -> MAD (fly) -> trains Granada, Sevilla, Barcelona -> fly BCN -> BER -> trains in Germany -> Rome -> fly FCO -> SEA, built by **forwarding emails** | First email creates "Trip to Madrid" dated to the flight only. Dated trips are not widened by email import, so each later booking more than 2 days past the trip end fails the date match, fails the city match (Granada != Madrid) and **auto-creates its own trip**. Result: 5-10 trips | Code (`index.ts:104-118,360-390,459`) | One trip, "Spain, Germany & Italy", every booking in it | B |
| 2 | Same trip built **by hand** in one trip (destination Madrid) | Bookings all land in it; dates widen. Plan lists days with no city. Weather/Pack show Granada, Sevilla, Barcelona, Berlin, Rome **only for nights with a hotel**; flight/train days show Madrid. Today title says "Madrid" in Berlin and Rome; Tools/Translate stay on Spain/Spanish all trip; header clock "in Madrid" | Code | City of the day everywhere; route at top | Mj |
| 3 | Same trip, **paste import** one confirmation at a time | Each paste whose city isn't Madrid shows "Create new trip" as the default; user must tap "Change trip" every time | Code (`ImportSheet.jsx:40-56`) | Suggests the Spain trip because the dates fit | Mj |
| 4 | Same trip, saving a tapas bar from the **Granada guide** | `tripForCity('Granada')` = none -> "Name your trip" -> new undated "Trip to Granada" | Code | Goes into the Spain trip (dates and route cover Granada) | B |
| 5 | Day trip from base: **staying in Seattle (trip to Seattle), dinner in Tacoma** via HONK/guide | New undated "Trip to Tacoma" | Code (`saveIdea.js:14-28`) | Saved to the Seattle trip; Tacoma shown as a day trip | B |
| 6 | Day trip Madrid -> Toledo (train + cathedral ticket added manually) | Lands in Madrid trip; Toledo never appears (no hotel), weather = Madrid (fine, 70 km) | Code | Fine; optionally "Day trip to Toledo" label | Mn |
| 7 | Seattle resident, no trip, saves a Tacoma restaurant for Saturday | Creates "Trip to Tacoma" undated, shows in Upcoming forever (never ends, `hasTripEnded` false) | Code/Inf | "Saved places near home" or a picker; no fake trip | Mj |
| 8 | Saving a place in a city **on the route** but not the destination (Sevilla, trip dated and covering it) | New "Trip to Sevilla" | Code | Spain trip auto-suggested | B |
| 9 | Saving a place 30 km from the destination (Versailles, trip to Paris) | `tripForCity('Versailles')` fails -> new trip (the 50 km rule exists only in `stays.js`, not in saving) | Code | Paris trip | Mj |
| 10 | Spelling variants: "Sevilla" vs "Seville", "New York" vs "New York City", "Munich"/"Muenchen" | Exact string match only -> new trip; email matching uses substring, partly better | Code | Same city recognised (match by place_id / coordinates) | Mj |
| 11 | Two hotels the same night (airport hotel + city hotel, or a duplicate booking) | Both listed under that date; no warning. `tripStops` picks the first stop found for the day | Code | "Two hotels on 14 Nov" flag, keep / cancel one | Mn |
| 12 | Overlapping restaurant reservations (19:00 and 19:30, different venues) | Both listed; no warning | Code | Conflict hint; travel time between them | Mn |
| 13 | Red-eye flight or overnight train, no hotel that night | Night belongs to the destination city (weather, segments). Plan shows the leg on its departure day; arrival "+1" shown | Code | "On the train" night; next day = arrival city | Mn |
| 14 | Cruise / ferry (multi-day ship, ports each day) | Ferry is a transport booking (`bookingKind`); no cabin-night concept; ports not cities; weather = destination | Code/Inf | Ship nights, port of the day | Mn |
| 15 | Road trip: rental car, different hotel every night (e.g. Utah parks) | Hotels 50 km+ from destination become stops: weather/pack per night OK. Destination is whatever the form said; Today title wrong most days; Tools fine (one country) | Code | Route strip, city per day | Mj |
| 16 | Long layover (11 h in Doha, no hotel) | Invisible as a place; two flight cards; no layover length shown | Code | "11 h layover in Doha" between legs, with HONK there | Mn |
| 17 | Open jaw: fly SEA -> LIS, train to Porto, fly OPO -> SEA | Paste import: no hotels -> not a round trip by airport -> `pickDestination` returns null, AI pick stands. Email: each leg may create its own trip (see #1) | Code | One trip "Portugal" | Mj |
| 18 | Trip with a gap (Madrid 1-5, home 6-9, Berlin 10-14), one "trip" | Dates widen to 1-14; Today shows "Day 7 of 14, Madrid" while at home; weather Madrid for home days | Code | Either two trips, or a "home" gap shown as such | Mn |
| 19 | Two trips overlapping (work trip to Chicago inside a US holiday) | Trips tab no longer auto-opens Today (needs exactly one active); "On the road" lists both. Tools/SOS pick whichever `find` hits first. Saving in Chicago goes to the Chicago trip (good) | Code | Today for the trip whose place I'm in today | Mn |
| 20 | A booking outside the trip dates (hotel in March added to a November trip) | Manual/paste: trip silently widens to Nov -> Mar (`tripsStore.js:191-192`), making it "active" for months. Email: not widened, booking joins only if within +-2 days | Code | Warning: "This is 4 months after the trip. Extend trip, move to another trip, or start a new one" | Mj |
| 21 | Group trip, travellers join different legs (Ana: Spain only; Ben: Germany only) | Collaborators see the whole trip; no per-leg membership; Today/Day n same for all | Code/Inf | Per-person legs or "who's on this booking" | Mn |
| 22 | Undated trip "Trip to Lisbon" later gains bookings in Lisbon, Seville and Morocco | Dates fill from bookings; Seville and Marrakesh hotels become stops (weather OK); title/Today/Tools/SOS stay Portugal; MAD currency wrong in Morocco | Code | Countries listed; tools switch | Mj |
| 23 | Currency / SOS / phrasebook switching country mid-trip (Spain -> Germany -> Italy) | SOS follows GPS (good). Currency EUR all trip (lucky). Translate stays Spanish in Berlin and Rome. Embassy = Spain. For London -> Singapore: GBP and English in Singapore | Code | Country of today | Mj |
| 24 | Dateline: Seattle -> Tokyo -> Sydney -> Honolulu | Each booking in its own zone (good). "Day n", Today, header clock use Tokyo's zone for the whole trip: in Honolulu the "today" date is a day ahead | Code | Today in the zone where I am today | Mn |
| 25 | Hotel check-out and flight on the same day | Plan shows both on that day (check-out isn't a timed item; only check-in has a default 15:00). Weather that day = hotel city (last night is check-out minus 1) -> falls to destination | Code | "Check out by 11:00, flight 14:05, leave by 11:30" | Mn |
| 26 | Airport transfer / taxi booked as "other" or transport | Shows on its day; no link to the flight; no "time too short" check between landing and pickup | Code | Linked and checked | Mn |
| 27 | Multi-city confirmation pasted at once (Expedia with 3 flights + 3 hotels) | Parsed to N bookings, destination = longest hotel stay; matched only if that city = a trip's city, else new trip with all bookings. Good for a new trip | Code | Same, plus route title "Lisbon, Porto & Madrid" | OK |
| 28 | Person who lives in Madrid visiting Seattle | Works (trip to Seattle); nothing assumes home = Seattle. But the outbound flight from Madrid on day 1 is "in Seattle" for Today/weather | Code | Fine; day 1 "Leaving Madrid" | OK |
| 29 | Home-city saves: Seattle resident with a trip to Madrid saves a Seattle cafe in Explore | `tripForCity('Seattle')` none -> "Trip to Seattle" | Code | Not a trip; "near home" list or picker | Mj |
| 30 | Re-forwarded email for an existing trip (same booking twice) | Matches by date (+-1 day slack) and inserts a **duplicate booking** (no dedupe on confirmation number visible in matchTrip) | Inf | "Already on your trip" | Mn |

Extra notes found while reading:
- `tripStops` reverse-geocodes every hotel on every Weather/Pack render (`stays.js:9-16`); no cache. Fine for 3 hotels, slow for a 20-night road trip.
- `generate-checklist` gets stops but the weather line is the destination only and says so (`generate-checklist/index.ts:52`).
- An undated city trip created by one tap never ends, so it shadows that city in `tripForCity` forever.

## 3. Recommended model

### 3a. Trip = container of stops

| Concept | Definition |
|---|---|
| **Trip** | Owner-named container with optional dates. `destination_*` stays as the **primary** stop (for cover photo, legacy code, list card) but is no longer "the" city. |
| **Stop** | `{ city, country_code, place_id, lat, lng, tz, start (first night), end (last night), kind: 'stay' / 'transit' / 'day_trip' / 'home', source: 'derived' / 'manual' }` |
| **Derivation** (default) | Sort all bookings by real start. Nights come from hotels (as now) **plus**: overnight flight/train/ferry = `transit` night; night after an arrival leg with no hotel = arrival city; night after a leg back to home = `home`. Arrival legs to a city with no hotel and a return the same day = `day_trip` (Toledo, Tacoma). |
| **Manual override** | Owner can add, rename, merge, reorder or re-date stops (needed for trips with no hotels booked yet, and for "staying with friends"). |
| **Storage** | **Add a `trip_stops` table** (trip_id, position, city, country_code, place_id, lat, lng, tz, start_date, end_date, kind, source). Reasons: (1) email import runs server-side and must match by stop, not by `destination_city`; (2) geocoding hotels on every render is slow and costs Google calls; (3) manual stops for unbooked legs can't be derived. Recompute derived rows after any booking insert/update/delete (client for manual/paste, Edge Function for email); never overwrite `source = 'manual'`. RLS: same as bookings (via trip). |
| **Home** | Use `user_profiles.home_city` (+ lat/lng) to recognise the first and last legs and `home` gaps. |

### 3b. "Where am I today" (one function, used everywhere)

`placeOn(trip, date)` in `src/lib/stays.js`:
1. If GPS is on and the trip is live, and the phone is within 50 km of a stop of today -> that stop.
2. Else the stop whose nights cover `date`.
3. On a travel day (a leg departs that day): before departure = origin stop, after arrival = arrival stop (for "now"); for the whole-day label, "Madrid -> Granada".
4. Transit night: "On the train to Berlin".
5. Fallback: primary destination.

Today/"Day n of N" date = the date in **today's stop zone** (fixes the dateline case); booking times stay in their own zones (unchanged rule).

### 3c. How saving / booking / import choose a trip

Score every non-cancelled trip the user can edit; show the best as the default **with a picker** (any existing trip, or "New trip").

| Signal | Rule |
|---|---|
| Date fit | Dated trip covering the item's date (or today for undated saves while a trip is live) |
| Route fit | Item within **N = 75 km** of any stop of that trip (place coordinates, not city names) |
| Live trip | A trip in progress wins for saves made during it, unless the place is > 500 km from every stop |
| Undated trip | Same city/stop within N km |
| Home | Item within N km of home and no trip covers it: offer "Save near home" (no trip), never auto-create |

Hard rule: **never auto-create a city trip when a dated trip covers that day within N km**, and never silently create one from a guide/HONK save: the sheet always shows "Save to: Spain & Germany (suggested) / other trips / New trip". Email import: same scoring server-side using `trip_stops`; if no trip scores, create one, but **widen a dated trip** when a booking sits within 3 days of its edge and on its route (fixes #1); otherwise file under "Unsorted" with a push to pick a trip.

### 3d. Conflicts surfaced (Plan tab banner + inline chip, never blocking)

| Check | Rule |
|---|---|
| Double hotel | Two hotel nights overlap -> "Two hotels on 14 Nov" with both names |
| Overlapping reservations | Two timed items overlap (restaurant default 1.5 h, activity 2 h) |
| Outside trip dates | Booking more than 1 day outside: ask "Extend trip / Move to another trip / New trip" instead of silently widening (`fillDatesIfUndated`) |
| Too-tight connection | Gap between consecutive items < travel time (Routes when both have coordinates; else 90 min for flight connections, 2 h airport arrival before international departure, check-out vs flight) |
| Missing night | A night inside the trip with no hotel and no transit: "Where are you sleeping on 9 Nov?" (dismissable) |
| Duplicate | Same confirmation number / same type, time and venue |

### 3e. Plan tab grouping

- **Route strip** at top: `Seattle -> Madrid -> Granada -> Sevilla -> Barcelona -> Berlin -> ... -> Rome -> Seattle`, each chip tappable (scrolls to that stop; long-press = stop's guide).
- **Stop header** when the stop changes: "Granada · 3 nights · 12-14 Nov", then **day sections** under it as today ("Thu · Nov 13"). Travel days show "Madrid -> Granada" as the header.
- Ideas: grouped **by stop**, then by kind (Clay's current grouping kept inside each stop). Ideas with no stop match go under "Anywhere on this trip".
- "Booked" / "Not booked" labelling from Clay stays.

### 3f. Impact by surface

| Surface | Change |
|---|---|
| Trip card / list | Title: owner's name if typed; default suggestion = countries ("Spain, Germany & Italy"), or cities when one country ("Granada, Sevilla & Barcelona"); max 3 then "+2". Meta line: "6 stops · 18 nights". On the road card: today's stop city. |
| Today | Title = today's stop; overline "Day 9 of 18 · Berlin"; weather tile from today's stop; "Tomorrow: train to Rome 08:10". Travel day: "Madrid -> Granada". |
| Weather | Per stop (already per segment): switch `tripSegments` to read `trip_stops`; transit nights show the arrival city. |
| Pack | Header "For 6 stops: Spain, Germany, Italy"; weather context per stop. |
| Guide / Explore | City chips = the stops of current/next trip (not just destinations); default = today's stop when live. |
| Tools (currency, tip, translate, embassy, banner) | Country of today's stop (GPS first for SOS as now). Banner "Set for Germany · stop 4 of 6". |
| Get there | Already uses the place's country; no change. |
| Header clock | "11:20 in Berlin" from today's stop. |

## 4. Prioritised change list

Effort: S < 1 day, M 1-3 days, L > 3 days. "Clay" = file changed in Clay commits 8640b49 (Plan grouping) / 43567c7 (new trip name); sequence after or rebase on them.

| # | Change | Effort | Files | Clay overlap |
|---|---|---|---|---|
| 1 | **Trip picker on save** (guide/HONK): suggest by date + distance (stop coordinates from `tripStops` for now, destination lat/lng fallback), list all editable trips, "New trip" last; "Save near home" option. Stops `tripForCity` auto-create | M | `saveIdea.js`, `ideasStore.js#tripForCity` (keep for guide context), `ExploreScreen.jsx`, `HonkView.jsx`, `NewTripNameSheet.jsx` (becomes a step of the picker), new `TripPickerSheet.jsx` | **Yes** (43567c7: saveIdea, ExploreScreen, HonkView, NewTripNameSheet) |
| 2 | **Email import: widen dated trips** on the same route (+-3 days) and match by distance, not city string; dedupe by confirmation number | S-M | `receive-booking-email/index.ts` (matchTrip, line 459 block) | No |
| 3 | **Outside-dates prompt** instead of silent widening (keep auto-fill for undated trips) | S | `tripsStore.js#fillDatesIfUndated`, `PlanTab.jsx` save handler, `ImportSheet.jsx` | **Yes** (PlanTab, ImportSheet) |
| 4 | **`placeOn(trip, date)`** helper + use in Today title/weather tile/overline, TripHeader clock, OnTheRoad card, Tools (`findCurrentOrNextTrip` callers), Translate default, Explore default city | M | `stays.js`, `TodayView.jsx`, `TripHeader.jsx`, `TripList.jsx`, `ToolboxScreen.jsx`, `CurrencyTool.jsx`, `TipTool.jsx`, `SosTool.jsx` (embassy only), `TranslateTool.jsx`, `useCityGuide.js` | No |
| 5 | Derive stops from **all legs** (arrival city, transit nights, day trips, home), cache geocodes | M | `stays.js`, `WeatherTab.jsx`, `PackTab.jsx` | No |
| 6 | **Plan tab: route strip + stop headers + ideas by stop** | M | `PlanTab.jsx`, `detail.css`, new `RouteStrip.jsx` | **Yes** (8640b49 rewrote PlanTab grouping) |
| 7 | **Conflict checks** (double hotel, overlap, tight connection, missing night, duplicate) as a pure lib + banner in Plan | M | new `src/lib/conflicts.js`, `PlanTab.jsx` | **Yes** (PlanTab) |
| 8 | **`trip_stops` table** + recompute on booking change (client and email Edge Function); manual edit sheet for stops | L | migration, `tripsStore.js`, `stays.js`, `receive-booking-email`, new `StopsSheet.jsx`, RLS | No |
| 9 | Trip title suggestion from stops ("Spain & Germany"); list card meta "6 stops" | S | `trips.js#suggestTripName`, `TripList.jsx`, `ImportSheet.jsx` | **Yes** (suggestTripName and ImportSheet name step from 43567c7) |
| 10 | Today zone from today's stop (dateline case) | S after #4 | `dates.js#todayAtTrip`, `trips.js#tripToday/tripDay` | No; touches the LOCAL_TIME rule, needs owner sign-off (doc says "by design") |
| 11 | City matching by place_id/coordinates instead of names (Sevilla/Seville) | S | `ideasStore.js`, `ImportSheet.jsx#matchTrip`, `receive-booking-email` | ImportSheet yes |
| 12 | Per-leg travellers for group trips | L | schema (`booking_seats` / collaborators), TravelersSheet | No (defer) |

Suggested order: 2 (no UI, fixes the worst data damage) -> 1 and 3 (with Clay's current state merged) -> 4 -> 5 -> 6 and 7 together in one Plan tab pass -> 9 -> 8 when the derived model proves insufficient (email import and road trips will be the trigger) -> 10, 11 -> 12 later.

Verification to run when built (owner rule): fixture for the flagship trip in `src/dev/fixtures.js`; screenshots of Today on days 1, 5, 9, 14, 18 with phone on Seattle and Tokyo time; email-import replay of 12 confirmations producing one trip.

## 6. Owner additions (2026-10-22)
- **Do this before the paywall.** Free limits (2 upcoming trips, 5 reservations per trip) only make sense once one
  real trip stays one trip.
- **Import any itinerary format** into the multi-city model, through the paste/import sheet and the forward-to-inbox
  address (attachments):
  - Spreadsheets (CSV, XLSX, Google Sheets export), PDFs (booking confirmations, travel-agent itineraries,
    tour-operator agendas), images/screenshots.
  - **Handwritten agendas (photo)**: First Class feature (AI vision read; show what was read for confirmation
    before saving).
  - All formats go through the same pipeline: extract -> bookings + stops -> match to a trip by dates and distance
    (never by city name alone) -> preview with the trip picker -> save. Free email-import limit applies to emailed
    files the same as emails.
