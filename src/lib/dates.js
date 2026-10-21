/**
 * Date helpers for date-only fields (start_date, end_date, check_in_date, activity_date, ...).
 *
 * `new Date('2026-04-04')` is parsed as UTC midnight, which renders as the previous day
 * in timezones west of UTC. These helpers parse date-only strings as LOCAL dates.
 */

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

/** A trip is completed when end_date < today (local) and it isn't cancelled. */
export function isTripCompleted(trip) {
  if (!trip?.end_date || trip.status === 'cancelled') return false
  return trip.end_date.slice(0, 10) < todayLocalISO()
}

/** A trip has ended (regardless of status) when end_date < today (local). */
export function hasTripEnded(trip) {
  return !!trip?.end_date && trip.end_date.slice(0, 10) < todayLocalISO()
}

/** The in-progress trip (by local date), else the next upcoming one. Cancelled trips are skipped. */
export function findCurrentOrNextTrip(trips = []) {
  const today = todayLocalISO()
  const live = trips.filter(t => t.status !== 'cancelled' && t.start_date && t.end_date)
  const current = live.find(t => t.start_date <= today && today <= t.end_date)
  if (current) return { trip: current, isLive: true }
  const next = live
    .filter(t => t.start_date > today)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))[0]
  return { trip: next || null, isLive: false }
}
