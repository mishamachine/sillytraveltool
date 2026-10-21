import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'
import { isNative, APP_SCHEME } from '../lib/authRedirect'
import { useAuthStore } from '../store/authStore'

// Handles com.sillytraveltool.app://… links that Android hands to the app:
//   auth-callback?code=…            magic link, sign-up confirmation, Google (PKCE)
//   auth-callback?type=recovery&code=…  password reset → "set new password" screen
//   auth-callback?error_description=…   expired/used link
//   invite?token=…                  trip invite (accepted once signed in, see App.jsx)

let started = false
const seen = new Set() // getLaunchUrl and appUrlOpen can both deliver the same link

export function initDeepLinks() {
  if (!isNative || started) return
  started = true
  CapApp.addListener('appUrlOpen', ({ url }) => handleDeepLink(url))
  CapApp.getLaunchUrl().then(res => res?.url && handleDeepLink(res.url)).catch(() => {})
}

// Custom-scheme URLs aren't parsed consistently by every WebView's URL(),
// so split host / query / fragment by hand.
function parseLink(raw) {
  const rest = raw.slice(`${APP_SCHEME}://`.length)
  const [beforeHash, hash = ''] = rest.split('#')
  const [host, query = ''] = beforeHash.split('?')
  const q = new URLSearchParams(query)
  const h = new URLSearchParams(hash)
  return { host: host.replace(/\/+$/, ''), get: key => q.get(key) ?? h.get(key) }
}

function friendlyAuthError(message = '') {
  if (/expired|invalid|not found|already been used/i.test(message)) {
    return 'That sign-in link has expired or was already used. Request a new one.'
  }
  if (/code verifier/i.test(message)) {
    return 'Open the link on the same device you requested it from, or request a new one.'
  }
  return message || 'Sign-in failed. Please try again.'
}

export async function handleDeepLink(raw) {
  if (!raw?.startsWith(`${APP_SCHEME}://`) || seen.has(raw)) return
  seen.add(raw)
  Browser.close().catch(() => {}) // Google flow opens a Custom Tab; no-op otherwise

  const { host, get } = parseLink(raw)
  const store = useAuthStore.getState()

  if (host === 'invite') {
    const token = get('token')
    if (!token) return
    try { sessionStorage.setItem('pending_invite_token', token) } catch {}
    store.bumpInvite()
    return
  }

  if (host !== 'auth-callback') return

  const errorDescription = get('error_description') || get('error')
  if (errorDescription) {
    store.setAuthError(friendlyAuthError(errorDescription))
    return
  }

  // Flag recovery before the session lands so App goes straight to the reset screen.
  const isRecovery = get('type') === 'recovery'
  if (isRecovery) store.setPasswordRecovery(true)

  let error = null
  const code = get('code')
  if (code) {
    ;({ error } = await supabase.auth.exchangeCodeForSession(code))
  } else if (get('access_token') && get('refresh_token')) {
    ;({ error } = await supabase.auth.setSession({
      access_token: get('access_token'),
      refresh_token: get('refresh_token'),
    }))
  } else {
    return
  }

  if (error) {
    if (isRecovery) store.setPasswordRecovery(false)
    store.setAuthError(friendlyAuthError(error.message))
  }
}
