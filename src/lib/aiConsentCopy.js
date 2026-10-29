// All wording for the AI reading permission in one place, so legal can swap it without touching components.
// DRAFT wording, not final legal copy. If the meaning changes, bump AI_CONSENT_VERSION in store/consentStore.js.
export const AI_CONSENT_TITLE = 'Let Goose read your bookings?'
export const AI_CONSENT_LEAD = 'Goose uses AI to turn what you send it into a tidy plan.'
export const AI_CONSENT_READS = [
  { icon: 'inbox', tone: 'accent', title: 'Booking emails you forward', meta: 'Times, places and confirmation numbers' },
  { icon: 'clipboard', tone: 'success', title: 'Text and files you import', meta: 'Pasted confirmations, PDFs and screenshots' },
  { icon: 'translate', tone: 'info', title: 'Sentences you translate', meta: 'Typed in Tools → Translate' },
]
export const AI_CONSENT_NOTE = 'The reading is done by DeepSeek, whose servers are in China, with Google Gemini for photos and PDFs. They only see what you send to Goose. You can change this any time in Settings.'
export const AI_CONSENT_NOT_NOW = 'If you choose Not now, forwarded emails wait unread, and importing and translating are switched off. You can still add bookings by hand.'
export const AI_CONSENT_POLICY_URL = 'https://sillytraveltool.com/privacy/#ai'
export const AI_CONSENT_POLICY_LABEL = 'Privacy Policy'
