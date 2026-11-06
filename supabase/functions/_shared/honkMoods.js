// HONK moods, shared by the app (src/screens/explore/HonkView.jsx) and goosey-discover. Plain JS so the app,
// the Edge Function and scripts/test-honk-moods.mjs all import the same list.

// The HONK tab's six moods (web from this release, native apps from 0.20.2). `label` is what the app sends; `id` goes into honk_used.mood.
export const MOODS = [
  { id: 'hungry',  label: 'Feed me',       hint: 'Local favourites and street eats',          icon: 'restaurant', tone: 'accent',  query: 'best local restaurants and street food' },
  { id: 'wow',     label: 'Wow me',        hint: 'Views, landmarks and hidden gems',          icon: 'compass',    tone: 'sun',     query: 'viewpoints landmarks and hidden gems' },
  { id: 'culture', label: 'Culture fix',   hint: 'Museums, galleries, old streets',           icon: 'museum',     tone: 'info',    query: 'museums galleries and historic sights' },
  { id: 'cheap',   label: 'Cheap thrills', hint: 'Free sights and budget bites',              icon: 'currency',   tone: 'success', query: 'free attractions and cheap eats' },
  { id: 'local',   label: 'Go local',      hint: 'Markets, corner cafés, neighbourhood bars', icon: 'map',        tone: 'danger',  query: 'local favourite market cafe or neighbourhood bar' },
  { id: 'nightlife', label: 'Night out',     hint: 'Bars, live music, late spots',              icon: 'moon',       tone: 'stay',    query: 'bars live music and nightlife' },
]

// Moods sent by the earlier web app and native builds up to 0.20.1. Keep them until those builds are gone.
const LEGACY_QUERY = {
  "I'm hungry": 'best places to eat',
  'Show me something': 'interesting sights and hidden gems',
  "I'm bored": 'fun things to do',
  'Treat myself': 'special treat dessert spa or upscale bar',
  'On a budget': 'cheap eats and free things to do',
  'Culture me': 'museums galleries and historic sights',
  'Night out': 'bars live music and nightlife',
  'Be a local': 'local favourite cafe market or neighbourhood bar',
}

// HONK mood label → what to ask Google for. An unknown label is searched as written.
export const MOOD_QUERY = { ...LEGACY_QUERY, ...Object.fromEntries(MOODS.map(m => [m.label, m.query])) }

export const moodQuery = label => MOOD_QUERY[label] || label
