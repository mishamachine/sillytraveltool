// Where a trip sleeps each night, from its hotel bookings, so a multi-city trip gets each city's weather and
// packing instead of only the destination's. Nights without a hotel fall back to the trip's own city.
import { geocode, reverseGeocode, distanceM } from './places'
import { tripCoords } from './weather'
import { isUndated } from './trips'

const FAR_M = 50000 // a hotel this far from the destination is another stop

async function stayPlace(b) {
  if (b.place_lat != null && b.place_lng != null) {
    const r = await reverseGeocode(b.place_lat, b.place_lng).catch(() => null)
    return { lat: Number(b.place_lat), lon: Number(b.place_lng), city: r?.city || null, country: r?.country || null }
  }
  const q = b.hotel_address || b.hotel_name
  const g = q ? await geocode(q).catch(() => null) : null
  return g ? { lat: g.lat, lon: g.lng, city: g.city || null, country: g.country || null } : null
}

/**
 * Stops away from the trip's city: [{ city, country, lat, lon, start, end }] with start = check-in date and
 * end = the last night (check-out minus one). Empty for a single-city trip.
 */
export async function tripStops(trip, bookings = []) {
  if (!trip || isUndated(trip)) return []
  const home = await tripCoords(trip)
  const hotels = bookings.filter(b => b.trip_id === trip.id && b.type === 'hotel' && b.check_in_date)
  const stops = []
  for (const b of hotels) {
    const p = await stayPlace(b)
    if (!p || (home && distanceM({ lat: home.lat, lng: home.lon }, { lat: p.lat, lng: p.lon }) < FAR_M)) continue
    const out = b.check_out_date || b.check_in_date
    const last = new Date(`${out}T12:00:00Z`); if (out > b.check_in_date) last.setUTCDate(last.getUTCDate() - 1)
    stops.push({ ...p, city: p.city || b.hotel_name, start: b.check_in_date, end: last.toISOString().slice(0, 10) })
  }
  return stops.sort((a, b) => (a.start < b.start ? -1 : 1))
}

/**
 * The trip's dates split into runs by place: [{ city, lat, lon, start, end }], covering every day from start
 * to end. Days not in a stop belong to the trip's own city.
 */
export async function tripSegments(trip, bookings = []) {
  const fromStops = segmentsFromStops(trip)
  if (fromStops) return fromStops
  const home = await tripCoords(trip)
  const stops = await tripStops(trip, bookings)
  if (!home && !stops.length) return []
  const base = { city: trip.destination_city, lat: home?.lat, lon: home?.lon }
  const day = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
  const segments = []
  for (let d = trip.start_date; d <= trip.end_date; d = day(d, 1)) {
    const stop = stops.find(s => d >= s.start && d <= s.end)
    const place = stop || base
    if (place.lat == null) continue
    const last = segments[segments.length - 1]
    if (last && last.city === place.city && last.lat === place.lat && last.end === day(d, -1)) last.end = d
    else segments.push({ city: place.city, country: place.country, lat: place.lat, lon: place.lon, start: d, end: d })
  }
  return segments
}

/**
 * Segments from the trip's saved stops (trip_stops, derived from all bookings: trains and flights too, not only
 * hotels). A night on board belongs to where it arrives. Null when the trip has no stops yet.
 */
function segmentsFromStops(trip) {
  const stops = (trip?.trip_stops || []).filter(s => s.nights > 0 && s.lat != null && s.kind !== 'day_trip')
  if (!stops.length || isUndated(trip)) return null
  const day = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const at = d => {
    const s = sorted.find(x => d >= x.start_date && d < x.end_date) || sorted.find(x => x.end_date === d)
    if (s?.kind !== 'transit') return s
    return sorted.find(x => x.position > s.position && x.kind !== 'transit') || s
  }
  const segments = []
  for (let d = trip.start_date; d <= trip.end_date; d = day(d, 1)) {
    const s = at(d)
    if (!s) continue
    const last = segments[segments.length - 1]
    if (last && last.city === s.city && last.end === day(d, -1)) last.end = d
    else segments.push({ city: s.city, country: s.country, lat: Number(s.lat), lon: Number(s.lng), start: d, end: d })
  }
  return segments.length ? segments : null
}
