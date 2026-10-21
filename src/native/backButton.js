import { App as CapApp } from '@capacitor/app'
import { isNative } from '../lib/authRedirect'
import { goBack } from '../lib/backStack'
import { useTripsStore } from '../store/tripsStore'
import { useUIStore } from '../store/uiStore'

// Android back: close the top sheet or sub-view, then the open trip, then return to Trips,
// and only then leave the app (minimise, like other apps).
let started = false

export function initBackButton() {
  if (!isNative || started) return
  started = true
  CapApp.addListener('backButton', () => {
    if (goBack()) return
    const trips = useTripsStore.getState()
    if (trips.activeTrip) { trips.setActiveTrip(null); return }
    const ui = useUIStore.getState()
    if (ui.activeTab !== 'trips') { ui.setTab('trips'); return }
    CapApp.minimizeApp()
  })
}
