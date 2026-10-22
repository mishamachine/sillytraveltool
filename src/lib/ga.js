import { Capacitor } from '@capacitor/core'

// GA4 on the website and in the Capacitor app. Fed by track() and screenView() in analytics.js; nothing
// else should call gtag. Production builds only; a dev build loads it with VITE_GA_DEV=1 (events are sent
// with debug_mode, so they show in GA4 DebugView). No ads storage, ad signals or Google signals.

const GA_ID = import.meta.env.VITE_GA_ID || 'G-H7ZP1DBHN3'
const ENABLED = import.meta.env.MODE === 'production' || import.meta.env.VITE_GA_DEV === '1'
const DEBUG = import.meta.env.DEV
const CLIENT_KEY = 'stt_ga_client_id'

let started = false
let lastUserId

function isNative() {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

function platform() {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

// The app's WebView origin (https://localhost, capacitor://localhost on iOS) can't keep GA's cookie, so the
// app keeps its own random device id and hands it to GA.
function nativeClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = `${Math.floor(Math.random() * 2147483647)}.${Math.floor(Date.now() / 1000)}`
      localStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch { return undefined }
}

export function initGA() {
  if (!ENABLED || started || typeof window === 'undefined') return
  started = true
  window[`ga-disable-${GA_ID}`] = false
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) } // gtag needs the arguments object, not an array
  window.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  })
  window.gtag('js', new Date())
  const native = isNative()
  // Page views are sent by screenView() (routing is Zustand state, not URLs).
  window.gtag('config', GA_ID, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(native ? { client_id: nativeClientId(), cookie_storage: 'none' } : {}),
    ...(DEBUG ? { debug_mode: true } : {}),
  })
  window.gtag('set', 'user_properties', { app_platform: platform() })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
}

// Opting out mid-session: GA's own kill switch stops every later hit.
export function stopGA() {
  if (typeof window !== 'undefined') window[`ga-disable-${GA_ID}`] = true
}

export function gaSetUser(userId) {
  if (!started || !window.gtag || userId === lastUserId) return
  lastUserId = userId
  try { window.gtag('set', { user_id: userId || null }) } catch { /* ignore */ }
}

export function gaEvent(name, params = {}) {
  if (!started || !window.gtag) return
  try { window.gtag('event', name, { ...params, app_platform: platform() }) } catch { /* ignore */ }
}

export function gaPageView(path) {
  if (!started || !window.gtag) return
  // The app has no real URLs; give GA a stable path per screen on the site's host
  const origin = isNative() ? 'https://sillytraveltool.com' : window.location.origin
  gaEvent('page_view', { page_title: path, page_location: `${origin}/${path}`, page_path: `/${path}` })
}
