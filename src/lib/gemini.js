/**
 * Silly Travel Tool — Gemini AI Client
 *
 * All calls proxied through Supabase Edge Functions.
 * The Gemini API key lives server-side only (GEMINI_API_KEY in Supabase secrets).
 * Client only needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 */
import { supabase } from './supabase'
import { track } from './analytics'
import { useConsentStore } from '../store/consentStore'
import { useAuthStore } from '../store/authStore'

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
    if (error) {
      if (error?.context?.status === 429) track('ai_quota_hit', { feature: name })
      const e = new Error(await extractErrorMessage(error))
      e.code = await extractErrorCode(error)
      throw e
    }
    if (data?.error) throw new Error(data.error)
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** The server's `{ code }` (e.g. 'ai_consent'), when it sent one. */
async function extractErrorCode(error) {
  try { return (await error?.context?.clone?.().json())?.code || null } catch { return null }
}

/**
 * Things the member sends Goose (imports, typed translations) are read by AI only after their yes (Apple 5.1.2(i)):
 * ask first when there's no answer, and once more if the server says the yes is gone (turned off on another device).
 */
async function withAiConsent(reason, call) {
  const declined = () => Object.assign(new Error('Goose needs your OK to read this. You can allow it any time in Settings.'), { code: 'ai_consent_declined' })
  if (!(await useConsentStore.getState().ensure(reason))) throw declined()
  try { return await call() } catch (e) {
    if (e?.code !== 'ai_consent') throw e
    useAuthStore.setState(st => ({ profile: st.profile ? { ...st.profile, ai_consent_at: null } : st.profile }))
    if (!(await useConsentStore.getState().ensure(reason))) throw declined()
    try { return await call() } catch (e2) {
      // Said yes, yet the server still says no: not an old app build, so don't tell the member to update
      if (e2?.code === 'ai_consent') throw new Error('Goose couldn’t confirm your OK just now. Please try again in a moment.')
      throw e2
    }
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
export async function generateGuideContent(city, country, section = 'overview', excludeNames = [], destinationKey = null, stage) {
  // destination_key lets the function read/write the shared guide cache server-side.
  // stage 'facts' = Google places only (fast); 'voice' = the Goose's words for them (see guideStore)
  return invokeFunction('generate-guide', { city, country, section, exclude_names: excludeNames, destination_key: destinationKey, stage }, 45000)
}

/**
 * Generate offline phrases for a language
 */
export async function generatePhrases(languageCode, languageName, source = { code: 'en', name: 'English' }) {
  return invokeFunction('generate-phrases', { languageCode, languageName, sourceCode: source.code, sourceName: source.name }, 45000)
}

/** One typed sentence → { native, romanized, back }. Not cached server-side; the Translate tool keeps it on the phone. */
export async function translateText(text, target, source = { code: 'en', name: 'English' }) {
  return withAiConsent('translate', () => invokeFunction('generate-phrases', { mode: 'text', text, languageCode: target.code, languageName: target.name, sourceCode: source.code, sourceName: source.name }, 30000))
}

/**
 * Goosey discovery
 */
// stage 'facts' = the Google place at once; 'voice' = the Goose's words for `place` (see HonkView)
export async function gooseyDiscover({ city, country, mood, filters = [], lat, lng, exclude = [], stage, place }) {
  return invokeFunction('goosey-discover', { city, country, mood, filters, lat, lng, exclude, stage, place })
}

/**
 * Parse booking email
 */
export async function parseBookingEmail(emailText) {
  return withAiConsent('import', () => invokeFunction('parse-booking-email', { emailText }, 32000))
}

/**
 * Read an itinerary file: a PDF, a screenshot or a photo (read by the AI's vision), or a spreadsheet (turned into
 * text here first). transcribe: also return what was read (read_text), shown before saving.
 */
export async function parseBookingFile(file, { transcribe = false } = {}) {
  return withAiConsent('import', () => readFile(file, transcribe))
}

async function readFile(file, transcribe) {
  const { sheetToText } = await import('../../supabase/functions/_shared/sheet.js')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sheet = await sheetToText(bytes, { name: file.name, mime: file.type })
  if (sheet != null) return invokeFunction('parse-booking-email', { emailText: `Spreadsheet itinerary (${file.name}):\n${sheet}`.slice(0, 20000) }, 45000)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return invokeFunction('parse-booking-email', { file: { name: file.name, mime: file.type || 'application/octet-stream', data: btoa(bin) }, transcribe }, 75000)
}

/**
 * Generate AI-powered packing checklist
 */
export async function generateChecklist(trip, bookings, weatherContext, stops = []) {
  return invokeFunction('generate-checklist', { trip, bookings, weatherContext, stops }, 45000)
}

export default { generateGuideContent, generatePhrases, gooseyDiscover, parseBookingEmail, parseBookingFile, generateChecklist }
