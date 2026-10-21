import { useEffect, useState } from 'react'
import { useTripsStore } from '../../store'
import { tripPhase } from '../../lib/trips'
import TripList from './TripList'
import TodayView from './TodayView'
import RecapView from './RecapView'
import ImportSheet from './ImportSheet'
import { useBackHandler } from '../../lib/backStack'
import './trips.css'

// Trips tab: Today during a trip in progress, otherwise the list. Past trips open a recap.
export default function TripsScreen() {
  const { trips, fetchTrips } = useTripsStore()
  const [view, setView] = useState(null) // null = automatic, 'list', { recap: tripId }, { today: tripId }
  const [showImport, setShowImport] = useState(false)


  useEffect(() => { fetchTrips() }, [])

  const active = trips.find(t => tripPhase(t) === 'active')
  const recapTrip = view?.recap && trips.find(t => t.id === view.recap)
  const todayTrip = view?.today ? trips.find(t => t.id === view.today) : view === null ? active : null

  // Back from a recap, or from Today opened via the list, returns to the list
  useBackHandler(!!recapTrip || !!view?.today, () => setView('list'))

  let content
  if (recapTrip) content = <RecapView trip={recapTrip} onBack={() => setView('list')} />
  else if (todayTrip) content = <TodayView trip={todayTrip} onShowAll={() => setView('list')} />
  else content = (
    <TripList
      onOpenToday={(t) => setView({ today: t.id })}
      onOpenRecap={(t) => setView({ recap: t.id })}
      onImport={() => setShowImport(true)}
    />
  )

  return (
    <>
      {content}
      {showImport && <ImportSheet trips={trips} onClose={() => setShowImport(false)} onBookingCreated={() => fetchTrips()} />}
    </>
  )
}
