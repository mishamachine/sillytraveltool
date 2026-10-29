// All wording for the AI reading permission in one place, so it can be swapped without touching components.
// Draft wording from the business side, not final legal copy. Version B is live; Version A is kept unused.
// If the meaning changes, bump AI_CONSENT_VERSION in store/consentStore.js.
export const AI_CONSENT_POLICY_URL = 'https://sillytraveltool.com/privacy/#ai'
export const AI_CONSENT_POLICY_LABEL = 'Privacy Policy'

// Version B (in use): text goes to DeepSeek first, Google as the fallback; PDFs and images go to Google.
export const AI_CONSENT_B = {
  title: 'Let Goose use AI on your bookings?',
  intro: 'To read booking emails, pasted confirmations and itinerary files, Silly Travel Tool sends them to AI services run by other companies:',
  bullets: [
    'Forwarded emails and pasted text (the subject, the sender and the first part of the message), and sentences you type to translate, go to DeepSeek, a company based in China. If DeepSeek isn’t available, they go to Google instead.',
    'PDFs and images you import go to Google (Gemini).',
  ],
  outro: 'These can include names, dates, booking or confirmation numbers and anything you type to translate. The companies process the data on their own servers, including in China. Each company’s own rules apply to what it keeps. We keep the booking details, not the emails.',
  afterPolicy: 'You can change your choice any time in Settings.',
  notNow: 'Without this, email import, pasting a confirmation, importing an itinerary and typed translations won’t work. You can still add bookings by hand. City guides, the phrase book, packing lists and HONK don’t need it.',
}

// Version A (UNUSED, swap in by changing AI_CONSENT below): everything goes to Google.
export const AI_CONSENT_A = {
  ...AI_CONSENT_B,
  bullets: ['Forwarded emails, pasted text and imported PDFs or images go to Google (Gemini).'],
  outro: 'These can include names, dates and booking or confirmation numbers. Google processes the data on its own servers. Each company’s own rules apply to what it keeps. We keep the booking details, not the emails.',
}

export const AI_CONSENT = AI_CONSENT_B
