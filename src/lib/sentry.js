import { Capacitor } from '@capacitor/core'
import { analyticsEnabled } from './analytics'

// Sentry error monitoring. No-op unless VITE_SENTRY_DSN is set. Never sends from the dev server, and sends
// nothing while the member has "Share usage stats" off (main.jsx doesn't start it then either).
// The SDKs are loaded with dynamic import so builds without a DSN don't pay for them at startup.
const DSN = import.meta.env.VITE_SENTRY_DSN || ''

let client = null // the module whose captureException we call

// Member emails reach PostgREST filters in request URLs (e.g. `invited_email.eq.<email>`), so a query string
// holding an '@' or an 'eq.' value is cut before it leaves the device. Bare email addresses in text are redacted.
const QUERY = /\?[^\s"'<>#]*/g
const SENSITIVE_QUERY = /@|%40|eq\./i
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

function scrubString(s) {
  return s.replace(QUERY, q => (SENSITIVE_QUERY.test(q) ? '?[filtered]' : q)).replace(EMAIL, '[email]')
}

// Scrubs every string in an event or breadcrumb, wherever it sits (URLs, messages, spans, frames, extras).
function scrub(value, depth = 0) {
  if (typeof value === 'string') return scrubString(value)
  if (!value || typeof value !== 'object' || depth > 10) return value
  for (const key of Object.keys(value)) value[key] = scrub(value[key], depth + 1)
  return value
}

// Never send an event that could not be scrubbed
function clean(event) {
  try { return scrub(event) } catch { return null }
}

export async function initSentry() {
  if (!DSN || client) return
  try {
    const options = {
      dsn: DSN,
      enabled: !import.meta.env.DEV,
      release: `stt@${import.meta.env.VITE_APP_VERSION}`,
      environment: import.meta.env.DEV ? 'development' : 'production',
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeBreadcrumb: breadcrumb => clean(breadcrumb),
      beforeSend: event => (analyticsEnabled() ? clean(event) : null),
      beforeSendTransaction: event => (analyticsEnabled() ? clean(event) : null),
    }
    const SentryReact = await import('@sentry/react')
    let native = false
    try { native = Capacitor.isNativePlatform() } catch { /* web */ }
    if (native) {
      const SentryCapacitor = await import('@sentry/capacitor')
      SentryCapacitor.init(options, SentryReact.init)
      client = SentryCapacitor
    } else {
      SentryReact.init({ ...options, integrations: [SentryReact.browserTracingIntegration()] })
      client = SentryReact
    }
  } catch (e) {
    console.warn('Sentry init failed', e)
  }
}

export function captureException(error, context) {
  try { client?.captureException(error, context) } catch { /* ignore */ }
}
