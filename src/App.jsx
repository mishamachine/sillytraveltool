import { useEffect, useState, lazy, Suspense } from 'react'
import { useAuthStore, useUIStore, useTripsStore, useCollabStore } from './store'
import { supabase } from './lib/supabase'

import AuthScreen from './screens/AuthScreen'
import BottomNav from './components/layout/BottomNav'
import ErrorBoundary from './components/shared/ErrorBoundary'

import { useVisibilityRestore } from './hooks/useVisibilityRestore'
import { initDeepLinks } from './native/deepLinks'
import { gaPageView } from './lib/ga'
import { applyTheme, onSystemThemeChange } from './lib/theme'
import './styles/global.css'

// Lazy-load heavy screens — reduces initial bundle
const TripsScreen = lazy(() => import('./screens/trips/TripsScreen'))
const TripDetailScreen = lazy(() => import('./screens/trips/TripDetailScreen'))
const GuideScreen = lazy(() => import('./screens/guide/GuideScreen'))
const GooseyScreen = lazy(() => import('./screens/goosey/GooseyScreen'))
const ToolboxScreen = lazy(() => import('./screens/toolbox/ToolboxScreen'))
const ProfileScreen = lazy(() => import('./screens/profile/ProfileScreen'))
const TripForm = lazy(() => import('./screens/trips/TripForm'))

const SCREENS = {
  trips: TripsScreen,
  guide: GuideScreen,
  goosey: GooseyScreen,
  toolbox: ToolboxScreen,
  profile: ProfileScreen,
}

function ScreenFallback() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ animation: 'bounce 1.4s ease-in-out infinite' }}>
        <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
          <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
          <circle cx="37.5" cy="28" r="5" fill="#2A2520"/>
          <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

function AppLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ animation: 'bounce 1.4s ease-in-out infinite' }}>
        <svg width="64" height="64" viewBox="0 0 100 100" fill="none">
          <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
          <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
          <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
          <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
          <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
          <circle cx="37.5" cy="28" r="5" fill="#2A2520"/>
          <circle cx="35.5" cy="26" r="2" fill="#fff"/>
          <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading, init, passwordRecovery, inviteNonce } = useAuthStore()
  const { activeTab, showTripForm, themePref } = useUIStore()
  const { activeTrip } = useTripsStore()
  const { fetchPendingInvites } = useCollabStore()
  useVisibilityRestore()

  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [inviteToast, setInviteToast] = useState(null)

  useEffect(() => { init(); initDeepLinks() }, [])

  // GA4 page_view per tab (no-op on native and non-production builds)
  useEffect(() => { if (user?.id) gaPageView(activeTab) }, [activeTab, user?.id])

  useEffect(() => {
    if (user) fetchPendingInvites()
  }, [user?.id])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      const dismissed = (() => { try { return localStorage.getItem('install_banner_dismissed') } catch { return null } })()
      if (!dismissed) setTimeout(() => setShowInstallBanner(true), 30000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') { setShowInstallBanner(false); setInstallPrompt(null) }
  }

  const dismissInstallBanner = () => {
    setShowInstallBanner(false)
    try { localStorage.setItem('install_banner_dismissed', '1') } catch {}
  }

  // Theme: explicit choice or the OS setting (src/lib/theme.js)
  useEffect(() => {
    applyTheme(themePref)
    if (themePref !== 'system') return
    return onSystemThemeChange(dark => { useUIStore.getState().setDarkMode(dark); applyTheme('system') })
  }, [themePref])

  // Invite token handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) return
    try { sessionStorage.setItem('pending_invite_token', token) } catch {}
    window.history.replaceState({}, '', '/')
  }, [])

  useEffect(() => {
    if (!user) return
    const token = (() => { try { return sessionStorage.getItem('pending_invite_token') } catch { return null } })()
    if (!token) return
    const acceptInvite = async () => {
      try {
        sessionStorage.removeItem('pending_invite_token')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invite`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ token }),
          }
        )
        const result = await res.json()

        if (res.ok && result.success) {
          await useTripsStore.getState().fetchTrips()
          await fetchPendingInvites()
          setInviteToast({ tripName: result.trip_title || 'the trip' })
          setTimeout(() => setInviteToast(null), 4000)
          useUIStore.getState().setTab('trips')
        } else {
          console.error('accept-invite failed:', result.error)
        }
      } catch (e) { console.error('accept invite error', e) }
    }
    acceptInvite()
  }, [user, inviteNonce])

  if (loading) return <AppLoading />
  if (!user || passwordRecovery) return <AuthScreen />

  const ActiveScreen = SCREENS[activeTab] || TripsScreen

  return (
    <ErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        <ActiveScreen />
      </Suspense>
      <BottomNav />
      {activeTrip && (
        <Suspense fallback={<ScreenFallback />}>
          <TripDetailScreen />
        </Suspense>
      )}
      {showTripForm && (
        <Suspense fallback={null}>
          <TripForm />
        </Suspense>
      )}
      {inviteToast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#2A2520', color: '#fff',
          borderRadius: 14, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          zIndex: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.3s ease', maxWidth: 'calc(100% - 32px)',
        }}>
          <span style={{ fontSize: 24 }}>🪿</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>You joined the trip!</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 1 }}>{inviteToast.tripName} is now in your trips</div>
          </div>
        </div>
      )}
      {showInstallBanner && installPrompt && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--nav-height) + 12px)', left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)', maxWidth: 396,
          background: '#2A2520', color: '#fff',
          borderRadius: 16, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 150, boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}>
          <span style={{ fontSize: 28 }}>🪿</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Add to Home Screen</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>The Goose works better as an app</div>
          </div>
          <button onClick={handleInstall} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 99, padding: '6px 14px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Install</button>
          <button onClick={dismissInstallBanner} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>
      )}
    </ErrorBoundary>
  )
}
