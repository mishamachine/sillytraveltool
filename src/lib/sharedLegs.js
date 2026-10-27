// Travellers on the same flight or train (docs/audit-pack/06 §3.1): their bookings show as one card.
// Strict on purpose: two rows group only when kind, operator and number, origin, destination and the departure
// minute all match, inside one trip. Any missing part means no group. No tolerance: a different minute is a
// different leg (counted by nearMisses() so the rule can be revisited from data).
// Pure: rows in, blocks out. Self-contained so scripts/test-shared-legs.mjs runs in Node.

const MIN = 60000
const MODES = new Set(['train', 'bus', 'coach', 'ferry']) // car rentals are never shared legs
const code = s => String(s || '').toUpperCase().replace(/[\s-]+/g, '')
const place = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** "Operator + number" of a leg, normalised ("DL 263" = "DL263"), or '' when it has none. */
function operatorOf(b) {
  const num = code(b.flight_number)
  if (b.type === 'flight') {
    if (!num) return ''
    // A bare "263" needs its airline to mean one flight
    return /^\d+$/.test(num) ? (code(b.airline) ? `${code(b.airline)}${num}` : '') : num
  }
  return num || code(b.airline)
}

/** Everything but the minute: trip, kind, operator, route. Null when a part is missing. */
function routeKey(b) {
  if (!b?.trip_id || !b.departure_time) return null
  let kind
  if (b.type === 'flight') kind = 'flight'
  else if (b.type === 'transport' && MODES.has(String(b.transport_mode || '').toLowerCase())) kind = String(b.transport_mode).toLowerCase()
  else return null
  const op = operatorOf(b), from = place(b.departure_airport), to = place(b.arrival_airport)
  if (!op || !from || !to || from === to) return null
  return [b.trip_id, kind, op, from, to].join('|')
}

const minuteOf = b => {
  const t = Date.parse(b.departure_time)
  return Number.isFinite(t) ? Math.floor(t / MIN) : null
}

/** The leg a booking is on, or null when it can't be told apart safely. Equal keys = the same flight or train. */
export function legKey(b) {
  const r = routeKey(b), m = r && minuteOf(b)
  return r && m != null ? `${r}|${m}` : null
}

/** Who a booking belongs to: the member who added it and the name on it. */
export const travellerOf = b => `${b.created_by || ''}|${place(b.passenger_name)}`

/** "Maria Silva", or "Traveller" when the booking has no name on it. */
export const travellerName = b => String(b.passenger_name || '').trim() || 'Traveller'

/**
 * Shared legs among `items`: Map of booking id → { key, items } for every booking on a leg that two or more
 * different travellers are on. `me`'s bookings come first, then the others by name. Everything else is absent.
 */
export function groupSharedLegs(items, me) {
  const byKey = new Map()
  for (const b of items) {
    if (b._kind && b._kind !== 'booking') continue
    const k = legKey(b)
    if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(b)
  }
  const out = new Map()
  for (const [key, rows] of byKey) {
    if (new Set(rows.map(travellerOf)).size < 2) continue // one traveller saved twice is not a shared leg
    const mine = b => (me && b.created_by === me ? 0 : 1)
    const sorted = [...rows].sort((a, b) => mine(a) - mine(b) || travellerName(a).localeCompare(travellerName(b)))
    const group = { key, items: sorted }
    for (const b of rows) out.set(b.id, group)
  }
  return out
}

/** 'YYYY-MM-DD' of a departure at the departure place (UTC when the zone is unknown). */
function depDay(b) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: b.departure_tz || 'UTC' }).format(new Date(b.departure_time)) } catch { return b.departure_time.slice(0, 10) }
}

/** Legs that almost matched: same operator, number, route and day, different minute. Count of such route-days. */
export function nearMisses(bookings) {
  const minutes = new Map()
  for (const b of bookings) {
    const r = routeKey(b), m = r && minuteOf(b)
    if (m == null) continue
    const k = `${r}|${depDay(b)}`
    ;(minutes.get(k) || minutes.set(k, new Set()).get(k)).add(m)
  }
  return [...minutes.values()].filter(s => s.size > 1).length
}
