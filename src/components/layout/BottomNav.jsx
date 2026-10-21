import { useUIStore, useTripsStore } from '../../store'
import { BottomNav as Nav } from '../../ui'

// Trips · Explore · Tools · Profile. HONK lives inside Explore (with the Guide).
export const TABS = [
  { id: 'trips', label: 'Trips', icon: 'trips' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'tools', label: 'Tools', icon: 'tools' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
]

export default function BottomNav() {
  const activeTab = useUIStore(s => s.activeTab)
  const setTab = useUIStore(s => s.setTab)
  const setActiveTrip = useTripsStore(s => s.setActiveTrip)

  const handleNav = (id) => {
    // Re-tapping Trips (or leaving it) closes an open trip
    if (id !== 'trips' || activeTab === 'trips') setActiveTrip(null)
    setTab(id)
  }

  return <Nav items={TABS} active={activeTab} onSelect={handleNav} />
}
