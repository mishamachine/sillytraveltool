// Demo-mode Edge Function responses, keyed by function name. Each receives the request body.
import guide from './fixtures/guide'
import honk from './fixtures/honk'
import checklist from './fixtures/checklist'
import phrases from './fixtures/phrases'
import parse from './fixtures/parse'

// resolve-timezone: a few demo places; anything else falls back to Madrid
const DEMO_ZONES = [[/\b(SEA|seattle)\b/i, 'America/Los_Angeles'], [/\b(HND|NRT|KIX|tokyo|kyoto|osaka)\b/i, 'Asia/Tokyo'],
  [/\b(LIS|lisbon|lisboa)\b/i, 'Europe/Lisbon'], [/\b(JFK|EWR|new york)\b/i, 'America/New_York'], [/\b(LHR|london)\b/i, 'Europe/London']]
function resolveTimezone(body) {
  const text = `${body.iata || ''} ${body.query || ''}`
  return { tz: (DEMO_ZONES.find(([re]) => re.test(text)) || [null, 'Europe/Madrid'])[1] }
}

export const DEMO_FUNCTIONS = {
  'resolve-timezone': resolveTimezone,
  'generate-guide': guide,
  'goosey-discover': honk,
  'generate-checklist': checklist,
  'generate-phrases': phrases,
  'parse-booking-email': parse,
}
