import { useUIStore } from '../store/uiStore'
import { useTripsStore } from '../store/tripsStore'
import { useAuthStore } from '../store/authStore'
import { screenView } from './analytics'

// Routing is Zustand state, so screen views come from the stores: tab, open trip + its tab.
function currentPath() {
  const { user, loading, passwordRecovery } = useAuthStore.getState()
  if (loading) return null
  if (!user || passwordRecovery) return 'sign_in'
  const ui = useUIStore.getState()
  if (ui.showTripForm) return 'trip_form'
  if (useTripsStore.getState().activeTrip) return `trip/${ui.activeTripTab}`
  // Guide and HONK keep the paths they had as Explore modes, so the cockpit's screen history stays continuous
  if (ui.activeTab === 'guide' || ui.activeTab === 'honk') return `explore/${ui.activeTab}`
  return ui.activeTab
}

export function initScreenTracking() {
  const update = () => screenView(currentPath())
  update()
  const unsubs = [useUIStore.subscribe(update), useTripsStore.subscribe(update), useAuthStore.subscribe(update)]
  return () => unsubs.forEach(u => u())
}
