// Copy, step logic and "seen" memory for the per-section "About this section" walkthroughs. Every tour is plain data
// keyed by section id, so a section can be renamed or added by editing this file only. Each step shows a real feature
// of the section; `art` names its animated mock (a reused onboarding scene in ART_REUSED, or a scene in
// sectionTourScenes.js). Kept free of React so scripts/test-section-tours.mjs can import it.

export const SEEN_PREFIX = 'stt_section_tour_seen_'

// Onboarding scenes (screens/auth/TourArt.jsx) the section tours reuse as they are
export const ART_REUSED = ['TripsArt', 'WeatherPackArt', 'InboxArt', 'InviteArt', 'TodayArt', 'TogetherArt', 'GuideArt', 'GuideMoreArt', 'HonkArt']

// tryIt: what the last step's button does once the tour closes.
//   { action: 'new-trip' }               opens the New trip form
//   { target: 'x', click: true|false }   scrolls to [data-tour="x"] on the screen, then clicks or focuses it
export const SECTION_TOURS = {
  trips: {
    overline: 'About Trips',
    tryIt: { label: 'Plan a trip', action: 'new-trip' },
    steps: [
      { id: 'list', art: 'TripsArt', title: 'What’s next, at a glance', body: 'Your trips are listed soonest first. Open one for the plan, day by day, with every booking in local time.' },
      { id: 'weather-pack', art: 'WeatherPackArt', title: 'Weather and a packing list', body: 'Each trip has Plan, Weather and Pack tabs. Goose packs for the forecast, your stops and what you’ve booked.' },
      { id: 'paste', art: 'trips-paste', title: 'Paste a booking', body: 'Tap the clipboard, paste an email or booking text, and Goose reads it. Check it, then save it to a trip.' },
      { id: 'inbox', art: 'InboxArt', title: 'Forward it. Goose files it.', body: 'Send any booking email to your private address and it lands in the right trip. One booking per email.' },
      { id: 'together', art: 'InviteArt', title: 'Invite your crew', body: 'Open a trip, tap Travelers and add their email. You choose who can edit, and everyone plans from the same trip.' },
      { id: 'recap', art: 'trips-recap', title: 'Recaps for past trips', body: 'Finished trips move to Past. Tap Recap for your nights, flights, bookings, the weather and any badges you earned.' },
      { id: 'new', art: 'trips-new', title: 'Start a trip', body: 'Pick a destination and a name. Not sure of the dates yet? Switch that on, and Goose fills them in from your bookings.' },
    ],
  },
  today: {
    overline: 'About Today',
    tryIt: { label: 'Show me Next up', target: 'today-next', click: false },
    steps: [
      { id: 'tiles', art: 'today-tiles', title: 'Your day, at a glance', body: 'Weather where you are, tomorrow’s first booking, and what’s still to come today.' },
      { id: 'fill', art: 'today-fill', title: 'An empty afternoon?', body: 'On a day with nothing planned, tap Let Goose fill it. Pick a pace and up to three moods, then add the picks you like.' },
      { id: 'shared', art: 'TogetherArt', title: 'Traveling together', body: 'A flight or train your crew is on shows once, with who’s coming along.' },
      { id: 'get-there', art: 'TodayArt', title: 'Next up, and how to get there', body: 'Next up sits at the top. Open it and tap Get there for walking, transit, driving or a ride app, with real travel times.' },
    ],
  },
  guide: {
    overline: 'About Guide',
    tryIt: { label: 'Open a guide', target: 'guide-tile', click: true },
    steps: [
      { id: 'search', art: 'guide-search', title: 'Pick any city', body: 'Search a city, or tap one from your trip. Goose writes the guide in five sections and saves it.' },
      { id: 'know-eat', art: 'GuideArt', title: 'The lowdown, then where to eat', body: 'The lowdown has the numbers and local quirks. Where to eat runs from cheap to splurge.' },
      { id: 'see-more', art: 'GuideMoreArt', title: 'Sights, transport and festivals', body: 'Must-sees covers landmarks, museums, areas and day trips. Getting around shows how locals travel. What’s on lists festivals and events.' },
      { id: 'save', art: 'guide-save', title: 'Keep what you like', body: 'Tap + on any place and pick a trip. It’s saved as an idea, ready to book when you are.' },
    ],
  },
  honk: {
    overline: 'About HONK',
    tryIt: { label: 'Pick a mood', target: 'honk-card', click: false },
    steps: [
      { id: 'what', art: 'HonkArt', title: 'Time to kill, nothing planned', body: 'Tap a mood and Goose finds something great a short walk away.' },
      { id: 'moods', art: 'honk-moods', title: 'Six moods', body: 'Feed me, Wow me, Culture fix, Cheap thrills, Go local or Night out. Each tile says what it pulls up.' },
      { id: 'result', art: 'honk-result', title: 'One good spot', body: 'Goose says where to go and how far. Add it to your trip, open the walk in Maps, or ask for another spot.' },
      { id: 'where', art: 'honk-where', title: 'Uses where you are', body: 'HONK uses your location to stay walkable. No location, or somewhere else in mind? Type a city instead.' },
    ],
  },
  toolbox: {
    overline: 'About Tools',
    tryIt: { label: 'Open Currency', target: 'tools-currency', click: true },
    steps: [
      { id: 'hub', art: 'tools-hub', title: 'Set for where you are', body: 'Tools follow your trip: the country you’re in now, or where your next trip starts.' },
      { id: 'sos', art: 'tools-sos', title: 'SOS, one tap away', body: 'Local emergency numbers, the nearest hospitals, police and pharmacies, and an emergency card to show.' },
      { id: 'translate', art: 'tools-translate', title: 'A pocket phrase book', body: 'Essential phrases in the local language, read aloud on Play. Type anything and Goose translates it.' },
      { id: 'tip', art: 'tools-tip', title: 'Tip and split', body: 'See how tipping works where you are, pick a percentage, and split the bill between your group.' },
      { id: 'currency', art: 'tools-currency', title: 'Currency with live rates', body: 'Convert in either direction, swap with one tap, and use Quick glance for small amounts, already converted.' },
    ],
  },
  profile: {
    overline: 'About Profile',
    tryIt: { label: 'Open Help', target: 'profile-help', click: true },
    steps: [
      { id: 'score', art: 'profile-score', title: 'Your Goose score', body: 'Trips, countries, days abroad and flights add up to your score. Badges mark the milestones.' },
      { id: 'docs', art: 'profile-docs', title: 'Travel documents', body: 'Keep passports, visas and insurance in one place. Numbers stay hidden until you reveal them.' },
      { id: 'loyalty', art: 'profile-loyalty', title: 'Loyalty cards', body: 'Save your airline and hotel numbers once, and find them fast at check-in.' },
      { id: 'settings', art: 'profile-settings', title: 'Settings and inbox', body: 'Copy your private inbox address, choose light or dark, and set your home currency and passport country.' },
      { id: 'help', art: 'profile-help', title: 'Help and FAQ', body: 'Search how everything works, or take the full tour of the app any time.' },
    ],
  },
}

// ---------- Step logic (pure) ----------

export const tourFor = (section) => SECTION_TOURS[section] || null
export const stepCount = (tour) => tour.steps.length
export const clampStep = (i, n) => Math.max(0, Math.min(Number.isFinite(i) ? Math.trunc(i) : 0, n - 1))
export const nextStep = (i, n) => clampStep(i + 1, n)
export const prevStep = (i, n) => clampStep(i - 1, n)
export const isLastStep = (i, n) => i >= n - 1
export const stepLabel = (i, n) => `Step ${i + 1} of ${n}`

/** Swipe left (negative dx) goes forward, right goes back; short drags are ignored. */
export function swipeTarget(i, n, dx, min = 50) {
  if (Math.abs(dx) < min) return i
  return dx < 0 ? nextStep(i, n) : prevStep(i, n)
}

/** Arrow keys step through the tour; anything else changes nothing (returns null). */
export function keyTarget(i, n, key) {
  if (key === 'ArrowRight') return nextStep(i, n)
  if (key === 'ArrowLeft') return prevStep(i, n)
  if (key === 'Home') return 0
  if (key === 'End') return n - 1
  return null
}

// ---------- "Seen" memory ----------

export function hasSeenSection(section, storage) {
  try { return storage.getItem(SEEN_PREFIX + section) === '1' } catch { return false }
}

export function markSectionSeen(section, storage) {
  try { storage.setItem(SEEN_PREFIX + section, '1') } catch { /* private mode: pulses again next visit */ }
}
