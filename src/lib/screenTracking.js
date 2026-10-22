import { useUIStore } from '../store/uiStore'
import { useTripsStore } from '../store/tripsStore'
import { useAuthStore } from '../store/authStore'
import { screenView } from './analytics'

// Routing is Zustand state, so screen views come from the stores: tab, open trip + its tab, Explore mode.
function currentPath() {
  const { user, loading, passwordRecovery } = useAuthStore.getState()
  if (loading) return null
  if (!user || passwordRecovery) return 'sign_in'
  const ui = useUIStore.getState()
  if (ui.showTripForm) return 'trip_form'
  if (useTripsStore.getState().activeTrip) return `trip/${ui.activeTripTab}`
  if (ui.activeTab === 'explore') return `explore/${ui.exploreMode}`
  return ui.activeTab
}

export function initScreenTracking() {
  const update = () => screenView(currentPath())
  update()
  const unsubs = [useUIStore.subscribe(update), useTripsStore.subscribe(update), useAuthStore.subscribe(update)]
  return () => unsubs.forEach(u => u())
}
