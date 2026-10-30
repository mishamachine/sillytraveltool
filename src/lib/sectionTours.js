// Copy and "seen" memory for the per-section "About this section" sheets. Wording comes from the onboarding tour and
// covers live features only. Kept free of React so scripts/test-section-tours.mjs can import it.

export const SEEN_PREFIX = 'stt_section_tour_seen_'

export const SECTION_TOURS = {
  trips: {
    overline: 'About Trips',
    cards: [
      { icon: 'trips', title: 'What’s next, at a glance', body: 'Every trip opens on what’s coming up. Tap in for the plan, day by day, with every booking in local time.' },
      { icon: 'inbox', title: 'Forward it. Goose files it.', body: 'Send any booking email to your private address and it lands in the right trip. One booking per email.' },
    ],
  },
  today: {
    overline: 'About Today',
    cards: [
      { icon: 'navigation', title: 'Today, and how to get there', body: 'While you travel, Trips opens on Today. Tap Get there on any booking for the way across town.' },
      { icon: 'cloud-sun', title: 'Packed for the forecast', body: 'See the weather for each stop, and Goose writes a packing list for the trip.' },
    ],
  },
  explore: {
    overline: 'About Explore',
    cards: [
      { icon: 'explore', title: 'Know a city before you land', body: 'Every city in five sections. Know has the numbers and local quirks; Eat runs from cheap to splurge. Tap + on any place to add it to your trip.' },
      { icon: 'museum', title: 'Sights, transit and festivals', body: 'See covers museums, landmarks, areas and day trips. Transit shows how locals get around. Events lists what’s on.' },
      { icon: 'megaphone', title: 'What is HONK?', body: 'For when you have a few minutes and nothing planned. Pick a mood, tap HONK, and Goose finds one good spot within walking distance.' },
    ],
  },
  toolbox: {
    overline: 'About Tools',
    cards: [
      { icon: 'tools', title: 'Help for the awkward bits', body: 'Currency, phrases, tipping and SOS, set for the country you’re in.' },
    ],
  },
  profile: {
    overline: 'About Profile',
    cards: [
      { icon: 'wallet', title: 'Your travel wallet', body: 'Goose score and badges, passports and documents, loyalty cards.' },
      { icon: 'book', title: 'Guide and FAQ', body: 'How everything works, whenever you need a hand.' },
    ],
  },
}

export function hasSeenSection(section, storage) {
  try { return storage.getItem(SEEN_PREFIX + section) === '1' } catch { return false }
}

export function markSectionSeen(section, storage) {
  try { storage.setItem(SEEN_PREFIX + section, '1') } catch { /* private mode: pulses again next visit */ }
}
