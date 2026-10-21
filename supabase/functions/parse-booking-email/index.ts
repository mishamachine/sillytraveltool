import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch } from '../_shared/gemini.ts'

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
      "ticket_quantity": null
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
- Dates in ISO 8601. Times with timezone if available.
- For hotels/activities, bookings array has 1 item; ultimate_destination = hotel city
- passenger_name: full name of the traveller if present in the email (e.g. "JOHN SMITH")
- seat_number: assigned seat for flights (e.g. "14A"). null if not assigned.
- ticket_quantity: number of tickets for activities/events. null for flights/hotels.`

    // 20s cap prevents the EarlyDrop wall-clock kill; geminiFetch returns 504 on timeout
    const gemRes = await geminiFetch(GEMINI_API_KEY, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
    }, { timeoutMs: 20000 })
    if (gemRes.status === 504) {
      return new Response(JSON.stringify({ error: 'Gemini timed out — please try again' }), { status: 504, headers: CORS })
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

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
