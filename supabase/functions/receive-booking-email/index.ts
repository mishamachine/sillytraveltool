import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { geminiFetch, checkAiQuota } from '../_shared/gemini.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'

// ============================================================
// receive-booking-email
// Resend inbound email webhook — receives forwarded booking
// confirmations, parses them via Gemini, matches to a trip,
// inserts booking. Authenticated by the Resend (Svix) webhook
// signature (RESEND_WEBHOOK_SECRET), then mapped to a user by the
// token embedded in the recipient address. No other fallback.
//
// Inbound address scheme:
//   {8-char-token}@bookings.sillytraveltool.com
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

function ok(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// Extract plain text from HTML (basic — strips tags)
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Extract the booking_email_token from To: address
// Matches: token@bookings.sillytraveltool.com
function extractToken(toHeader: string): string | null {
  const match = toHeader.match(/([a-f0-9]{8})@bookings\.sillytraveltool\.com/i)
  return match ? match[1].toLowerCase() : null
}

// Verify a Svix-signed webhook (Resend uses Svix). Signed content is
// "{svix-id}.{svix-timestamp}.{raw body}", HMAC-SHA256 with the base64
// secret after the "whsec_" prefix; header holds "v1,<sig>" entries.
async function verifySvix(secret: string, headers: Headers, rawBody: string): Promise<boolean> {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !timestamp || !sigHeader) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return sigHeader.split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

// Match booking to the most relevant trip
// Priority: date overlap > destination city match > most recent upcoming trip
function matchTrip(trips: any[], booking: any): any | null {
  if (!trips?.length) return null

  const upcoming = trips.filter(t =>
    t.status !== 'cancelled' && t.status !== 'completed' &&
    new Date(t.end_date) >= new Date()
  ).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

  if (!upcoming.length) return null // no upcoming trips — let caller auto-create

  // 1. Date overlap match
  const bookingDate =
    booking.departure_time ? new Date(booking.departure_time) :
    booking.check_in_date  ? new Date(booking.check_in_date) :
    booking.activity_date  ? new Date(booking.activity_date) :
    null

  if (bookingDate) {
    const dateMatch = upcoming.find(t => {
      const start = new Date(t.start_date)
      const end   = new Date(t.end_date)
      // Widen window by 2 days each side for transit bookings
      start.setDate(start.getDate() - 2)
      end.setDate(end.getDate() + 2)
      return bookingDate >= start && bookingDate <= end
    })
    if (dateMatch) return dateMatch
  }

  // 2. Destination city match (case-insensitive)
  if (booking.destination_city || booking.arrival_airport || booking.hotel_name) {
    const cityHint = (booking.destination_city || booking.arrival_airport || booking.hotel_name || '').toLowerCase()
    const cityMatch = upcoming.find(t =>
      cityHint.includes(t.destination_city?.toLowerCase() || '') ||
      (t.destination_city || '').toLowerCase().split(' ').some(word => word.length > 3 && cityHint.includes(word))
    )
    if (cityMatch) return cityMatch
  }

  // 3. No confident match — return null so caller can auto-create a trip
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const GEMINI_API_KEY     = Deno.env.get('GEMINI_API_KEY')
  const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const WEBHOOK_SECRET       = Deno.env.get('RESEND_WEBHOOK_SECRET')

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err('Missing environment secrets', 500)
  }
  // Fail closed: without the signing secret we cannot tell Resend from anyone else.
  if (!WEBHOOK_SECRET) {
    console.error('RESEND_WEBHOOK_SECRET is not set — rejecting inbound email')
    return err('Webhook not configured', 503)
  }

  try {
    // ── 1. Verify signature, then parse Resend email.received payload ──
    // JSON shape: { type: "email.received", data: { email_id, to: [{email}] | string, from, subject, text?, html? } }
    const rawText = await req.text()
    if (!(await verifySvix(WEBHOOK_SECRET, req.headers, rawText))) {
      console.warn('receive-booking-email: invalid or missing webhook signature')
      return err('Invalid signature', 401)
    }

    let rawBody: any = {}
    try { rawBody = JSON.parse(rawText) } catch { return err('Invalid JSON payload') }
    const payload = rawBody?.data ?? rawBody

    let toAddress = ''
    const toRaw = payload.to ?? payload.To ?? ''
    if (Array.isArray(toRaw)) {
      toAddress = toRaw.map((t: any) => (typeof t === 'string' ? t : t?.email || '')).join(', ')
    } else {
      toAddress = String(toRaw)
    }

    const fromAddress = String(payload.from ?? payload.From ?? '')
    const subject     = String(payload.subject ?? payload.Subject ?? '')
    let bodyText      = payload.text ?? payload.plain ?? ''
    const html        = payload.html ?? ''
    if (!bodyText && html) bodyText = htmlToText(html)

    if (!toAddress) return err('No recipient address in webhook payload')
    // ── Body fetch via Resend receiving API (body not in webhook payload) ──
    if (!bodyText) {
      const emailId = (rawBody?.data ?? rawBody)?.email_id
      if (!emailId) return err('No email body and no email_id to fetch from')
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
      if (!RESEND_API_KEY) return err('Missing RESEND_API_KEY secret', 500)
      console.log(`📥 Fetching email body for email_id: ${emailId}`)
      const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` }
      })
      if (!fetchRes.ok) {
        const fetchErr = await fetchRes.text()
        console.error('Resend receiving API error:', fetchErr)
        return err('Failed to fetch email body from Resend', 502)
      }
      const fetchedEmail = await fetchRes.json()
      bodyText = fetchedEmail.text ?? ''
      const fetchedHtml = fetchedEmail.html ?? ''
      if (!bodyText && fetchedHtml) bodyText = htmlToText(fetchedHtml)
      console.log(`📥 Fetched email body — length: ${bodyText.length}`)
    }

    if (!bodyText) return err('No email body in webhook payload')

    console.log(`📬 receive-booking-email: to="${toAddress}" subject="${subject}" bodyLen=${bodyText.length}`)

    // ── 2. Extract user token from To: address ────────────────
    const token = extractToken(toAddress)
    console.log(`🔑 Token extracted: "${token}" from toAddress: "${toAddress}"`)

    // ── 3. Look up user by token (the only accepted path) ─────
    if (!token) return err('No booking token in recipient address', 404)

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .eq('booking_email_token', token)
      .single()
    if (profileErr || !profile) {
      console.error('Token lookup failed:', token, profileErr?.message)
      return err('Unknown booking address — token not found', 404)
    }

    const userId = profile.id

    if (!(await checkAiQuota(userId))) {
      console.warn(`AI quota exceeded for user ${userId} — inbound email not parsed`)
      return err('Daily AI limit reached', 429)
    }

    // ── 4. Fetch user's trips for matching ────────────────────
    const { data: trips } = await supabase
      .from('trips')
      .select('id, title, destination_city, destination_country, destination_country_code, destination_tz, start_date, end_date, status')
      .eq('owner_id', userId)
      .order('start_date', { ascending: true })

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
    }, { timeoutMs: 20000 })

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

    // ── 6. Match to a trip — or create one ───────────────────
    let matchedTrip = matchTrip(trips || [], parsed)

    // If no match and we have enough info, create a new trip
    if (!matchedTrip && parsed.destination_city) {
      const tripCity = parsed.destination_city
      const startDate = parsed.check_in_date || parsed.activity_date ||
        (parsed.departure_time ? parsed.departure_time.slice(0, 10) : null) ||
        new Date().toISOString().slice(0, 10)
      const endDate = parsed.check_out_date ||
        (parsed.arrival_time ? parsed.arrival_time.slice(0, 10) : null) || startDate

      const { data: newTrip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          owner_id: userId,
          title: `Trip to ${tripCity}`,
          destination_city: tripCity,
          destination_country: '',
          destination_country_code: '',
          start_date: startDate,
          end_date: endDate,
          status: 'planning',
          destination_tz: await resolveZone(supabase, { query: tripCity }),
        })
        .select()
        .single()

      if (tripErr) {
        console.error(`❌ Trip auto-create failed for user ${userId}:`, tripErr.message, tripErr.code, tripErr.details)
      } else if (newTrip) {
        matchedTrip = newTrip
        console.log(`🆕 Created new trip for user ${userId}: ${newTrip.id} → ${tripCity}`)
      }
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
      return err(`Database insert failed: ${insertErr.message}`, 500)
    }

    console.log(`✅ Booking created for user ${userId}: ${booking.id} → trip ${matchedTrip?.id || 'unassigned'}`)

    return ok({
      success: true,
      booking_id: booking.id,
      trip_id: matchedTrip?.id || null,
      trip_title: matchedTrip?.title || null,
      booking_type: parsed.type,
      booking_title: parsed.title,
    })

  } catch (e: any) {
    console.error('receive-booking-email error:', e)
    return err(e.message || 'Unexpected error', 500)
  }
})
