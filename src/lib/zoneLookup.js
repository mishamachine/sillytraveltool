// Ask the server which time zone a place is in (airport code, station/venue name, or coordinates).
// Server: supabase/functions/resolve-timezone (airport table → Google Time Zone API → fallbacks).
// Answers are cached in memory and localStorage; a failed lookup returns null and the caller
// falls back to the trip's zone.
import { supabase } from './supabase'
import { isValidZone } from './localTime'

const memo = new Map()
const STORE = 'stt_zone_cache'

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} }
}
function writeStore(key, tz) {
  try {
    const all = readStore()
    all[key] = tz
    const keys = Object.keys(all)
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete all[k])
    localStorage.setItem(STORE, JSON.stringify(all))
  } catch { /* cache only */ }
}

/** { iata } | { query } | { lat, lng } → IANA zone or null. */
export async function lookupZone(input) {
  const key = input.iata ? `iata:${input.iata.toUpperCase()}`
    : input.query ? `q:${input.query.trim().toLowerCase()}`
    : `ll:${Number(input.lat).toFixed(2)},${Number(input.lng).toFixed(2)}`
  if (memo.has(key)) return memo.get(key)
  const stored = readStore()[key]
  if (isValidZone(stored)) { memo.set(key, stored); return stored }

  const pending = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('resolve-timezone', { body: input })
      const tz = !error && isValidZone(data?.tz) ? data.tz : null
      if (tz) writeStore(key, tz)
      return tz
    } catch { return null }
  })()
  memo.set(key, pending)
  const tz = await pending
  memo.set(key, tz)
  return tz
}

/** Zone for an airport code or station/venue text ("SEA", "Madrid Atocha"), in a city for context. */
export function lookupPlaceZone(place, { city = '', airport = false } = {}) {
  const text = String(place || '').trim()
  if (!text) return Promise.resolve(null)
  if (airport && /^[A-Za-z]{3}$/.test(text)) return lookupZone({ iata: text.toUpperCase() })
  return lookupZone({ query: [text, airport ? 'airport' : '', city].filter(Boolean).join(' ') })
}
