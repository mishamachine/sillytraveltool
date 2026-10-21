import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================
// receive-booking-email
// Resend inbound email webhook — receives forwarded booking
// confirmations, parses them via Gemini, matches to a trip,
// inserts booking. No auth header — authenticated by token
// embedded in the recipient address.
//
// Inbound address scheme:
//   {8-char-token}@bookings.sillytraveltool.com
//
// Resend posts multipart/form-data with fields:
//   to, from, subject, text, html, attachments, headers, ...
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

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err('Missing environment secrets', 500)
  }

  try {
    // ── 1. Parse Resend inbound webhook payload ──────────────
    // Resend email.received Webhook sends JSON:
    // { type: "email.received", data: { to: [{email}], from, subject, text, html } }
    // Legacy multipart/form-data path kept as fallback.
    let toAddress = ''
    let fromAddress = ''
    let subject = ''
    let bodyText = ''
    let rawBody: any = {}

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Legacy Resend Inbound product (multipart)
      const formData = await req.formData()
      toAddress   = formData.get('to')      as string || ''
      fromAddress = formData.get('from')    as string || ''
      subject     = formData.get('subject') as string || ''
      bodyText    = formData.get('text')    as string || ''
      const html  = formData.get('html')    as string || ''
      if (!bodyText && html) bodyText = htmlToText(html)
    } else {
      // Resend email.received Webhook — JSON body
      // Unwrap { type, data } envelope that Resend wraps all webhook events in
      rawBody = await req.json().catch(() => ({}) as any)
      const body = rawBody
      const payload = body?.data ?? body

      // to can be string or array of { email } objects
      const toRaw = payload.to ?? payload.To ?? ''
      if (Array.isArray(toRaw)) {
        toAddress = toRaw.map((t: any) => (typeof t === 'string' ? t : t?.email || '')).join(', ')
      } else {
        toAddress = String(toRaw)
      }

      fromAddress = payload.from    ?? payload.From    ?? ''
      subject     = payload.subject ?? payload.Subject ?? ''
      bodyText    = payload.text    ?? payload.plain   ?? ''
      const html  = payload.html    ?? ''
      if (!bodyText && html) bodyText = htmlToText(html)
    }

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

    // ── 3. Look up user by token OR by from-email (fallback) ──
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    let profile: any = null

    if (token) {
      // Primary path: token in recipient address (production)
      const { data, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .eq('booking_email_token', token)
        .single()
      if (profileErr || !data) {
        console.error('Token lookup failed:', token, profileErr?.message)
        return err('Unknown booking address — token not found', 404)
      }
      profile = data
      console.log(`✅ User found by token: ${profile.id}`)
    } else {
      // Fallback path: no token in address (e.g. measira.resend.app dev testing)
      // Extract bare email from "Name <email>" format
      const fromEmail = (fromAddress.match(/<([^>]+)>/) || [null, fromAddress])[1].trim().toLowerCase()
      console.log(`🔍 No token — falling back to from-email lookup: "${fromEmail}"`)

      // Look up user id by email via SQL RPC (service role, queries auth.users directly)
      const { data: userId, error: rpcErr } = await supabase.rpc('get_user_id_by_email', { p_email: fromEmail })
      if (rpcErr || !userId) {
        console.error('From-email RPC lookup failed:', fromEmail, rpcErr?.message)
        return err('Sender email not associated with any account', 404)
      }
      profile = { id: userId, display_name: fromEmail }
      console.log(`✅ User found by from-email: ${profile.id}`)
    }

    const userId = profile.id

    // ── 4. Fetch user's trips for matching ────────────────────
    const { data: trips } = await supabase
      .from('trips')
      .select('id, title, destination_city, destination_country, destination_country_code, start_date, end_date, status')
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
  "type": "flight|hotel|activity|transport|other",
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
  "ticket_quantity": null
}

Rules:
- departure_time and arrival_time must be ISO 8601 with timezone if available, date only if no time found
- check_in_date and check_out_date must be YYYY-MM-DD
- activity_date must be YYYY-MM-DD
- price must be a number, not a string
- destination_city is the city the booking is IN or travelling TO (used for trip matching)
- passenger_name: full name of the traveller if present (e.g. "JOHN SMITH"). null if absent.
- seat_number: assigned flight seat (e.g. "14A"). null if not assigned.
- ticket_quantity: number of tickets for activities/events. null for flights/hotels.
- Return raw JSON only — no markdown, no explanation`

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    )

    if (!gemRes.ok) {
      const gemErr = await gemRes.text()
      console.error('Gemini error:', gemErr)
      return err('Gemini parse failed', 502)
    }

    const gemData = await gemRes.json()
    const rawText = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    let parsed: any = null
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('JSON parse failed:', rawText.slice(0, 300))
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
      const endDate = parsed.check_out_date || startDate

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
        })
        .select()
        .single()

      if (tripErr) {
        console.error(`❌ Trip auto-create failed for user ${userId}:`, tripErr.message, tripErr.code, tripErr.details)
      } else if (newTrip) {
        matchedTrip = newTrip
        console.log(`🆕 Created new trip for user ${userId}: ${newTrip.id} → ${tripCity}`)
        // Increment trips_created stat
        try { await supabase.rpc('increment_user_stat', { p_user_id: userId, p_field: 'trips_created', p_amount: 1 }) } catch (_) {}
      }
    }

    // ── 7. Sanitize booking fields ────────────────────────────
    const sanitized: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (k === 'destination_city') continue  // internal only — not a bookings column
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
