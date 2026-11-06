// Which city Explore opens on. Pure helpers (the hook in screens/explore/useCityGuide.js wires them up).
//   1. the trip you're on, else the next upcoming trip's city (passed in as `current`/`upcoming`)
//   2. the most recent past trip's city
//   3. the last city you looked at (remembered on this device)
//   4. nothing: Explore shows a row of popular cities to tap, and writes no guide until one is tapped
import { hasTripEnded } from './dates.js'

export const LAST_CITY_KEY = 'stt_explore_last_city'

// Shown when there is nothing else to open on. Static on purpose: listing "guides already written" would mean
// reading other travellers' lookups, and a tap loads from the shared cache or writes the guide then.
export const POPULAR_CITIES = [
  { city: 'Paris', country: 'France', country_code: 'FR' },
  { city: 'Tokyo', country: 'Japan', country_code: 'JP' },
  { city: 'Rome', country: 'Italy', country_code: 'IT' },
  { city: 'Barcelona', country: 'Spain', country_code: 'ES' },
  { city: 'London', country: 'United Kingdom', country_code: 'GB' },
  { city: 'Lisbon', country: 'Portugal', country_code: 'PT' },
  { city: 'New York', country: 'United States', country_code: 'US' },
  { city: 'Bangkok', country: 'Thailand', country_code: 'TH' },
]

const tripDest = t => ({ city: t.destination_city, country: t.destination_country || '', country_code: t.destination_country_code || '' })

/** Finished trips, most recently ended first. Cancelled and undated trips are skipped. */
export function pastTrips(trips = []) {
  return trips
    .filter(t => t.status !== 'cancelled' && t.destination_city && t.end_date && hasTripEnded(t))
    .sort((a, b) => (a.end_date < b.end_date ? 1 : a.end_date > b.end_date ? -1 : 0))
}

/** Default Explore city, or null. `current` = a destination for the trip you're on / the next trip (or null). */
export function pickDefaultCity({ current = null, upcoming = null, trips = [], lastViewed = null, tripsReady = true } = {}) {
  if (current?.city) return current
  if (upcoming?.destination_city) return tripDest(upcoming)
  const past = pastTrips(trips)[0]
  if (past) return tripDest(past)
  // Until trips have loaded, "no trips" may only mean "not here yet": the remembered city must not win that race
  return tripsReady && lastViewed?.city ? lastViewed : null
}

export function readLastCity() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_CITY_KEY))
    return v && typeof v.city === 'string' && v.city ? { city: v.city, country: v.country || '', country_code: v.country_code || '' } : null
  } catch { return null }
}

export function saveLastCity(d) {
  if (!d?.city) return
  try { localStorage.setItem(LAST_CITY_KEY, JSON.stringify({ city: d.city, country: d.country || '', country_code: d.country_code || '' })) } catch { /* storage off */ }
}
