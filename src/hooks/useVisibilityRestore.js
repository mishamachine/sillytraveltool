/**
 * useVisibilityRestore
 *
 * Fixes the "hang on return from background" bug.
 *
 * Root causes:
 * 1. Supabase Realtime websocket silently dies when iOS/Android
 *    backgrounds the app — subscription enters zombie state.
 * 2. Auth token may have expired during a long background stay;
 *    Supabase's auto-refresh can miss its window when backgrounded.
 * 3. No UI recovery path exists — app just hangs on stale state.
 *
 * Fix: Page Visibility API listener that fires on foreground restore.
 * - Validates / refreshes the auth session
 * - Refetches trips so the list is always current
 * - Re-subscribes the Realtime channel if a trip is open
 */

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useTripsStore } from '../store'

export function useVisibilityRestore() {
  const debounceRef = useRef(null)
  const unsubRef    = useRef(null)   // holds the current realtime unsub fn

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return

      // Debounce — ignore rapid tab switches / screen flickers
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          // 1. Check / refresh the auth session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()

          if (sessionError || !session) {
            // Session truly gone — let Supabase's onAuthStateChange handle sign-out
            await supabase.auth.refreshSession()
            return
          }

          // 2. If token is within 5 min of expiry, proactively refresh it
          const expiresAt = session.expires_at * 1000  // convert to ms
          const fiveMin   = 5 * 60 * 1000
          if (Date.now() > expiresAt - fiveMin) {
            await supabase.auth.refreshSession()
          }

          // 3. Refetch trips list (silently — no loading spinner)
          const { fetchTrips, activeTrip, fetchTripDetail, subscribeToTrip } = useTripsStore.getState()
          await fetchTrips()

          // 4. If a trip detail is open, re-fetch + re-subscribe Realtime
          if (activeTrip?.id) {
            await fetchTripDetail(activeTrip.id)

            // Tear down the old (possibly zombie) subscription
            if (typeof unsubRef.current === 'function') {
              unsubRef.current()
            }

            // Stand up a fresh one
            unsubRef.current = subscribeToTrip(activeTrip.id)
          }

        } catch (err) {
          // Swallow — don't surface errors from a background restore check.
          // If auth is truly broken, normal Supabase listeners will catch it.
          console.warn('[useVisibilityRestore] restore check failed:', err.message)
        }
      }, 1000)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Also handle the iOS "pageshow" event (fires on bfcache restore —
    // a separate case where the browser shows a frozen page snapshot)
    const handlePageShow = (e) => {
      if (e.persisted) handleVisibilityChange()
    }
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (typeof unsubRef.current === 'function') unsubRef.current()
    }
  }, [])
}
