// The work after an inbound email is authenticated and mapped to a user: parse it with the AI, match it to a
// trip by dates and distance (extending or joining trips that are one journey), and insert the booking.
// Shared by the Resend webhook (index.ts) so it can be exercised without a signed webhook.
import { geminiFetch, checkAiQuota } from '../_shared/gemini.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'
import { attachPlace, geocode, cached } from '../_shared/google.ts'
import { bestTrip, wallSpan, distanceKm, gapDays, routeKm, NEAR_KM, EDGE_DAYS } from '../_shared/tripMatch.js'
import { readItinerary, VISION_TYPES } from '../_shared/itinerary.ts'
import { sheetToText } from '../_shared/sheet.js'

const toBase64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

export function ok(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ── Trip matching: dates and distance (shared rule in _shared/tripMatch.js), never the city name alone ──
const MOVES = new Set(['flight', 'transport'])
type Pt = { lat: number, lng: number }

/** Coordinates for a place name (airport, station, city), cached 30 days. */
async function geo(admin: any, q: unknown) {
  const s = String(q ?? '').trim()
  if (!s) return null
  return await cached(admin, `geo:${s.toLowerCase().slice(0, 200)}`, 30, () => geocode(s)).catch(() => null)
}
const legPlace = (b: any, side: 'departure_airport' | 'arrival_airport') =>
  b[side] ? (b.type === 'flight' ? `${b[side]} airport` : String(b[side])) : null

/** Where a booking happens: both ends of a flight or train, else the venue (or its city). */
async function bookingPoints(admin: any, b: any): Promise<{ dep: Pt | null, arr: Pt | null, at: Pt | null }> {
  const pick = (g: any) => (g && g.lat != null ? { lat: Number(g.lat), lng: Number(g.lng) } : null)
  if (MOVES.has(b.type)) {
    const [dep, arr] = await Promise.all([geo(admin, legPlace(b, 'departure_airport')), geo(admin, legPlace(b, 'arrival_airport'))])
    return { dep: pick(dep), arr: pick(arr), at: null }
  }
  if (b.place_lat != null && b.place_lng != null) return { dep: null, arr: null, at: { lat: Number(b.place_lat), lng: Number(b.place_lng) } }
  return { dep: null, arr: null, at: pick(await geo(admin, b.destination_city || b.hotel_address || b.venue_address)) }
}

const nearHome = (p: Pt | null, home: Pt | null) => !!(p && home && distanceKm(p, home) <= NEAR_KM)

/** Points of a trip a booking can match: its destination plus where its bookings are (home left out). */
async function loadTripPoints(admin: any, trip: any, home: Pt | null) {
  if (trip.destination_lat == null && trip.destination_city) {
    const g = await geo(admin, [trip.destination_city, trip.destination_country].filter(Boolean).join(', '))
    if (g) {
      trip.destination_lat = g.lat; trip.destination_lng = g.lng
      await admin.from('trips').update({ destination_lat: g.lat, destination_lng: g.lng }).eq('id', trip.id)
    }
  }
  const { data: rows } = await admin.from('bookings')
    .select('type, place_lat, place_lng, departure_airport, arrival_airport')
    .eq('trip_id', trip.id).limit(40)
  const pts: Pt[] = []
  for (const r of rows || []) {
    const p = await bookingPoints(admin, r)
    for (const x of [p.dep, p.arr, p.at]) if (x && !nearHome(x, home)) pts.push(x)
  }
  trip.points = pts
}

/** A trip this function made on its own ("Trip to X", no guests, only emailed bookings): safe to fold into another. */
async function isAutoTrip(admin: any, trip: any) {
  if (!/^Trip to /.test(trip.title || '') || trip.title !== `Trip to ${trip.destination_city}`) return false
  const [{ data: guests }, { data: manual }, { data: acts }] = await Promise.all([
    admin.from('trip_collaborators').select('id').eq('trip_id', trip.id).neq('role', 'owner').limit(1),
    admin.from('bookings').select('id').eq('trip_id', trip.id).neq('source', 'email_import').limit(1),
    admin.from('trip_activities').select('id').eq('trip_id', trip.id).limit(1),
  ])
  return !guests?.length && !manual?.length && !acts?.length
}

/**
 * A flight or train that links two trips (leaves one, lands at the other, within EDGE_DAYS) means they are one
 * journey: fold the auto-made neighbour into `trip`. Returns the id of the trip folded in, or null.
 */
async function foldNeighbour(admin: any, trip: any, trips: any[], ends: { dep: Pt | null, arr: Pt | null }, home: Pt | null) {
  for (const other of trips) {
    if (other.id === trip.id || other.status === 'cancelled' || !other.start_date || !trip.start_date) continue
    if (gapDays(other, { start: trip.start_date, end: trip.end_date }) > EDGE_DAYS) continue
    if (!other.points) await loadTripPoints(admin, other, home)
    const touches = [ends.dep, ends.arr].some(p => p && !nearHome(p, home) && routeKm(other, { points: [p] }) <= NEAR_KM)
    if (!touches || !(await isAutoTrip(admin, other))) continue
    const start = other.start_date < trip.start_date ? other.start_date : trip.start_date
    const end = other.end_date > trip.end_date ? other.end_date : trip.end_date
    await admin.from('bookings').update({ trip_id: trip.id }).eq('trip_id', other.id)
    await admin.from('trips').update({ start_date: start, end_date: end }).eq('id', trip.id)
    await admin.from('trips').delete().eq('id', other.id)
    trip.start_date = start; trip.end_date = end
    console.log(`🔗 Folded trip ${other.id} into ${trip.id}`)
    return other.id
  }
  return null
}

export async function ingestEmail(
  supabase: any,
  profile: { id: string, home_city?: string | null },
  { subject, fromAddress, bodyText, GEMINI_API_KEY, attachments = [] }: {
    subject: string, fromAddress: string, bodyText: string, GEMINI_API_KEY: string,
    attachments?: { name: string, mime: string, bytes: Uint8Array }[],
  },
): Promise<Response> {
  const userId = profile.id

  if (!(await checkAiQuota(userId))) {
    console.warn(`AI quota exceeded for user ${userId} — inbound email not parsed`)
    return err('Daily AI limit reached', 429)
  }

  // ── 4. Fetch user's trips for matching ────────────────────
  const { data: trips } = await supabase
    .from('trips')
    .select('id, title, destination_city, destination_country, destination_country_code, destination_tz, destination_lat, destination_lng, start_date, end_date, status')
    .eq('owner_id', userId)
    .order('start_date', { ascending: true })

  const tripList: any[] = trips || []

  // ── 4b. Attachments first: an itinerary PDF, a screenshot or a spreadsheet can hold a whole trip ──
  const fromFiles: any[] = []
  for (const a of attachments) {
    const sheet = await sheetToText(a.bytes, { name: a.name, mime: a.mime }).catch(() => null)
    if (sheet == null && !VISION_TYPES.test(a.mime)) continue
    if (fromFiles.length && !(await checkAiQuota(userId))) break
    const read = await readItinerary(GEMINI_API_KEY, sheet != null
      ? { text: `Spreadsheet itinerary (${a.name}):\n${sheet}`.slice(0, 20000) }
      : { file: { mime: a.mime, data: toBase64(a.bytes) } })
    if (read.result?.bookings?.length) fromFiles.push(...read.result.bookings)
    else console.warn(`attachment ${a.name}: ${read.error || 'no bookings'}`)
  }
  if (fromFiles.length) {
    const results: any[] = []
    for (const parsed of fromFiles.slice(0, 40)) results.push(await fileBooking(supabase, profile, tripList, parsed))
    const saved = results.filter(r => r.booking_id && !r.duplicate).length
    console.log(`📎 ${saved} of ${results.length} bookings from attachments for user ${userId}`)
    return ok({ success: true, from_attachments: true, count: saved, bookings: results, trip_ids: [...new Set(results.map(r => r.trip_id).filter(Boolean))] })
  }

  // ── 5. Parse email via Gemini ─────────────────────────────
  const emailContext = [
    subject ? `Subject: ${subject}` : '',
    `From: ${fromAddress}`,
    '',
    bodyText.slice(0, 6000), // cap to avoid token overflow
  ].filter(Boolean).join('\n')

  const prompt = `Extract booking details from this confirmation email and return ONLY a valid JSON object.

Email:
${emailContext}

Return this JSON structure (use null for any field not found):
{
"email_kind": "booking|loyalty|other",
"loyalty": { "program_name": null, "member_number": null, "member_name": null, "tier": null, "points_balance": null, "points_as_of": null, "expiry_date": null },
"type": "flight|hotel|activity|transport|restaurant|other",
"title": "short descriptive title e.g. 'Flight to Tokyo' or 'Hilton Tokyo Check-in'",
"confirmation_number": null,
"flight_number": null,
"airline": null,
"departure_airport": null,
"arrival_airport": null,
"departure_time": null,
"arrival_time": null,
"flight_class": null,
"hotel_name": null,
"hotel_address": null,
"check_in_date": null,
"check_out_date": null,
"room_type": null,
"activity_date": null,
"activity_time": null,
"venue_name": null,
"venue_address": null,
"price": null,
"currency": null,
"booking_url": null,
"notes": null,
"destination_city": null,
"passenger_name": null,
"seat_number": null,
"ticket_quantity": null,
"party_size": null,
"transport_mode": null
}

Rules:
- email_kind: "loyalty" for a loyalty, frequent-flyer or hotel-rewards statement, welcome or membership email that has
  no new reservation in it; then fill "loyalty" (program_name e.g. "Iberia Plus", member_number as printed, tier e.g.
  "Gold", points_balance a whole number, points_as_of = statement date YYYY-MM-DD, expiry_date YYYY-MM-DD) and leave
  the booking fields null. "booking" for a reservation or ticket. "other" for anything else.
- departure_time and arrival_time: the LOCAL time exactly as printed on the confirmation, as YYYY-MM-DDTHH:MM with NO time zone or offset. The departure time is local to the departure airport/station, the arrival time local to the arrival airport/station. Never convert between time zones. Date only (YYYY-MM-DD) if no time is printed.
- activity_time: local time exactly as printed, HH:MM 24h.
- departure_airport / arrival_airport for flights: the 3-letter IATA code when shown (e.g. MAD), otherwise the airport name
- check_in_date and check_out_date must be YYYY-MM-DD
- activity_date must be YYYY-MM-DD
- price must be a number, not a string
- destination_city is the city the booking is IN or travelling TO (used for trip matching)
- passenger_name: full name of the traveller if present (e.g. "JOHN SMITH"). null if absent.
- seat_number: assigned flight seat (e.g. "14A"). null if not assigned.
- ticket_quantity: number of tickets for activities/events. null for flights/hotels.
- type must be one of: flight, hotel, activity, transport, restaurant, other
- restaurant = a dining reservation (OpenTable, Resy, Tock, SevenRooms, TheFork, direct booking):
venue_name = restaurant, venue_address, activity_date (YYYY-MM-DD), activity_time (HH:MM, 24h), party_size = number of guests,
title like "Dinner at <restaurant>"
- transport = train, bus, ferry, coach or car rental: transport_mode = train|bus|ferry|coach|car,
airline = operator (e.g. Amtrak, Eurostar, Trenitalia, FlixBus), flight_number = train/service number,
departure_airport / arrival_airport = station or port names, departure_time / arrival_time as for flights
- activity = museum, attraction, tour, concert, show or sports ticket: venue_name, venue_address, activity_date,
activity_time, ticket_quantity
- party_size: guests on a restaurant reservation, otherwise null. transport_mode: null unless type is transport.
- Return raw JSON only — no markdown, no explanation`

  const gemRes = await geminiFetch(GEMINI_API_KEY, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
  }, { timeoutMs: 30000 })

  if (!gemRes.ok) {
    const gemErr = await gemRes.text()
    console.error('Gemini error:', gemErr)
    return err('Gemini parse failed', 502)
  }

  const gemData = await gemRes.json()
  const gemText = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  let parsed: any = null
  try {
    const cleaned = gemText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('JSON parse failed:', gemText.slice(0, 300))
    return err('Could not parse Gemini response as JSON', 502)
  }

  // A loyalty statement or membership email: file the card in the traveller's Loyalty wallet, not a booking
  if (parsed.email_kind === 'loyalty' && parsed.loyalty?.program_name) {
    const r = await fileLoyalty(supabase, userId, parsed.loyalty)
    return r.error ? err(r.error, 500) : ok({ success: true, loyalty: true, ...r })
  }
  // Not a booking at all (newsletter, receipt without a date): nothing to file
  if (parsed.email_kind === 'other' && !wallSpan(parsed) && !parsed.confirmation_number) {
    console.log(`📭 Not a booking or loyalty email for user ${userId}: ignored`)
    return ok({ success: true, ignored: true })
  }
  delete parsed.email_kind; delete parsed.loyalty
  const filed = await fileBooking(supabase, profile, tripList, parsed)
  return filed.error ? err(filed.error, filed.status || 500) : ok(filed)
}

/** Match one parsed booking to a trip (extend, fold or create one) and insert it. Updates `trips` in place. */
async function fileBooking(supabase: any, profile: { id: string, home_city?: string | null }, trips: any[], parsed: any): Promise<Record<string, any>> {
  const userId = profile.id
  // ── 5b. The same confirmation forwarded again: keep the booking we already have ──
  // Hotels, tickets and tables only: an outbound and return flight share one confirmation number
  const tripIds = trips.map((t: any) => t.id)
  if (tripIds.length && parsed.title && !parsed.departure_time) {
    const dateKeys: [string, unknown][] = [['check_in_date', parsed.check_in_date], ['activity_date', parsed.activity_date]]
    let q = supabase.from('bookings').select('id, trip_id').in('trip_id', tripIds).eq('created_by', userId)
    q = parsed.confirmation_number ? q.eq('confirmation_number', String(parsed.confirmation_number)) : q.eq('title', String(parsed.title))
    for (const [k, v] of dateKeys) q = v ? q.eq(k, String(v)) : q.is(k, null)
    q = q.is('departure_time', null)
    const { data: dupes } = await q.limit(1)
    const dupe = dupes?.[0]
    if (dupe) {
      console.log(`↩️ Duplicate email for user ${userId}: booking ${dupe.id} already exists`)
      return { success: true, duplicate: true, booking_id: dupe.id, trip_id: dupe.trip_id }
    }
  }

  // A flight or train already saved (same service, same departure): don't add it twice. The times need
  // their zones to compare with stored instants, so probe a copy.
  if (MOVES.has(parsed.type) && parsed.departure_time && (parsed.flight_number || parsed.confirmation_number) && tripIds.length) {
    const probe = await attachZones(supabase, { ...parsed }, { city: parsed.destination_city || '' })
    if (probe.departure_time && probe.departure_tz) {
      let q = supabase.from('bookings').select('id, trip_id').in('trip_id', tripIds).eq('departure_time', new Date(probe.departure_time).toISOString())
      q = parsed.flight_number ? q.eq('flight_number', String(parsed.flight_number)) : q.eq('confirmation_number', String(parsed.confirmation_number))
      const { data: dupes } = await q.limit(1)
      if (dupes?.[0]) {
        console.log(`↩️ Duplicate leg for user ${userId}: booking ${dupes[0].id} already exists`)
        return { success: true, duplicate: true, booking_id: dupes[0].id, trip_id: dupes[0].trip_id }
      }
    }
  }

  // ── 6. Match to a trip by dates and distance — extend it, or create one ──
  // Dates as printed (local), before zones turn them into instants
  const span = wallSpan(parsed)
  await attachPlace(supabase, parsed, parsed.destination_city || '')
  const homeGeo = profile.home_city ? await geo(supabase, profile.home_city) : null
  const home = homeGeo ? { lat: homeGeo.lat, lng: homeGeo.lng } : null
  const ends = await bookingPoints(supabase, parsed)
  // Home doesn't place a booking: a flight home matches the trip it leaves from
  const away = [ends.dep, ends.arr, ends.at].filter(p => p && !nearHome(p, home)) as Pt[]
  const item = { start: span?.start || null, end: span?.end || null, points: away.length ? away : [ends.dep, ends.arr, ends.at].filter(Boolean) }
  const today = new Date().toISOString().slice(0, 10)
  const candidates = trips.filter((t: any) => t.status !== 'cancelled' &&
    (!t.start_date || !item.start || gapDays(t, item) <= EDGE_DAYS))
  for (const t of candidates) await loadTripPoints(supabase, t, home)
  const match = bestTrip(candidates, item, { today })
  let matchedTrip: any = match?.trip || null

  if (matchedTrip && match?.widen) {
    await supabase.from('trips').update(match.widen).eq('id', matchedTrip.id)
    Object.assign(matchedTrip, match.widen)
    console.log(`📅 Trip ${matchedTrip.id} now ${match.widen.start_date} → ${match.widen.end_date} (${match.fit})`)
  }

  // If no match and we have enough info, create a new trip
  if (!matchedTrip && (parsed.destination_city || ends.arr || ends.at)) {
    // A flight home with no trip to join: the trip is where it leaves from
    const homeward = MOVES.has(parsed.type) && nearHome(ends.arr, home) && parsed.departure_airport
    const geoTrip = homeward ? await geo(supabase, legPlace(parsed, 'departure_airport'))
      : parsed.destination_city ? await geo(supabase, parsed.destination_city)
      : MOVES.has(parsed.type) ? await geo(supabase, legPlace(parsed, 'arrival_airport'))
      : await geo(supabase, parsed.hotel_address || parsed.venue_address)
    const tripCity = geoTrip?.city || (homeward ? parsed.departure_airport : parsed.destination_city)
    // No date in the email: an undated trip ("Dates to be decided"), never today's date, which made a
    // one-day trip "in progress" and took over the Trips tab
    const startDate = span?.start || null
    const endDate = span?.end || null

    const { data: newTrip, error: tripErr } = tripCity ? await supabase
      .from('trips')
      .insert({
        owner_id: userId,
        title: `Trip to ${tripCity}`,
        destination_city: tripCity,
        destination_country: geoTrip?.country || '',
        destination_country_code: geoTrip?.country_code || '',
        destination_lat: geoTrip?.lat ?? null,
        destination_lng: geoTrip?.lng ?? null,
        start_date: startDate,
        end_date: endDate,
        status: 'planning',
        destination_tz: await resolveZone(supabase, geoTrip ? { lat: geoTrip.lat, lng: geoTrip.lng } : { query: tripCity }),
      })
      .select()
      .single() : { data: null, error: null }

    if (tripErr) {
      console.error(`❌ Trip auto-create failed for user ${userId}:`, tripErr.message, tripErr.code, tripErr.details)
    } else if (newTrip) {
      matchedTrip = newTrip
      trips.push(newTrip)
      console.log(`🆕 Created new trip for user ${userId}: ${newTrip.id} → ${tripCity}`)
    }
  }

  // A train or flight that joins this trip to another emailed one: they're one journey
  let foldedTripId: string | null = null
  if (matchedTrip?.start_date && MOVES.has(parsed.type)) {
    foldedTripId = await foldNeighbour(supabase, matchedTrip, trips.filter((t: any) => t.id !== matchedTrip.id), ends, home)
    if (foldedTripId) trips.splice(trips.findIndex((t: any) => t.id === foldedTripId), 1)
  }

  // ── 6b. Local time: attach the place's zone to each time, then convert to instants ──
  const tripTz = matchedTrip?.destination_tz ||
    (parsed.destination_city ? await resolveZone(supabase, { query: parsed.destination_city }) : null)
  if (matchedTrip && !matchedTrip.destination_tz && tripTz) {
    await supabase.from('trips').update({ destination_tz: tripTz }).eq('id', matchedTrip.id)
  }
  await attachZones(supabase, parsed, { fallbackTz: tripTz, city: parsed.destination_city || '' })

  // ── 7. Sanitize booking fields ────────────────────────────
  // Only real bookings columns — a field Gemini invents must not break the insert
  const BOOKING_COLUMNS = new Set([
    'type', 'title', 'confirmation_number', 'flight_number', 'airline', 'departure_airport',
    'arrival_airport', 'departure_time', 'arrival_time', 'flight_class', 'hotel_name', 'hotel_address',
    'check_in_date', 'check_out_date', 'room_type', 'activity_date', 'activity_time', 'venue_name',
    'venue_address', 'price', 'currency', 'booking_url', 'notes', 'passenger_name', 'seat_number',
    'ticket_quantity', 'party_size', 'transport_mode', 'departure_tz', 'arrival_tz', 'local_tz',
    'place_id', 'place_lat', 'place_lng',
  ])
  const BOOKING_TYPES = ['flight', 'hotel', 'activity', 'transport', 'restaurant', 'other']
  if (!BOOKING_TYPES.includes(parsed.type)) parsed.type = 'other'
  for (const k of ['ticket_quantity', 'party_size']) {
    const n = parseInt(String(parsed[k] ?? ''), 10)
    parsed[k] = Number.isFinite(n) && n > 0 && n <= 50 ? n : null
  }

  const sanitized: Record<string, any> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (!BOOKING_COLUMNS.has(k)) continue  // destination_city etc. are matching hints only
    if (v === '' || v === undefined || v === null) {
      sanitized[k] = null
    } else if ((k === 'departure_time' || k === 'arrival_time') && typeof v === 'string') {
      try {
        const d = new Date(v)
        sanitized[k] = isNaN(d.getTime()) ? null : d.toISOString()
      } catch { sanitized[k] = null }
    } else if (k === 'price' && v !== null) {
      const p = parseFloat(String(v))
      sanitized[k] = isNaN(p) ? null : p
    } else {
      sanitized[k] = v
    }
  }

  // ── 8. Insert booking ─────────────────────────────────────
  const bookingRow = {
    ...sanitized,
    trip_id: matchedTrip?.id || null,
    created_by: userId,
    source: 'email_import',
    is_shared: false,
  }

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert(bookingRow)
    .select()
    .single()

  if (insertErr) {
    console.error('Booking insert error:', insertErr)
    return { error: `Database insert failed: ${insertErr.message}`, status: 500 }
  }

  console.log(`✅ Booking created for user ${userId}: ${booking.id} → trip ${matchedTrip?.id || 'unassigned'}`)

  return {
    success: true,
    booking_id: booking.id,
    trip_id: matchedTrip?.id || null,
    trip_title: matchedTrip?.title || null,
    trip_fit: match?.fit || (matchedTrip ? 'created' : null),
    folded_trip_id: foldedTripId,
    booking_type: parsed.type,
    booking_title: parsed.title,
  }

}

/** Add or update a loyalty card from a statement: matched by member number, else by program name. */
async function fileLoyalty(supabase: any, userId: string, l: Record<string, any>): Promise<Record<string, any>> {
  const clean = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, 120))
  const digits = (v: unknown) => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toLowerCase()
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const pts = parseInt(String(l.points_balance ?? '').replace(/[^0-9-]/g, ''), 10)
  const program = clean(l.program_name)!
  const fields: Record<string, any> = {
    program_name: program,
    ...(clean(l.member_number) ? { card_number: clean(l.member_number) } : {}),
    ...(clean(l.member_name) ? { member_name: clean(l.member_name) } : {}),
    ...(clean(l.tier) ? { tier: clean(l.tier) } : {}),
    ...(Number.isFinite(pts) ? { points_balance: pts, points_updated_at: new Date(`${date(l.points_as_of) || new Date().toISOString().slice(0, 10)}T12:00:00Z`).toISOString() } : {}),
    ...(date(l.expiry_date) ? { expiry_date: date(l.expiry_date) } : {}),
  }
  const { data: cards } = await supabase.from('loyalty_cards').select('id, program_name, card_number').eq('user_id', userId)
  const num = digits(fields.card_number)
  const same = (cards || []).find((c: any) => num && digits(c.card_number) === num) ||
    (cards || []).find((c: any) => String(c.program_name || '').toLowerCase() === program.toLowerCase())
  if (same) {
    const { error } = await supabase.from('loyalty_cards').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', same.id)
    if (error) return { error: `Loyalty update failed: ${error.message}` }
    console.log(`💳 Loyalty card ${same.id} updated for user ${userId}`)
    return { card_id: same.id, updated: true, program_name: program }
  }
  const { data, error } = await supabase.from('loyalty_cards').insert({ ...fields, user_id: userId }).select('id').single()
  if (error) return { error: `Loyalty insert failed: ${error.message}` }
  console.log(`💳 Loyalty card ${data.id} added for user ${userId}`)
  return { card_id: data.id, updated: false, program_name: program }
}
