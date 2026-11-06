import { useUIStore, useTripsStore } from '../../store'
import { BottomNav as Nav } from '../../ui'

// Trips · Guide · HONK · Tools · Profile. HONK is the raised Goose button in the middle.
export const TABS = [
  { id: 'trips', label: 'Trips', icon: 'trips' },
  { id: 'guide', label: 'Guide', icon: 'book' },
  { id: 'honk', label: 'HONK', feature: true },
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
