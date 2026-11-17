// Which trip a pasted confirmation belongs to, and the fresh re-check before a new trip is created.
// The email importer can create a trip at any time, so the list the sheet was opened with can be out of date.
import { bestTrip } from '../../supabase/functions/_shared/tripMatch.js'
import { editableTrips, withCoords } from './tripPick'
import { bookingDates } from './trips'
import { todayLocalISO } from './dates'
import { geocode } from './places'

// ── Client-side trip matcher ──────────────────────────────
// Same rule as email import (supabase/functions/_shared/tripMatch.js): the trip whose dates the itinerary overlaps
// (nearest first), or one within 3 days on its route, or an undated trip nearby. Never the city name alone.
// No match → null (→ "Create new trip").
export async function matchTrip(trips, ultimateDestination, bookings) {
  const candidates = await withCoords(editableTrips(trips))
  if (!candidates.length) return null
  const dates = bookings.flatMap(bookingDates).sort()
  const points = []
  const add = g => { if (g?.lat != null) points.push({ lat: Number(g.lat), lng: Number(g.lng) }) }
  for (const b of bookings.slice(0, 8)) {
    if (b.place_lat != null && b.place_lng != null) add({ lat: b.place_lat, lng: b.place_lng })
    else if (b.arrival_airport) add(await geocode(`${b.arrival_airport}${b.type === 'flight' ? ' airport' : ''}`).catch(() => null))
  }
  if (ultimateDestination?.city) add(await geocode(ultimateDestination.city).catch(() => null))
  const withStops = candidates.map(t => ({ ...t, points: (t.trip_stops || []).map(s => ({ lat: s.lat, lng: s.lng })) }))
  const top = bestTrip(withStops, { start: dates[0] || null, end: dates[dates.length - 1] || null, points }, { today: todayLocalISO() })
  return top ? candidates.find(t => t.id === top.trip.id) : null
}

/**
 * Refetch the trips from the server, then match again on the fresh list. Returns the trip to offer, or null when
 * nothing new matches. `offered` (a Set of trip ids) makes sure a trip is offered once: if the traveller sees it and
 * still wants a new trip, the second call lets the create go through. A failed refetch is not fatal: the match then
 * runs on whatever list the store holds.
 */
export async function matchOnFreshTrips({ refresh, getTrips, ultimateDestination, bookings, offered = new Set() }) {
  try { await refresh() } catch { /* best effort: match on what we have */ }
  const trip = await matchTrip(getTrips(), ultimateDestination, bookings)
  if (!trip || offered.has(trip.id)) return null
  offered.add(trip.id)
  return trip
}
