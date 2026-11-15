// "Add to home screen" (web only): the rules, the device checks and the one block of wording.
// Pure functions take their environment as arguments so scripts/test-install-prompt.mjs can run them in Node.
// The pop-up, onboarding step, Settings row and Help row all use this file (UI: components/shared/InstallPrompt.jsx).

// ---- STRINGS (all install wording lives here) ----
export const INSTALL_COPY = {
  title: 'Add Silly Travel Tool to your home screen',
  body: 'It opens like an app, without the browser bars.',
  add: 'Add',
  notNow: 'Not now',
  dismiss: 'Dismiss',
  gotIt: 'Got it',
  iosSteps: 'Tap Share, then Add to Home Screen.',
  iosOtherBrowser: 'Open this page in Safari, then tap Share, then Add to Home Screen.',
  menuHint: 'Open your browser menu, then Install app or Add to Home screen.',
  settingsRow: 'Add to home screen',
  helpRow: 'Install STT on your phone or computer',
  helpRowMeta: 'Opens like an app, without the browser bars',
}
// ---- END STRINGS ----

export const STORAGE_KEY = 'stt_install_prompt'
export const LEGACY_DISMISSED_KEY = 'install_banner_dismissed' // the old 30 s toast: counts as 1 dismissal
export const MIN_GAP_MS = 14 * 24 * 60 * 60 * 1000
export const MAX_DISMISSALS = 2

// Events through track(), short codes, no props
export const EVENTS = { shown: 'install_prompt_shown', dismissed: 'install_prompt_dismissed', accepted: 'install_prompt_accepted' }

/** Device facts: { native, standalone, ios, iosSafari }. Pass fakes in tests. */
export function readEnv({ capacitor, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  const nav = win?.navigator || {}
  const ua = nav.userAgent || ''
  let native = false
  try { native = !!capacitor?.isNativePlatform?.() } catch { native = false }
  const standalone = !!(win?.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone === true)
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/.test(ua)
  return { native, standalone, ios, iosSafari }
}

/** Where "Add to home screen" makes sense at all: the website, in a browser tab. */
export function surfaceAvailable(env, state) {
  return !env.native && !env.standalone && !state?.done
}

/** What "Add" does: 'prompt' (browser's own), 'ios-safari' / 'ios-other' (steps), 'menu' (hint). */
export function installMethod(env, hasDeferred) {
  if (env.ios) return env.iosSafari ? 'ios-safari' : 'ios-other'
  return hasDeferred ? 'prompt' : 'menu'
}

export function stepsText(method) {
  return method === 'ios-safari' ? INSTALL_COPY.iosSteps : method === 'ios-other' ? INSTALL_COPY.iosOtherBrowser : INSTALL_COPY.menuHint
}

// ---- counters (localStorage, wrapped so a private window simply never shows the pop-up) ----
export function readState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    const s = raw ? JSON.parse(raw) : {}
    let dismissals = Number.isInteger(s.dismissals) && s.dismissals >= 0 ? s.dismissals : 0
    let legacy = false
    try { legacy = !!storage.getItem(LEGACY_DISMISSED_KEY) } catch { /* ignore */ }
    if (legacy) dismissals = Math.max(dismissals, 1)
    return { last_shown: Number.isFinite(s.last_shown) ? s.last_shown : null, dismissals, done: s.done === true, ok: true }
  } catch {
    return { last_shown: null, dismissals: 0, done: false, ok: false }
  }
}

export function writeState(storage, s) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ last_shown: s.last_shown, dismissals: s.dismissals, done: s.done })); return true } catch { return false }
}

const update = (storage, patch) => { const s = { ...readState(storage), ...patch }; return writeState(storage, s) ? s : null }
export const markShown = (storage, now) => update(storage, { last_shown: now })
export const markDismissed = (storage) => update(storage, { dismissals: readState(storage).dismissals + 1 })
export const markDone = (storage) => update(storage, { done: true })
/** The onboarding step counts as a showing for the 14-day gap, but not as a dismissal. */
export const markOnboardingShown = (storage, now) => update(storage, { last_shown: now })

/**
 * Should the pop-up show now? Returns 'show', or a reason: 'unavailable' (native, installed, done), 'signed_out',
 * 'busy' (mid-task), 'visit' (already shown this visit), 'dismissed' (2 dismissals), 'first_visit' (nothing stored yet:
 * start the 14-day clock instead of showing), 'gap' (under 14 days), 'storage' (no localStorage).
 */
export function evaluate({ state, now, env, signedIn, busy, shownThisVisit }) {
  if (!state.ok) return 'storage'
  if (!surfaceAvailable(env, state)) return 'unavailable'
  if (!signedIn) return 'signed_out'
  if (state.dismissals >= MAX_DISMISSALS) return 'dismissed'
  if (shownThisVisit) return 'visit'
  if (state.last_shown == null) return 'first_visit'
  if (now - state.last_shown < MIN_GAP_MS) return 'gap'
  if (busy) return 'busy'
  return 'show'
}

// ---- the browser's saved install offer (Chrome, Edge, Android) ----
let deferred = null
let installed = false
const listeners = new Set()
const notify = () => listeners.forEach(f => f())

export const getDeferred = () => deferred
export const clearDeferred = () => { deferred = null; notify() }
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f) }
export const wasInstalledThisVisit = () => installed

/** Listen once, as early as the module loads. onInstalled runs when the browser reports the install. */
export function captureInstallEvents(win, onInstalled) {
  if (!win?.addEventListener) return
  win.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify() })
  win.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); onInstalled?.() })
}
