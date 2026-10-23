// Which trip a saved place or a booking goes to, on the phone: the shared rule (dates + distance, never the city
// name alone) from supabase/functions/_shared/tripMatch.js, applied to the trips the traveller can edit.
import { rankTrips, NEAR_KM } from '../../supabase/functions/_shared/tripMatch.js'
import { hasTripEnded, todayLocalISO } from './dates'
import { tripDates } from './trips'
import { geocode } from './places'

export { NEAR_KM }

/** Trips a place or booking can be added to: not cancelled, not view-only, not over. */
export function editableTrips(trips = []) {
  return trips.filter(t => t.status !== 'cancelled' && t._myRole !== 'viewer' && !hasTripEnded(t))
}

/** A trip with its known points: destination plus stops (trip_stops rows, when loaded). */
const withPoints = t => ({ ...t, points: (t.trip_stops || []).map(s => ({ lat: s.lat, lng: s.lng })) })

/**
 * Trips for saving a place at { lat, lng } (undated): [{ trip, fit, km, score }] best first, all editable trips
 * included. fit: 'live' (you're on it, the place is within reach) | 'upcoming' (passes within NEAR_KM) |
 * 'undated' (planned for this area) | null.
 */
export function rankForPlace(trips, point, today = todayLocalISO()) {
  return rankTrips(editableTrips(trips).map(withPoints), { start: null, points: point ? [point] : [] }, { today })
}

/**
 * Trips with coordinates: older trips saved before destination_lat existed get their city geocoded (cached),
 * so they can still be matched by distance.
 */
export async function withCoords(trips = []) {
  return Promise.all(trips.map(async t => {
    if (t.destination_lat != null || !t.destination_city) return t
    const g = await geocode([t.destination_city, t.destination_country].filter(Boolean).join(', ')).catch(() => null)
    return g?.lat != null ? { ...t, destination_lat: g.lat, destination_lng: g.lng } : t
  }))
}

/** The trip a place should be saved to, or null when none fits (then the picker asks). */
export function suggestForPlace(trips, point, today) {
  const top = rankForPlace(trips, point, today)[0]
  return top && top.score > 0 ? top : null
}

/** Why a trip is suggested, in a few words. */
export function fitReason(r) {
  if (!r?.fit) return null
  if (r.fit === 'live') return 'You\'re on this trip'
  if (r.fit === 'upcoming') return `On your route · ${tripDates(r.trip)}`
  if (r.fit === 'undated') return 'Planned for this area'
  if (r.fit === 'inside') return `Fits the dates · ${tripDates(r.trip)}`
  if (r.fit === 'edge') return `Just outside the dates · ${tripDates(r.trip)}`
  return null
}
