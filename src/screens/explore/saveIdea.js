import { useTripsStore, useIdeasStore, tripForCity } from '../../store'
import { lookupZone } from '../../lib/zoneLookup'
import { warmGuide } from '../../store/guideStore'

/** True when saving to this city would start a trip, so the caller asks for its name first (NewTripNameSheet). */
export const needsNewTrip = (destination) => !tripForCity(useTripsStore.getState().trips, destination.city)

/**
 * One tap from the guide or HONK: save a place to the trip for its city. With no trip there yet, start one
 * without dates, named `title` (the name the traveller saw and could change); flights or hotels added later
 * give it dates. destination: { city, country, country_code }. Returns { trip, created }.
 */
export async function saveIdea(destination, item, kind, source = 'guide', { title } = {}) {
  let trip = tripForCity(useTripsStore.getState().trips, destination.city)
  let created = false
  if (!trip) {
    const destination_tz = await lookupZone({ query: `${destination.city}, ${destination.country}` })
    trip = await useTripsStore.getState().createTrip({
      title: title || `Trip to ${destination.city}`,
      destination_city: destination.city,
      destination_country: destination.country,
      destination_country_code: destination.country_code,
      destination_tz,
      start_date: null,
      end_date: null,
    }, { via: 'one_tap' })
    created = true
    warmGuide(destination.city, destination.country, destination.country_code)
  }
  await useIdeasStore.getState().addIdea(trip.id, item, kind, source)
  return { trip, created }
}
