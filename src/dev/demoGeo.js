// Demo geocoding: a few cities, airports and stations, so trip matching and stops work offline (demo mode and
// scripts/test-route.mjs). Same shape as the places Edge Function's geocode / reverse answers.
export const DEMO_GEO = [
  ['seattle|sea\\b', 47.61, -122.33, 'Seattle', 'United States', 'US'], ['tacoma', 47.25, -122.44, 'Tacoma', 'United States', 'US'],
  ['madrid|mad\\b|atocha|chamart', 40.42, -3.70, 'Madrid', 'Spain', 'ES'], ['toledo', 39.86, -4.03, 'Toledo', 'Spain', 'ES'],
  ['granada|grx\\b', 37.18, -3.60, 'Granada', 'Spain', 'ES'], ['sevilla|seville|svq\\b|santa justa', 37.39, -5.98, 'Seville', 'Spain', 'ES'],
  ['barcelona|bcn\\b|sants', 41.39, 2.17, 'Barcelona', 'Spain', 'ES'], ['berlin|ber\\b|hauptbahnhof', 52.52, 13.40, 'Berlin', 'Germany', 'DE'],
  ['dresden', 51.05, 13.74, 'Dresden', 'Germany', 'DE'], ['munich|münchen|muc\\b', 48.14, 11.58, 'Munich', 'Germany', 'DE'],
  ['rome|roma|fco\\b|termini', 41.90, 12.50, 'Rome', 'Italy', 'IT'], ['tokyo|hnd\\b|nrt\\b', 35.68, 139.69, 'Tokyo', 'Japan', 'JP'],
  ['kyoto', 35.01, 135.77, 'Kyoto', 'Japan', 'JP'], ['lisbon|lis\\b', 38.72, -9.14, 'Lisbon', 'Portugal', 'PT'],
  ['new york|jfk\\b', 40.71, -74.01, 'New York', 'United States', 'US'],
]
export function demoGeo(q) {
  const hit = DEMO_GEO.find(([re]) => new RegExp(re, 'i').test(q || ''))
  return hit ? { lat: hit[1], lng: hit[2], city: hit[3], country: hit[4], country_code: hit[5] } : null
}
export function demoReverse(lat, lng) {
  const near = DEMO_GEO.map(g => ({ g, d: (g[1] - lat) ** 2 + (g[2] - lng) ** 2 })).sort((a, b) => a.d - b.d)[0]
  return near && near.d < 1 ? { city: near.g[3], country: near.g[4], country_code: near.g[5] } : null
}
