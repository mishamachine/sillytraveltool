import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap, checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'

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

    const raw = await req.json()
    const city = cap(raw.city, 80), country = cap(raw.country, 80), mood = cap(raw.mood, 60)
    const filters = (Array.isArray(raw.filters) ? raw.filters : []).slice(0, 10).map((f: unknown) => cap(f, 40))
    if (!city || !mood) return new Response(JSON.stringify({ error: 'city and mood required' }), { status: 400, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    if (!(await checkAiQuota(user.id))) {
      return new Response(JSON.stringify({ error: QUOTA_MESSAGE }), { status: 429, headers: CORS })
    }

    const filterText = filters.length ? ` Filters: ${filters.join(', ')}.` : ''
    const prompt = `You are The Goose, a cheeky but trustworthy travel companion who knows every city's hidden gems.
The user is RIGHT NOW in ${city}, ${country} and wants: "${mood}".${filterText}

Find ONE specific, genuine recommendation that is WALKABLE from the city center — ideally within 15 minutes on foot. Not a generic tourist trap. The kind of place a local friend would whisper to you.

Return ONLY a valid JSON object with no markdown, no explanation:
{
  "name": "",
  "type": "",
  "why": "2-3 sentences of genuine personality-filled reason why this is worth walking to right now",
  "address": "",
  "neighbourhood": "",
  "best_time": "",
  "insider_tip": "",
  "google_maps_url": "",
  "price_range": "free",
  "goose_rating": "short punchy verdict in 6 words or less"
}`

    const gemRes = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 1024 } })

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
      const m = cleaned.match(/(\{[\s\S]*\})/)
      if (m) result = JSON.parse(m[0])
      else return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 502, headers: CORS })
    }

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
