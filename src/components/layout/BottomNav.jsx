import { useUIStore, useTripsStore, useCollabStore } from '../../store'

const NAV_ITEMS = [
  {
    id: 'trips',
    label: 'Trips',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="7" width="18" height="14" rx="3" stroke="currentColor" strokeWidth={active ? 2.5 : 2} fill={active ? 'currentColor' : 'none'} opacity={active ? .15 : 1}/>
        <rect x="3" y="7" width="18" height="14" rx="3" stroke="currentColor" strokeWidth={active ? 2.5 : 2} fill="none"/>
        <path d="M8 7V5a2 2 0 014 0v2M12 7V5a2 2 0 014 0v2" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round"/>
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={active ? 2.5 : 2}/>
      </svg>
    )
  },
  {
    id: 'guide',
    label: 'Guide',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={active ? 2.5 : 2}/>
        <path d="M12 3v1M12 20v1M3 12h1M20 12h1" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round"/>
        <path d="M7 7l.5.5M16.5 16.5l.5.5M17 7l-.5.5M7.5 16.5L7 17" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={active ? 2.5 : 2} fill={active ? 'currentColor' : 'none'} opacity={active ? .35 : 1}/>
      </svg>
    )
  },
]

function HonkButton({ onClick, active }) {
  return (
    <button className={`nav-honk ${active ? 'active' : ''}`} onClick={onClick} aria-label="Goosey — HONK">
      <div className="nav-honk-btn" style={{ position: 'relative' }}>
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="35" r="28" fill="rgba(255,255,255,.3)" stroke="rgba(255,255,255,.85)" strokeWidth="5"/>
          <circle cx="39" cy="29" r="8" fill="#fff"/>
          <circle cx="37.5" cy="28" r="5.5" fill="#2A2520"/>
          <circle cx="35.5" cy="26" r="2.2" fill="#fff"/>
          <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="rgba(255,255,255,.7)" strokeWidth="3" strokeLinejoin="round"/>
        </svg>
      </div>
      <span className="nav-honk-label">HONK</span>
    </button>
  )
}

const NAV_ITEMS_RIGHT = [
  {
    id: 'toolbox',
    label: 'Tools',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} opacity={active ? .15 : 1}/>
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    )
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={active ? 2.5 : 2} fill={active ? 'currentColor' : 'none'} opacity={active ? .2 : 1}/>
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={active ? 2.5 : 2} fill="none"/>
        <path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round"/>
      </svg>
    )
  }
]

export default function BottomNav() {
  const { activeTab, setTab } = useUIStore()
  const { setActiveTrip } = useTripsStore()
  const { pendingInvites } = useCollabStore()
  const pendingCount = pendingInvites?.length || 0

  const handleNav = (id) => {
    if (id !== 'trips') setActiveTrip(null)
    setTab(id)
  }

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => handleNav(item.id)}
          aria-label={item.label}
          aria-current={activeTab === item.id ? 'page' : undefined}
          style={{ position: 'relative' }}
        >
          {item.icon(activeTab === item.id)}
          {item.id === 'trips' && pendingCount > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: '50%', transform: 'translateX(8px)',
              background: 'var(--primary)', color: '#fff',
              borderRadius: 99, minWidth: 16, height: 16,
              fontSize: 10, fontFamily: 'var(--font-heading)', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', lineHeight: 1,
              border: '2px solid var(--bg)',
            }}>{pendingCount}</span>
          )}
          {item.label}
        </button>
      ))}

      <HonkButton onClick={() => handleNav('goosey')} active={activeTab === 'goosey'} />

      {NAV_ITEMS_RIGHT.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => handleNav(item.id)}
          aria-label={item.label}
          aria-current={activeTab === item.id ? 'page' : undefined}
        >
          {item.icon(activeTab === item.id)}
          {item.label}
        </button>
      ))}
    </nav>
  )
}
