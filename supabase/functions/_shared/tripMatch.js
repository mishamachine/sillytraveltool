// Which trip a booking or saved place belongs to, by dates and distance, never by city name alone.
// Plain JS so the app (Vite) and the Edge Functions (Deno) share one rule.
//
// item:  { start, end }  YYYY-MM-DD local dates of the booking (null for an undated saved place)
//        points: [{ lat, lng }]  where it happens (both ends for a flight or train)
// trip:  a trips row (start_date, end_date, status, destination_lat/lng) plus
//        points: [{ lat, lng }]  its stops and booked places, if known
// ctx:   { today: YYYY-MM-DD }

export const NEAR_KM = 75     // a place this close to a stop is on the trip's route
export const EDGE_DAYS = 3    // a booking this close to a trip's ends extends it when it is on the route
export const LIVE_KM = 500    // during a trip, saves within this distance of its stops belong to it

const R = 6371
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity
  const rad = x => (Number(x) * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const valid = p => p && p.lat != null && p.lng != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
const pt = p => ({ lat: Number(p.lat), lng: Number(p.lng) })

/** Every known point of a trip: its destination plus any stops or booked places passed in. */
export function tripPoints(trip) {
  const pts = []
  if (valid({ lat: trip?.destination_lat, lng: trip?.destination_lng })) pts.push(pt({ lat: trip.destination_lat, lng: trip.destination_lng }))
  for (const p of trip?.points || []) if (valid(p)) pts.push(pt(p))
  return pts
}

/** Closest distance in km between any point of the item and any point of the trip (Infinity when unknown). */
export function routeKm(trip, item) {
  const tp = tripPoints(trip)
  let best = Infinity
  for (const a of (item?.points || []).filter(valid)) for (const b of tp) best = Math.min(best, distanceKm(pt(a), b))
  return best
}

const DAY = 86400000
const dayNum = d => Math.round(Date.parse(`${d}T12:00:00Z`) / DAY)

/** Days between the item and the trip's dates: 0 when they overlap. */
export function gapDays(trip, item) {
  const s = dayNum(trip.start_date), e = dayNum(trip.end_date)
  const a = dayNum(item.start), z = dayNum(item.end || item.start)
  if (z < s) return s - z
  if (a > e) return a - e
  return 0
}

/**
 * How well a trip fits an item: { score, fit, km, widen } where fit is
 * 'inside' (dates overlap) | 'edge' (within EDGE_DAYS of an end and on the route: widen gives new dates) |
 * 'live' (undated save during the trip, near enough) | 'upcoming' (undated save near a dated trip's stops) |
 * 'undated' (undated trip near the item) | null (no fit; score 0).
 */
export function scoreTrip(trip, item, ctx = {}) {
  const none = { score: 0, fit: null, km: Infinity, widen: null }
  if (!trip || trip.status === 'cancelled') return none
  const km = routeKm(trip, item)
  const near = km <= NEAR_KM
  const dated = !!(trip.start_date && trip.end_date)
  const closeness = Number.isFinite(km) ? Math.max(0, 20 - km / 50) : 0 // tie-break: nearer wins

  if (item.start) {
    if (dated) {
      const gap = gapDays(trip, item)
      const end = item.end || item.start
      const union = { start_date: item.start < trip.start_date ? item.start : trip.start_date, end_date: end > trip.end_date ? end : trip.end_date }
      const widen = union.start_date !== trip.start_date || union.end_date !== trip.end_date ? union : null
      if (gap === 0) return { score: 80 + closeness, fit: 'inside', km, widen }
      if (gap <= EDGE_DAYS && near) return { score: 60 + closeness - gap, fit: 'edge', km, widen }
      return { ...none, km }
    }
    if (near && trip.status !== 'completed') {
      return { score: 50 + closeness, fit: 'undated', km, widen: { start_date: item.start, end_date: item.end || item.start } }
    }
    return { ...none, km }
  }

  // An undated item (a place saved from the guide): the trip you're on, else the next one passing nearby
  const today = ctx.today
  if (dated && today && trip.end_date >= today) {
    if (trip.start_date <= today && km <= LIVE_KM) return { score: 90 + closeness, fit: 'live', km, widen: null }
    if (trip.start_date > today && near) return { score: 70 + closeness, fit: 'upcoming', km, widen: null }
  }
  if (!dated && near && trip.status !== 'completed') return { score: 60 + closeness, fit: 'undated', km, widen: null }
  return { ...none, km }
}

/**
 * Local date span of a booking as printed (wall-clock strings or dates): { start, end } or null.
 * A hotel runs from check-in to check-out; a flight or train from departure to arrival.
 */
export function wallSpan(b) {
  const d = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
  const dates = [b?.departure_time, b?.arrival_time, b?.check_in_date, b?.check_out_date, b?.activity_date].map(d).filter(Boolean).sort()
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null
}

/** Trips ranked best first: [{ trip, score, fit, km, widen }], including those that don't fit (score 0). */
export function rankTrips(trips, item, ctx = {}) {
  return (trips || [])
    .map(trip => ({ trip, ...scoreTrip(trip, item, ctx) }))
    .sort((a, b) => b.score - a.score || a.km - b.km || String(a.trip.start_date || '9').localeCompare(String(b.trip.start_date || '9')))
}

/** The trip an item belongs to, or null when nothing fits (then ask, or start a new trip). */
export function bestTrip(trips, item, ctx = {}) {
  const top = rankTrips(trips, item, ctx)[0]
  return top && top.score > 0 ? top : null
}
