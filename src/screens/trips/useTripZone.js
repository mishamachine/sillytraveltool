import { useEffect } from 'react'
import { useTripsStore } from '../../store'
import { isValidZone } from '../../lib/localTime'
import { lookupZone } from '../../lib/zoneLookup'

// Trips created before time zones existed have no destination_tz: look it up once (coordinates
// when stored, else city + country) and save it on the trip, so Today, day counts and plan times
// follow the destination. Viewers without edit rights simply keep the lookup for this session.
const asked = new Set()

export function useTripZone(trip) {
  const updateTrip = useTripsStore(s => s.updateTrip)
  const has = isValidZone(trip?.destination_tz)
  useEffect(() => {
    if (!trip?.id || has || asked.has(trip.id) || !trip.destination_city) return
    asked.add(trip.id)
    const input = trip.destination_lat && trip.destination_lng
      ? { lat: Number(trip.destination_lat), lng: Number(trip.destination_lng) }
      : { query: [trip.destination_city, trip.destination_country].filter(Boolean).join(', ') }
    lookupZone(input).then(tz => {
      if (tz) updateTrip(trip.id, { destination_tz: tz }).catch(() => {})
    })
  }, [trip?.id, has])
  return has ? trip.destination_tz : null
}
