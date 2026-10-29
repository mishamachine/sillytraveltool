// What the member agreed to, in one place. Bump AI_CONSENT_VERSION when the wording's meaning changes and
// AI_CONSENT_ROUTING when the AI companies change; both are checked on the server (my_record_ai_consent's list, and
// supabase/functions/_shared/consent.ts), and members who agreed to something else are asked again.
export const AI_CONSENT_VERSION = 'v2-2026-10-29'
export const AI_CONSENT_ROUTING = 'deepseek-first+gemini-fallback; pdf/image gemini'

/** True when the profile holds a yes to the CURRENT wording and routing. */
export const consentCurrent = (profile) =>
  !!profile?.ai_consent_at && profile.ai_consent_version === AI_CONSENT_VERSION && profile.ai_consent_routing === AI_CONSENT_ROUTING
