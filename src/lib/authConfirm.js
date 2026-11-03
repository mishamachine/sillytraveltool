// /auth/confirm: the page our branded auth emails link to (web only).
// The email link carries ?token_hash=…&type=… and nothing happens until the member taps Continue, so link scanners
// that open every URL in an email can't use up the one-time token. Only the tap calls verifyOtp.
// Pure functions, no browser or Supabase imports, so scripts/test-auth-confirm.mjs runs them in Node.

export const CONFIRM_PATH = '/auth/confirm'

// What each email type means for the page. `start` is the sign-in form to reopen when the link is no use.
export const CONFIRM_TYPES = {
  recovery:     { title: 'Reset your password', blurb: 'Tap Continue to choose a new password.', start: 'forgot', again: 'Send me a new reset link' },
  magiclink:    { title: 'Sign in', blurb: 'Tap Continue and you are in.', start: 'magic', again: 'Send me a new sign-in link' },
  signup:       { title: 'Confirm your email', blurb: 'Tap Continue to activate your account.', start: 'login', again: 'Back to log in' },
  email_change: { title: 'Confirm an email change', blurb: 'Tap Continue to confirm the change to your account\'s email address.', start: 'login', again: 'Back to log in' },
}

export function isConfirmPath(pathname) {
  return /^\/auth\/confirm\/?$/.test(pathname || '')
}

// → { tokenHash, type } when the link is usable, or { error: 'incomplete' | 'unknown_type', type? }
export function parseConfirmParams(search) {
  const q = new URLSearchParams(search || '')
  const tokenHash = (q.get('token_hash') || '').trim()
  const type = (q.get('type') || '').trim()
  if (!tokenHash || !type) return { error: 'incomplete' }
  if (!Object.hasOwn(CONFIRM_TYPES, type)) return { error: 'unknown_type', type }
  return { tokenHash, type }
}

// Drop the one-time params from the address bar once read (history, screenshots and shared links stay clean)
export function stripConfirmParams(win) {
  win.history.replaceState(win.history.state, '', win.location.pathname)
}

// → { ok: true, type } or { ok: false, reason: 'expired' | 'network' | 'incomplete' | 'unknown_type' }
export async function confirmLink(supabase, parsed) {
  if (parsed.error) return { ok: false, reason: parsed.error }
  let res
  try {
    res = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type })
  } catch {
    return { ok: false, reason: 'network' }
  }
  const error = res?.error
  if (!error) return { ok: true, type: parsed.type }
  // Supabase answers 4xx for a used, expired or wrong token; fetch failures and 5xx are worth another try
  const status = error.status
  const retry = error.name === 'AuthRetryableFetchError' || (typeof status === 'number' && status >= 500)
  return { ok: false, reason: retry ? 'network' : 'expired' }
}

export const REASON_COPY = {
  expired: { title: 'That link has run out', body: 'Email links work once and only for a short while. Ask for a fresh one and we will send it straight over.' },
  network: { title: 'Goose could not reach the server', body: 'Check your connection and try Continue again.' },
  incomplete: { title: 'That link looks cut off', body: 'Part of the link went missing, often when an email app wraps a long line. Ask for a fresh one.' },
  unknown_type: { title: 'We do not know that link', body: 'It may be from an older email. Ask for a fresh one.' },
}
