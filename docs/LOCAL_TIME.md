# Local time for bookings (owner rule, 21 Oct 2026)

**Every booking and reservation is shown in the local time of the place where it happens, never the phone's.**
A flight leaves at the time printed for the departure airport and lands at the time printed for the arrival
airport. Hotels, restaurants and tickets use the venue's clock. Today, "Day 4 of 10" and "next up in 1h 20m" follow
where you are on the trip (today's stop, else the destination), so nothing shifts when you plan from home or your phone
changes time zone mid-trip.

## Data model (migration `20261021220000_local_time_zones.sql`, live)

| Field | Meaning |
|---|---|
| `bookings.departure_time` / `arrival_time` | The real moment (timestamptz), unchanged type |
| `bookings.departure_tz` / `arrival_tz` | IANA zone of the departure / arrival airport or station, e.g. `America/Los_Angeles` |
| `bookings.local_tz` | IANA zone of the hotel, restaurant or venue |
| `bookings.activity_date` + `activity_time`, `check_in_date` | Wall-clock values at the venue (as printed), read in `local_tz` |
| `trips.destination_tz` | Zone of the destination: Today, day counts, plans and fallbacks |
| `timezone_cache` | Server-only cache of place → zone lookups |

## Where zones come from

- **Server** (`supabase/functions/_shared/timezones.ts`): a built-in table of ~350 airport codes, then Google
  Geocoding + Time Zone API (`GOOGLE_MAPS_SERVER_KEY` secret, set by the owner), then free fallbacks
  (Photon + timeapi.io). Results are cached.
- **`resolve-timezone`** Edge Function (signed-in users) answers the app's lookups.
- **Email import** (`receive-booking-email`, `parse-booking-email`): the AI now returns times exactly as printed,
  with no offset; the server attaches each place's zone and converts to the real moment.
- **Booking form**: departure/arrival zones fill in from the airport or station as you type, venue zones from the
  address (default: the trip's zone). Each time field says "Local time at SEA · PT" with a Change link.
- **Trips**: the zone is looked up when you pick the destination; older trips get it the first time they're opened.

## App rules (`src/lib/localTime.js`, `src/lib/trips.js`)

- Display a booking's time with `bookingTime` / `bookingArrival` / `dateTimeIn` in its own zone; never `format(new Date(...))`.
- A zone name ("Spain Time") appears next to a time whenever the place's clock differs from the phone's; the booking
  detail sheet always names it.
- "Today" for a trip is `tripToday(trip)` / `todayAtTrip(trip)`: the date in **today's stop's zone** (owner sign-off
  22 Oct 2026, multi-city build). A Spain → Germany trip counts its Berlin days in Berlin's date; a single-city trip
  is unchanged (the destination's date). Stops come from `trip_stops` (`docs/MULTI_CITY_PLAN.md`); without stops it
  falls back to `destination_tz`. `tripZoneToday(trip)` is that zone, used by Today for its day buckets.
- Rows saved before zones existed (no `departure_tz`) were fixed by the backfill on 21 Oct 2026
  (`docs/LOCAL_TIME_BACKFILL.md`); the device-zone fallback remains for any row without zones.

## Verified

- Same fixtures with the phone on Seattle, Tokyo and Madrid time give identical results (day 4 of 10, flight
  13:05 Seattle → 08:40 Madrid +1, train 07:05, dinner 20:30, "in 1h 20m").
- Android emulator set to Tokyo: Today shows Granada's date and "02:09 Spain Time"
  (`docs/screenshots/clay/09-android-localtime-today-tokyo.jpg`).
- Browser on Seattle time: a LHR → MAD flight entered as 07:40 / 11:05 is stored as 07:40Z / 10:05Z and shown as
  "07:40 · arr. 11:05 · United Kingdom Time" (`05-detail-localtime-*.jpg`).
