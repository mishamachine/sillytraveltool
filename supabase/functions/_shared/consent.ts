// Has the member said yes to AI reading what they import or type (user_profiles.ai_consent_at, Apple 5.1.2(i))?
// Checked by the functions that send a member's own content to the AI: parse-booking-email, generate-phrases (typed
// text) and inbox-release; forwarded emails are held in ingest.ts instead.

/** The app opens the Allow sheet on this code; older app builds show the message. */
export const CONSENT_REQUIRED = {
  error: 'Goose needs your OK before reading imports. Update STT to the latest version to give it.',
  code: 'ai_consent',
}

// Must match src/lib/aiConsentPolicy.js and my_record_ai_consent (scripts/test-ai-consent.mjs checks all three).
// A yes to older wording or routing doesn't count.
export const AI_CONSENT_VERSION = 'v3-2026-10-29'
export const AI_CONSENT_ROUTING = 'deepseek-first+gemini-fallback; pdf/image gemini'

/** A profile row's yes to the current wording and routing. */
export const consentCurrent = (row: { ai_consent_at?: string | null, ai_consent_version?: string | null, ai_consent_routing?: string | null } | null | undefined) =>
  !!row?.ai_consent_at && row.ai_consent_version === AI_CONSENT_VERSION && row.ai_consent_routing === AI_CONSENT_ROUTING

/**
 * True when the member allowed the CURRENT wording and routing. Before migration 20261026120000_ai_consent the column doesn't exist (Postgres
 * 42703 "undefined column") and this answers true, so nothing changes until it's applied. Any other database error
 * answers false (ask again).
 * TODO(remove): once migration 20261026120000_ai_consent is applied in production, delete the 42703 branch so a
 * missing column fails closed.
 */
export async function aiConsentGiven(userId: string): Promise<boolean> {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.from('user_profiles').select('ai_consent_at, ai_consent_version, ai_consent_routing').eq('id', userId).single()
  if (error) return error.code === '42703'
  return consentCurrent(data)
}
