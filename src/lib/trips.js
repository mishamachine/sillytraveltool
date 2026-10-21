// Display helpers for trips and bookings (pure functions, no data access).
import { format } from 'date-fns'
import { parseLocalDate, todayLocalISO, daysBetween, hasTripEnded } from './dates'

/** 'active' | 'upcoming' | 'past' | 'cancelled' by local date. */
export function tripPhase(trip, today = todayLocalISO()) {
  if (!trip) return 'upcoming'
  if (trip.status === 'cancelled') return 'cancelled'
  if (trip.start_date <= today && today <= trip.end_date) return 'active'
  if (hasTripEnded(trip)) return 'past'
  if (trip.status === 'active') return 'active'
  return 'upcoming'
}

/** Day number within the trip (1-based) and total days. */
export function tripDay(trip, today = todayLocalISO()) {
  const total = daysBetween(trip.start_date, trip.end_date) + 1
  const n = Math.min(total, Math.max(1, daysBetween(trip.start_date, today) + 1))
  return { n, total }
}

export function nightsOf(trip) {
  return Math.max(0, daysBetween(trip.start_date, trip.end_date))
}

/** "Apr 1 – 10" / "Mar 28 – Apr 4" / with year: "Mar 6 – 12, 2026" */
export function formatRange(startISO, endISO, { year = false } = {}) {
  const s = parseLocalDate(startISO), e = parseLocalDate(endISO)
  if (!s || !e) return ''
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const left = format(s, 'MMM d')
  const right = sameMonth ? format(e, 'd') : format(e, 'MMM d')
  const y = year || s.getFullYear() !== new Date().getFullYear() ? `, ${format(e, 'yyyy')}` : ''
  return `${left} – ${right}${y}`
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

// ---- bookings ----

const DEFAULT_CHECKIN = '15:00'

/** Start moment of a booking as a Date (local), or null. */
export function bookingStart(b) {
  if (!b) return null
  if (b.departure_time) return new Date(b.departure_time)
  if (b.activity_date) return new Date(`${b.activity_date}T${(b.activity_time || '12:00').slice(0, 5)}:00`)
  if (b.check_in_date) return new Date(`${b.check_in_date}T${DEFAULT_CHECKIN}:00`)
  if (b.date) return new Date(`${b.date}T${(b.time || '12:00').slice(0, 5)}:00`) // trip_activities
  return null
}

/** True when the booking has a real clock time (not a date-only default). */
export function hasClockTime(b) {
  return !!(b?.departure_time || b?.activity_time || b?.time)
}

/** Local 'YYYY-MM-DD' of the booking start. */
export function bookingDay(b) {
  const d = bookingStart(b)
  return d ? format(d, 'yyyy-MM-dd') : null
}

export function timeLabel(d) {
  return d ? format(d, 'HH:mm') : ''
}

/** Booking type → category key used by IconTile CATEGORY (transport splits by mode). */
export function bookingKind(b) {
  if (!b) return 'other'
  if (b.type === 'transport') {
    const mode = (b.transport_mode || '').toLowerCase()
    if (['bus', 'ferry', 'car'].includes(mode)) return mode
    if (mode === 'car_rental' || mode === 'rental') return 'car'
    return 'train'
  }
  if (b.type === 'activity' && /museum|museo|gallery|galer/i.test(`${b.title} ${b.venue_name || ''}`)) return 'museum'
  return b.type || 'other'
}

/** Short meta line for a booking row. */
export function bookingMeta(b) {
  const bits = []
  if (b.type === 'flight') {
    if (b.flight_number) bits.push(b.flight_number)
    if (b.seat_number) bits.push(`Seat ${b.seat_number}`)
  } else if (b.type === 'hotel') {
    if (b.check_in_date && b.check_out_date) bits.push(plural(daysBetween(b.check_in_date, b.check_out_date), 'night'))
    if (b.hotel_name && !b.title?.includes(b.hotel_name)) bits.push(b.hotel_name)
  } else if (b.type === 'transport') {
    if (b.provider) bits.push(b.provider)
    if (b.seat_number) bits.push(b.seat_number)
  } else if (b.type === 'restaurant') {
    if (b.party_size) bits.push(plural(b.party_size, 'guest'))
    if (b.venue_name && !b.title?.includes(b.venue_name)) bits.push(b.venue_name)
  } else {
    if (b.ticket_quantity) bits.push(plural(b.ticket_quantity, 'ticket'))
    else if (b.venue_name && !b.title?.includes(b.venue_name)) bits.push(b.venue_name)
  }
  if (b.confirmation_number && bits.length < 2) bits.push(`Conf. ${b.confirmation_number}`)
  return bits.join(' · ')
}

/** Sorted, with start dates; items without a start go last. */
export function sortByStart(items) {
  return [...items].sort((a, b) => (bookingStart(a)?.getTime() ?? Infinity) - (bookingStart(b)?.getTime() ?? Infinity))
}

/** "in 1h 20m" / "in 3 days" / "now" */
export function relativeIn(date, now = new Date()) {
  const min = Math.round((date - now) / 60000)
  if (min <= 0) return 'now'
  if (min < 60) return `in ${min}m`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`
  return `in ${plural(Math.round(h / 24), 'day')}`
}

/** Maps search for an address or place. */
export function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
