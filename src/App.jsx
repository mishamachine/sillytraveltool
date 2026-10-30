import { useEffect, useState, lazy, Suspense } from 'react'
import { useAuthStore, useUIStore, useTripsStore, useCollabStore } from './store'
import { isDemo } from './lib/supabase'
import { demoParams } from './dev/demoClient'

import AuthScreen from './screens/AuthScreen'
import BottomNav from './components/layout/BottomNav'
import ErrorBoundary from './components/shared/ErrorBoundary'
import OutsideDatesSheet from './components/shared/OutsideDatesSheet'
import PaywallSheet from './components/shared/PaywallSheet'
import AiConsentSheet from './components/shared/AiConsentSheet'
import InviteConfirmSheet from './components/shared/InviteConfirmSheet'
import { previewInvite } from './lib/invite'
import { usePlanStore } from './store/planStore'
import { useConsentStore, hasAiConsent } from './store/consentStore'

import { useVisibilityRestore } from './hooks/useVisibilityRestore'
import { initDeepLinks } from './native/deepLinks'
import { initBackButton } from './native/backButton'
import { initExternalLinks } from './native/externalLinks'
import { track } from './lib/analytics'
import { initScreenTracking } from './lib/screenTracking'
import { applyTheme, onSystemThemeChange } from './lib/theme'
import './styles/global.css'
import './styles/app.css'
import { GooseMark, Logo, ProgressBar, Toast, Button, IconButton } from './ui'
import { ONBOARDED_KEY, markOnboarded } from './screens/auth/onboardingState'

// Lazy-load heavy screens — reduces initial bundle
const TripsScreen = lazy(() => import('./screens/trips/TripsScreen'))
const TripDetailScreen = lazy(() => import('./screens/trips/TripDetailScreen'))
const ExploreScreen = lazy(() => import('./screens/explore/ExploreScreen'))
const ToolboxScreen = lazy(() => import('./screens/toolbox/ToolboxScreen'))
const ProfileScreen = lazy(() => import('./screens/profile/ProfileScreen'))
const Onboarding = lazy(() => import('./screens/auth/Onboarding'))
const TripForm = lazy(() => import('./screens/trips/TripForm'))

const SCREENS = {
  trips: TripsScreen,
  explore: ExploreScreen,
  tools: ToolboxScreen,
  profile: ProfileScreen,
}

function ScreenFallback() {
  return (
    <div className="app-fallback" role="status" aria-label="Loading">
      <GooseMark expression="reading" size={46} tile tileSize="sm" />
    </div>
  )
}

function AppLoading() {
  return (
    <div className="app-splash" role="status" aria-label="Loading Silly Travel Tool">
      <Logo size="lg" />
      <ProgressBar className="app-splash__bar" label="Loading" />
    </div>
  )
}

export default function App() {
  const { user, loading, init, passwordRecovery, inviteNonce, profile, profileReady } = useAuthStore()
  const { activeTab, showTripForm, themePref, tourOpen, closeTour } = useUIStore()
  const { activeTrip } = useTripsStore()
  const { fetchPendingInvites } = useCollabStore()
  useVisibilityRestore()

  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [inviteToast, setInviteToast] = useState(null)
  const [invitePreview, setInvitePreview] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { held, releasing, released, clearReleased, asking: askingAi } = useConsentStore()

  useEffect(() => { init(); initDeepLinks(); initBackButton(); initExternalLinks() }, [])

  // GA4 page_view per tab (no-op on the dev server unless VITE_GA_DEV=1)
  useEffect(() => initScreenTracking(), [])

  useEffect(() => {
    if (user) fetchPendingInvites()
  }, [user?.id])

  // The member's plan (First Class or free) for locks, Settings and the paywall
  useEffect(() => {
    if (!user) { usePlanStore.getState().clear(); return }
    usePlanStore.getState().load().then(() => {
      // Demo screenshots (?demo&paywall=<trigger>): open the paywall at launch
      const trigger = isDemo && demoParams().get('paywall')
      if (trigger) usePlanStore.getState().openPaywall(trigger)
    })
  }, [user?.id])

  // Forwarded emails held until the member allows AI reading: count them, and file them at once if the yes was given
  // on another device in the meantime
  useEffect(() => {
    if (!user || !profileReady) return
    useConsentStore.getState().loadHeld().then(() => {
      if (hasAiConsent() && useConsentStore.getState().held > 0) useConsentStore.getState().release()
    })
  }, [user?.id, profileReady])

  useEffect(() => {
    if (!released) return
    const t = setTimeout(clearReleased, 5000)
    return () => clearTimeout(t)
  }, [released])

  // One-time onboarding tour (features, Goose inbox, location, plans) for new accounts. Accounts older than a day
  // are existing users: mark them onboarded without showing it. Dev: ?onboarding forces it.
  const userId = user?.id
  const profileCreatedAt = profile?.created_at
  useEffect(() => {
    if (!userId || !profileReady) return
    const force = import.meta.env.DEV && new URLSearchParams(window.location.search).has('onboarding')
    let done = '1'
    try { done = localStorage.getItem(ONBOARDED_KEY) } catch {}
    if (done && !force) return
    if (!profileCreatedAt && !force) return // no profile row yet: decide on a later run
    const created = profileCreatedAt ? new Date(profileCreatedAt).getTime() : Date.now()
    if (force || Date.now() - created < 24 * 60 * 60 * 1000) setShowOnboarding(true)
    else markOnboarded()
  }, [userId, profileReady, profileCreatedAt])

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
    // Ask first: the link only fetches who invited you; nothing is accepted until Join (InviteConfirmSheet)
    const showInvite = async () => {
      try {
        sessionStorage.removeItem('pending_invite_token')
        const p = await previewInvite(token)
        if (!p.ok) {
          console.error('invite preview failed:', p.error); track('invite_accept_failed', { status: p.status })
          setInviteToast({ error: p.error })
          setTimeout(() => setInviteToast(null), 6000)
          return
        }
        setInvitePreview({ token, inviter: p.inviter, tripTitle: p.tripTitle, role: p.role })
      } catch (e) { console.error('invite preview error', e) }
    }
    showInvite()
  }, [user, inviteNonce])

  if (loading) return <AppLoading />
  if (!user || passwordRecovery) return <AuthScreen />

  if (showOnboarding || tourOpen) return (
    <Suspense fallback={<ScreenFallback />}>
      <Onboarding replay={!showOnboarding} onDone={({ firstClass } = {}) => {
        setShowOnboarding(false); closeTour()
        if (firstClass) usePlanStore.getState().openPaywall('onboarding')
      }} />
    </Suspense>
  )

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
      <OutsideDatesSheet />
      <PaywallSheet />
      <AiConsentSheet />
      {held > 0 && !releasing && !askingAi && !hasAiConsent() && (
        <Toast icon="inbox" title={held === 1 ? '1 email waiting' : `${held} emails waiting`}
          action={<Button variant="primary" size="sm" onClick={() => useConsentStore.getState().ensure('held')}>Review</Button>}>
          Goose files them once you say it can read them
        </Toast>
      )}
      {released && (released.filed > 0 || released.ignored > 0 || released.expired > 0 || released.failed > 0 || released.kept > 0 || released.limited) && (
        <Toast icon={released.filed && !released.expired && !released.failed && !released.kept && !released.limited ? 'check-circle' : 'info'}
          title={released.filed ? `Goose filed ${released.filed === 1 ? '1 email' : `${released.filed} emails`}` : released.limited ? 'Daily email limit reached' : 'Nothing new to file'}>
          {released.limited ? 'The rest are saved. Goose files them when you open the app tomorrow.'
            : released.kept ? 'One couldn’t be filed just now. Goose will try again when you next open the app.'
            : released.expired || released.failed ? 'Some couldn’t be opened any more. Forward them again and Goose will file them.'
            : released.ignored ? 'Some weren’t bookings, so Goose left them out.'
            : 'They’re in your trips now'}
        </Toast>
      )}
      {invitePreview && (
        <InviteConfirmSheet invite={invitePreview} onClose={() => setInvitePreview(null)} onJoined={async (tripTitle) => {
          setInvitePreview(null)
          await useTripsStore.getState().fetchTrips()
          await fetchPendingInvites()
          track('invite_accepted')
          setInviteToast({ tripName: tripTitle || 'the trip' })
          setTimeout(() => setInviteToast(null), 4000)
          useUIStore.getState().setTab('trips')
        }} />
      )}
      {inviteToast && (
        inviteToast.error
          ? <Toast position="top" icon="alert-circle" title="Invite not opened">{inviteToast.error}</Toast>
          : <Toast position="top" icon="users" title="You joined the trip">{inviteToast.tripName} is now in your trips</Toast>
      )}
      {showInstallBanner && installPrompt && (
        <Toast icon="smartphone" title="Add to home screen" action={(
          <>
            <Button variant="primary" size="sm" onClick={handleInstall}>Install</Button>
            <IconButton icon="close" variant="inverse" label="Dismiss" onClick={dismissInstallBanner} />
          </>
        )}>Goose works better as an app</Toast>
      )}
    </ErrorBoundary>
  )
}
