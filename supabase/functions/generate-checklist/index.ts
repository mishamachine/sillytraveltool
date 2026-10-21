import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap } from '../_shared/gemini.ts'

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

    const { trip, bookings: rawBookings, weatherContext } = await req.json()
    const bookings = Array.isArray(rawBookings) ? rawBookings.slice(0, 100) : []
    if (!trip) return new Response(JSON.stringify({ error: 'trip required' }), { status: 400, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    const nights = trip?.end_date && trip?.start_date
      ? Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / (1000 * 60 * 60 * 24))
      : 7
    const flightCount = (bookings || []).filter((b: any) => b.type === 'flight').length
    const hasHotel = (bookings || []).some((b: any) => b.type === 'hotel')
    const hasActivities = (bookings || []).some((b: any) => b.type === 'activity')
    const month = trip?.start_date ? new Date(trip.start_date).toLocaleString('default', { month: 'long' }) : 'unknown'
    const destination = [cap(trip?.destination_city, 80), cap(trip?.destination_country, 80)].filter(Boolean).join(', ') || 'the destination'
    const weatherLine = weatherContext
      ? `Weather during trip: avg high ${weatherContext.avgHigh}°, avg low ${weatherContext.avgLow}°, conditions: ${weatherContext.summary}. Rain expected: ${weatherContext.rainDays} day(s).`
      : ''

    const prompt = `You are a world-class travel packer helping someone prepare for ${nights} nights in ${destination} in ${month}.

Facts: ${flightCount} flight(s), hotel: ${hasHotel}, activities booked: ${hasActivities}.${weatherLine ? '\n' + weatherLine : ''}

Generate a tight, smart packing checklist tailored to this destination and season. Every item must be specific — no vague entries like "clothes".

Return ONLY a valid JSON array with no markdown:
[
  {
    "title": "section emoji + name",
    "items": [
      { "label": "Item name", "note": "One short reason or tip, max 8 words" }
    ]
  }
]

Rules:
- 4-6 sections, 4-7 items each. Keep it tight — quality over quantity.
- Every item needs a "note" — why it matters or a quick tip.
- Do NOT include notes like "essential" or "important" — only genuinely useful context.`

    const gemRes = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 3000 } })

    if (!gemRes.ok) {
      const err = await gemRes.text()
      return new Response(JSON.stringify({ error: `Gemini error: ${err.slice(0, 200)}` }), { status: 502, headers: CORS })
    }

    const gemData = await gemRes.json()
    const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return new Response(JSON.stringify({ error: 'No content from Gemini' }), { status: 502, headers: CORS })

    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    let result
    try { result = JSON.parse(cleaned) } catch {
      const m = cleaned.match(/(\[[\s\S]*\])/)
      if (m) result = JSON.parse(m[0])
      else return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 502, headers: CORS })
    }

    // Normalise: accept array, result.sections, or result.checklist
    if (Array.isArray(result)) return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (Array.isArray(result.sections)) return new Response(JSON.stringify(result.sections), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (Array.isArray(result.checklist)) return new Response(JSON.stringify(result.checklist), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ error: 'Unexpected checklist format' }), { status: 502, headers: CORS })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
