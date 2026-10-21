import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap } from '../_shared/gemini.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildPrompt(city: string, country: string, section: string, excludeNames: string[] = []): string {
  const wikiCity = city.replace(/ /g, '_')
  const britannicaCity = city.replace(/ /g, '-').toLowerCase()
  const excludeClause = excludeNames.length > 0
    ? `\nIMPORTANT: Do NOT include any of these already-shown items: ${excludeNames.map(n => `"${n}"`).join(', ')}. Return completely different items only.`
    : ''

  if (section === 'overview') {
    return `You are The Goose — a well-travelled, opinionated, slightly cheeky travel guide.
Return ONLY a valid JSON object. No markdown, no preamble. Raw JSON only.
{
  "history": "200-250 word engaging overview of ${city}, ${country} — its history, character, and what makes it worth visiting. Write with personality.",
  "wikipedia_url": "https://en.wikipedia.org/wiki/${wikiCity}",
  "britannica_url": "https://www.britannica.com/place/${britannicaCity}",
  "city_stats": {
    "population": "e.g. 13.96 million",
    "area_km2": 2194,
    "founded": "e.g. 1457",
    "timezone": "e.g. JST (UTC+9)",
    "language": "e.g. Japanese",
    "currency": "e.g. Japanese Yen (JPY)",
    "country_capital": true,
    "avg_temp_summer": "e.g. 30°C / 86°F",
    "avg_temp_winter": "e.g. 5°C / 41°F",
    "comparisons": ["e.g. Tokyo is 3x larger by population than Los Angeles", "e.g. The city covers an area twice the size of London"],
    "goose_facts": [
      { "fact": "surprising fact about this city", "goose_take": "witty commentary" },
      { "fact": "another surprising fact", "goose_take": "commentary" },
      { "fact": "third fact", "goose_take": "commentary" }
    ]
  }
}
Use real, accurate information about ${city}, ${country}.`
  }

  if (section === 'eat_cheap') {
    return `You are The Goose — opinionated travel guide with genuine insider food knowledge.
Return ONLY a valid JSON object for budget dining in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 1, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'eat_mid') {
    return `You are The Goose — opinionated travel guide with genuine insider food knowledge.
Return ONLY a valid JSON object for mid-range dining in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 2, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'eat_splurge') {
    return `You are The Goose — opinionated travel guide with genuine insider food knowledge.
Return ONLY a valid JSON object for splurge dining in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 3, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_temples') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for temples, shrines and religious sites in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "real place name", "type": "specific type/era/style", "address": "real address or area", "description": "2 sentences on what you see and why it matters", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "place name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real places in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_neighbourhoods') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for neighbourhoods and districts to explore in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "real neighbourhood name", "type": "character/vibe e.g. bohemian, historic, foodie", "address": "area or district", "description": "2 sentences on the vibe and what to do there", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "neighbourhood name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real neighbourhoods in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_museums') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for museums and galleries in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "real museum name", "type": "type e.g. art, history, science", "address": "real address", "description": "2 sentences on the collection and why to go", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "museum name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real museums in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_parks') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for parks, gardens and outdoor spaces in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "real park name", "type": "type e.g. urban park, botanical garden, waterfront", "address": "real address or area", "description": "2 sentences on what makes it worth visiting", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "park name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real parks in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_daytrips') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for day trips from ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 10 objects:
{ "name": "real destination name", "type": "type e.g. coastal town, mountain village, ancient ruins", "address": "distance and direction e.g. 45min south by train", "description": "2 sentences on what makes it worth the trip", "goose_quip": "insider tip most visitors dont know", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "destination name ${country}" }
Mark is_goose_pick: true for the 1-2 best. Use real day trip destinations from ${city}, ${country}.${excludeClause}`
  }

  if (section === 'move') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for getting around ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "move": { "overview": "3-4 sentences on getting around ${city} including local apps, transit cards, and insider tips", "options": [] } }
move.options must have at least 6 objects:
{ "type": "transport type e.g. Metro, Taxi, Bus", "description": "how it works, coverage, price range", "tip": "insider tip locals know", "official_url": "real official website or empty string", "app_name": "local app name if applicable or empty string" }
Use real, accurate transport information for ${city}, ${country}.`
  }

  if (section === 'events') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for events in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "events": [] }
events must have at least 8 objects:
{ "name": "event name", "month": "month or season", "description": "2 sentences — what it is and why to go", "type": "festival/market/sports/music/cultural" }
Use real events and festivals that actually happen in ${city}, ${country}.`
  }

  throw new Error(`Unknown section: ${section}`)
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
    const city = cap(raw.city, 80), country = cap(raw.country, 80), section = cap(raw.section || 'overview', 40)
    const exclude_names = (Array.isArray(raw.exclude_names) ? raw.exclude_names : []).slice(0, 40).map((n: unknown) => cap(n, 80))
    if (!city || !country) return new Response(JSON.stringify({ error: 'city and country required' }), { status: 400, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    const prompt = buildPrompt(city, country, section, exclude_names)

    const gemRes = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 3000 } })

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

    return new Response(JSON.stringify({ section, ...result }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
