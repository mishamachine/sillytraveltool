// Post-trip share card: the data-to-card mapping. Pure functions, no DOM, so it can be tested in node.
// The card is built ONLY from the fields read below (trip title, month and year, stop cities and countries,
// counts, the member's own Goose score and badge ids). Bookings are used only to count flights; their names,
// confirmation numbers, addresses, travellers and prices are never read, so they cannot reach the renderer.
import { BADGES } from './tokens.js'

export const CARD_SIZES = { story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } }
export const CARD_LOOKS = ['dark', 'terracotta']
export const MAX_TITLE = 60
export const MAX_ROUTE = 5
export const MAX_BADGES = 4
export const CTA = 'Plan yours with Silly Travel Tool'
export const SITE = 'sillytraveltool.com'
const SHARE_URL = `${SITE}/?utm_source=recap_share&utm_medium=card`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const ymd = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? [+m[1], +m[2], +m[3]] : null }
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** A title cut to `max` characters at a word boundary, with an ellipsis; one very long word is cut by characters. */
function capTitle(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`
}

/** Days on the trip, counting both ends (a day trip is 1 day); null when undated. */
export function tripDays(trip) {
  const a = ymd(trip?.start_date), b = ymd(trip?.end_date)
  if (!a || !b) return null
  const utc = ([y, m, d]) => Date.UTC(y, m - 1, d)
  return Math.max(1, Math.round((utc(b) - utc(a)) / 864e5) + 1)
}

/** "Oct 2026", "Oct – Nov 2026" or "Dec 2026 – Jan 2027": month and year only, never exact days. */
export function monthLine(trip) {
  const a = ymd(trip?.start_date), b = ymd(trip?.end_date) || a
  if (!a) return null
  const one = ([y, m]) => `${MONTHS[m - 1]} ${y}`
  if (a[0] === b[0] && a[1] === b[1]) return one(a)
  return a[0] === b[0] ? `${MONTHS[a[1] - 1]} – ${one(b)}` : `${one(a)} – ${one(b)}`
}

/** Cities and countries on the route, first city first. Stays only (not the home leg, nights on board or day trips). */
export function routeOf(trip, stops = []) {
  const stays = [...stops].filter(s => s.kind === 'stay' && clean(s.city, 40)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const cities = [], countries = []
  let countryName = ''
  for (const s of stays) {
    const c = clean(s.city, 40)
    if (!cities.some(x => x.toLowerCase() === c.toLowerCase())) cities.push(c)
    const k = clean(s.country_code || s.country, 40).toLowerCase()
    if (k && !countries.includes(k)) countries.push(k)
    if (!countryName) countryName = clean(s.country, 40)
  }
  if (!cities.length && clean(trip?.destination_city, 40)) cities.push(clean(trip.destination_city, 40))
  if (!countries.length && clean(trip?.destination_country_code || trip?.destination_country, 40)) countries.push('home')
  if (!countryName) countryName = clean(trip?.destination_country, 40)
  return { cities, countryCount: countries.length, countryName }
}

/** The member's badges unlocked during this trip (or in the three days after), as { id, name, icon, tier }. */
export function badgesEarnedOn(trip, badges = []) {
  const a = ymd(trip?.start_date), b = ymd(trip?.end_date)
  if (!a || !b) return []
  const from = new Date(a[0], a[1] - 1, a[2]), until = new Date(b[0], b[1] - 1, b[2] + 3)
  return badges
    .filter(x => { const t = new Date(x.unlocked_at); return t >= from && t <= until })
    .map(x => ({ id: x.badge_id, ...(BADGES[x.badge_id] || { name: x.badge_name, icon: 'award', tier: x.badge_tier }) }))
}

/**
 * One dry line from real counts only, by priority: two or more flights, then more than one city, else the days line
 * (so one flight or one city always gets "N days away. Goose is proud.").
 */
export function gooseLine({ days, cities, flights }) {
  if (flights > 1) return `${plural(flights, 'flight')}. Zero lost in the inbox.`
  if (cities > 1) return `${cities} cities, one tidy itinerary.`
  if (days) return `${plural(days, 'day')} away. Goose is proud.`
  return 'Goose approves.'
}

export function shareCaption({ title, days, cities }) {
  const bits = [days && plural(days, 'day'), cities && plural(cities, 'city', 'cities')].filter(Boolean).join(', ')
  return `${title}${bits ? `: ${bits}` : ''}. Planned with Silly Travel Tool. ${SHARE_URL}`
}

/**
 * Everything the renderer may draw. `trip`, `stops`, `bookings`, `stats` and `badges` are the member's own rows;
 * `title` and `hideDates` come from the preview sheet.
 */
export function buildShareCard({ trip, stops = [], bookings = [], stats = null, badges = [], title, hideDates = false }) {
  const name = capTitle(title ?? trip?.title, MAX_TITLE) || 'My trip'
  const days = tripDays(trip)
  const { cities, countryCount, countryName } = routeOf(trip, stops)
  const flights = bookings.filter(b => b?.type === 'flight').length
  const completed = Math.max(0, Number(stats?.trips_completed) || 0)
  const score = Math.max(0, Math.round(Number(stats?.goose_score) || 0))
  const earned = badgesEarnedOn(trip, badges).slice(0, MAX_BADGES).map(({ id, name: n, icon }) => ({ id, name: n, icon: icon || 'award' }))

  // One city: no route strip, no city or country numbers; one giant days number with the place under it
  const single = cities.length === 1 && days > 0
  const place = countryName || cities[0]
  const trio = single
    ? [{ value: days, label: `${days === 1 ? 'day' : 'days'} in ${place}`, hero: true }]
    : [
      days > 0 && { value: days, label: days === 1 ? 'day' : 'days' },
      cities.length > 0 && { value: cities.length, label: cities.length === 1 ? 'city' : 'cities' },
      countryCount > 0 && { value: countryCount, label: countryCount === 1 ? 'country' : 'countries' },
    ].filter(Boolean)
  const extras = [
    flights > 0 && { value: flights, label: flights === 1 ? 'flight' : 'flights' },
    completed > 0 && { value: completed, label: completed === 1 ? 'trip completed' : 'trips completed' },
  ].filter(Boolean)

  return {
    overline: 'TRIP RECAP',
    title: name,
    dateLine: hideDates ? null : monthLine(trip),
    route: single ? { cities: [], more: 0 } : { cities: cities.slice(0, MAX_ROUTE), more: Math.max(0, cities.length - MAX_ROUTE) },
    trio,
    extras,
    gooseLine: gooseLine({ days, cities: cities.length, flights }),
    score: score > 0 ? score : null,
    badges: earned,
    cta: CTA,
    site: SITE,
    alt: `Trip recap card: ${name}${days ? `, ${plural(days, 'day')}` : ''}${cities.length ? `, ${plural(cities.length, 'city', 'cities')}` : ''}.`,
    caption: shareCaption({ title: name, days, cities: cities.length }),
  }
}
