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
  captureFirstTouch()
  initActiveTime()
  setTimeout(trackSessionStart, 1500)
}

// --- session context ------------------------------------------------------------------------------------
// Once per session: coarse device and setting codes (no identifiers, no fingerprinting detail), and how many days
// since this device's last session. First party, covered by the Settings opt-out like every other event.

function trackSessionStart() {
  try {
    if (sessionStorage.getItem('stt_session_started')) return
    sessionStorage.setItem('stt_session_started', '1')
  } catch { return }
  const ua = navigator.userAgent || ''
  const os = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : /mac/i.test(ua) ? 'mac' : /win/i.test(ua) ? 'windows' : /linux|cros/i.test(ua) ? 'linux' : 'other'
  const w = window.innerWidth || 0
  let daysSince
  try {
    const last = Number(localStorage.getItem('stt_last_session'))
    if (last) daysSince = Math.floor((Date.now() - last) / 86400000)
    localStorage.setItem('stt_last_session', String(Date.now()))
  } catch { /* storage blocked */ }
  track('session_start', {
    lang: (navigator.language || '').slice(0, 10),
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } })(),
    os,
    display: getPlatform() !== 'web' ? 'app' : window.matchMedia?.('(display-mode: standalone)').matches ? 'installed' : 'browser',
    screen: w < 600 ? 'phone' : w < 1024 ? 'tablet' : 'desktop',
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    net: navigator.connection?.effectiveType,
    returning: daysSince != null,
    days_since: daysSince,
  })
}

// --- first touch (UTM / referrer) ---------------------------------------------------------------------
// Kept on the device from the first visit; saved once to `member_attribution` when the account is created.

const TOUCH_KEY = 'stt_first_touch'

function captureFirstTouch() {
  try {
    if (localStorage.getItem(TOUCH_KEY)) return
    const q = new URLSearchParams(window.location.search)
    const code = v => (v && /^[\w.-]{1,64}$/.test(v) ? v.toLowerCase() : null)
    let referrer = null
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : ''
      if (host && !host.endsWith('sillytraveltool.com') && host !== window.location.hostname) referrer = host.slice(0, 128)
    } catch { /* bad referrer */ }
    localStorage.setItem(TOUCH_KEY, JSON.stringify({
      utm_source: code(q.get('utm_source')),
      utm_medium: code(q.get('utm_medium')),
      utm_campaign: code(q.get('utm_campaign')),
      referrer_domain: referrer,
      landing_path: window.location.pathname.slice(0, 128),
      first_seen: new Date().toISOString(),
    }))
  } catch { /* storage blocked */ }
}

function saveAttribution(userId) {
  try {
    const touch = JSON.parse(localStorage.getItem(TOUCH_KEY) || 'null')
    if (!touch) return
    supabase.from('member_attribution').insert({ user_id: userId, ...touch }).then(() => {}, () => {})
  } catch { /* ignore */ }
}

// --- active time ---------------------------------------------------------------------------------------
// Counts seconds only while the tab is visible and someone touched it in the last minute, per screen.
// Sent as `active_time {path, seconds}` on screen change, when the app is hidden, and every 5 minutes.

const TICK_S = 15
const IDLE_MS = 60_000
let lastInput = Date.now()
let activePath = null
let activeSeconds = 0
let sinceFlush = 0

function flushActiveTime() {
  if (activeSeconds >= 1 && activePath) track('active_time', { path: activePath, seconds: activeSeconds }, activePath.split('/')[0])
  activeSeconds = 0
  sinceFlush = 0
}

function initActiveTime() {
  if (typeof window === 'undefined' || initActiveTime.done) return
  initActiveTime.done = true
  const touch = () => { lastInput = Date.now() }
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(e, touch, { passive: true, capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushActiveTime()
    else touch()
  })
  setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE_MS || !activePath) return
    activeSeconds += TICK_S
    sinceFlush += TICK_S
    if (sinceFlush >= 300) flushActiveTime()
  }, TICK_S * 1000)
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
        if (event === 'sign_up') saveAttribution(userId)
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
  flushActiveTime()
  activePath = path
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
