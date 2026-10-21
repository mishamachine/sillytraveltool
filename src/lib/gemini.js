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
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    })
    clearTimeout(timer)
    if (error) throw new Error(`Edge Function ${name} error: ${error.message}`)
    if (data?.error) throw new Error(data.error)
    return data
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new Error(`${name} timed out — please try again`)
    throw e
  }
}

/**
 * Generate destination guide content — section-based
 * section: 'overview' | 'eat' | 'see' | 'move' | 'events'
 */
export async function generateGuideContent(city, country, section = 'overview', excludeNames = []) {
  return invokeFunction('generate-guide', { city, country, section, exclude_names: excludeNames })
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
