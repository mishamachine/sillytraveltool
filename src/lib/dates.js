/**
 * Date helpers for date-only fields (start_date, end_date, check_in_date, activity_date, ...).
 *
 * `new Date('2026-04-04')` is parsed as UTC midnight, which renders as the previous day
 * in timezones west of UTC. These helpers parse date-only strings as LOCAL dates.
 */
import { isValidZone, todayIn } from './localTime'
import { zoneOn } from '../../supabase/functions/_shared/route.js'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse a 'YYYY-MM-DD' string as a local date at noon. Other values fall back to new Date(v). */
export function parseLocalDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value
  const m = typeof value === 'string' ? DATE_ONLY.exec(value.slice(0, 10)) : null
  if (m && value.length === 10) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return new Date(value)
}

/** Today's local date as 'YYYY-MM-DD'. */
export function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local midnight today. */
export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole calendar days from a to b (both date-only strings or Dates), DST-safe. */
export function daysBetween(a, b) {
  const da = parseLocalDate(a), db = parseLocalDate(b)
  if (!da || !db) return 0
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())
  return Math.round((ub - ua) / 86400000)
}

/**
 * Today where the traveller is on the trip: the date in today's stop's zone (Berlin on the Berlin days of a
 * Spain-Germany trip), else the destination's (destination_tz), else the phone's. Stops come with the trip
 * (trip.trip_stops); booking times always stay in their own zones (docs/LOCAL_TIME.md).
 */
export function todayAtTrip(trip) {
  if (!isValidZone(trip?.destination_tz)) return todayLocalISO()
  const d0 = todayIn(trip.destination_tz)
  const zone = trip.trip_stops?.length ? zoneOn(trip.trip_stops, d0) : null
  if (!isValidZone(zone) || zone === trip.destination_tz) return d0
  const d1 = todayIn(zone)
  return zoneOn(trip.trip_stops, d1) === zone ? d1 : d0
}

/** The zone that governs a trip's "today": today's stop's, else the destination's. */
export function tripZoneToday(trip) {
  const zone = trip?.trip_stops?.length ? zoneOn(trip.trip_stops, todayAtTrip(trip)) : null
  return isValidZone(zone) ? zone : trip?.destination_tz || null
}

/** A trip is completed when end_date < today at the destination and it isn't cancelled. */
export function isTripCompleted(trip) {
  if (!trip?.end_date || trip.status === 'cancelled') return false
  return trip.end_date.slice(0, 10) < todayAtTrip(trip)
}

/** A trip has ended (regardless of status) when end_date < today at the destination. */
export function hasTripEnded(trip) {
  return !!trip?.end_date && trip.end_date.slice(0, 10) < todayAtTrip(trip)
}

/** The in-progress trip (by the destination's date), else the next upcoming one. Cancelled trips are skipped. */
export function findCurrentOrNextTrip(trips = []) {
  const live = trips.filter(t => t.status !== 'cancelled' && t.start_date && t.end_date)
  const current = live.find(t => t.start_date <= todayAtTrip(t) && todayAtTrip(t) <= t.end_date)
  if (current) return { trip: current, isLive: true }
  const next = live
    .filter(t => t.start_date > todayAtTrip(t))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))[0]
  return { trip: next || null, isLive: false }
}
