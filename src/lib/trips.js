// Display helpers for trips and bookings (pure functions, no data access).
import { format } from 'date-fns'
import { parseLocalDate, daysBetween, todayAtTrip } from './dates'
import { deviceZone, isValidZone, wallToInstant, dayIn, timeIn, zoneName, differsFromDevice } from './localTime'

/** Today's date where the trip is (its destination zone), else on the phone. */
export const tripToday = todayAtTrip

/** 'active' | 'upcoming' | 'past' | 'cancelled' by the date at the destination. */
export function tripPhase(trip, today = tripToday(trip)) {
  if (!trip) return 'upcoming'
  if (trip.status === 'cancelled') return 'cancelled'
  if (trip.start_date <= today && today <= trip.end_date) return 'active'
  if (trip.end_date && trip.end_date.slice(0, 10) < today) return 'past'
  if (trip.status === 'active') return 'active'
  return 'upcoming'
}

/** Day number within the trip (1-based) and total days. */
export function tripDay(trip, today = tripToday(trip)) {
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
// Owner rule: every booking is in the local time of the place it happens.
//   departure_time / arrival_time: real instants, shown in departure_tz / arrival_tz
//   activity_date + activity_time, check_in_date, trip_activities date + time: wall-clock values
//   at the venue, read in local_tz (else the trip's destination_tz).
// Rows saved before zones existed have no departure_tz: they keep showing in the phone's zone,
// as they did when they were entered, until they are reviewed.

const DEFAULT_CHECKIN = '15:00'

/** Zone a booking's start is shown in. */
export function bookingZone(b, tripTz) {
  if (!b) return deviceZone()
  if (b.departure_time) return isValidZone(b.departure_tz) ? b.departure_tz : deviceZone()
  if (isValidZone(b.local_tz)) return b.local_tz
  return isValidZone(tripTz) ? tripTz : deviceZone()
}

/** Zone a booking's arrival is shown in. */
export function arrivalZone(b) {
  return isValidZone(b?.arrival_tz) ? b.arrival_tz : bookingZone(b)
}

/** Start moment of a booking (a real instant), or null. */
export function bookingStart(b, tripTz) {
  if (!b) return null
  if (b.departure_time) return new Date(b.departure_time)
  const zone = bookingZone(b, tripTz)
  if (b.activity_date) return wallToInstant(`${b.activity_date}T${(b.activity_time || '12:00').slice(0, 5)}`, zone)
  if (b.check_in_date) return wallToInstant(`${b.check_in_date}T${DEFAULT_CHECKIN}`, zone)
  if (b.date) return wallToInstant(`${b.date}T${(b.time || '12:00').slice(0, 5)}`, zone) // trip_activities
  return null
}

/** True when the booking has a real clock time (not a date-only default). */
export function hasClockTime(b) {
  return !!(b?.departure_time || b?.activity_time || b?.time)
}

/** 'YYYY-MM-DD' of the booking start, at the place. */
export function bookingDay(b, tripTz) {
  const d = bookingStart(b, tripTz)
  return d ? dayIn(d, bookingZone(b, tripTz)) : null
}

/** "13:05" — the booking's start, local to the place. */
export function bookingTime(b, tripTz) {
  const d = bookingStart(b, tripTz)
  return d ? timeIn(d, bookingZone(b, tripTz)) : ''
}

/** Arrival "08:40" local to the arrival place, plus whole days after the departure date there. */
export function bookingArrival(b) {
  if (!b?.arrival_time) return null
  const arr = new Date(b.arrival_time)
  const depDay = bookingDay(b)
  const arrDay = dayIn(arr, arrivalZone(b))
  return { time: timeIn(arr, arrivalZone(b)), plusDays: depDay && arrDay ? Math.max(0, daysBetween(depDay, arrDay)) : 0 }
}

/** "Spain Time" when the place's clock differs from the phone's, else '' (no label needed). */
export function zoneHint(tz) {
  return differsFromDevice(tz) ? zoneName(tz) : ''
}

/** A Date shown as "13:05" in a zone (phone zone when none is given). */
export function timeLabel(d, tz) {
  return d ? timeIn(d, tz) : ''
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

/** Sorted by real start moment; items without a start go last. */
export function sortByStart(items, tripTz) {
  return [...items].sort((a, b) => (bookingStart(a, tripTz)?.getTime() ?? Infinity) - (bookingStart(b, tripTz)?.getTime() ?? Infinity))
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
