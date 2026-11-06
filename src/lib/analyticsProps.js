// Privacy guard for analytics props (track() → analytics_events and GA4): short codes, counts and booleans only.
// Keys that can carry a person (names, travellers, passengers, guests, contacts, IDs) are dropped whatever their value,
// and so are arrays and objects, so a booking's travellers can never reach an analytics feed.

const BLOCKED_KEY = /mail|name|title|note|text|query|phone|address|coord|confirm|passport|token|url|travel+er|passenger|guest|child|infant|adult|birth|(^|_)(lat|lng|lon|number)($|_)/i

function cleanValue(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined
  if (typeof v !== 'string') return undefined
  // Short codes only: 'flight', 'email_import', 'GB', 'ja'. Long strings, '@' and long digit runs are dropped.
  if (v.length > 40 || v.includes('@') || /\d{5,}/.test(v)) return undefined
  return v
}

export function cleanProps(props) {
  const out = {}
  for (const [k, v] of Object.entries(props || {})) {
    if (BLOCKED_KEY.test(k) || k.length > 40) continue
    const clean = cleanValue(v)
    if (clean !== undefined && clean !== null && clean !== '') out[k] = clean
  }
  return out
}
