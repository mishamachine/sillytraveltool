// Demo-mode Edge Function responses, keyed by function name. Each receives the request body.
import guide from './fixtures/guide'
import honk from './fixtures/honk'
import checklist from './fixtures/checklist'
import phrases from './fixtures/phrases'
import parse from './fixtures/parse'
import fillDay from './fixtures/fillDay'
import { demoGeo, demoReverse } from './demoGeo'

// resolve-timezone: a few demo places; anything else falls back to Madrid
const DEMO_ZONES = [[/\b(SEA|seattle)\b/i, 'America/Los_Angeles'], [/\b(HND|NRT|KIX|tokyo|kyoto|osaka)\b/i, 'Asia/Tokyo'],
  [/\b(LIS|lisbon|lisboa)\b/i, 'Europe/Lisbon'], [/\b(JFK|EWR|new york)\b/i, 'America/New_York'], [/\b(LHR|london)\b/i, 'Europe/London']]
function resolveTimezone(body) {
  const text = `${body.iata || ''} ${body.query || ''}`
  return { tz: (DEMO_ZONES.find(([re]) => re.test(text)) || [null, 'Europe/Madrid'])[1] }
}

// places: no Google in demo mode; lookups answer "nothing" (screens show their non-Google fallbacks), except
// geocoding of the demo cities (./demoGeo)
function places(body) {
  if (body.action === 'geocode') return demoGeo(body.query)
  if (body.action === 'reverse') return demoReverse(Number(body.lat), Number(body.lng))
  if (body.action === 'autocomplete') return { suggestions: [] }
  if (body.action === 'nearby' || body.action === 'embassy') return { places: [] }
  if (body.action === 'find') return { place: null }
  return null
}

export const DEMO_FUNCTIONS = {
  places,
  'resolve-timezone': resolveTimezone,
  'generate-guide': guide,
  'goosey-discover': honk,
  'generate-checklist': checklist,
  'generate-phrases': phrases,
  'parse-booking-email': parse,
  'fill-my-day': fillDay,
}
