// How-to guide: one source for the in-app Help screen (src/screens/profile/HelpView.jsx) and the
// static sillytraveltool.com/help page (scripts/build-help.mjs). Plain data, no JSX, so Node can import it.
// Keep labels exactly as they appear in the app ("New trip", "Paste confirmation text", ...).

export const HELP_GROUPS = [
  { id: 'start', title: 'Getting started' },
  { id: 'together', title: 'Travel together' },
  { id: 'explore', title: 'Explore a city' },
  { id: 'travel', title: 'On the trip' },
  { id: 'account', title: 'Your account' },
]

export const HELP_TOPICS = [
  {
    id: 'new-trip', group: 'start', icon: 'trips', tone: 'accent',
    title: 'Start a trip',
    summary: 'A trip is a city and, when you know them, the dates.',
    steps: [
      'Open Trips and tap New trip.',
      'Pick the city. Add dates, or tick "Not sure of the dates yet".',
      'Save. The trip opens on its Plan tab, ready for bookings.',
    ],
    tips: [
      'A trip without dates shows "Planning". Tap Add dates whenever you decide; adding a booking fills them in for you.',
      'Visiting several cities? Keep one trip and add a stay in each city. Weather and packing follow you city by city.',
    ],
  },
  {
    id: 'goose-inbox', group: 'start', icon: 'inbox', tone: 'info',
    title: 'Forward booking emails',
    summary: 'The fastest way in. Goose reads the email and files it into the right trip.',
    steps: [
      'Find your private Goose inbox address in Profile → Settings → Goose inbox, and tap Copy.',
      'Forward any flight, hotel, train, restaurant or ticket confirmation to it.',
      'It shows up in the matching trip, usually within a minute. No trip for that city yet? Goose starts one.',
    ],
    tips: [
      'Save the address as a contact called "Goose" so forwarding takes two taps.',
      'Keep the address private: anything sent to it lands in your trips.',
    ],
  },
  {
    id: 'paste', group: 'start', icon: 'clipboard', tone: 'accent',
    title: 'Paste a confirmation',
    summary: 'For bookings that live in an app, a PDF or a screenshot instead of your inbox.',
    steps: [
      'Open a trip, tap + and choose Paste confirmation text.',
      'Paste the text and tap Read it. Goose pulls out times, places and confirmation numbers in about 15 seconds.',
      'Check the details, pick the trip (or New trip) and save.',
    ],
    tips: ['A whole itinerary works too: Goose splits it into flights, stays and the rest.'],
  },
  {
    id: 'by-hand', group: 'start', icon: 'edit', tone: 'neutral',
    title: 'Add or edit a booking by hand',
    summary: 'Flights, stays, trains, restaurants, tickets, cars, buses and ferries, or a plain note.',
    steps: [
      'Open a trip, tap + and pick a type under "Or add by hand".',
      'Fill in what you have. Restaurants and tickets only need the place, date and time; the rest sits under More details.',
      'Tap any booking later to see it, edit it or delete it.',
    ],
    tips: [
      'Times are always the local time where the thing happens, not your phone\'s time. A 09:00 flight from Tokyo stays 09:00, wherever you are.',
      'People you share a trip with as "Can edit" can add and edit bookings too.',
    ],
  },
  {
    id: 'share', group: 'together', icon: 'users', tone: 'info',
    title: 'Invite people to a trip',
    summary: 'Invite by email so everyone plans from the same trip.',
    steps: [
      'Open the trip and tap the Travelers button at the top (or Trip options → Invite travelers).',
      'Type their email under Invite by email, choose Can edit or View only, and tap Send invite.',
      'Goose emails them an invite. They sign in (or create an account) and tap Join trip under Invites on their Trips screen.',
    ],
    tips: ['Invite everyone who is coming, even if they only want to look: View only keeps the plan safe from accidental edits.'],
  },
  {
    id: 'together-bookings', group: 'together', icon: 'inbox', tone: 'accent',
    title: 'Everyone adds their own bookings',
    summary: 'Each traveller forwards their own booking emails; Goose logs them in the shared trip.',
    steps: [
      'Each traveller forwards their own confirmation emails to their own Goose inbox address (Profile → Settings → Goose inbox).',
      'Goose reads each one and files it in the shared trip, so nobody has to type anyone else\'s flights.',
      'Flights someone else added show their name, so you can see who lands when.',
    ],
    tips: ['No email? Anyone who can edit can open the trip, tap + and paste a confirmation or add a booking by hand.'],
  },
  {
    id: 'together-live', group: 'together', icon: 'refresh', tone: 'success',
    title: 'See changes live',
    summary: 'When anyone adds or changes something, everyone sees it straight away.',
    steps: [
      'Keep the trip open: new bookings and plans appear on their own, no refresh needed.',
      'Each person\'s times are shown in the local time where they happen, so arrivals line up even across time zones.',
      'Add a plan like "Meet at the hotel, 16:30" so everyone knows where to be.',
    ],
  },
  {
    id: 'together-access', group: 'together', icon: 'shield', tone: 'neutral',
    title: 'Who can do what',
    summary: 'The trip owner decides who can edit and who can only view.',
    steps: [
      'Can edit: add, change and remove bookings and plans.',
      'View only: see everything, change nothing.',
      'The owner can change access, cancel an invite or remove someone from the Travelers sheet. Anyone else can tap Leave trip there.',
    ],
  },
  {
    id: 'guide', group: 'explore', icon: 'book', tone: 'success',
    title: 'City guide',
    summary: 'Know, Eat, See, Transit and Events for any city.',
    steps: [
      'Open Explore. Your next trip\'s city loads on its own, or search any city.',
      'Pick a section: Know (history and local quirks), Eat (cheap to splurge), See, Transit or Events.',
      'Each list shows 15 places with photos and ratings. Tap Show 15 more for the next batch.',
    ],
    tips: [
      'Facts like addresses, ratings and hours come from Google. The commentary is written by Goose (AI) and labelled; tap Report if something is off.',
    ],
  },
  {
    id: 'honk', group: 'explore', icon: 'megaphone', tone: 'accent',
    title: 'HONK: what\'s good near me',
    summary: 'Tell Goose your mood and get one good pick within walking distance.',
    steps: [
      'Open Explore and tap a mood on the HONK card, or More moods.',
      'Allow location when asked. HONK uses it once to find spots near you.',
      'Goose picks a place with its real walking time. Not feeling it? Tap Another spot.',
    ],
    tips: ['Moods include I\'m hungry, Treat myself, On a budget, Culture me and Night out.'],
  },
  {
    id: 'ideas', group: 'explore', icon: 'plus', tone: 'accent',
    title: 'Save ideas, then book them',
    summary: 'Shortlist places from the guide or HONK in one tap.',
    steps: [
      'Tap + on any place card. It goes into "Trip ideas" on that city\'s trip (Goose starts a trip if you don\'t have one).',
      'Open the trip\'s Plan tab to see your ideas.',
      'Booked it? Open the idea and tap Confirm a visit. The booking form comes pre-filled and the idea turns into a booking.',
    ],
    tips: ['A check on a card means it\'s in your ideas; a calendar means it\'s booked, with the date and time.'],
  },
  {
    id: 'get-there', group: 'travel', icon: 'navigation', tone: 'info',
    title: 'Get there',
    summary: 'Walk, transit and drive times, and the right ride app for the country.',
    steps: [
      'Tap the arrow button on a place card, on HONK or in a booking\'s details.',
      'Compare walking, transit and driving times.',
      'Tap one to open your maps app with directions, or pick a ride app (Uber, Lyft, Grab or Bolt, depending on the country) with the drop-off filled in.',
    ],
  },
  {
    id: 'trip-tabs', group: 'travel', icon: 'calendar', tone: 'accent',
    title: 'Plan, Weather and Pack',
    summary: 'Each trip has three tabs.',
    steps: [
      'Plan: everything booked, day by day, plus your trip ideas.',
      'Weather: the forecast for each day, for the city you\'re in that night.',
      'Pack: a packing list made for this trip, its weather and what you\'ve booked. Tick things off as you go.',
    ],
    tips: [
      'While a trip is on, Trips opens on Today: what\'s next, how long until it, and buttons to open the booking or get directions.',
      'When a trip ends you get a Recap you can share.',
    ],
  },
  {
    id: 'tools', group: 'travel', icon: 'tools', tone: 'success',
    title: 'Travel tools',
    summary: 'Currency, Translate, Tip & split and SOS, set for the country of your current or next trip.',
    steps: [
      'Currency: live rates between the local currency and your home currency.',
      'Translate: a pocket phrase book in the local language, plus a box to translate anything you type.',
      'Tip & split: the local tipping custom and each person\'s share of the bill.',
      'SOS: emergency numbers, your embassy and an emergency card for the country you\'re in.',
    ],
    tips: [
      'Set your home currency and passport country in Profile → Settings. SOS uses your passport country to find your embassy, and when location is off.',
    ],
  },
  {
    id: 'wallet', group: 'account', icon: 'passport', tone: 'info',
    title: 'Travel documents and loyalty cards',
    summary: 'Passports, visas, insurance and frequent-flyer numbers in one place.',
    steps: [
      'Open Profile and tap Travel documents or Loyalty cards.',
      'Add a document or card. Document numbers are encrypted and show only the last four digits until you tap Reveal.',
    ],
  },
  {
    id: 'score', group: 'account', icon: 'award', tone: 'accent',
    title: 'Goose score and badges',
    summary: 'Points for trips, countries, days abroad and flights.',
    steps: [
      'Your score and stats are at the top of Profile.',
      'Tap Badges to see what you\'ve earned and how close you are to the next one.',
    ],
  },
  {
    id: 'settings', group: 'account', icon: 'settings', tone: 'neutral',
    title: 'Settings and privacy',
    summary: 'Your name, home currency, light or dark mode, °C or °F.',
    steps: [
      'Open Profile → Settings.',
      'Turn off Share usage stats to stop anonymous feature counts from this device.',
      'Delete account erases your trips, documents and score.',
    ],
  },
]

export const HELP_FAQ = [
  {
    q: 'Do the people I invite need STT?',
    a: 'Yes, a free account. Goose emails them an invite; once they sign in with that email they tap Join trip under Invites on their Trips screen.',
  },
  {
    q: 'Can my friends forward their own bookings to the trip?',
    a: 'Yes. Each traveller forwards to their own Goose inbox address, and Goose logs the booking in the shared trip for everyone.',
  },
  {
    q: 'How do I replay the tour?',
    a: 'Tap Take the tour at the top of this Guide and FAQ, or in Profile.',
  },
  {
    q: 'Something isn\'t working. How do I tell you?',
    a: 'Every report helps. Tap Report an issue at the bottom of Profile or Help: it opens an email with your app version filled in. Say what happened and what you expected, and add a screenshot if you can.',
  },
  {
    q: 'I forwarded an email but nothing showed up.',
    a: 'Give it a minute, then close and reopen the app. Check you sent it to your own Goose inbox address (Profile → Settings). Still nothing? Open the trip, tap + and paste the confirmation text instead.',
  },
  {
    q: 'The times look wrong.',
    a: 'Every time in STT is the local time where it happens, so a flight shows its departure city\'s time and its arrival city\'s time. If a booking was entered in the wrong zone, open it and tap Edit booking.',
  },
  {
    q: 'Goose put a booking in the wrong trip.',
    a: 'Open the booking, delete it and paste the confirmation into the right trip. Or paste it from Trips and pick the trip yourself.',
  },
  {
    q: 'Does it work offline?',
    a: 'Phrase books you\'ve loaded and typed translations stay on your phone. Guides, imports and live rates need a connection, so screenshot SOS and your hotel address before you fly.',
  },
  {
    q: 'Who can see my trips?',
    a: 'Only you and the people you invite. Goose\'s AI reads forwarded emails to pull out booking details; we keep the details, not the emails. See the Privacy Policy for the full list.',
  },
]

export const HELP_CONTACT = 'hello@sillytraveltool.com'

/** Topics whose text contains every word of the query (case-insensitive). */
export function searchHelp(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return HELP_TOPICS
  return HELP_TOPICS.filter(t => {
    const text = [t.title, t.summary, ...(t.steps || []), ...(t.tips || [])].join(' ').toLowerCase()
    return words.every(w => text.includes(w))
  })
}
