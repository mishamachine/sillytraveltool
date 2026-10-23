import { useTripsStore, useIdeasStore } from '../../store'
import { lookupZone } from '../../lib/zoneLookup'
import { geocode } from '../../lib/places'
import { suggestForPlace, rankForPlace, editableTrips, withCoords } from '../../lib/tripPick'
import { warmGuide } from '../../store/guideStore'

/** Where a guide or HONK place is: its own coordinates, else its city's. */
export async function placePoint(destination, item) {
  if (item?.lat != null && item?.lng != null) return { lat: Number(item.lat), lng: Number(item.lng) }
  if (!destination?.city) return null
  const g = await geocode([destination.city, destination.country].filter(Boolean).join(', ')).catch(() => null)
  return g?.lat != null ? { lat: g.lat, lng: g.lng } : null
}

/**
 * The trip a place should be saved to (by dates and distance: the trip you're on, else one passing within
 * ~75 km, else one planned for the area), and every editable trip ranked for the picker.
 * Never by city name alone, and never a new trip: with no fit, `suggested` is null and the picker asks.
 */
export async function tripsForPlace(destination, item) {
  const point = await placePoint(destination, item)
  const trips = await withCoords(editableTrips(useTripsStore.getState().trips))
  return { point, suggested: suggestForPlace(trips, point), ranked: rankForPlace(trips, point) }
}

/** Save a place to a trip's ideas; returns the saved idea. */
export async function saveIdeaTo(trip, item, kind, source = 'guide') {
  return await useIdeasStore.getState().addIdea(trip.id, item, kind, source)
}

/** Move a saved idea to another trip (the "Change" link after a one-tap save). */
export async function moveIdea(fromTripId, idea, toTrip, item, kind, source = 'guide') {
  await useIdeasStore.getState().addIdea(toTrip.id, item, kind, source)
  if (fromTripId && idea?.id) await useIdeasStore.getState().removeIdea(fromTripId, idea.id)
  return toTrip
}

/**
 * Start a trip the traveller named in the picker, without dates (flights or hotels added later give it dates),
 * and save the place to it. destination: { city, country, country_code }.
 */
export async function createTripAndSave(destination, item, kind, source = 'guide', { title, point } = {}) {
  const destination_tz = await lookupZone({ query: `${destination.city}, ${destination.country}` })
  const trip = await useTripsStore.getState().createTrip({
    title: title || `Trip to ${destination.city}`,
    destination_city: destination.city,
    destination_country: destination.country,
    destination_country_code: destination.country_code,
    destination_tz,
    destination_lat: point?.lat ?? null,
    destination_lng: point?.lng ?? null,
    start_date: null,
    end_date: null,
  }, { via: 'one_tap' })
  warmGuide(destination.city, destination.country, destination.country_code)
  await useIdeasStore.getState().addIdea(trip.id, item, kind, source)
  return trip
}
