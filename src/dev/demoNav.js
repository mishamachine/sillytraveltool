// Demo-only screen driver for the App Store screenshots (scripts/ios-store-shots.py). The simulator can't tap into the
// WKWebView, so the script opens com.sillytraveltool.app://demo?tab=guide  (handled in native/deepLinks.js, demo builds only):
//   tab=trips|guide|honk|tools|profile    switch tab
//   trips=list|today                      Trips tab: all trips, or back to automatic (Today)
//   trip=<id>|close                       open a trip's Plan, or close it
//   profile=docs|home                     Profile tab sub-screen
import { useUIStore } from '../store/uiStore'
import { useTripsStore } from '../store/tripsStore'

export const DEMO_VIEW_EVENT = 'stt-demo-view'

export function demoGo(get) {
  const tab = get('tab')
  if (get('trip') === 'close') useTripsStore.getState().setActiveTrip(null)
  if (tab) useUIStore.getState().setTab(tab)
  const trip = get('trip')
  if (trip && trip !== 'close') {
    const t = useTripsStore.getState().trips.find(x => x.id === trip)
    if (t) useTripsStore.getState().setActiveTrip(t)
  }
  // Screens keep their sub-view in local state; they listen for this once mounted
  const view = { trips: get('trips'), profile: get('profile') }
  if (view.trips || view.profile) setTimeout(() => window.dispatchEvent(new CustomEvent(DEMO_VIEW_EVENT, { detail: view })), 600)
}
