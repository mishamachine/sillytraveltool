/**
 * Silly Travel Tool — Gemini AI Client
 *
 * All calls proxied through Supabase Edge Functions.
 * The Gemini API key lives server-side only (GEMINI_API_KEY in Supabase secrets).
 * Client only needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 */
import { supabase } from './supabase'

/**
 * Core Edge Function invoker — handles auth + error unwrapping
 */
async function invokeFunction(name, payload, timeoutMs = 30000) {
  // Ensure we have a valid session before invoking — avoids 401 on cold start
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated — please sign in')

  const controller = new AbortController()
  let timedOut = false
  let timer
  // Promise.race backstop in case the underlying fetch ignores the abort signal
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new Error('This is taking longer than expected. Please try again.'))
    }, timeoutMs)
  })

  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke(name, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
      }),
      timeout,
    ])
    if (timedOut) throw new Error('This is taking longer than expected. Please try again.')
    if (error) throw new Error(await extractErrorMessage(error))
    if (data?.error) throw new Error(data.error)
    return data
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pull the server's `{ error }` message out of a non-2xx Edge Function response
 */
async function extractErrorMessage(error) {
  const res = error?.context
  if (res && typeof res.clone === 'function') {
    try {
      const body = await res.clone().json()
      if (body?.error) return String(body.error)
    } catch {
      try {
        const text = await res.clone().text()
        if (text && text.length < 300) return text
      } catch { /* ignore */ }
    }
  }
  if (error?.name === 'FunctionsFetchError') return 'Could not reach the server. Check your connection and try again.'
  return error?.message || 'Something went wrong. Please try again.'
}

/**
 * Generate destination guide content — section-based
 * section: 'overview' | 'eat' | 'see' | 'move' | 'events'
 */
export async function generateGuideContent(city, country, section = 'overview', excludeNames = [], destinationKey = null) {
  // destination_key lets the function read/write the shared guide cache server-side
  return invokeFunction('generate-guide', { city, country, section, exclude_names: excludeNames, destination_key: destinationKey }, 45000)
}

/**
 * Generate offline phrases for a language
 */
export async function generatePhrases(languageCode, languageName) {
  return invokeFunction('generate-phrases', { languageCode, languageName })
}

/**
 * Goosey discovery
 */
export async function gooseyDiscover({ city, country, mood, filters = [] }) {
  return invokeFunction('goosey-discover', { city, country, mood, filters })
}

/**
 * Parse booking email
 */
export async function parseBookingEmail(emailText) {
  return invokeFunction('parse-booking-email', { emailText }, 28000)
}

/**
 * Generate AI-powered packing checklist
 */
export async function generateChecklist(trip, bookings, weatherContext) {
  return invokeFunction('generate-checklist', { trip, bookings, weatherContext })
}

export default { generateGuideContent, generatePhrases, gooseyDiscover, parseBookingEmail, generateChecklist }
