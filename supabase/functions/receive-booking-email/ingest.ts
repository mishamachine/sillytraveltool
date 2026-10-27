// The work after an inbound email is authenticated and mapped to a user: parse it with the AI, match it to a
// trip by dates and distance (extending or joining trips that are one journey), and insert the booking.
// Shared by the Resend webhook (index.ts) so it can be exercised without a signed webhook.
import { geminiFetch } from '../_shared/gemini.ts'
import { quotaUnavailable, rememberQuota } from '../_shared/quota.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'
import { attachPlace, geocode, cached, setGoogleUser } from '../_shared/google.ts'
import { rankTrips, wallSpan, distanceKm, gapDays, routeKm, NEAR_KM, EDGE_DAYS } from '../_shared/tripMatch.js'
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
    await admin.from('trips').delete().eq('id', other.id)
    Object.assign(trip, await widenTrip(admin, trip.id, start, end) || { start_date: start, end_date: end })
    console.log(`🔗 Folded trip ${other.id} into ${trip.id}`)
    return other.id
  }
  return null
}

/**
 * An auto-made trip is named after the email that started it, which can be the flight home ("Trip to San Francisco").
 * When its destination is home (the profile's, else where the first leg leaves from), point it
 * at the longest hotel stay away from home, else where the first leg lands. A name the traveller typed is never changed.
 */
async function repointAutoTrip(admin: any, trip: any, home: Pt | null) {
  if (trip.destination_lat == null || !(await isAutoTrip(admin, trip))) return
  const { data: rows } = await admin.from('bookings')
    .select('type, transport_mode, departure_airport, arrival_airport, departure_time, hotel_name, hotel_address, check_in_date, check_out_date')
    .eq('trip_id', trip.id).limit(60)
  const legs = (rows || []).filter((b: any) => MOVES.has(b.type) && b.departure_time && b.arrival_airport && b.arrival_airport !== b.departure_airport)
    .sort((a: any, b: any) => String(a.departure_time).localeCompare(String(b.departure_time)))
  const pt = (g: any) => (g && g.lat != null ? { lat: Number(g.lat), lng: Number(g.lng) } : null)
  const dest = { lat: Number(trip.destination_lat), lng: Number(trip.destination_lng) }
  // No home city: the trip can't be "to" where its first leg leaves from, so that place is home
  if (!home && legs.length > 1) home = pt(await geo(admin, legPlace(legs[0], 'departure_airport')))
  if (!nearHome(dest, home)) return
  const nights = (b: any) => (Date.parse(b.check_out_date || b.check_in_date) - Date.parse(b.check_in_date)) / 864e5
  const hotels = (rows || []).filter((b: any) => b.type === 'hotel' && b.check_in_date && (b.hotel_address || b.hotel_name))
    .sort((a: any, b: any) => nights(b) - nights(a) || String(a.check_in_date).localeCompare(String(b.check_in_date)))
  const stays = [] as any[]
  for (const h of hotels) stays.push(await geo(admin, h.hotel_address || h.hotel_name))
  // A night booked at the destination means it's a real stop, not home
  if (stays.some(g => nearHome(pt(g), dest))) return
  let to: any = stays.find(g => g?.city && !nearHome(pt(g), home)) || null
  if (!to && legs.length) {
    const g = await geo(admin, legPlace(legs[0], 'arrival_airport'))
    if (g?.city && !nearHome(pt(g), home)) to = g
  }
  if (!to) return
  const next = {
    title: `Trip to ${to.city}`, destination_city: to.city, destination_country: to.country || '',
    destination_country_code: to.country_code || '', destination_lat: to.lat, destination_lng: to.lng,
    destination_tz: await resolveZone(admin, { lat: to.lat, lng: to.lng }) || trip.destination_tz,
  }
  await admin.from('trips').update(next).eq('id', trip.id)
  Object.assign(trip, next)
  console.log(`🏷️ Trip ${trip.id} renamed: ${next.title} (was home)`)
}

/**
 * A trip's dates only grow, in one statement (public.widen_trip), so emails filed at the same moment can't undo each
 * other's widening. Returns the trip's dates after the change, or null when the call failed.
 */
async function widenTrip(admin: any, tripId: string, start: string, end: string) {
  const { data, error } = await admin.rpc('widen_trip', { p_trip: tripId, p_start: start, p_end: end })
  if (error) { console.warn('widen_trip failed', error.message); return null }
  const row = Array.isArray(data) ? data[0] : data
  return row ? { start_date: row.start_date, end_date: row.end_date } : null
}

/**
 * One email per traveller at a time (public.take_ingest_lock): several confirmations forwarded together are filed in
 * turn, so they extend one trip instead of each starting their own. Waits up to a minute, then goes ahead anyway.
 */
// ── Who may mail an inbox (audit S4) ──
// The member's account email always; the addresses they added (inbox_allowed_senders); anyone only when they
// turned on inbox_accept_any (auto-forwarding rules keep the airline as the sender). Checked before any AI call.

export type InboxProfile = {
  id: string, home_city?: string | null,
  account_email?: string | null, // filled from auth.users when absent
  inbox_allowed_senders?: string[] | null, inbox_accept_any?: boolean | null,
}

/**
 * "Sam Rivera <Sam.Rivera+trips@GoogleMail.com>" → "samrivera@gmail.com": the address only (display name removed),
 * lowercased, plus-tag stripped, and for Gmail the dots too. Null when it isn't one plain address.
 */
export function normalizeAddress(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  const bracket = s.match(/<([^<>]*)>\s*$/)
  const addr = (bracket ? bracket[1] : s).trim().toLowerCase()
  const m = addr.match(/^([^\s@<>",;]+)@([a-z0-9.-]+\.[a-z]{2,})$/)
  if (!m) return null
  let [, local, domain] = m
  local = local.split('+')[0]
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return local ? `${local}@${domain}` : null
}

async function accountEmailOf(supabase: any, profile: InboxProfile): Promise<string | null> {
  if (profile.account_email !== undefined) return profile.account_email
  try {
    const { data } = await supabase.auth.admin.getUserById(profile.id)
    return data?.user?.email || null
  } catch { return null }
}

/** True when this inbox takes mail from `fromAddress`. */
export async function senderAllowed(supabase: any, profile: InboxProfile, fromAddress: string): Promise<boolean> {
  if (profile.inbox_accept_any === true) return true
  const from = normalizeAddress(fromAddress)
  if (!from) return false
  if ((profile.inbox_allowed_senders || []).some(a => normalizeAddress(a) === from)) return true
  return normalizeAddress(await accountEmailOf(supabase, profile)) === from
}

// AI reads (the email, each attachment) one inbox may use a day: its own budget, not the member's in-app AI quota
export const INBOX_DAILY_PARSES = 30

/**
 * One unit of today's inbox budget; false once it's spent (or AI is paused, or the project-wide cap is reached).
 * Fails closed like the AI quota: if the RPC errors, the last answer (under a minute old) stands, else refuse.
 */
async function inboxBudget(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('consume_inbox_quota', { p_user: userId, p_limit: INBOX_DAILY_PARSES })
    if (error) return quotaUnavailable('inbox', userId, `consume_inbox_quota: ${error.message}`.slice(0, 200))
    const ok = data !== false
    rememberQuota('inbox', userId, ok)
    return ok
  } catch (e) {
    return quotaUnavailable('inbox', userId, `consume_inbox_quota error: ${(e as Error).message}`)
  }
}

export async function ingestEmail(supabase: any, profile: InboxProfile, input: Parameters<typeof ingestOne>[2]): Promise<Response> {
  // Not from this member or someone they allowed: dropped without a word, nothing parsed, no body kept
  if (!(await senderAllowed(supabase, profile, input.fromAddress))) {
    const domain = normalizeAddress(input.fromAddress)?.split('@')[1] || 'unreadable'
    console.log(`🚫 Inbox of ${profile.id}: sender not allowed (${domain}), dropped`)
    try {
      await supabase.from('function_errors').insert({ fn: 'receive-booking-email', kind: 'inbox_rejected_sender', status: 403, user_id: profile.id, message: `sender domain ${domain}`.slice(0, 120) })
    } catch { /* logging is best-effort */ }
    return ok({ success: true, ignored: true, reason: 'sender' })
  }
  let locked = false
  for (let i = 0; i < 40 && !locked; i++) {
    const { data, error } = await supabase.rpc('take_ingest_lock', { p_user: profile.id, p_seconds: 90 })
    if (error) { console.warn('ingest lock unavailable', error.message); break }
    locked = data === true
    if (!locked) await new Promise(r => setTimeout(r, 1500))
  }
  try {
    return await ingestOne(supabase, profile, input)
  } finally {
    if (locked) await supabase.rpc('release_ingest_lock', { p_user: profile.id })
  }
}

async function ingestOne(
  supabase: any,
  profile: InboxProfile,
  { subject, fromAddress, bodyText, GEMINI_API_KEY, attachments = [], loadAttachments, emailId = null }: {
    subject: string, fromAddress: string, bodyText: string, GEMINI_API_KEY: string,
    attachments?: { name: string, mime: string, bytes: Uint8Array }[],
    // The webhook downloads files only once the sender is accepted
    loadAttachments?: () => Promise<{ name: string, mime: string, bytes: Uint8Array }[]>,
    emailId?: string | null,  // the Resend email id: stamped on every booking from this email (raw_email_id)
  },
): Promise<Response> {
  const userId = profile.id
  setGoogleUser(userId)

  if (!attachments.length && loadAttachments) attachments = await loadAttachments()
  if (!bodyText && !attachments.length) {
    console.warn('No email body or readable attachment')
    return ok({ success: true, ignored: true })
  }
  if (!(await inboxBudget(supabase, userId))) {
    console.warn(`Inbox budget spent for user ${userId}: inbound email not parsed`)
    return err('Daily inbox limit reached', 429)
  }

  // ── 4. Fetch user's trips for matching ────────────────────
  const TRIP_COLS = 'id, title, destination_city, destination_country, destination_country_code, destination_tz, destination_lat, destination_lng, start_date, end_date, status'
  const { data: trips } = await supabase
    .from('trips')
    .select(TRIP_COLS)
    .eq('owner_id', userId)
    .order('start_date', { ascending: true })

  // Trips the sender joined with edit rights: their own bookings belong there too. Marked `shared`, so this
  // function never moves, merges, renames or re-dates them (someone else owns them). Viewers and pending
  // invites don't count.
  const { data: joined } = await supabase
    .from('trip_collaborators')
    .select('trip_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .eq('role', 'collaborator')
  const sharedIds = [...new Set((joined || []).map((r: any) => r.trip_id))].filter(id => !(trips || []).some((t: any) => t.id === id))
  const { data: sharedTrips } = sharedIds.length
    ? await supabase.from('trips').select(TRIP_COLS).in('id', sharedIds)
    : { data: [] }

  const tripList: any[] = [...(trips || []), ...(sharedTrips || []).map((t: any) => ({ ...t, shared: true }))]

  // ── 4b. Attachments first: an itinerary PDF, a screenshot or a spreadsheet can hold a whole trip ──
  const fromFiles: any[] = []
  for (const a of attachments) {
    const sheet = await sheetToText(a.bytes, { name: a.name, mime: a.mime }).catch(() => null)
    if (sheet == null && !VISION_TYPES.test(a.mime)) continue
    if (fromFiles.length && !(await inboxBudget(supabase, userId))) break
    const read = await readItinerary(GEMINI_API_KEY, sheet != null
      ? { text: `Spreadsheet itinerary (${a.name}):\n${sheet}`.slice(0, 20000) }
      : { file: { mime: a.mime, data: toBase64(a.bytes) } })
    if (read.result?.bookings?.length) fromFiles.push(...read.result.bookings)
    else console.warn(`attachment ${a.name}: ${read.error || 'no bookings'}`)
  }
  if (fromFiles.length) {
    const results: any[] = []
    for (const parsed of fromFiles.slice(0, 40)) results.push(await fileBooking(supabase, profile, tripList, parsed, emailId))
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
"change_type": "new|change|cancellation",
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
"transport_mode": null,
"more_legs": []
}

Rules:
- A flight or train with connections (e.g. LIS -> JFK -> SFO): the FIRST leg goes in the main fields, and every later
  leg goes in "more_legs" in order, each an object with title ("JFK -> SFO"), flight_number, departure_airport,
  arrival_airport, departure_time, arrival_time, seat_number. Otherwise "more_legs" is [].
- email_kind: "loyalty" for a loyalty, frequent-flyer or hotel-rewards statement, welcome or membership email that has
  no new reservation in it; then fill "loyalty" (program_name e.g. "Iberia Plus", member_number as printed, tier e.g.
  "Gold", points_balance a whole number, points_as_of = statement date YYYY-MM-DD, expiry_date YYYY-MM-DD) and leave
  the booking fields null. "booking" for a reservation or ticket. "other" for anything else.
- change_type: "change" when the email updates an existing reservation (new date, time, room, seat, guests, schedule
  change), "cancellation" when it cancels one, else "new". Always give the booking details as they are NOW.
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
  // Connecting legs share the booking's reference, airline and traveller; each is filed as its own booking
  const more = (Array.isArray(parsed.more_legs) ? parsed.more_legs : []).filter((l: any) => l && typeof l === 'object').slice(0, 6)
  delete parsed.more_legs
  const shared = { type: parsed.type, confirmation_number: parsed.confirmation_number, airline: parsed.airline, transport_mode: parsed.transport_mode,
    passenger_name: parsed.passenger_name, flight_class: parsed.flight_class, change_type: parsed.change_type, currency: parsed.currency }
  const filed = await fileBooking(supabase, profile, tripList, parsed, emailId)
  if (filed.error || !more.length) return filed.error ? err(filed.error, filed.status || 500) : ok(filed)
  const legs = [filed]
  for (const l of more) {
    const leg = { ...shared, ...l, destination_city: l.destination_city || l.arrival_airport || null }
    leg.title = leg.title || [l.departure_airport, l.arrival_airport].filter(Boolean).join(' -> ')
    legs.push(await fileBooking(supabase, profile, tripList, leg, emailId))
  }
  return ok({ ...filed, legs: legs.map(r => ({ booking_id: r.booking_id, trip_id: r.trip_id, duplicate: r.duplicate, error: r.error })) })
}

/** Match one parsed booking to a trip (extend, fold or create one) and insert it. Updates `trips` in place. */
async function fileBooking(supabase: any, profile: { id: string, home_city?: string | null }, trips: any[], parsed: any, emailId: string | null = null): Promise<Record<string, any>> {
  const userId = profile.id
  setGoogleUser(userId)
  // ── 5b. The same confirmation forwarded again: keep the booking we already have ──
  // Hotels, tickets and tables only: an outbound and return flight share one confirmation number
  const tripIds = trips.map((t: any) => t.id)
  const tripOf = (id: string) => trips.find((t: any) => t.id === id)
  const same = await sameReservation(supabase, userId, tripIds, parsed, id => tripOf(id)?.destination_tz || null, id => !!tripOf(id)?.shared)
  if (same) return same
  delete parsed.change_type
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
      // Only the sender's own legs: two travellers on a shared trip can be on the same flight
      let q = supabase.from('bookings').select('id, trip_id').in('trip_id', tripIds).eq('created_by', userId).eq('departure_time', new Date(probe.departure_time).toISOString())
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
  // A shared trip must also be on the booking's route (overlapping dates alone isn't enough: the traveller may
  // have a trip of their own elsewhere). One that fits wins over the sender's own: that's where the group plans.
  const fits = rankTrips(candidates, item, { today }).filter((r: any) => r.score > 0 && (!r.trip.shared || r.km <= NEAR_KM))
  const match = fits.find((r: any) => r.trip.shared) || fits[0] || null
  let matchedTrip: any = match?.trip || null

  // Someone else's trip keeps its dates; a booking outside them still lands (the app offers to stretch them)
  if (matchedTrip && match?.widen && !matchedTrip.shared) {
    Object.assign(matchedTrip, await widenTrip(supabase, matchedTrip.id, match.widen.start_date, match.widen.end_date) || match.widen)
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
  if (matchedTrip?.start_date && !matchedTrip.shared && MOVES.has(parsed.type)) {
    foldedTripId = await foldNeighbour(supabase, matchedTrip, trips.filter((t: any) => t.id !== matchedTrip.id && !t.shared), ends, home)
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
  const sanitized = sanitizeBooking(parsed)

  // ── 8. Insert booking ─────────────────────────────────────
  // Free plan: 5 forwarded emails; later ones are saved locked until First Class (false while the limits switch is off)
  const { data: locked } = await supabase.rpc('email_import_locked', { p_user: userId })
  const bookingRow = {
    ...sanitized,
    trip_id: matchedTrip?.id || null,
    created_by: userId,
    source: 'email_import',
    is_shared: false,
    locked: !!locked,
    // One email = one import for the free-plan counter, however many legs it filed (set here, never from the AI's output)
    raw_email_id: emailId ? String(emailId).slice(0, 200) : null,
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
  if (matchedTrip && !matchedTrip.shared) await repointAutoTrip(supabase, matchedTrip, home).catch(e => console.warn('repointAutoTrip', e?.message || e))

  return {
    success: true,
    booking_id: booking.id,
    trip_id: matchedTrip?.id || null,
    trip_title: matchedTrip?.title || null,
    trip_fit: match?.fit || (matchedTrip ? 'created' : null),
    folded_trip_id: foldedTripId,
    booking_type: parsed.type,
    booking_title: parsed.title,
    locked: !!locked,
  }

}

// Only real bookings columns — a field the AI invents must not break the insert
function sanitizeBooking(parsed: Record<string, any>): Record<string, any> {
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
  return sanitized
}

// What makes a reservation itself (not just its paperwork): if one of these differs, the email changed it
const CHANGE_FIELDS = ['departure_time', 'arrival_time', 'departure_airport', 'arrival_airport', 'flight_number', 'check_in_date',
  'check_out_date', 'activity_date', 'activity_time', 'hotel_name', 'venue_name', 'room_type', 'party_size', 'ticket_quantity',
  'seat_number', 'flight_class', 'price']
const sameValue = (k: string, a: unknown, b: unknown) => {
  if (a == null || b == null || a === '' || b === '') return true // a detail missing from one email isn't a change
  if (k === 'departure_time' || k === 'arrival_time') return Date.parse(String(a)) === Date.parse(String(b))
  if (k === 'activity_time') return String(a).slice(0, 5) === String(b).slice(0, 5)
  if (k === 'price') return Math.abs(Number(a) - Number(b)) < 0.01
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}
const normRef = (v: unknown) => String(v ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()

/** The calendar day a stored instant falls on in the place it left from (UTC when no zone was stored). */
const localDay = (iso: string, tz: string | null) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) }
  catch { return d.toISOString().slice(0, 10) }
}

/**
 * Two legs under one confirmation number: the same leg only when it is the same service. Without a service number on
 * either side (ferry and bus e-tickets: one reference for out and back), the same origin and departure day must match
 * as well, or the return leg would overwrite the outbound one. `parsed` carries the day as printed (local).
 */
function sameLeg(stored: Record<string, any>, parsed: Record<string, any>): boolean {
  const a = normRef(stored.flight_number), b = normRef(parsed.flight_number)
  if (a && b) return a === b
  const from = normRef(parsed.departure_airport)
  const day = typeof parsed.departure_time === 'string' ? parsed.departure_time.slice(0, 10) : ''
  return !!from && !!day && normRef(stored.departure_airport) === from && !!stored.departure_time && localDay(stored.departure_time, stored.departure_tz || null) === day
}

/**
 * The same reservation forwarded again, changed or cancelled: same confirmation number and type (and, for a flight or
 * train, the same leg: see sameLeg; outbound and return legs share a confirmation number). Returns the action taken,
 * or null when it's a new reservation.
 */
async function sameReservation(supabase: any, userId: string, tripIds: string[], parsed: Record<string, any>, tripTzOf: (id: string) => string | null, isShared: (id: string) => boolean = () => false) {
  const ref = normRef(parsed.confirmation_number)
  if (!ref || !tripIds.length) return null
  const { data: rows } = await supabase.from('bookings').select('*').in('trip_id', tripIds).eq('created_by', userId).eq('type', parsed.type)
  const existing = (rows || []).find((b: any) => normRef(b.confirmation_number) === ref && (!MOVES.has(parsed.type) || sameLeg(b, parsed)))
  if (!existing) return null

  // A cancellation email never cancels or renames the booking (an email can be forged or wrong): it is noted,
  // and the app shows the note so the traveller checks with the provider
  if (parsed.change_type === 'cancellation') {
    const now = new Date().toISOString()
    const note = `Cancellation email received on ${now.slice(0, 10)}`
    const notes = (existing.notes || '').includes(note) ? existing.notes : [existing.notes, note].filter(Boolean).join('\n')
    await supabase.from('bookings').update({ cancellation_received_at: now, notes }).eq('id', existing.id)
    console.log(`📮 Booking ${existing.id}: cancellation email noted for user ${userId}`)
    return { success: true, cancellation_noted: true, booking_id: existing.id, trip_id: existing.trip_id }
  }

  // Compare in the same terms as the saved row: local times turned into instants in each place's zone
  const next = { ...parsed }
  await attachZones(supabase, next, { fallbackTz: existing.local_tz || existing.departure_tz || tripTzOf(existing.trip_id), city: parsed.destination_city || '' })
  const clean = sanitizeBooking(next)
  const changed = CHANGE_FIELDS.filter(k => !sameValue(k, existing[k], clean[k]))
  if (!changed.length) {
    console.log(`↩️ Same reservation again for user ${userId}: booking ${existing.id}`)
    return { success: true, duplicate: true, booking_id: existing.id, trip_id: existing.trip_id }
  }

  // Changed: update the booking in place, never a second copy; the trip stretches to fit if needed
  const updates: Record<string, any> = {}
  for (const [k, v] of Object.entries(clean)) if (v != null && k !== 'title' && k !== 'confirmation_number') updates[k] = v
  updates.notes = [existing.notes, `Updated by email on ${new Date().toISOString().slice(0, 10)}: ${changed.join(', ').replace(/_/g, ' ')}`].filter(Boolean).join('\n')
  const { error } = await supabase.from('bookings').update(updates).eq('id', existing.id)
  if (error) return { error: `Booking update failed: ${error.message}`, status: 500 }
  const span = wallSpan(parsed)
  if (span && existing.trip_id && !isShared(existing.trip_id)) await widenTrip(supabase, existing.trip_id, span.start, span.end)
  console.log(`✏️ Booking ${existing.id} updated for user ${userId}: ${changed.join(', ')}`)
  return { success: true, updated: true, changed, booking_id: existing.id, trip_id: existing.trip_id }
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
