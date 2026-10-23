// A trip's route, from all its bookings: where the traveller sleeps each night, the stops that makes, travel days,
// day trips and the way home (docs/MULTI_CITY_PLAN.md §3a/§3b). Plain JS, shared by the app and Edge Functions;
// geocoding is passed in, so the rule itself does no I/O.
//
// Booking dates are local to each place (owner rule, docs/LOCAL_TIME.md): a flight departs on its departure
// airport's date and lands on its arrival airport's date.

import { distanceKm, NEAR_KM } from './tripMatch.js'

const SAME_KM = 50 // two places this close are the same stop
const DAY_TRIP_KM = 30 // a visit this far from where you sleep is a day trip (Toledo from Madrid, Tacoma from Seattle)
const DAY = 86400000
export const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const span = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY)

/** Calendar date of an instant in a zone ('YYYY-MM-DD'), else of a date-only value as written. */
export function dayIn(value, tz) {
  if (!value) return null
  const s = String(value)
  if (!/T/.test(s)) return s.slice(0, 10)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s))
  } catch { return s.slice(0, 10) }
}

const isLeg = b => b.type === 'flight' || (b.type === 'transport' && !!b.arrival_airport && b.arrival_airport !== b.departure_airport)
const legQuery = (b, side) => (b[side] ? `${b[side]}${b.type === 'flight' && /^[A-Z]{3}$/i.test(String(b[side]).trim()) ? ' airport' : ''}` : null)
const near = (a, b, km = SAME_KM) => !!(a && b && distanceKm(a, b) <= km)

/**
 * The trip's legs (flights, trains, buses, ferries between places) with local dates and resolved places:
 * [{ booking, dep: place, arr: place, depDay, arrDay, depAt, arrAt }] in time order.
 * resolve(query) → { city, country, country_code, lat, lng } | null
 */
export async function tripLegs(bookings, { resolve: resolveIn }) {
  const resolve = memo(resolveIn)
  await Promise.all(bookings.filter(isLeg).flatMap(b => [resolve(legQuery(b, 'departure_airport')), resolve(legQuery(b, 'arrival_airport'))]))
  const legs = []
  for (const b of bookings.filter(isLeg)) {
    const [dep, arr] = await Promise.all([resolve(legQuery(b, 'departure_airport')), resolve(legQuery(b, 'arrival_airport'))])
    const depDay = dayIn(b.departure_time, b.departure_tz)
    if (!depDay) continue
    legs.push({
      booking: b, dep: dep && { ...dep, tz: b.departure_tz || null }, arr: arr && { ...arr, tz: b.arrival_tz || null },
      depDay, arrDay: dayIn(b.arrival_time, b.arrival_tz) || depDay,
      depAt: b.departure_time ? Date.parse(b.departure_time) : null, arrAt: b.arrival_time ? Date.parse(b.arrival_time) : null,
    })
  }
  return legs.sort((a, b) => (a.depAt ?? 0) - (b.depAt ?? 0) || (a.depDay < b.depDay ? -1 : 1))
}

const memo = fn => {
  const m = new Map()
  return (...args) => { const k = JSON.stringify(args); if (!m.has(k)) m.set(k, Promise.resolve(fn(...args)).catch(() => null)); return m.get(k) }
}

/** Every lookup the trip needs, started at once (they are slow one by one), then served from memory. */
async function prefetched(trip, bookings, ctx) {
  const resolve = memo(ctx.resolve), reverse = ctx.reverse ? memo(ctx.reverse) : null
  const jobs = []
  for (const b of bookings) {
    if (isLeg(b)) jobs.push(resolve(legQuery(b, 'departure_airport')), resolve(legQuery(b, 'arrival_airport')))
    else if (b.place_lat != null && b.place_lng != null) { if (reverse) jobs.push(reverse(Number(b.place_lat), Number(b.place_lng))) }
    else {
      const q = b.hotel_address || b.venue_address || [b.hotel_name || b.venue_name, trip?.destination_city].filter(Boolean).join(', ')
      if (q) jobs.push(resolve(q))
    }
  }
  await Promise.all(jobs)
  return { ...ctx, resolve, reverse }
}

/** Where a hotel or venue is: its own coordinates (and their city), else its address or name. */
async function venuePlace(b, { resolve, reverse, trip }) {
  if (b.place_lat != null && b.place_lng != null) {
    const r = reverse ? await reverse(Number(b.place_lat), Number(b.place_lng)) : null
    return { ...(r || {}), lat: Number(b.place_lat), lng: Number(b.place_lng), tz: b.local_tz || r?.tz || null }
  }
  const q = b.hotel_address || b.venue_address || [b.hotel_name || b.venue_name, trip?.destination_city].filter(Boolean).join(', ')
  const g = q ? await resolve(q) : null
  return g ? { ...g, tz: b.local_tz || null } : null
}

/**
 * Stops of a trip, in order: [{ position, city, country, country_code, lat, lng, tz, start_date, end_date, nights,
 * kind }] where kind is 'home' (where the trip starts or ends), 'stay', 'transit' (a night on a train, plane or
 * ferry) or 'day_trip' (there and back without sleeping). start_date is the first day there, end_date the day you
 * leave (a stay of 3 nights from 10 Nov ends 13 Nov). Undated trips have no stops.
 * ctx: { resolve(query), reverse(lat, lng), home?: { lat, lng } }
 */
export async function deriveStops(trip, bookings, ctxIn) {
  if (!trip?.start_date || !trip?.end_date) return []
  const mine = bookings.filter(b => !b.trip_id || b.trip_id === trip.id)
  const ctx = await prefetched(trip, mine, ctxIn)
  const legs = await tripLegs(mine, ctx)
  const first = trip.start_date, last = trip.end_date
  const sleep = new Map() // date → { place, kind }

  // 1. Hotel nights
  for (const b of mine.filter(b => b.type === 'hotel' && b.check_in_date)) {
    const p = await venuePlace(b, { ...ctx, trip })
    if (!p) continue
    const out = b.check_out_date && b.check_out_date > b.check_in_date ? b.check_out_date : addDays(b.check_in_date, 1)
    for (let d = b.check_in_date; d < out; d = addDays(d, 1)) sleep.set(d, { place: p, kind: 'stay', hotel: true })
  }
  // 2. Nights on board: a leg that lands on a later day, with no hotel that night
  for (const l of legs) {
    for (let d = l.depDay; d < l.arrDay; d = addDays(d, 1)) {
      if (!sleep.get(d)?.hotel && l.arr) sleep.set(d, { place: l.arr, kind: 'transit' })
    }
  }
  // 3. Nights with no hotel after arriving somewhere: you sleep where you landed until the next leg
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i], next = legs[i + 1]
    if (!l.arr) continue
    const until = next ? next.depDay : addDays(last, 1)
    for (let d = l.arrDay; d < until && d <= last; d = addDays(d, 1)) {
      if (!sleep.has(d)) sleep.set(d, { place: l.arr, kind: 'stay', assumed: true })
    }
  }
  // Before the first leg (or with no legs): the trip's own city
  const dest = trip.destination_lat != null
    ? { city: trip.destination_city, country: trip.destination_country, country_code: trip.destination_country_code, lat: Number(trip.destination_lat), lng: Number(trip.destination_lng), tz: trip.destination_tz }
    : null

  // Home: the profile's home, else where a round trip starts and ends
  const origin = legs[0]?.dep, end = legs[legs.length - 1]?.arr
  const home = ctx.home || (origin && end && near(origin, end, NEAR_KM) ? origin : null)
  const isHome = p => !!(home && near(p, home, NEAR_KM))

  // 4. Runs of nights in one place become stops
  const stops = []
  for (let d = first; d < last; d = addDays(d, 1)) {
    let s = sleep.get(d)
    if (!s) {
      const before = legs.length && d < legs[0].depDay
      s = before && origin ? { place: origin, kind: 'stay', assumed: true } : dest ? { place: dest, kind: 'stay', assumed: true } : null
    }
    if (!s?.place) continue
    const kind = s.kind === 'transit' ? 'transit' : isHome(s.place) ? 'home' : 'stay'
    const prev = stops[stops.length - 1]
    if (prev && prev.kind === kind && prev.end_date === d && near(prev, s.place)) { prev.end_date = addDays(d, 1); prev.nights++; continue }
    stops.push({ ...pick(s.place), start_date: d, end_date: addDays(d, 1), nights: 1, kind })
  }

  // 5. The way there and back: home (or wherever the first leg leaves from) and the last leg's arrival
  if (origin && !(stops[0] && near(stops[0], origin) && stops[0].start_date === first)) {
    stops.unshift({ ...pick(origin), start_date: legs[0].depDay, end_date: legs[0].depDay, nights: 0, kind: 'home', _order: -1 })
  }
  const lastLeg = legs[legs.length - 1]
  if (end && lastLeg.arrDay >= addDays(last, -1) && !(stops.length && near(stops[stops.length - 1], end) && stops[stops.length - 1].kind !== 'transit')) {
    stops.push({ ...pick(end), start_date: lastLeg.arrDay, end_date: lastLeg.arrDay, nights: 0, kind: 'home', _order: 3 })
  }

  // 6. Day trips: a booked visit or a there-and-back leg somewhere other than where you sleep that night
  const dayPlaces = []
  for (const b of mine.filter(b => !isLeg(b) && b.type !== 'hotel' && b.activity_date)) {
    const p = await venuePlace(b, { ...ctx, trip })
    if (p) dayPlaces.push({ day: b.activity_date, place: p })
  }
  for (const l of legs) if (l.arr && l.arrDay === l.depDay) dayPlaces.push({ day: l.arrDay, place: l.arr, leg: true })
  for (const { day, place } of dayPlaces) {
    const where = stops.find(s => s.kind !== 'home' && s.kind !== 'day_trip' && day >= s.start_date && day < s.end_date) ||
      stops.find(s => s.end_date === day && s.kind !== 'day_trip')
    const nextStop = stops.find(s => s.start_date === day && s.kind !== 'day_trip')
    if (!where || near(where, place, DAY_TRIP_KM) || (nextStop && near(nextStop, place, DAY_TRIP_KM)) || isHome(place)) continue
    if (stops.some(s => s.kind === 'day_trip' && s.start_date === day && near(s, place))) continue
    stops.push({ ...pick(place), start_date: day, end_date: day, nights: 0, kind: 'day_trip' })
  }

  return stops
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : order(a) - order(b)))
    .map(({ _order, ...s }, position) => ({ ...s, position })) // eslint-disable-line no-unused-vars
}

// On the same day: leaving home first, arriving home last, a day trip before the next stay
const order = s => s._order ?? (s.kind === 'day_trip' ? 1 : 2)

function pick(p) {
  return {
    city: p.city || p.name || 'Somewhere', country: p.country || null, country_code: p.country_code || null,
    lat: p.lat ?? null, lng: p.lng ?? null, tz: p.tz || null, place_id: p.place_id || null,
  }
}

/**
 * Where the traveller is on a date: { kind: 'stay' | 'home' | 'travel' | 'transit' | 'day_trip', city, country_code,
 * tz, lat, lng, label, from?, to? }. A travel day reads "Madrid → Granada" and, given `now` (ms), the place you're
 * at now (origin before departure, destination after arrival). A night on board reads "On the way to Berlin".
 * Falls back to the trip's destination.
 */
export function placeOn(trip, date, stops = [], legs = [], { now = null } = {}) {
  const dest = { city: trip?.destination_city, country_code: trip?.destination_country_code, tz: trip?.destination_tz, lat: trip?.destination_lat, lng: trip?.destination_lng }
  const moving = legs.filter(l => l.depDay === date && l.dep && l.arr && !near(l.dep, l.arr))
  if (moving.length) {
    const a = moving[0], z = moving[moving.length - 1]
    const from = place(a.dep), to = place(z.arr)
    let here = to
    if (now != null) {
      if (a.depAt != null && now < a.depAt) here = from
      else if (z.arrAt != null && now < z.arrAt) here = { ...to, inTransit: true }
    }
    return { kind: 'travel', ...here, from, to, label: `${from.city} → ${to.city}` }
  }
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const day = sorted.find(s => s.kind === 'day_trip' && s.start_date === date)
  if (day) return { kind: 'day_trip', ...place(day), label: day.city }
  const night = sorted.find(s => s.kind !== 'day_trip' && s.nights > 0 && date >= s.start_date && date < s.end_date)
  if (night?.kind === 'transit') {
    const next = sorted.find(s => s.position > night.position && s.kind !== 'transit' && s.kind !== 'day_trip')
    return { kind: 'transit', ...place(next || night), label: `On the way to ${(next || night).city}` }
  }
  if (night) return { kind: night.kind, ...place(night), label: night.city }
  const leaving = sorted.find(s => s.kind !== 'day_trip' && s.end_date === date)
  if (leaving) return { kind: leaving.kind, ...place(leaving), label: leaving.city }
  return { kind: 'stay', ...dest, label: dest.city }
}

const place = p => ({ city: p.city, country: p.country || null, country_code: p.country_code || null, tz: p.tz || null, lat: p.lat ?? null, lng: p.lng ?? null })

/** The stop whose time zone governs a date (for "today" and "Day n of N"), from stops alone. */
export function zoneOn(stops = [], date) {
  const s = stops.find(x => x.kind !== 'day_trip' && x.nights > 0 && date >= x.start_date && date < x.end_date) ||
    stops.find(x => x.kind !== 'day_trip' && x.end_date === date)
  return s?.tz || null
}

/** The route as stops, without nights on board or day trips: Seattle → Madrid → … → Seattle. */
export function routeCities(stops = []) {
  const out = []
  for (const s of [...stops].sort((a, b) => a.position - b.position)) {
    if (s.kind === 'transit' || s.kind === 'day_trip') continue
    if (out[out.length - 1]?.city !== s.city) out.push(s)
  }
  return out
}

/**
 * A trip name from its stops: countries when there are several ("Spain, Germany & Italy"), else cities
 * ("Granada, Sevilla & Barcelona"); three at most, then "+2". Null when there's nothing to name.
 */
export function nameFromStops(stops = []) {
  const away = stops.filter(s => s.kind === 'stay')
  if (!away.length) return null
  const uniq = arr => arr.filter((x, i) => x && arr.indexOf(x) === i)
  const countries = uniq(away.map(s => s.country))
  const parts = countries.length > 1 ? countries : uniq(away.map(s => s.city))
  if (parts.length === 1) return parts[0]
  const shown = parts.slice(0, 3)
  const more = parts.length - shown.length
  return more > 0 ? `${shown.join(', ')} +${more}` : `${shown.slice(0, -1).join(', ')} & ${shown[shown.length - 1]}`
}

export { span as daysBetween }
