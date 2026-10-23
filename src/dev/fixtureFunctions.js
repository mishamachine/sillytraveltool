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

// places: no Google in demo mode; lookups answer "nothing" (screens show their non-Google fallbacks), except
// geocoding of a few demo cities, airports and stations so trip matching and stops work offline
const DEMO_GEO = [
  ['seattle|sea\\b', 47.61, -122.33, 'Seattle', 'United States', 'US'], ['tacoma', 47.25, -122.44, 'Tacoma', 'United States', 'US'],
  ['madrid|mad\\b|atocha|chamart', 40.42, -3.70, 'Madrid', 'Spain', 'ES'], ['toledo', 39.86, -4.03, 'Toledo', 'Spain', 'ES'],
  ['granada|grx\\b', 37.18, -3.60, 'Granada', 'Spain', 'ES'], ['sevilla|seville|svq\\b|santa justa', 37.39, -5.98, 'Seville', 'Spain', 'ES'],
  ['barcelona|bcn\\b|sants', 41.39, 2.17, 'Barcelona', 'Spain', 'ES'], ['berlin|ber\\b|hauptbahnhof', 52.52, 13.40, 'Berlin', 'Germany', 'DE'],
  ['dresden', 51.05, 13.74, 'Dresden', 'Germany', 'DE'], ['munich|münchen|muc\\b', 48.14, 11.58, 'Munich', 'Germany', 'DE'],
  ['rome|roma|fco\\b|termini', 41.90, 12.50, 'Rome', 'Italy', 'IT'], ['tokyo|hnd\\b|nrt\\b', 35.68, 139.69, 'Tokyo', 'Japan', 'JP'],
  ['kyoto', 35.01, 135.77, 'Kyoto', 'Japan', 'JP'], ['lisbon|lis\\b', 38.72, -9.14, 'Lisbon', 'Portugal', 'PT'],
  ['new york|jfk\\b', 40.71, -74.01, 'New York', 'United States', 'US'],
]
function demoGeo(q) {
  const hit = DEMO_GEO.find(([re]) => new RegExp(re, 'i').test(q || ''))
  return hit ? { lat: hit[1], lng: hit[2], city: hit[3], country: hit[4], country_code: hit[5] } : null
}
function demoReverse(lat, lng) {
  const near = DEMO_GEO.map(g => ({ g, d: (g[1] - lat) ** 2 + (g[2] - lng) ** 2 })).sort((a, b) => a.d - b.d)[0]
  return near && near.d < 1 ? { city: near.g[3], country: near.g[4], country_code: near.g[5] } : null
}
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
}
