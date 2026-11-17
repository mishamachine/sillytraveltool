// All wording for the AI reading permission in one place, so it can be swapped without touching components.
// Trimmed to the store minimum (legal approved, 17 Nov 2026); routing is unchanged, so AI_CONSENT_VERSION is not bumped
// (src/lib/aiConsentPolicy.js, pinned by scripts/test-ai-consent.mjs). Version A is kept unused.
export const AI_CONSENT_POLICY_URL = 'https://sillytraveltool.com/privacy/#ai'
export const AI_CONSENT_POLICY_LABEL = 'Privacy Policy'

// Version B (in use): text goes to DeepSeek first, Google as the fallback; PDFs and images go to Google (the Privacy Policy has the detail).
export const AI_CONSENT_B = {
  title: 'Let Goose read your bookings with AI?',
  // "Privacy Policy" inside the intro is shown as a link to AI_CONSENT_POLICY_URL (AiConsentSheet.jsx)
  intro: 'Goose sends what you forward or import, and what you translate, to AI partners (DeepSeek and Google) to read it. Details are in our Privacy Policy.',
  bullets: [],
  outro: '',
  afterPolicy: 'You can change your choice any time in Settings.',
  notNow: 'You can still add bookings by hand.',
}

// Version A (UNUSED, swap in by changing AI_CONSENT below): everything goes to Google.
export const AI_CONSENT_A = {
  ...AI_CONSENT_B,
  bullets: ['Forwarded emails, pasted text and imported PDFs or images go to Google (Gemini).'],
  outro: 'These can include names, dates and booking or confirmation numbers. Google processes the data on its own servers. Each company’s own rules apply to what it keeps. We keep the booking details, not the emails.',
}

export const AI_CONSENT = AI_CONSENT_B
