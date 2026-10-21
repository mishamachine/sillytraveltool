import { Capacitor } from '@capacitor/core'

// Sentry error monitoring. No-op unless VITE_SENTRY_DSN is set.
// The SDKs are loaded with dynamic import so builds without a DSN don't pay for them at startup.
const DSN = import.meta.env.VITE_SENTRY_DSN || ''

let client = null // the module whose captureException we call

export async function initSentry() {
  if (!DSN || client) return
  try {
    const options = {
      dsn: DSN,
      release: `stt@${import.meta.env.VITE_APP_VERSION}`,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
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
