// The work after an inbound email is authenticated and mapped to a user: parse it with the AI, match it to a
// trip by dates and distance (extending or joining trips that are one journey), and insert the booking.
// Shared by the Resend webhook (index.ts) so it can be exercised without a signed webhook.
import { consentCurrent } from '../_shared/consent.ts'
import { geminiFetch, checkAiQuota } from '../_shared/gemini.ts'
import { quotaUnavailable, rememberQuota } from '../_shared/quota.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'
import { attachPlace, geocode, cached, setGoogleUser } from '../_shared/google.ts'
import { rankTrips, wallSpan, distanceKm, gapDays, routeKm, NEAR_KM, EDGE_DAYS } from '../_shared/tripMatch.js'
import { airportCity, cityName, iataOf } from '../_shared/airportCities.js'
import { bookingEmailPrompt, normalizeEmailParse, travelerSummary, scrubNotes, legTitle } from '../_shared/emailParse.js'
import { prepareEmailText, looksLikeBooking } from '../_shared/emailText.js'
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
type Pt = { lat: number, lng: number, city?: string | null, country?: string | null, country_code?: string | null }
// A flight or train home this many days after a trip's last booking still ends that trip; one email's bookings this
// far apart are separate trips
const HOME_DAYS = 30
// Landing and leaving the same airport or station within this many hours is a connection, not a stop
const CONNECT_HOURS = 12

const regionName = (cc: string | null) => {
  try { return cc ? new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || null : null } catch { return null }
}

/**
 * Coordinates for a place name (airport, station, city), cached 30 days. An airport code ("MAD", "MAD airport") comes
 * from the airport table, never a geocoder: a bare "MAD" geocodes to Mád in Hungary ("Trip to Mád").
 */
async function geo(admin: any, q: unknown) {
  const s = String(q ?? '').trim()
  if (!s) return null
  const a = airportCity(s)
  if (a) return { lat: a.lat, lng: a.lng, city: a.city, country: regionName(a.country_code), country_code: a.country_code, address: s }
  const query = /^[A-Z]{3}$/.test(s) ? `${s} airport` : s
  return await cached(admin, `geo:${query.toLowerCase().slice(0, 200)}`, 30, () => geocode(query)).catch(() => null)
}
/** What to look up for one end of a leg: the airport (by code when known), else the station or port, with its city. */
const legPlace = (b: any, side: 'departure_airport' | 'arrival_airport') => {
  const v = b[side]
  if (!v) return null
  const base = b.type === 'flight' && !airportCity(v) ? `${iataOf(v) || v} airport` : String(v)
  if (airportCity(base)) return base
  const city = cityName(side === 'departure_airport' ? b.departure_city : b.arrival_city)
  return city && !base.toLowerCase().includes(city.toLowerCase()) ? `${base}, ${city}` : base
}

/** Where a booking happens: both ends of a flight or train, else the venue (or its city). Points carry the city. */
async function bookingPoints(admin: any, b: any): Promise<{ dep: Pt | null, arr: Pt | null, at: Pt | null }> {
  const pick = (g: any): Pt | null => (g && g.lat != null ? { lat: Number(g.lat), lng: Number(g.lng), city: g.city || null, country: g.country || null, country_code: g.country_code || null } : null)
  if (MOVES.has(b.type)) {
    const [dep, arr] = await Promise.all([geo(admin, legPlace(b, 'departure_airport')), geo(admin, legPlace(b, 'arrival_airport'))])
    return { dep: pick(dep), arr: pick(arr), at: null }
  }
  if (b.place_lat != null && b.place_lng != null) return { dep: null, arr: null, at: { lat: Number(b.place_lat), lng: Number(b.place_lng) } }
  return { dep: null, arr: null, at: pick(await geo(admin, cityName(b.destination_city) || b.hotel_address || b.venue_address)) }
}

const nearHome = (p: Pt | null, home: Pt | null) => !!(p && home && distanceKm(p, home) <= NEAR_KM)

/**
 * Points of a trip a booking can match: its destination plus where its bookings are (home left out). Also its legs in
 * order (trip.legs), where the first one leaves from (trip.origin) and how many bookings aren't legs (trip.stays).
 */
async function loadTripPoints(admin: any, trip: any, home: Pt | null) {
  if (trip.destination_lat == null && trip.destination_city) {
    const g = await geo(admin, [trip.destination_city, trip.destination_country].filter(Boolean).join(', '))
    if (g) {
      trip.destination_lat = g.lat; trip.destination_lng = g.lng
      await admin.from('trips').update({ destination_lat: g.lat, destination_lng: g.lng }).eq('id', trip.id)
    }
  }
  const { data: rows } = await admin.from('bookings')
    .select('type, place_lat, place_lng, departure_airport, arrival_airport, departure_time, arrival_time')
    .eq('trip_id', trip.id).limit(40)
  const pts: Pt[] = [], legs: { dep: Pt | null, arr: Pt | null, at: string, until: string }[] = []
  let stays = 0
  for (const r of rows || []) {
    const p = await bookingPoints(admin, r)
    for (const x of [p.dep, p.arr, p.at]) if (x && !nearHome(x, home)) pts.push(x)
    if (MOVES.has(r.type)) legs.push({ dep: p.dep, arr: p.arr, at: String(r.departure_time || ''), until: String(r.arrival_time || r.departure_time || '') })
    else stays++
  }
  legs.sort((a, b) => a.at.localeCompare(b.at))
  // Connections (stored as instants here) are not places the trip goes
  const transit = new Set<Pt>()
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i], b = legs[i + 1], wait = (Date.parse(b.at) - Date.parse(a.until)) / 36e5
    if (a.arr && b.dep && distanceKm(a.arr, b.dep) <= NEAR_KM && wait >= 0 && wait < CONNECT_HOURS) { transit.add(a.arr); transit.add(b.dep) }
  }
  const kept = pts.filter(x => !transit.has(x))
  trip.points = kept.length ? kept : pts; trip.legs = legs; trip.origin = legs[0]?.dep || null; trip.stays = stays
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
 * Fold an auto-made neighbour into `trip` when they are one journey: a flight or train of `trip` leaves one and lands at
 * the other within EDGE_DAYS, or the neighbour is only the way home (legs from this trip's route back to where it
 * started, or to home) within HOME_DAYS after it. Either email can arrive first. Returns the id folded in, or null.
 * `trip` must have fresh points (loadTripPoints after its bookings were added).
 */
async function foldNeighbour(admin: any, trip: any, trips: any[], ends: { dep: Pt | null, arr: Pt | null }, home: Pt | null) {
  for (const other of trips) {
    if (other.id === trip.id || other.shared || other.status === 'cancelled' || !other.start_date || !trip.start_date) continue
    const gap = gapDays(other, { start: trip.start_date, end: trip.end_date })
    if (gap > HOME_DAYS) continue
    if (!other.points) await loadTripPoints(admin, other, home)
    const touches = [ends.dep, ends.arr].some(p => p && !nearHome(p, home) && routeKm(other, { points: [p] }) <= NEAR_KM)
    const wayHome = other.start_date >= trip.start_date && !other.stays && other.legs?.length > 0 &&
      other.legs.every((l: any) => l.arr && (nearHome(l.arr, home) || (trip.origin && distanceKm(l.arr, trip.origin) <= NEAR_KM))) &&
      other.legs.some((l: any) => l.dep && !nearHome(l.dep, home) && !(trip.origin && distanceKm(l.dep, trip.origin) <= NEAR_KM) && routeKm(trip, { points: [l.dep] }) <= NEAR_KM)
    if (!(wayHome || (gap <= EDGE_DAYS && touches)) || !(await isAutoTrip(admin, other))) continue
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
  ai_consent_at?: string | null, ai_consent_version?: string | null, ai_consent_routing?: string | null, // undefined before migration 20261026120000_ai_consent: read as given
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
// Forwarded emails kept waiting for the yes to AI reading, per member
export const MAX_HELD = 50

/**
 * One unit of today's inbox budget; false once it's spent (or AI is paused, or the project-wide cap is reached).
 * Fails closed like the AI quota: if the RPC errors, the last answer (under a minute old) stands, else refuse.
 */
async function inboxBudget(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('consume_inbox_quota', { p_user: userId, p_limit: INBOX_DAILY_PARSES })
    // Before migration 20261026090000_inbox_trust the RPC doesn't exist: the member's AI quota, as the inbox always used
    if (error && (error.code === 'PGRST202' || error.code === '42883')) return await checkAiQuota(userId)
    if (error) return quotaUnavailable('inbox', userId, `consume_inbox_quota: ${error.message}`.slice(0, 200))
    const ok = data !== false
    rememberQuota('inbox', userId, ok)
    return ok
  } catch (e) {
    return quotaUnavailable('inbox', userId, `consume_inbox_quota error: ${(e as Error).message}`)
  }
}

/**
 * Server-side switches (app_settings key 'inbox', value { sender_check, consent_hold }), both OFF when the row or a key
 * is absent, which is how the inbox has always worked live: any sender, read on arrival. consent_hold ON holds emails
 * until the member allows AI reading (needs app builds that can ask); sender_check ON drops mail from anyone but the
 * member and their allowed senders. Read once per email; a read error counts as OFF.
 */
export async function inboxSwitches(supabase: any): Promise<{ sender_check: boolean, consent_hold: boolean }> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'inbox').maybeSingle()
    const v = data?.value || {}
    return { sender_check: v.sender_check === true, consent_hold: v.consent_hold === true }
  } catch { return { sender_check: false, consent_hold: false } }
}

export async function ingestEmail(supabase: any, profile: InboxProfile, input: Parameters<typeof ingestOne>[2]): Promise<Response> {
  const switches = await inboxSwitches(supabase)
  // Sender check on, and not from this member or someone they allowed: dropped without a word, nothing parsed, no body kept
  if (switches.sender_check && !(await senderAllowed(supabase, profile, input.fromAddress))) {
    const domain = normalizeAddress(input.fromAddress)?.split('@')[1] || 'unreadable'
    console.log(`🚫 Inbox of ${profile.id}: sender not allowed (${domain}), dropped`)
    try {
      await supabase.from('function_errors').insert({ fn: 'receive-booking-email', kind: 'inbox_rejected_sender', status: 403, user_id: profile.id, message: `sender domain ${domain}`.slice(0, 120) })
    } catch { /* logging is best-effort */ }
    return ok({ success: true, ignored: true, reason: 'sender' })
  }
  // No yes to AI reading yet (Apple 5.1.2(i)): keep only the Resend id, sender domain and subject; inbox-release
  // fetches and files it once the member allows it in the app
  // (a yes to older wording or routing counts as no; a profile without the column at all is read as given)
  if (switches.consent_hold && profile.ai_consent_at !== undefined && !consentCurrent(profile) && !input.released) {
    if (!input.emailId) return ok({ success: true, ignored: true, reason: 'consent' })
    // At most MAX_HELD waiting per member; beyond that the email is dropped (they can forward it again after allowing)
    const { count } = await supabase.from('held_inbox_emails').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)
    if ((count || 0) >= MAX_HELD) {
      try {
        await supabase.from('function_errors').insert({ fn: 'receive-booking-email', kind: 'inbox_hold_cap', status: 200, user_id: profile.id, message: `held emails at cap (${MAX_HELD}), dropped one` })
      } catch { /* logging is best-effort */ }
      return ok({ success: true, ignored: true, reason: 'held_full' })
    }
    const { error } = await supabase.from('held_inbox_emails').upsert({
      user_id: profile.id, email_id: String(input.emailId).slice(0, 200),
      from_domain: normalizeAddress(input.fromAddress)?.split('@')[1]?.slice(0, 120) || null,
      subject: String(input.subject || '').slice(0, 200) || null,
    }, { onConflict: 'user_id,email_id', ignoreDuplicates: true })
    if (error) {
      // Not held: say so (Resend retries on an error answer) and leave a trace
      console.error('hold email failed', error.message)
      try {
        await supabase.from('function_errors').insert({ fn: 'receive-booking-email', kind: 'inbox_hold_failed', status: 500, user_id: profile.id, message: String(error.message || 'hold failed').slice(0, 280) })
      } catch { /* logging is best-effort */ }
      return err('Could not hold the email', 500)
    }
    console.log(`⏸️ Inbox of ${profile.id}: held until AI reading is allowed`)
    return ok({ success: true, held: true })
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
  { subject, fromAddress, bodyText, GEMINI_API_KEY, attachments = [], loadAttachments, emailId = null, receivedAt = null }: {
    subject: string, fromAddress: string, bodyText: string, GEMINI_API_KEY: string,
    attachments?: { name: string, mime: string, bytes: Uint8Array }[],
    // The webhook downloads files only once the sender is accepted
    loadAttachments?: () => Promise<{ name: string, mime: string, bytes: Uint8Array }[]>,
    emailId?: string | null,  // the Resend email id: stamped on every booking from this email (raw_email_id)
    released?: boolean,       // filed by inbox-release after the member allowed AI reading (skips the hold)
    receivedAt?: string | null, // when the email arrived: "tomorrow" and dates without a year are read against it
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

  // ── 4b. The email's text for the AI, losslessly cleaned (light markdown, no styles, images or tracking strings);
  // nothing cut by content, only a safety cap (emailText.js) ──
  const body = prepareEmailText(bodyText)
  if (body.capped) console.log(`✂️ Email text over the cap: ${body.before} characters, ${body.after} sent`)

  // ── 4c. Attachments: an itinerary PDF, a screenshot or a spreadsheet can hold a whole trip ──
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
  const fileItems = (who: { passenger_name: string | null, party_size: number | null }) =>
    fromFiles.slice(0, 40).map((b: any) => prepareBooking(b, who, null))
  const fileOnly = async (extra: Record<string, any> = {}) => {
    const results = await fileEmail(supabase, profile, tripList, fileItems({ passenger_name: null, party_size: null }), emailId)
    const saved = results.filter(r => r.booking_id && !r.duplicate).length
    console.log(`📎 ${saved} of ${results.length} bookings from attachments for user ${userId}`)
    return ok({ success: true, from_attachments: true, count: saved, bookings: results, trip_ids: [...new Set(results.map(r => r.trip_id).filter(Boolean))], ...extra })
  }
  // The body is read with the files and both are filed together, so neither hides the other; a short note that only
  // points at the files ("my ticket is attached", no date or time) isn't worth an AI call
  if (fromFiles.length && body.text.length < 300 && !looksLikeBooking(body.text)) return await fileOnly()
  if (fromFiles.length && !(await inboxBudget(supabase, userId))) return await fileOnly()

  // ── 5. Read the email with the AI: every booking in it, every traveller (prompt and answer shape: _shared/emailParse.js) ──
  const prompt = bookingEmailPrompt({ subject, from: fromAddress, body: body.text, receivedAt })
  const gemRes = await geminiFetch(GEMINI_API_KEY, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 8000 },
  }, { timeoutMs: 30000 })

  if (!gemRes.ok) {
    const gemErr = await gemRes.text()
    console.error('Gemini error:', gemErr)
    if (fromFiles.length) return await fileOnly()
    return err('Gemini parse failed', 502)
  }

  const gemData = await gemRes.json()
  const gemText = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  let email: ReturnType<typeof normalizeEmailParse> = null
  try {
    const cleaned = gemText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    email = normalizeEmailParse(JSON.parse(cleaned))
  } catch { /* below */ }
  if (!email) {
    console.error('JSON parse failed:', gemText.slice(0, 300))
    if (fromFiles.length) return await fileOnly()
    return err('Could not parse Gemini response as JSON', 502)
  }

  // A loyalty statement or membership email: each program's card into the member's own Loyalty wallet, not a booking
  if (email.email_kind === 'loyalty' && email.loyalty.length) {
    const cards: Record<string, any>[] = []
    for (const l of email.loyalty) cards.push(await fileLoyalty(supabase, userId, l))
    const bad = cards.find(r => r.error)
    if (fromFiles.length) return await fileOnly({ cards })
    return bad ? err(bad.error, 500) : ok({ success: true, loyalty: true, ...cards[0], cards })
  }
  // Not a booking (newsletter, offer, flight-status marketing, insurance or payment receipt): nothing to file
  if (!email.bookings.length || email.email_kind === 'other' || email.email_kind === 'loyalty') {
    if (fromFiles.length) return await fileOnly()
    console.log(`📭 Not a booking or loyalty email for user ${userId}: ignored`)
    return ok({ success: true, ignored: true })
  }
  const who = travelerSummary(email.travelers)
  const items = email.bookings.map(b => prepareBooking(b, who, email))
  // The files' bookings the body doesn't already hold (same reference and type on the same day, or the same service)
  const dayOf = (b: any) => String(b.departure_time || b.check_in_date || b.activity_date || '').slice(0, 10)
  const sameItem = (a: any, b: any) => a.type === b.type && dayOf(a) === dayOf(b) &&
    ((a.flight_number && b.flight_number && normRef(a.flight_number) === normRef(b.flight_number)) ||
     (a.confirmation_number && normRef(a.confirmation_number) === normRef(b.confirmation_number)))
  for (const f of fileItems(who)) if (!items.some(b => sameItem(b, f))) items.push(f)
  const results = await fileEmail(supabase, profile, tripList, items, emailId)
  // The first booking's answer at the top (as before), every booking under legs when there are several
  const first = results.find(r => !r.ignored) || results[0]
  if (results.length === 1 || !first || first.error) return first?.error ? err(first.error, first.status || 500) : ok(first)
  return ok({ ...first, count: results.filter(r => r.booking_id && !r.duplicate).length,
    legs: results.map(r => ({ booking_id: r.booking_id, trip_id: r.trip_id, booking_type: r.booking_type, duplicate: r.duplicate, updated: r.updated, cancellation_noted: r.cancellation_noted, ignored: r.ignored, error: r.error })) })
}

/**
 * One booking from the AI made ready to file: the travellers on it (names and adult/child/infant only, as one line,
 * plus the head count), notes without identity or contact lines, the city as its English name (never a code), and a
 * note when the email's dates were unclear.
 */
function prepareBooking(b: Record<string, any>, who: { passenger_name: string | null, party_size: number | null }, email: { unclear?: string | null } | null) {
  const p: Record<string, any> = { ...b }
  const own = typeof p.passenger_name === 'string' && !/[\d@]/.test(p.passenger_name) ? p.passenger_name.trim().slice(0, 200) : null
  p.passenger_name = own || who.passenger_name
  if (p.type !== 'restaurant' && p.party_size == null && who.party_size) p.party_size = who.party_size
  p.notes = scrubNotes(p.notes)
  if (email?.unclear) p.notes = [p.notes, `Check the date: ${email.unclear}`].filter(Boolean).join('\n')
  p.destination_city = cityName(p.destination_city) || cityName(p.arrival_city) || airportCity(p.arrival_airport)?.city || null
  return p
}

/**
 * File every booking of one email (or one attachment set): each one already saved is kept, changed or noted; the rest
 * go to one trip per group of dates (a package or a round trip is one trip), found or made once for the whole group.
 * Returns one result per booking, in order. Updates `trips` in place.
 */
async function fileEmail(supabase: any, profile: { id: string, home_city?: string | null }, trips: any[], items: any[], emailId: string | null): Promise<Record<string, any>[]> {
  const userId = profile.id
  setGoogleUser(userId)
  const tripIds = trips.map((t: any) => t.id)
  const tripOf = (id: string) => trips.find((t: any) => t.id === id)
  const results: Record<string, any>[] = []
  const fresh: { parsed: any, slot: number, span?: any, ends?: any }[] = []
  for (const parsed of items) {
    // ── 5b. The same reservation forwarded again, changed or cancelled ──
    const siblings = items.filter(x => x.type === parsed.type).length
    const same = await sameReservation(supabase, userId, tripIds, parsed, id => tripOf(id)?.destination_tz || null, id => !!tripOf(id)?.shared, siblings)
    if (same) { results.push(same); continue }
    // A cancellation, change or "still confirmed" mention of something never filed: never filed as a new booking
    // (a change email carries only part of the details)
    if (parsed.change_type === 'unchanged' || parsed.change_type === 'change' && !parsed.departure_time && !parsed.check_in_date && !parsed.activity_date) { results.push({ success: true, ignored: true, reason: 'not_filed_yet', booking_type: parsed.type }); continue }
    if (parsed.change_type === 'cancellation') { results.push({ success: true, ignored: true, reason: 'cancellation_unmatched', booking_type: parsed.type }); continue }
    delete parsed.change_type; delete parsed.changed
    const dupe = await alreadySaved(supabase, userId, tripIds, parsed)
    if (dupe) { results.push(dupe); continue }
    fresh.push({ parsed, slot: results.push({}) - 1 })
  }
  if (!fresh.length) return results

  const homeGeo = profile.home_city ? await geo(supabase, profile.home_city) : null
  const home = homeGeo ? { lat: homeGeo.lat, lng: homeGeo.lng } : null
  for (const f of fresh) {
    f.span = wallSpan(f.parsed) // dates as printed (local), before zones turn them into instants
    await attachPlace(supabase, f.parsed, f.parsed.destination_city || '')
    f.ends = await bookingPoints(supabase, f.parsed)
    f.parsed.title = legTitle(f.parsed, f.ends.arr?.city) || f.parsed.title
  }
  for (const group of dateGroups(fresh)) {
    const { trip, fit } = await placeGroup(supabase, profile, trips, group, home)
    for (const f of group) results[f.slot] = await insertBooking(supabase, userId, trip, f.parsed, emailId, fit)
    if (!trip || trip.shared) continue
    // A flight or train that joins this trip to another emailed one: they're one journey
    await loadTripPoints(supabase, trip, home)
    for (const f of group.filter(g => MOVES.has(g.parsed.type))) {
      const folded = await foldNeighbour(supabase, trip, trips.filter((t: any) => t.id !== trip.id && !t.shared), f.ends, home)
      if (!folded) continue
      trips.splice(trips.findIndex((t: any) => t.id === folded), 1)
      for (const f2 of group) results[f2.slot].folded_trip_id = folded
      await loadTripPoints(supabase, trip, home)
    }
    await repointAutoTrip(supabase, trip, home).catch(e => console.warn('repointAutoTrip', e?.message || e))
    for (const f of group) if (results[f.slot].trip_id === trip.id) results[f.slot].trip_title = trip.title
  }
  return results
}

/** Bookings of one email in date order, split where HOME_DAYS or more pass between them; undated ones join the first group. */
function dateGroups<T extends { span?: any }>(items: T[]): T[][] {
  const dated = items.filter(f => f.span).sort((a, b) => a.span.start.localeCompare(b.span.start))
  const groups: T[][] = []
  let end = ''
  for (const f of dated) {
    if (!groups.length || gapDays({ start_date: f.span.start, end_date: f.span.end }, { start: end, end }) > HOME_DAYS) groups.push([])
    groups[groups.length - 1].push(f)
    if (f.span.end > end) end = f.span.end
  }
  const undated = items.filter(f => !f.span)
  if (undated.length) (groups[0] ||= []).push(...undated)
  return groups
}

/** The same booking already saved under another email: a hotel, ticket or table on the same day, or a leg already filed. */
async function alreadySaved(supabase: any, userId: string, tripIds: string[], parsed: any) {
  if (tripIds.length && parsed.title && !parsed.departure_time) {
    const dateKeys: [string, unknown][] = [['check_in_date', parsed.check_in_date], ['activity_date', parsed.activity_date]]
    let q = supabase.from('bookings').select('id, trip_id').in('trip_id', tripIds).eq('created_by', userId).eq('type', parsed.type)
    q = parsed.confirmation_number ? q.eq('confirmation_number', String(parsed.confirmation_number)) : q.eq('title', String(parsed.title))
    for (const [k, v] of dateKeys) q = v ? q.eq(k, String(v)) : q.is(k, null)
    q = q.is('departure_time', null)
    const { data: dupes } = await q.limit(1)
    if (dupes?.[0]) {
      console.log(`↩️ Duplicate email for user ${userId}: booking ${dupes[0].id} already exists`)
      return { success: true, duplicate: true, booking_id: dupes[0].id, trip_id: dupes[0].trip_id, booking_type: parsed.type }
    }
  }
  // A flight or train already saved (same service, same departure): the times need their zones to compare with
  // stored instants, so probe a copy
  if (MOVES.has(parsed.type) && parsed.departure_time && (parsed.flight_number || parsed.confirmation_number) && tripIds.length) {
    const probe = await attachZones(supabase, { ...parsed }, { city: parsed.destination_city || '' })
    if (probe.departure_time && probe.departure_tz) {
      // Only the sender's own legs: two travellers on a shared trip can be on the same flight
      let q = supabase.from('bookings').select('id, trip_id').in('trip_id', tripIds).eq('created_by', userId).eq('departure_time', new Date(probe.departure_time).toISOString())
      q = parsed.flight_number ? q.eq('flight_number', String(parsed.flight_number)) : q.eq('confirmation_number', String(parsed.confirmation_number))
      const { data: dupes } = await q.limit(1)
      if (dupes?.[0]) {
        console.log(`↩️ Duplicate leg for user ${userId}: booking ${dupes[0].id} already exists`)
        return { success: true, duplicate: true, booking_id: dupes[0].id, trip_id: dupes[0].trip_id, booking_type: parsed.type }
      }
    }
  }
  return null
}

/**
 * ── 6. The trip for a group of bookings from one email, in this order ──
 *   1. a trip that already holds a booking with the same reference (the rest of a package, the other half of a round trip);
 *   2. dates and distance (tripMatch.js: overlapping dates in another region don't count);
 *   3. the way home: legs that leave from a trip's route and land where it started (or at home), up to HOME_DAYS after;
 *   4. a new trip, named after where the group goes (longest stay, the turnaround of a round trip, else the last arrival).
 */
async function placeGroup(supabase: any, profile: { id: string }, trips: any[], group: any[], home: Pt | null): Promise<{ trip: any, fit: string | null }> {
  const userId = profile.id
  const dated = group.filter(f => f.span)
  const span = dated.length ? { start: dated.map(f => f.span.start).sort()[0], end: dated.map(f => f.span.end).sort().slice(-1)[0] } : null
  // A connection (landing and leaving the same place within CONNECT_HOURS) is not somewhere the trip goes: a change of
  // planes in Frankfurt must not pull a Chicago-Mumbai trip into a Zürich trip on the same dates
  const legs = group.filter(f => MOVES.has(f.parsed.type) && f.parsed.departure_time).sort((a, b) => String(a.parsed.departure_time).localeCompare(String(b.parsed.departure_time)))
  const transit = new Set<Pt>()
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i], b = legs[i + 1]
    const wait = (Date.parse(b.parsed.departure_time) - Date.parse(a.parsed.arrival_time || a.parsed.departure_time)) / 36e5
    if (a.ends.arr && b.ends.dep && distanceKm(a.ends.arr, b.ends.dep) <= NEAR_KM && wait >= 0 && wait < CONNECT_HOURS) { transit.add(a.ends.arr); transit.add(b.ends.dep) }
  }
  const stops = group.flatMap(f => [f.ends.dep, f.ends.arr, f.ends.at]).filter(Boolean) as Pt[]
  const all = stops.some(p => !transit.has(p)) ? stops.filter(p => !transit.has(p)) : stops
  const away = all.filter(p => !nearHome(p, home))
  const item = { start: span?.start || null, end: span?.end || null, points: away.length ? away : all }
  const live = trips.filter((t: any) => t.status !== 'cancelled')
  const widen = async (t: any) => {
    if (t.shared || !item.start) return
    const s = !t.start_date || item.start < t.start_date ? item.start : t.start_date
    const e = !t.end_date || item.end! > t.end_date ? item.end! : t.end_date
    if (s !== t.start_date || e !== t.end_date) Object.assign(t, await widenTrip(supabase, t.id, s, e) || { start_date: s, end_date: e })
  }

  // 1. Same reference
  const refs = [...new Set(group.map(f => f.parsed.confirmation_number).filter(Boolean).map(String))]
  if (refs.length && live.length) {
    const { data } = await supabase.from('bookings').select('trip_id').in('trip_id', live.map((t: any) => t.id)).eq('created_by', userId).in('confirmation_number', refs).limit(10)
    const t = (data || []).map((r: any) => live.find((x: any) => x.id === r.trip_id))
      .find((x: any) => x && (!item.start || !x.start_date || gapDays(x, item) <= HOME_DAYS))
    if (t) { await widen(t); return { trip: t, fit: 'reference' } }
  }

  // 2. Dates and distance
  const near = live.filter((t: any) => !t.start_date || !item.start || gapDays(t, item) <= HOME_DAYS)
  for (const t of near) await loadTripPoints(supabase, t, home)
  const candidates = near.filter((t: any) => !t.start_date || !item.start || gapDays(t, item) <= EDGE_DAYS)
  // A shared trip must also be on the booking's route (overlapping dates alone isn't enough: the traveller may
  // have a trip of their own elsewhere). One that fits wins over the sender's own: that's where the group plans.
  const fits = rankTrips(candidates, item, { today: new Date().toISOString().slice(0, 10) }).filter((r: any) => r.score > 0 && (!r.trip.shared || r.km <= NEAR_KM))
  const match = fits.find((r: any) => r.trip.shared) || fits[0] || null
  if (match) {
    // Someone else's trip keeps its dates; a booking outside them still lands (the app offers to stretch them)
    if (match.widen && !match.trip.shared) {
      Object.assign(match.trip, await widenTrip(supabase, match.trip.id, match.widen.start_date, match.widen.end_date) || match.widen)
      console.log(`📅 Trip ${match.trip.id} now ${match.widen.start_date} → ${match.widen.end_date} (${match.fit})`)
    }
    return { trip: match.trip, fit: match.fit }
  }

  // 3. The way home
  const moves = group.filter(f => MOVES.has(f.parsed.type)).sort((a, b) => String(a.parsed.departure_time).localeCompare(String(b.parsed.departure_time)))
  if (item.start && moves.length && moves.length === group.length) {
    const from = moves[0].ends.dep, to = moves[moves.length - 1].ends.arr
    const trip = near.filter((t: any) => !t.shared && t.start_date && t.start_date <= item.start! &&
      // leaves from somewhere on the trip other than where it started (a whole new round trip from home is not a way home)
      from && routeKm(t, { points: [from] }) <= NEAR_KM && !(t.origin && distanceKm(from, t.origin) <= NEAR_KM) && !nearHome(from, home) &&
      to && (nearHome(to, home) || (t.origin && distanceKm(to, t.origin) <= NEAR_KM)))
      .sort((a: any, b: any) => gapDays(a, item) - gapDays(b, item))[0]
    if (trip) { await widen(trip); return { trip, fit: 'homeward' } }
  }

  // 4. A new trip
  const to = await destinationOf(supabase, group, home)
  const tripCity = to?.city || cityName(group[0].parsed.destination_city)
  if (!tripCity) return { trip: null, fit: null }
  // No date in the email: an undated trip ("Dates to be decided"), never today's date
  const { data: newTrip, error: tripErr } = await supabase.from('trips').insert({
    owner_id: userId,
    title: `Trip to ${tripCity}`,
    destination_city: tripCity,
    destination_country: to?.country || regionName(to?.country_code || null) || '',
    destination_country_code: to?.country_code || '',
    destination_lat: to?.lat ?? null,
    destination_lng: to?.lng ?? null,
    start_date: item.start,
    end_date: item.end,
    status: 'planning',
    destination_tz: await resolveZone(supabase, to ? { lat: to.lat, lng: to.lng } : { query: tripCity }),
  }).select().single()
  if (tripErr || !newTrip) {
    console.error(`❌ Trip auto-create failed for user ${userId}:`, tripErr?.message, tripErr?.code, tripErr?.details)
    return { trip: null, fit: null }
  }
  trips.push(newTrip)
  console.log(`🆕 Created new trip for user ${userId}: ${newTrip.id} → ${tripCity}`)
  return { trip: newTrip, fit: 'created' }
}

/** Where a new trip goes: the longest hotel stay away from home, the turnaround of a round trip, the last arrival
 * away from home, else (a flight home) where it leaves from; for anything else its city or address. */
async function destinationOf(supabase: any, group: any[], home: Pt | null): Promise<Pt | null> {
  const nights = (b: any) => (Date.parse(b.check_out_date || b.check_in_date) - Date.parse(b.check_in_date)) / 864e5 || 0
  const placeOf = async (f: any): Promise<Pt | null> => {
    const g = await geo(supabase, cityName(f.parsed.destination_city)) || await geo(supabase, f.parsed.hotel_address || f.parsed.venue_address)
    return g?.city ? { lat: g.lat, lng: g.lng, city: g.city, country: g.country, country_code: g.country_code } : f.ends.at
  }
  const stays = group.filter(f => f.parsed.type === 'hotel' && f.parsed.check_in_date)
    .sort((a, b) => nights(b.parsed) - nights(a.parsed) || String(a.parsed.check_in_date).localeCompare(String(b.parsed.check_in_date)))
  for (const f of stays) { const g = await placeOf(f); if (g?.city && !nearHome(g, home)) return g }
  const moves = group.filter(f => MOVES.has(f.parsed.type)).sort((a, b) => String(a.parsed.departure_time).localeCompare(String(b.parsed.departure_time)))
  if (moves.length) {
    const start = moves[0].ends.dep, last = moves[moves.length - 1]
    if (moves.length > 1 && start && last.ends.arr && distanceKm(start, last.ends.arr) <= NEAR_KM) {
      // Round trip: the arrival before the longest wait between legs
      let turn = 0, wait = -Infinity
      for (let i = 0; i < moves.length - 1; i++) {
        const w = Date.parse(moves[i + 1].parsed.departure_time) - Date.parse(moves[i].parsed.arrival_time || moves[i].parsed.departure_time)
        if (w > wait) { wait = w; turn = i }
      }
      if (moves[turn].ends.arr) return withCity(moves[turn])
    }
    const out = [...moves].reverse().find(f => f.ends.arr && !nearHome(f.ends.arr, home))
    if (out) return withCity(out)
    if (moves[0].ends.dep) return { ...moves[0].ends.dep, city: moves[0].ends.dep.city || cityName(moves[0].parsed.departure_city) }
  }
  return group.length ? await placeOf(group[0]) : null
}
const withCity = (f: any): Pt => ({ ...f.ends.arr, city: f.ends.arr.city || cityName(f.parsed.arrival_city) || cityName(f.parsed.destination_city) })

/** Insert one booking into `trip` (or unassigned), with each time turned into an instant in its place's zone. */
async function insertBooking(supabase: any, userId: string, trip: any, parsed: any, emailId: string | null, fit: string | null): Promise<Record<string, any>> {
  // ── 6b. Local time: attach the place's zone to each time, then convert to instants ──
  const tripTz = trip?.destination_tz || (parsed.destination_city ? await resolveZone(supabase, { query: parsed.destination_city }) : null)
  if (trip && !trip.destination_tz && tripTz && !trip.shared) {
    await supabase.from('trips').update({ destination_tz: tripTz }).eq('id', trip.id)
    trip.destination_tz = tripTz
  }
  await attachZones(supabase, parsed, { fallbackTz: tripTz, city: parsed.destination_city || '' })

  // ── 7. Sanitize booking fields (only real bookings columns: a field the AI invents must not break the insert) ──
  const sanitized = sanitizeBooking(parsed)

  // ── 8. Insert booking ──
  // Free plan: 5 forwarded emails; later ones are saved locked until First Class (false while the limits switch is off)
  const { data: locked } = await supabase.rpc('email_import_locked', { p_user: userId })
  const { data: booking, error: insertErr } = await supabase.from('bookings').insert({
    ...sanitized,
    trip_id: trip?.id || null,
    created_by: userId,
    source: 'email_import',
    is_shared: false,
    locked: !!locked,
    // One email = one import for the free-plan counter, however many bookings it filed (set here, never from the AI's output)
    raw_email_id: emailId ? String(emailId).slice(0, 200) : null,
  }).select().single()
  if (insertErr) {
    console.error('Booking insert error:', insertErr)
    return { error: `Database insert failed: ${insertErr.message}`, status: 500 }
  }
  console.log(`✅ Booking created for user ${userId}: ${booking.id} → trip ${trip?.id || 'unassigned'}`)
  return {
    success: true,
    booking_id: booking.id,
    trip_id: trip?.id || null,
    trip_title: trip?.title || null,
    trip_fit: fit,
    folded_trip_id: null,
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

/** A hotel, ticket or table that is the same item as a stored one under the same reference: the same day, else the same name. */
function sameStay(stored: Record<string, any>, parsed: Record<string, any>): boolean {
  const day = parsed.check_in_date || parsed.activity_date
  if (day) return (stored.check_in_date || stored.activity_date) === day
  const name = normRef(parsed.hotel_name || parsed.venue_name)
  return !!name && normRef(stored.hotel_name || stored.venue_name) === name
}

/**
 * The same reservation forwarded again, changed or cancelled: same confirmation number and type, and the same item
 * under it: for a flight or train the same leg (sameLeg: outbound and return share a reference), for anything else the
 * same day (a package holds several hotels under one reference). A change email for the only item of its type under
 * that reference matches it whatever its new dates. A cancellation matches any type under the reference (the AI may
 * not tell a cancelled hotel's type) and notes every item it names. Returns the action taken, or null when it's new.
 * `siblings` = how many bookings of this type the email holds.
 */
async function sameReservation(supabase: any, userId: string, tripIds: string[], parsed: Record<string, any>, tripTzOf: (id: string) => string | null, isShared: (id: string) => boolean = () => false, siblings = 1) {
  const ref = normRef(parsed.confirmation_number)
  if (!ref || !tripIds.length) return null
  const cancel = parsed.change_type === 'cancellation'
  let q = supabase.from('bookings').select('*').in('trip_id', tripIds).eq('created_by', userId)
  if (!cancel) q = q.eq('type', parsed.type)
  const { data: rows } = await q
  const under = (rows || []).filter((b: any) => normRef(b.confirmation_number) === ref)

  // A cancellation email never cancels or renames the booking (an email can be forged or wrong): it is noted
  // (cancellation_received_at), and the app shows the note so the traveller checks with the provider
  if (cancel) {
    let hit = under.filter((b: any) => b.type === parsed.type)
    if (!hit.length) hit = under
    const leg = MOVES.has(parsed.type) && parsed.flight_number ? hit.filter((b: any) => sameLeg(b, parsed)) : []
    const stay = !MOVES.has(parsed.type) && hit.length > 1 ? hit.filter((b: any) => sameStay(b, parsed)) : []
    hit = leg.length ? leg : stay.length ? stay : hit
    if (!hit.length) return null
    const now = new Date().toISOString()
    const note = `Cancellation email received on ${now.slice(0, 10)}`
    for (const existing of hit) {
      const notes = (existing.notes || '').includes(note) ? existing.notes : [existing.notes, note].filter(Boolean).join('\n')
      await supabase.from('bookings').update({ cancellation_received_at: now, notes }).eq('id', existing.id)
      console.log(`📮 Booking ${existing.id}: cancellation email noted for user ${userId}`)
    }
    return { success: true, cancellation_noted: true, booking_id: hit[0].id, trip_id: hit[0].trip_id, booking_type: hit[0].type, noted: hit.length }
  }

  const existing = MOVES.has(parsed.type) ? under.find((b: any) => sameLeg(b, parsed))
    : under.find((b: any) => sameStay(b, parsed)) || (under.length === 1 && siblings <= 1 && parsed.change_type === 'change' ? under[0] : null)
  if (!existing) return null

  // Compare in the same terms as the saved row: local times turned into instants in each place's zone. A date with no
  // time (a seat-change email prints only the day) never replaces a stored time: read as midnight UTC it moved a
  // 22:30 departure to 16:00 the day before
  const next: Record<string, any> = { ...parsed }
  for (const k of ['departure_time', 'arrival_time']) if (typeof next[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next[k].trim())) delete next[k]
  // When the email says which fields it changes (a seat change), only those change
  const only = Array.isArray(parsed.changed) && parsed.changed.length ? new Set(parsed.changed.filter((k: string) => CHANGE_FIELDS.includes(k))) : null
  delete next.changed
  const span = wallSpan(next) // as printed, before zones
  await attachZones(supabase, next, { fallbackTz: existing.local_tz || existing.departure_tz || tripTzOf(existing.trip_id), city: parsed.destination_city || '' })
  const clean = sanitizeBooking(next)
  // Named fields change even from empty (a first seat); otherwise a detail missing from either side isn't a change
  const changed = only?.size
    ? CHANGE_FIELDS.filter(k => only.has(k) && clean[k] != null && (existing[k] == null || !sameValue(k, existing[k], clean[k])))
    : CHANGE_FIELDS.filter(k => !sameValue(k, existing[k], clean[k]))
  if (!changed.length) {
    console.log(`↩️ Same reservation again for user ${userId}: booking ${existing.id}`)
    return { success: true, duplicate: true, booking_id: existing.id, trip_id: existing.trip_id }
  }

  // Changed: update the booking in place, never a second copy; the trip stretches to fit if needed
  const updates: Record<string, any> = {}
  for (const [k, v] of Object.entries(clean)) if (v != null && k !== 'title' && k !== 'confirmation_number' && (!only?.size || !CHANGE_FIELDS.includes(k) || only.has(k))) updates[k] = v
  updates.notes = [existing.notes, `Updated by email on ${new Date().toISOString().slice(0, 10)}: ${changed.join(', ').replace(/_/g, ' ')}`].filter(Boolean).join('\n')
  const { error } = await supabase.from('bookings').update(updates).eq('id', existing.id)
  if (error) return { error: `Booking update failed: ${error.message}`, status: 500 }
  if (span && existing.trip_id && !isShared(existing.trip_id)) await widenTrip(supabase, existing.trip_id, span.start, span.end)
  console.log(`✏️ Booking ${existing.id} updated for user ${userId}: ${changed.join(', ')}`)
  return { success: true, updated: true, changed, booking_id: existing.id, trip_id: existing.trip_id }
}

/** Add or update a loyalty card from a statement: matched by member number (or the old number it replaces), else by program name. */
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
  const num = digits(fields.card_number), old = digits(l.previous_number)
  // A replaced card (new number) updates the card with the old number
  const same = (cards || []).find((c: any) => num && digits(c.card_number) === num) ||
    (cards || []).find((c: any) => old && digits(c.card_number) === old) ||
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
