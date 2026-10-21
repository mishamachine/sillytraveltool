import { useEffect } from 'react'
import { useTripsStore, useUIStore } from '../../store'
import { tripPhase } from '../../lib/trips'
import { Screen, SegmentedControl } from '../../ui'
import TripHeader from './detail/TripHeader'
import PlanTab from './detail/PlanTab'
import WeatherTab from './detail/WeatherTab'
import PackTab from './detail/PackTab'
import './detail/detail.css'

// Store tab ids stay 'itinerary' / 'weather' / 'checklist'; labels follow the Clay design.
const TABS = [
  { value: 'itinerary', label: 'Plan' },
  { value: 'weather', label: 'Weather' },
  { value: 'checklist', label: 'Pack' },
]
const PANELS = { itinerary: PlanTab, weather: WeatherTab, checklist: PackTab }

export default function TripDetailScreen() {
  const { activeTrip: trip, subscribeToTrip } = useTripsStore()
  const { activeTripTab, setTripTab } = useUIStore()

  // Real-time subscription to this trip's bookings and activities
  useEffect(() => {
    if (!trip?.id) return
    const unsubscribe = subscribeToTrip(trip.id)
    return unsubscribe
  }, [trip?.id, subscribeToTrip])

  if (!trip) return null

  const tab = PANELS[activeTripTab] ? activeTripTab : 'itinerary'
  const Panel = PANELS[tab]
  // Past trips are a look back: no adding or editing bookings
  const readOnly = tripPhase(trip) === 'past'

  return (
    <Screen gap={4} className="detail" labelledBy="detail-title">
      <TripHeader trip={trip} readOnly={readOnly} />
      <div className="detail-tabs">
        <SegmentedControl label="Trip sections" value={tab} onChange={setTripTab} options={TABS} idPrefix="trip" />
      </div>
      <div className="detail-panel" role="tabpanel" id={`trip-panel-${tab}`} aria-labelledby={`trip-tab-${tab}`}>
        <Panel trip={trip} readOnly={readOnly} />
      </div>
    </Screen>
  )
}
