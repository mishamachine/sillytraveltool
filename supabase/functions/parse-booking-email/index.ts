import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'
import { attachPlace } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { emailText: rawEmailText } = await req.json()
    const emailText = String(rawEmailText ?? '').slice(0, 20000)
    if (!emailText) return new Response(JSON.stringify({ error: 'emailText required' }), { status: 400, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    if (!(await checkAiQuota(user.id))) {
      return new Response(JSON.stringify({ error: QUOTA_MESSAGE }), { status: 429, headers: CORS })
    }

    const prompt = `Extract ALL booking legs from this travel confirmation email.

Email:
---
${emailText}
---

For multi-leg flights (e.g. YVR -> LAX -> NRT), return EACH leg as a separate object in the bookings array.
Connection cities are intermediate stops. The ultimate_destination is the FINAL arrival city/airport.

Return ONLY valid JSON with no markdown, exactly this shape:
{
  "bookings": [
    {
      "type": "flight",
      "title": "YVR -> LAX",
      "confirmation_number": null,
      "booking_url": null,
      "price": null,
      "currency": null,
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
      "destination_city": null,
      "passenger_name": null,
      "seat_number": null,
      "ticket_quantity": null,
      "party_size": null,
      "transport_mode": null
    }
  ],
  "ultimate_destination": {
    "city": "Tokyo",
    "airport_code": "NRT"
  }
}

Rules:
- For a single-leg booking, bookings array has exactly 1 item
- For multi-leg flights, each leg is its own object in the array
- title for flights should be "ORIGIN -> DESTINATION" (e.g. "YVR -> LAX")
- ultimate_destination.city = city name of the FINAL destination (not a connection)
- destination_city on each booking = arrival city for that specific leg
- Shared fields like confirmation_number, price, airline appear on each leg
- departure_time and arrival_time: the LOCAL time exactly as printed on the confirmation, as YYYY-MM-DDTHH:MM with NO time zone or offset. The departure time is local to the departure airport/station, the arrival time local to the arrival airport/station. Never convert between time zones. Date only (YYYY-MM-DD) if no time is printed.
- activity_time: local time exactly as printed, HH:MM 24h.
- departure_airport / arrival_airport for flights: the 3-letter IATA code when shown (e.g. MAD), otherwise the airport name
- Dates as YYYY-MM-DD.
- For hotels/activities, bookings array has 1 item; ultimate_destination = hotel city
- passenger_name: full name of the traveller if present in the email (e.g. "JOHN SMITH")
- seat_number: assigned seat for flights (e.g. "14A"). null if not assigned.
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
- party_size: guests on a restaurant reservation, otherwise null. transport_mode: null unless type is transport.`

    // 24s cap prevents the EarlyDrop wall-clock kill; geminiFetch returns 504 on timeout
    const gemRes = await geminiFetch(GEMINI_API_KEY, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
    }, { timeoutMs: 24000 })
    if (gemRes.status === 504) {
      return new Response(JSON.stringify({ error: 'Reading the email timed out — please try again' }), { status: 504, headers: CORS })
    }

    if (!gemRes.ok) {
      const err = await gemRes.text()
      return new Response(JSON.stringify({ error: `Gemini error: ${err.slice(0, 200)}` }), { status: 502, headers: CORS })
    }

    const gemData = await gemRes.json()
    const rawText = gemData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return new Response(JSON.stringify({ error: 'No content from Gemini' }), { status: 502, headers: CORS })

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    let result
    try {
      result = JSON.parse(cleaned)
    } catch {
      const m = cleaned.match(/(\{[\s\S]*\})/)
      if (m) {
        try { result = JSON.parse(m[0]) }
        catch { return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 502, headers: CORS }) }
      } else {
        return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 502, headers: CORS })
      }
    }

    // Backwards-compat: if Gemini returned old single-object format, wrap it
    if (!result.bookings) {
      const single = result
      result = {
        bookings: [single],
        ultimate_destination: {
          city: single.destination_city || single.arrival_airport || null,
          airport_code: single.arrival_airport || null
        }
      }
    }

    // Ensure bookings is always an array
    if (!Array.isArray(result.bookings)) {
      result.bookings = [result.bookings]
    }

    // Local time: attach each place's zone and turn printed local times into instants
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const destCity = result.ultimate_destination?.city || null
    const destTz = destCity ? await resolveZone(admin, { query: destCity }) : null
    result.ultimate_destination = { ...(result.ultimate_destination || {}), tz: destTz }
    for (const b of result.bookings) {
      const legTz = b.destination_city && b.destination_city !== destCity ? await resolveZone(admin, { query: b.destination_city }) : destTz
      await attachZones(admin, b, { fallbackTz: legTz || destTz, city: b.destination_city || destCity || '' })
      await attachPlace(admin, b, b.destination_city || destCity || '')
    }

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
