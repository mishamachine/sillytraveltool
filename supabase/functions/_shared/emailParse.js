// The booking-email prompt and the shape of its answer, apart from the filing code so the offline tests can check the
// contract: every booking in the email (packages), every traveller (families), English city names, dates read
// against the day the email arrived. Plain JS so node tests import it directly.
import { airportCity, cityName, iataOf } from './airportCities.js'
import { MAX_EMAIL_CHARS } from './emailText.js'

/** Fields of one booking in the AI's answer (a subset are bookings columns; the rest are matching hints). */
export const BOOKING_FIELDS = ['type', 'title', 'confirmation_number', 'flight_number', 'airline', 'departure_airport',
  'departure_city', 'arrival_airport', 'arrival_city', 'departure_time', 'arrival_time', 'flight_class', 'hotel_name',
  'hotel_address', 'check_in_date', 'check_out_date', 'room_type', 'activity_date', 'activity_time', 'venue_name',
  'venue_address', 'price', 'currency', 'booking_url', 'notes', 'destination_city', 'passenger_name', 'seat_number',
  'ticket_quantity', 'party_size', 'transport_mode', 'change_type', 'changed']

/** Fields of one loyalty card in the answer. */
export const LOYALTY_FIELDS = ['program_name', 'member_number', 'previous_number', 'member_name', 'tier', 'points_balance', 'points_as_of', 'expiry_date']

/** Top-level keys of the answer. */
export const EMAIL_KEYS = ['email_kind', 'change_type', 'loyalty', 'travelers', 'bookings', 'unclear']

/** What one traveller may be stored as: a name and adult/child/infant, nothing else (privacy). */
export const TRAVELER_KEYS = ['name', 'type']

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "2026-11-06 (Friday)" for the day the email arrived (UTC), now when unknown or unreadable. */
export function receivedDay(receivedAt) {
  const d = new Date(receivedAt || Date.now())
  const ok = Number.isNaN(d.getTime()) ? new Date() : d
  return `${ok.toISOString().slice(0, 10)} (${WEEKDAYS[ok.getUTCDay()]})`
}

const emptyBooking = () => `{ ${BOOKING_FIELDS.map(k => `"${k}": null`).join(', ')} }`

/** The prompt for one forwarded email. */
export function bookingEmailPrompt({ subject = '', from = '', body = '', receivedAt = null } = {}) {
  // The caller trims the body (emailText.js prepareEmailText); this cap only guards a direct call
  const email = [subject ? `Subject: ${subject}` : '', `From: ${from}`, '', String(body).slice(0, MAX_EMAIL_CHARS)].join('\n')
  // The fixed instructions first and the email last: providers cache a repeated prompt prefix, so the rules are cheap
  return `Extract every booking from the confirmation email at the end and return ONLY a valid JSON object.

Return this JSON structure (null for any field not found):
{
"email_kind": "booking|loyalty|other",
"change_type": "new|change|cancellation",
"loyalty": [{ ${LOYALTY_FIELDS.map(k => `"${k}": null`).join(', ')} }],
"travelers": [{ "name": "Given Family", "type": "adult|child|infant" }],
"bookings": [${emptyBooking()}],
"unclear": null
}

Rules:
- bookings: EVERY reservation in the email, each its own object, in date order. A package or itinerary with flights,
  hotels, a car rental, trains, tours and tables gives one object per item. Never leave a booking only in notes.
- A flight or train journey with several legs (connections, out and back, multi-city): one object per leg, each with its
  own flight_number, airports and times.
- confirmation_number on every object: the item's own reference when it has one (e.g. a car rental "Ref CAR-123"),
  else the email's booking or package reference.
- travelers: every traveller named on the booking, in the order printed, as "Given Family" in normal capitalisation
  (not all capitals), without titles (Mr, Mrs, Miss, Mstr, Dr), accents and hyphens kept. type: "infant" for an infant
  or lap child, "child" for a child, else "adult". Only the name and type: never a date of birth, age, passport or ID
  number, loyalty or frequent-flyer number, email address or phone number, for anyone, and never put those in notes.
  [] when no name is printed.
- passenger_name on a booking: null, unless that booking is for only some of the travellers (then their names).
- email_kind: "booking" for a reservation or ticket the traveller holds. "loyalty" for a loyalty, frequent-flyer or
  hotel-rewards statement, welcome or membership email with no new reservation in it: then "loyalty" lists ONE object
  per program the member belongs to with a member number (program_name e.g. "Iberia Plus", member_number = the current
  number, previous_number = a replaced old number if the email gives one, member_name, tier e.g. "Gold", points_balance
  a whole number, points_as_of = statement date YYYY-MM-DD, expiry_date YYYY-MM-DD) and bookings is []; a program the
  member has not joined, or that has no number, is not listed; past stays and flights in a statement are not bookings.
  "other" for everything else, with bookings []: newsletters, offers and deals, flight-status or app marketing, travel
  insurance policies and receipts, payment receipts, surveys.
- change_type (for the email, and on each booking): "change" when the email updates an existing reservation (new
  date, time, room, seat, guests, schedule change), "cancellation" when it cancels it, "unchanged" for an item the
  email only mentions as still confirmed, else "new". A partial cancellation cancels only the items it names. Always
  give the booking details as they are NOW.
- changed: on a "change" booking, the list of fields the email changes (e.g. ["seat_number"] for a seat change,
  ["departure_time", "arrival_time"] for a new schedule); leave other fields as printed or null. A fee for the change
  (seat fee, change fee) or a refund is not the price.
- The email may contain marketing, legal text, reply history and forwarded headers: ignore anything that isn't a
  booking or a loyalty statement (offers, "deals", sample flights in an app advert are not bookings). The booking may be
  anywhere, including at the very end or deep in a forwarded or quoted chain. Tables are written as | cell | rows.
  Decode any leftover entities (&nbsp;) or quoted-printable codes (=C3=B3); never copy markup or {{placeholders}}.
- Dates: YYYY-MM-DD. Resolve relative dates ("today", "tomorrow", "this Friday") against the day the email was
  received, and a date printed without a year to the first such date on or after that day.
- A date like 03/04/2027 can be day/month or month/day: decide from the sender's locale (language, country, address,
  currency, other dates in the email such as 22/11/2026 that can only be day/month). If it is still unclear, leave the
  date null and say what is unclear in "unclear". Never guess.
- departure_time and arrival_time: the LOCAL time exactly as printed on the confirmation, as YYYY-MM-DDTHH:MM with NO
  time zone or offset, local to the departure / arrival airport or station. Never convert between time zones. Date only
  (YYYY-MM-DD) if no time is printed.
- activity_time: local time exactly as printed, HH:MM 24h.
- departure_airport / arrival_airport for flights: the 3-letter IATA code when shown (e.g. MAD), otherwise the airport name.
- departure_city / arrival_city: the common English name of the city the airport or station serves ("Madrid" for MAD,
  "Munich" for München Hbf), never a code.
- destination_city: the common English name of the city the booking is in or travels to, never an airport code.
- price must be a number (1.234,56 € is 1234.56), currency a 3-letter code.
- seat_number: assigned seat(s) (e.g. "14A"). ticket_quantity: number of tickets for activities and events.
- party_size: guests on a restaurant reservation, else null.
- type must be one of: flight, hotel, activity, transport, restaurant, other
- restaurant = a dining reservation: venue_name = restaurant, venue_address, activity_date, activity_time, party_size,
  title like "Dinner at <restaurant>"
- transport = train, bus, ferry, coach, car rental, transfer or cruise: transport_mode = train|bus|ferry|coach|car
  (a transfer or taxi is car, titled "Transfer to <place>"; a cruise is ONE ferry booking titled "Cruise: <ship>", from
  the embarkation port to the disembarkation port, with the ports of call and days at sea in notes), airline = operator,
  flight_number = train/service number, departure_airport / arrival_airport = station, port or pick-up / drop-off place,
  departure_time / arrival_time as for flights (a car rental: pick-up and drop-off)
- activity = museum, attraction, tour, concert, show or sports ticket: venue_name, venue_address, activity_date,
  activity_time, ticket_quantity
- hotel: hotel_name, hotel_address, check_in_date, check_out_date, room_type (with the number of rooms)
- Return raw JSON only, no markdown, no explanation

The email was received on ${receivedDay(receivedAt)}.

Email:
${email}`
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)
const TOP = new Set([...EMAIL_KEYS, 'more_legs'])
const CHANGES = new Set(['new', 'change', 'cancellation', 'unchanged'])
const LEG_SHARED = ['type', 'confirmation_number', 'airline', 'transport_mode', 'passenger_name', 'flight_class', 'currency']

/**
 * The AI's answer in one shape: { email_kind, change_type, loyalty, travelers, unclear, bookings: [...] }.
 * Takes the new shape ({ bookings: [...] }) and the old one (one booking at the top, later legs in more_legs).
 * Each leg in more_legs becomes its own booking with the shared fields of its parent. Null when unusable.
 */
export function normalizeEmailParse(raw) {
  if (!isObj(raw)) return null
  const nested = Array.isArray(raw.bookings)
  const list = nested ? raw.bookings : (raw.type || raw.title || raw.confirmation_number ? [raw] : [])
  const emailChange = CHANGES.has(raw.change_type) ? raw.change_type : 'new'
  const bookings = []
  for (const item of list.filter(isObj)) {
    const base = {}
    for (const [k, v] of Object.entries(item)) if (!TOP.has(k) || (nested && k === 'change_type')) base[k] = v
    // Each booking's own change, else the email's
    base.change_type = CHANGES.has(base.change_type) ? base.change_type : emailChange
    base.changed = Array.isArray(item.changed) ? item.changed.filter(k => typeof k === 'string').slice(0, 20) : null
    bookings.push(base)
    for (const leg of (Array.isArray(item.more_legs) ? item.more_legs : []).filter(isObj).slice(0, 6)) {
      const shared = Object.fromEntries(LEG_SHARED.map(k => [k, base[k]]))
      bookings.push({ ...shared, change_type: base.change_type, changed: base.changed, ...leg, destination_city: leg.destination_city || leg.arrival_city || null })
    }
  }
  // An item without its own reference carries the email's (a package lists it once)
  const ref = bookings.find(b => b.confirmation_number)?.confirmation_number || null
  for (const b of bookings) if (!b.confirmation_number && ref) b.confirmation_number = ref
  return {
    email_kind: raw.email_kind || null,
    change_type: emailChange,
    // One card or several (a wallet email lists each program); only those with a name
    loyalty: (Array.isArray(raw.loyalty) ? raw.loyalty : [raw.loyalty]).filter(l => isObj(l) && l.program_name).slice(0, 10),
    travelers: cleanTravelers(raw.travelers),
    unclear: typeof raw.unclear === 'string' && raw.unclear.trim() ? raw.unclear.trim().slice(0, 300) : null,
    bookings: bookings.slice(0, 12),
  }
}

const TITLES = /^(mr|mrs|ms|miss|mstr|master|inf|chd|dr|prof|mx|sir|madam|herr|frau|sr|sra|srta|m|mme|mlle)\.?$/i
const capWord = w => w.split(/([-'’])/).map(p => (p.length > 0 && /[^-'’]/.test(p) ? p[0].toLocaleUpperCase() + p.slice(1).toLocaleLowerCase() : p)).join('')

/** "NUÑEZ-WHITAKER / SØREN MR" or "SØREN NUÑEZ-WHITAKER MR" → "Søren Nuñez-Whitaker". Null when no name is left. */
export function tidyName(raw) {
  let s = String(raw ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || /\d|@/.test(s)) return null // a number or an address is not a name (and is never stored)
  // Airline style "FAMILY / GIVEN"
  const slash = s.split('/').map(x => x.trim()).filter(Boolean)
  if (slash.length === 2) s = `${slash[1]} ${slash[0]}`
  const words = s.split(' ').filter(w => !TITLES.test(w))
  if (!words.length) return null
  const shouting = !/\p{Ll}/u.test(words.join(''))
  return words.map(w => (shouting ? capWord(w) : w)).join(' ').slice(0, 80)
}

/** Travellers as [{ name, type }]: only those two keys, whatever else the AI sent (privacy: no DOB, IDs, contacts). */
export function cleanTravelers(raw) {
  const out = []
  for (const t of Array.isArray(raw) ? raw : []) {
    const name = tidyName(typeof t === 'string' ? t : t?.name)
    if (!name) continue
    const type = ['child', 'infant'].includes(String(t?.type || '').toLowerCase()) ? String(t.type).toLowerCase() : 'adult'
    if (!out.some(x => x.name === name)) out.push({ name, type })
  }
  return out.slice(0, 20)
}

const familyOf = n => n.split(' ').slice(-1)[0]
const givenOf = n => n.split(' ').slice(0, -1).join(' ')
const joinNames = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '')

/**
 * One readable line for passenger_name, plus the head count:
 *   one family  → "Søren, Amélie, Zoë and Ismaël Nuñez-Whitaker + infant Léa-Marie"
 *   families    → "Arjun, Priya, Kabir and Anaya Mehta; Sunita and Vikram Kapoor; James Holloway"
 *   no two alike → "Ana Ruiz and Ben Cole"
 *   more than 8 → the first 8 then "+ 3 more". Single names (山田 花子 has a space; "Cher" none) stay as written.
 * party_size is the number of travellers when there are two or more, else null.
 */
export function travelerSummary(travelers) {
  const list = cleanTravelers(travelers)
  if (!list.length) return { passenger_name: null, party_size: null }
  const seated = list.filter(t => t.type !== 'infant').map(t => t.name)
  const infants = list.filter(t => t.type === 'infant').map(t => t.name)
  const shown = seated.slice(0, 8), more = seated.length - shown.length
  const families = []
  for (const n of shown) {
    const fam = n.includes(' ') ? familyOf(n) : null
    const g = fam && families.find(f => f.fam === fam)
    if (g) g.names.push(n); else families.push({ fam, names: [n] })
  }
  const parts = families.map(f => (f.fam && f.names.length > 1 ? `${joinNames(f.names.map(givenOf))} ${f.fam}` : joinNames(f.names)))
  let line = families.every(f => f.names.length === 1) ? joinNames(parts) : parts.join('; ')
  if (more > 0) line += ` + ${more} more`
  const one = families.length === 1 ? families[0].fam : null
  for (const i of infants) line = `${line ? `${line} + ` : ''}infant ${one && i.includes(' ') && familyOf(i) === one ? givenOf(i) : i}`
  return { passenger_name: line.slice(0, 200), party_size: list.length > 1 ? Math.min(list.length, 50) : null }
}

// Lines in notes that carry someone's identity or contact data: dropped before anything is stored
const PRIVATE_LINE = /(passport|date of birth|\bd\.?o\.?b\b|born on|birth ?date|national id|id number|frequent[ -]?fl|\bff\s*(no|number|#)|loyalty (no|number|#)|member(ship)? (no|number|#)|phone|tel\.?:|mobile|e-?mail|@)/i

/** Notes without lines that carry IDs, birth dates, loyalty numbers or contact details. */
export function scrubNotes(notes) {
  if (notes == null) return null
  const kept = String(notes).split(/\n|;\s*/).map(l => l.trim()).filter(l => l && !PRIVATE_LINE.test(l))
  return kept.length ? kept.join('\n').slice(0, 1000) : null
}

const MODE_WORD = { train: 'Train', bus: 'Bus', ferry: 'Ferry', coach: 'Coach' }

/**
 * One title style for every leg: "Flight to London (LHR)", "Train to Hamburg", "Ferry to Calais". A car rental, a hotel,
 * a table and a ticket keep their own title. `arrCity` is the arrival's city when the caller knows it.
 */
export function legTitle(b, arrCity = null) {
  if (b.type === 'flight') {
    // The airport table first (YVR is Vancouver, though the airport sits in Richmond), then the AI's English name
    const code = iataOf(b.arrival_airport)
    const city = airportCity(code)?.city || cityName(b.arrival_city) || cityName(arrCity) || null
    if (city) return `Flight to ${city}${code ? ` (${code})` : ''}`
    if (code) return `Flight to ${code}`
    return b.title || 'Flight'
  }
  // A cruise (or any round sailing) keeps its own title: "Ferry to Barcelona" from Barcelona says nothing
  const round = String(b.departure_airport || '').trim().toLowerCase() === String(b.arrival_airport || '').trim().toLowerCase()
  if (b.type === 'transport' && MODE_WORD[b.transport_mode] && !round && !/^cruise\b/i.test(b.title || '')) {
    const city = cityName(b.arrival_city) || cityName(arrCity) || null
    return city ? `${MODE_WORD[b.transport_mode]} to ${city}` : b.title || MODE_WORD[b.transport_mode]
  }
  return b.title
}
