import { Capacitor } from '@capacitor/core'
import { isConsentRegion, consentDefaults } from './consent'

// GA4 on the website and in the Capacitor app. Fed by track() and screenView() in analytics.js; nothing
// else should call gtag, and this is the only place that loads gtag.js. Every build except the dev server (npm run dev)
// loads it; the dev server needs VITE_GA_DEV=1 (events are sent with debug_mode, so they show in GA4 DebugView).
// No ads storage, ad signals or Google signals.
// EU/EEA/UK/Switzerland visitors: initGA() is only called after they opt in (analytics.js), so gtag.js is never fetched
// before consent ("basic" Consent Mode: no cookieless pings). Consent Mode v2 defaults are still set, denied, before it loads.

// The stream's Google tag ID (GA Admin → Data streams → Configure tag settings). It forwards to the GA4
// measurement ID G-H7ZP1DBHN3; Google answers 404 when the script or config uses the measurement ID itself.
// The tag's other ID, G-KRXDJXZ4SS, is an old measurement ID: configuring it would also send hits there.
const GA_ID = import.meta.env.VITE_GA_ID || 'GT-PHRN37HF'
const KILL_IDS = [GA_ID, 'G-H7ZP1DBHN3']
const ENABLED = !import.meta.env.DEV || import.meta.env.VITE_GA_DEV === '1'
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
  if (!ENABLED || typeof window === 'undefined') return
  KILL_IDS.forEach(id => { window[`ga-disable-${id}`] = false })
  if (started) {
    // Opted out earlier this session and back in: lift the switch
    try { window.gtag('consent', 'update', { analytics_storage: 'granted' }) } catch { /* ignore */ }
    return
  }
  started = true
  const region = isConsentRegion()
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) } // gtag needs the arguments object, not an array
  window.gtag('consent', 'default', consentDefaults(region))
  // Reaching this point means analytics is on (opted in, or outside the region), so analytics storage is granted
  if (region) window.gtag('consent', 'update', { analytics_storage: 'granted' })
  window.gtag('js', new Date())
  const native = isNative()
  // Page views are sent by screenView() (routing is Zustand state, not URLs).
  window.gtag('config', GA_ID, {
    send_page_view: false,
    page_location: pageLocation(native ? 'https://sillytraveltool.com' : window.location.origin, '', window.location.search),
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
  if (typeof window === 'undefined') return
  KILL_IDS.forEach(id => { window[`ga-disable-${id}`] = true })
  try { window.gtag?.('consent', 'update', { analytics_storage: 'denied' }) } catch { /* ignore */ }
}

// page_location for GA: the screen's path on the site's host, keeping only utm_* parameters from the query string so
// campaign tags survive and nothing else (tokens, emails in links) is ever sent.
export function pageLocation(origin, path, search = '') {
  const kept = new URLSearchParams()
  try { new URLSearchParams(search).forEach((v, k) => { if (/^utm_[a-z0-9_]+$/i.test(k)) kept.append(k, v) }) } catch { /* bad query */ }
  const q = kept.toString()
  return `${origin}/${path}${q ? `?${q}` : ''}`
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
  gaEvent('page_view', { page_title: path, page_location: pageLocation(origin, path, window.location.search), page_path: `/${path}` })
}
