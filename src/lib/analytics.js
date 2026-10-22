import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'
import { initGA, stopGA, gaEvent, gaPageView, gaSetUser } from './ga'

// Product analytics. Every track() goes to two places:
//  - Supabase `analytics_events` (first party, insert-own RLS; skipped when signed out)
//  - GA4 (website and app; see ga.js)
// Fire-and-forget: never throws, never blocks UI. Off when the user turns off "Share usage stats" in
// Settings; off by default when the browser sends Do Not Track or Global Privacy Control.
// Props are short codes only: cleanProps() drops anything that looks personal (emails, names, free text,
// coordinates, confirmation numbers), so pass enums, counts and booleans.

const APP_VERSION = import.meta.env.VITE_APP_VERSION || null
const PREF_KEY = 'stt_analytics'

// GA4 has recommended names for these; the Supabase rows keep ours
const GA_NAMES = { sign_in: 'login', screen_view: null }

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

let lastScreen = null
function currentScreen() {
  if (lastScreen) return lastScreen.split('/')[0]
  try { return sessionStorage.getItem('stt_active_tab') || null } catch { return null }
}

// --- consent ---------------------------------------------------------------------------------------

function browserSaysNo() {
  try { return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true } catch { return false }
}

export function analyticsEnabled() {
  try {
    const pref = localStorage.getItem(PREF_KEY)
    if (pref === 'on') return true
    if (pref === 'off') return false
  } catch { /* fall through to the browser signal */ }
  return !browserSaysNo()
}

export function setAnalyticsEnabled(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* ignore */ }
  if (on) { initGA(); track('analytics_opt_in') }
  else stopGA()
}

export function initAnalytics() {
  if (analyticsEnabled()) initGA()
  initErrorTracking()
}

// --- privacy guard -----------------------------------------------------------------------------------

const BLOCKED_KEY = /mail|name|title|note|text|query|phone|address|coord|confirm|passport|token|url|(^|_)(lat|lng|lon|number)($|_)/i

function cleanValue(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined
  if (typeof v !== 'string') return undefined
  // Short codes only: 'flight', 'email_import', 'GB', 'ja'. Long strings, '@' and long digit runs are dropped.
  if (v.length > 40 || v.includes('@') || /\d{5,}/.test(v)) return undefined
  return v
}

export function cleanProps(props) {
  const out = {}
  for (const [k, v] of Object.entries(props || {})) {
    if (BLOCKED_KEY.test(k) || k.length > 40) continue
    const clean = cleanValue(v)
    if (clean !== undefined && clean !== null && clean !== '') out[k] = clean
  }
  return out
}

// --- events ----------------------------------------------------------------------------------------

// Returns a promise that always resolves (await it only when the session is about
// to go away, e.g. before sign-out). Deferred one tick so it is safe to call from
// inside supabase.auth.onAuthStateChange callbacks.
export function track(event, props = {}, screen) {
  try {
    if (!analyticsEnabled()) return Promise.resolve()
    const clean = cleanProps(props)
    const where = screen || currentScreen()
    const gaName = event in GA_NAMES ? GA_NAMES[event] : event
    if (gaName) gaEvent(gaName, { ...clean, ...(clean.provider ? { method: clean.provider } : {}), screen: where || undefined })
    return new Promise(resolve => setTimeout(resolve, 0))
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        const userId = data?.session?.user?.id
        gaSetUser(userId)
        if (!userId) return
        return supabase.from('analytics_events').insert({
          user_id: userId,
          session_id: getSessionId(),
          event,
          screen: where,
          props: clean,
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

// One per screen change: GA page_view + a Supabase `screen_view` row. Path like 'trip/pack' or 'explore/honk'.
export function screenView(path) {
  if (!path || path === lastScreen) return
  lastScreen = path
  if (!analyticsEnabled()) return
  gaPageView(path)
  track('screen_view', { path }, path.split('/')[0])
}

// Error class only (never the message, which can hold user text); capped per session.
let errorsSent = 0
export function trackError(kind, error) {
  if (errorsSent >= 5) return
  errorsSent += 1
  const name = (error && typeof error === 'object' && error.name) || typeof error
  track('app_error', { kind, error_type: String(name).slice(0, 40) })
}

function initErrorTracking() {
  if (typeof window === 'undefined' || initErrorTracking.done) return
  initErrorTracking.done = true
  window.addEventListener('error', e => trackError('js', e.error))
  window.addEventListener('unhandledrejection', e => trackError('promise', e.reason))
}

// Short reason code for a failed AI or network call, from its user-facing message.
export function errorReason(e) {
  const m = String(e?.message || '').toLowerCase()
  if (/limit|quota|too many/.test(m)) return 'quota'
  if (/longer than expected|timeout|timed out/.test(m)) return 'timeout'
  if (/reach the server|network|connection|fetch/.test(m)) return 'network'
  return 'other'
}
