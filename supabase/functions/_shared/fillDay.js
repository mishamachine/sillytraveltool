// "Fill my day": the rules shared by the app and the fill-my-day Edge Function (plain JS so both can import it).
// Nothing here touches personal data: a request is a city, a country, a date and the chosen chips.

export const PACES = {
  slow: { label: 'Slow', chip: 'Slow (2-3 stops)', min: 2, max: 3 },
  steady: { label: 'Steady', chip: 'Steady (4-5)', min: 4, max: 5 },
  packed: { label: 'Packed', chip: 'Packed (6+)', min: 6, max: 8 },
}
export const BUDGETS = {
  easy: { label: 'Easy on the wallet', levels: [0, 1] },
  middle: { label: 'Middle', levels: [0, 1, 2] },
  treat: { label: 'Treat yourself', levels: [0, 1, 2, 3, 4] },
}
// vibe id → label, the Google text search, and the kind of stop it makes
export const VIBES = {
  cafes: { label: 'Cafés', query: 'best cafes and bakeries', category: 'food', minutes: 45 },
  museums: { label: 'Museums', query: 'best museums and galleries', category: 'museum', minutes: 90 },
  history: { label: 'History', query: 'historic sights and monuments', category: 'sight', minutes: 60 },
  food: { label: 'Food stops', query: 'best local restaurants and tapas', category: 'food', minutes: 60 },
  walking: { label: 'Walking', query: 'scenic walks and old town streets', category: 'sight', minutes: 45 },
  views: { label: 'Views', query: 'best viewpoints and panoramic spots', category: 'sight', minutes: 40 },
  markets: { label: 'Markets & shops', query: 'local markets and independent shops', category: 'sight', minutes: 60 },
  parks: { label: 'Parks', query: 'parks and gardens', category: 'sight', minutes: 45 },
}
export const MAX_VIBES = 3
// With no vibe picked: a mix
export const MIX = ['history', 'food', 'walking']

export const DEFAULT_PACE = 'steady'
export const DEFAULT_BUDGET = 'middle'
export const DAY_START = '09:00'
export const DAY_END = '22:00'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
const LATEST_START = '17:00'
// A real calendar date (2026-02-31 is refused)
const realDate = (d) => ISO_DATE.test(String(d)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d

/** The vibes to plan with: known ids only, at most MAX_VIBES, or the mix. */
export const chooseVibes = (vibes) => {
  const v = [...new Set((Array.isArray(vibes) ? vibes : []).filter(x => typeof x === 'string' && VIBES[x]))].slice(0, MAX_VIBES)
  return v.length ? v : MIX
}

/**
 * The request the app sends: city, country, date and the chips (plus an earliest start time and the place ids of the
 * last proposal). No coordinates: the server finds the city itself. Nothing about the member: no name, email, trip
 * title, bookings, hotel or position.
 */
export function buildRequest({ city, country, date, pace, budget, vibes, startAfter, exclude }) {
  const req = {
    city: clean(city, 80), country: clean(country, 80), date,
    pace: PACES[pace] ? pace : DEFAULT_PACE,
    budget: BUDGETS[budget] ? budget : DEFAULT_BUDGET,
    vibes: chooseVibes(vibes),
  }
  // A day that starts after 17:00 has no room for a plan: ask for 17:00 at the latest
  if (startAfter && HHMM.test(startAfter)) req.start_after = startAfter > LATEST_START ? LATEST_START : startAfter
  // "Try another": the Google place ids of the last proposal, so the next one differs
  const ex = (Array.isArray(exclude) ? exclude : []).filter(x => typeof x === 'string' && x.length <= 300).slice(0, 12)
  if (ex.length) req.exclude = ex
  return req
}

/** Server side: the same checks on whatever arrives. null = refuse. */
export function parseRequest(raw) {
  if (!raw || typeof raw !== 'object') return null
  const city = clean(raw.city, 80)
  if (!city || !realDate(raw.date)) return null
  return buildRequest({ ...raw, city, country: raw.country, startAfter: raw.start_after, exclude: raw.exclude })
}

// ── times ──
export const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
export const fromMin = (n) => { const x = Math.max(0, Math.min(23 * 60 + 59, Math.round(n))); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

/** Straight-line walking estimate in minutes (used when Google Routes has no answer). */
export function estWalk(a, b) {
  if (a?.lat == null || b?.lat == null) return 10
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return Math.max(1, Math.ceil((12742000 * Math.asin(Math.sqrt(h)) * 1.3) / 80))
}

/** Rank for picking: well rated, well reviewed. */
export const score = (p) => (p.rating || 0) * Math.log10((p.rating_count || 0) + 10)

/** Candidates for the day: open for business, within the budget (no price level = free or unknown, allowed), unique. */
export function pickCandidates(places, budget, limit = 24) {
  const levels = BUDGETS[budget]?.levels || BUDGETS[DEFAULT_BUDGET].levels
  const seen = new Set()
  return (places || [])
    .filter(p => p && p.place_id && p.name && !p.closed && (p.price_level == null || levels.includes(p.price_level)))
    .filter(p => !seen.has(p.place_id) && seen.add(p.place_id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
}

/** Back-to-back day with no AI: nearest-neighbour order from the first pick, from `from` on. */
export function basicPlan(cands, count, from = DAY_START) {
  const left = cands.slice(0, count)
  const out = []
  let cur = left.shift(), t = toMin(from)
  while (cur) {
    out.push({ ...cur, start: fromMin(t), minutes: cur.minutes || 60, reason: '' })
    t += (cur.minutes || 60) + 10
    left.sort((a, b) => estWalk(cur, a) - estWalk(cur, b))
    cur = left.shift()
  }
  return out
}

/**
 * Check what the AI returned against the real candidates: known indices only, no repeats, valid times, in
 * order, inside the day, between the pace's min and max. Returns null when it is unusable (the caller falls
 * back to basicPlan).
 */
export function validatePlan(ai, cands, pace, from = DAY_START) {
  const p = PACES[pace] || PACES[DEFAULT_PACE]
  const rows = Array.isArray(ai?.stops) ? ai.stops : []
  const used = new Set()
  const out = []
  for (const r of rows) {
    const i = r?.i
    if (!Number.isInteger(i) || !cands[i] || used.has(i) || !HHMM.test(String(r.start))) continue
    used.add(i)
    const minutes = Math.min(180, Math.max(20, Math.round(Number(r.minutes)) || cands[i].minutes || 60))
    out.push({ ...cands[i], start: r.start, minutes, reason: clean(r.reason, 140).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim() })
  }
  out.sort((a, b) => toMin(a.start) - toMin(b.start))
  const trimmed = out.slice(0, p.max)
  if (trimmed.length < p.min) return null
  if (toMin(trimmed[0].start) < toMin(from) || toMin(trimmed[trimmed.length - 1].start) > toMin(DAY_END) - 20) return null
  return trimmed
}

/** Push each stop later when the walk from the one before would not fit; drops stops that no longer end by DAY_END. */
export function retime(stops, walks) {
  const out = []
  let free = 0
  stops.forEach((s, i) => {
    const walk = i === 0 ? 0 : walks[i - 1] ?? 10
    const start = Math.max(toMin(s.start), i === 0 ? 0 : free + walk)
    if (start + 20 > toMin(DAY_END)) return
    out.push({ ...s, start: fromMin(start), walk_min: i === 0 ? null : walk })
    free = start + s.minutes
  })
  return out
}

/** The day's weekday line from Google's weekday descriptions ("Monday: 9:00 AM – 5:00 PM"), or ''. */
export function hoursFor(hours, date) {
  if (!Array.isArray(hours) || !hours.length) return ''
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return clean(hours[(wd + 6) % 7], 60).replace(/^[A-Za-z]+:\s*/, '')
}

// ── app side ──
const catOf = (s) => s.category || 'sight'

/**
 * Proposal stops → trip_activities rows (a dated, timed plan, not an idea). The date and time are wall-clock at the
 * place, like manual plans. `keep` = the stop ids the member left in.
 */
export function proposalToActivities(proposal, { tripId, userId, keep }) {
  return (proposal?.stops || []).filter(s => !keep || keep.includes(s.place_id)).map(s => ({
    trip_id: tripId, created_by: userId, is_idea: false, is_completed: false, source: 'fill_my_day',
    title: clean(s.name, 120), category: catOf(s), date: proposal.date, time: s.start, duration_minutes: s.minutes || null,
    location_name: clean(s.name, 120), location_address: clean(s.address, 200) || null,
    location_lat: s.lat ?? null, location_lng: s.lng ?? null,
    notes: clean(s.reason, 500) || null, place_id: s.place_id || null,
  }))
}

/** Country for the request: the trip's country name when the place is its destination, else the country code. */
export const countryFor = (trip, place) =>
  (place?.city && place.city === trip?.destination_city ? trip?.destination_country : place?.country) || place?.country_code || trip?.destination_country || ''

/** Dates of the trip from `from` on that hold nothing (byDay: date → items), at most `max`. */
export function emptyDays(trip, byDay, from, max = 4) {
  if (!trip?.start_date || !trip?.end_date) return []
  const out = []
  const d = new Date(`${trip.start_date.slice(0, 10)}T12:00:00Z`)
  const end = new Date(`${trip.end_date.slice(0, 10)}T12:00:00Z`)
  for (; d <= end && out.length < max; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (iso >= from && !byDay[iso]) out.push(iso)
  }
  return out
}
