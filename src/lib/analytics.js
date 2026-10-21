import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// First-party product analytics → Supabase `analytics_events` (insert-own RLS).
// Fire-and-forget: never throws, never blocks UI. Skipped when signed out.
// Keep props small and free of PII (no emails, names, document numbers).

const APP_VERSION = import.meta.env.VITE_APP_VERSION || null

function getPlatform() {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem('stt_session_id')
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
      sessionStorage.setItem('stt_session_id', id)
    }
    return id
  } catch {
    if (!getSessionId.fallback) getSessionId.fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    return getSessionId.fallback
  }
}

function currentScreen() {
  try { return sessionStorage.getItem('stt_active_tab') || null } catch { return null }
}

// Returns a promise that always resolves (await it only when the session is about
// to go away, e.g. before sign-out). Deferred one tick so it is safe to call from
// inside supabase.auth.onAuthStateChange callbacks.
export function track(event, props = {}, screen) {
  try {
    return new Promise(resolve => setTimeout(resolve, 0))
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        const userId = data?.session?.user?.id
        if (!userId) return
        return supabase.from('analytics_events').insert({
          user_id: userId,
          session_id: getSessionId(),
          event,
          screen: screen || currentScreen(),
          props: props || {},
          app_version: APP_VERSION,
          platform: getPlatform(),
        })
      })
      .then(() => {}, () => {})
  } catch {
    // analytics must never break the app
    return Promise.resolve()
  }
}
