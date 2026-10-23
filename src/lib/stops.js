// A trip's stops and "where am I today", on the phone. The rule lives in supabase/functions/_shared/route.js; this
// file supplies geocoding (the places Edge Function, cached) and the saved stops (trip_stops, loaded with trips).
import { deriveStops, tripLegs, placeOn, routeCities, nameFromStops } from '../../supabase/functions/_shared/route.js'
import { geocode, reverseGeocode } from './places'
import { todayAtTrip, findCurrentOrNextTrip } from './dates'
import { isValidZone } from './localTime'

export { routeCities, nameFromStops }

const ctx = {
  resolve: async (q) => (q ? (await geocode(q).catch(() => null)) : null),
  reverse: async (lat, lng) => (await reverseGeocode(lat, lng).catch(() => null)),
}

/** Home coordinates from the profile's home city (cached by places.js). */
export async function homePoint(profile) {
  const g = profile?.home_city ? await ctx.resolve(profile.home_city) : null
  return g?.lat != null ? { lat: g.lat, lng: g.lng } : null
}

/** Stops derived from a trip's bookings (all of them, with zones and coordinates). */
export async function computeStops(trip, bookings, { home = null } = {}) {
  return deriveStops(trip, bookings, { ...ctx, home })
}

/** The trip's legs with places, for travel days ("Madrid → Granada"). */
export async function computeLegs(bookings) {
  return tripLegs(bookings, ctx)
}

const stopKey = s => [s.position, s.kind, s.city, s.start_date, s.end_date, s.nights, s.tz].join('|')
/** True when the derived stops differ from the saved ones. */
export const stopsChanged = (saved = [], next = []) =>
  saved.length !== next.length || [...saved].sort((a, b) => a.position - b.position).some((s, i) => stopKey(s) !== stopKey(next[i]))

/**
 * Where the traveller is on a date of a trip (default today, at today's stop): see route.js placeOn.
 * legs (from computeLegs) make travel days exact; without them a day between two stops still reads "A → B".
 */
export function tripPlace(trip, { date = todayAtTrip(trip), legs = [], now = Date.now() } = {}) {
  const stops = trip?.trip_stops || []
  const p = placeOn(trip, date, stops, legs, { now })
  if (p.kind === 'travel' || legs.length) return p
  // No legs loaded: a day one stop ends and the next starts is a travel day
  const sorted = [...stops].sort((a, b) => a.position - b.position).filter(s => s.kind !== 'day_trip')
  const i = sorted.findIndex(s => s.end_date === date && s.start_date < date)
  const next = i >= 0 ? sorted.slice(i + 1).find(s => s.start_date === date && s.kind !== 'transit') : null
  if (next && next.city !== sorted[i].city) {
    const from = sorted[i]
    return { ...p, kind: 'travel', city: next.city, country_code: next.country_code, tz: next.tz, lat: next.lat, lng: next.lng,
      from, to: next, label: `${from.city} → ${next.city}` }
  }
  return p
}

/**
 * The place the tools (currency, tipping, embassy, translate) should use: today's stop on a live trip, else the
 * first stay of the next trip, else its destination. { trip, isLive, city, country_code, tz } or null.
 */
export function currentPlace(trips = []) {
  const { trip, isLive } = findCurrentOrNextTrip(trips)
  if (!trip) return null
  if (isLive) {
    const p = tripPlace(trip)
    const stays = routeCities(trip.trip_stops || []).filter(s => s.kind === 'stay')
    const at = stays.findIndex(s => s.city === p.city)
    return {
      trip, isLive, city: p.city || trip.destination_city, country: p.country || (p.country_code === trip.destination_country_code ? trip.destination_country : null),
      country_code: p.country_code || trip.destination_country_code, tz: isValidZone(p.tz) ? p.tz : trip.destination_tz,
      stop: stays.length > 1 && at >= 0 ? { n: at + 1, of: stays.length } : null,
    }
  }
  const firstStay = [...(trip.trip_stops || [])].sort((a, b) => a.position - b.position).find(s => s.kind === 'stay')
  return {
    trip, isLive,
    city: firstStay?.city || trip.destination_city,
    country: firstStay?.country || trip.destination_country,
    country_code: firstStay?.country_code || trip.destination_country_code,
    tz: firstStay?.tz || trip.destination_tz,
  }
}
