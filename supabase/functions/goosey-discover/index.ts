import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap, checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { geocode, searchText, routeOne, withGoogleScope, setGoogleUser, type Place } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// HONK mood → what to ask Google for. Results are open now and walkable from the user.
const MOOD_QUERY: Record<string, string> = {
  "I'm hungry": 'best places to eat',
  'Show me something': 'interesting sights and hidden gems',
  "I'm bored": 'fun things to do',
  'Treat myself': 'special treat dessert spa or upscale bar',
  'On a budget': 'cheap eats and free things to do',
  'Culture me': 'museums galleries and historic sights',
  'Night out': 'bars live music and nightlife',
  'Be a local': 'local favourite cafe market or neighbourhood bar',
}

const PRICE = ['free', '$', '$$', '$$$', '$$$$']

const metres = (a: { lat: number, lng: number }, b: { lat: number, lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return Math.round(12742000 * Math.asin(Math.sqrt(h)))
}

type Candidate = Place & { distance_m: number | null, walk_min?: number | null }

// Straight-line distance understates a walk (streets, rivers, big roads): estimate for ranking, then ask Google
// Routes for the place we actually send someone to
const estWalk = (m: number | null) => (m != null ? Math.ceil((m * 1.3) / 80) : null)
async function withRealWalk(p: Candidate, origin: { lat: number, lng: number } | null, gps: boolean): Promise<Candidate> {
  if (!gps || !origin || p.lat == null || p.lng == null) return { ...p, walk_min: estWalk(p.distance_m) }
  const r = await routeOne(origin, { lat: p.lat, lng: p.lng }, 'WALK')
  return { ...p, walk_min: r?.minutes ?? estWalk(p.distance_m), distance_m: r?.metres ?? p.distance_m }
}

// Facts-stage pick without AI: well rated, well reviewed, and close
const honkScore = (p: Candidate) => (p.rating || 0) * Math.log10((p.rating_count || 0) + 10) / (1 + (p.distance_m ?? 800) / 1200)

async function askGemini(key: string, prompt: string, temperature = 0.9) {
  const res = await geminiFetch(key, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 1024 } })
  if (!res.ok) throw new Error(`Gemini error: ${(await res.text()).slice(0, 200)}`)
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No content from Gemini')
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {
    const m = cleaned.match(/(\{[\s\S]*\})/)
    if (m) return JSON.parse(m[0])
    throw new Error('Failed to parse Gemini response')
  }
}

/** The Google facts the app shows, plus the Goose's words when we have them. */
function toResult(p: Candidate, words: any = null) {
  return {
    name: p.name,
    type: p.type_label || '',
    summary: p.summary || '',
    why: cap(words?.why, 600) || (words ? p.summary || '' : ''),
    address: p.short_address || p.address,
    neighbourhood: '',
    best_time: cap(words?.best_time, 120),
    insider_tip: cap(words?.insider_tip, 300),
    google_maps_url: p.maps_url || '',
    price_range: p.price_level != null ? PRICE[p.price_level] : '',
    goose_rating: cap(words?.goose_rating, 60),
    pending: !words,
    // Google facts
    place_id: p.place_id, rating: p.rating, rating_count: p.rating_count, photo: p.photo,
    open_now: true, distance_m: p.distance_m, walk_min: p.walk_min ?? estWalk(p.distance_m),
    lat: p.lat, lng: p.lng, source: 'google',
  }
}

function voicePrompt(city: string, country: string, mood: string, p: Record<string, unknown>) {
  return `You are The Goose, a cheeky but trustworthy travel companion.
The user is in ${city}, ${country} right now and wants: "${mood}". You are sending them to this REAL place (Google data, open now; walk_min = minutes on foot):
${JSON.stringify(p)}
Return ONLY JSON:
{ "why": "2-3 sentences of genuine personality-filled reason to walk there right now", "best_time": "", "insider_tip": "", "goose_rating": "short punchy verdict in 6 words or less" }
Never invent facts that contradict the data.`
}

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    setGoogleUser(user.id)

    const raw = await req.json()
    const city = cap(raw.city, 80), country = cap(raw.country, 80), mood = cap(raw.mood, 60)
    const filters = (Array.isArray(raw.filters) ? raw.filters : []).slice(0, 10).map((f: unknown) => cap(f, 40))
    const exclude = (Array.isArray(raw.exclude) ? raw.exclude : []).slice(0, 20).map((f: unknown) => cap(f, 300))
    const lat = Number(raw.lat), lng = Number(raw.lng)
    const gps = raw.lat != null && raw.lng != null && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    if (!city || !mood) return json({ error: 'city and mood required' }, 400)

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return json({ error: 'Gemini key not configured' }, 500)

    // stage: 'facts' = the place from Google at once (no AI); 'voice' = the Goose's words for that place;
    // omitted = both in one call, with the Goose choosing among the candidates (older app builds)
    const stage = raw.stage === 'facts' || raw.stage === 'voice' ? raw.stage : 'full'

    if (stage === 'voice') {
      const p = raw.place && typeof raw.place === 'object' ? raw.place : null
      if (!p?.name) return json({ error: 'place required' }, 400)
      if (!(await checkAiQuota(user.id))) return json({ error: QUOTA_MESSAGE }, 429)
      const facts = {
        name: cap(p.name, 120), type: cap(p.type, 60), rating: Number(p.rating) || null, reviews: Number(p.rating_count) || null,
        price: cap(p.price_range, 8), summary: cap(p.summary, 400), walk_min: Number(p.walk_min) || null,
      }
      try {
        const w = await askGemini(GEMINI_API_KEY, voicePrompt(city, country, mood, facts))
        return json({ why: cap(w?.why, 600), best_time: cap(w?.best_time, 120), insider_tip: cap(w?.insider_tip, 300), goose_rating: cap(w?.goose_rating, 60) })
      } catch (e) { return json({ error: (e as Error).message }, 502) }
    }

    // 1. Real places open right now, around the user (or the city centre)
    const origin = gps ? { lat, lng } : await geocode(`${city}, ${country}`)
    let candidates: Candidate[] = []
    if (origin) {
      const query = `${MOOD_QUERY[mood] || mood}${filters.length ? ` (${filters.join(', ')})` : ''}`
      const r = await searchText(query, { openNow: true, minRating: 4.2, near: { lat: origin.lat, lng: origin.lng, radius: 1500 }, pageSize: 20 })
      candidates = (r?.places || [])
        .filter(p => !p.closed && !exclude.includes(p.place_id))
        .map(p => ({ ...p, distance_m: p.lat != null && p.lng != null ? metres(origin, { lat: p.lat, lng: p.lng }) : null }))
        .filter(p => p.distance_m == null || p.distance_m <= 2500)
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
        .slice(0, 15)
    }

    if (candidates.length && stage === 'facts') {
      // "Walkable right now": if the best match is a long walk in reality, try the next two before settling
      const ranked = candidates.slice().sort((a, b) => honkScore(b) - honkScore(a))
      let best: Candidate | null = null
      for (const c of ranked.slice(0, gps ? 3 : 1)) {
        const w = await withRealWalk(c, origin, gps)
        if (!best || (w.walk_min ?? 99) < (best.walk_min ?? 99)) best = w
        if ((w.walk_min ?? 99) <= 20) { best = w; break }
      }
      return json(toResult(best!))
    }

    if (!(await checkAiQuota(user.id))) return json({ error: QUOTA_MESSAGE }, 429)

    if (candidates.length) {
      const list = candidates.map((p, i) => ({ i, name: p.name, type: p.type_label, rating: p.rating, reviews: p.rating_count, price: p.price_level, summary: p.summary, walk_min: estWalk(p.distance_m) }))
      let pick: any = null
      try {
        pick = await askGemini(GEMINI_API_KEY, `You are The Goose, a cheeky but trustworthy travel companion.
The user is in ${city}, ${country} right now and wants: "${mood}".${filters.length ? ` Filters: ${filters.join(', ')}.` : ''}
These REAL places are open now and walkable (walk_min = minutes on foot; rating out of 5 from Google):
${JSON.stringify(list)}
Pick ONE — the kind of place a local friend would whisper to you, not just the highest rated. Return ONLY JSON:
{ "i": 0, "why": "2-3 sentences of genuine personality-filled reason to walk there right now", "best_time": "", "insider_tip": "", "goose_rating": "short punchy verdict in 6 words or less" }
Never invent facts that contradict the data.`)
      } catch (e) { console.warn(`honk pick: ${(e as Error).message}`) }
      const idx = Number.isInteger(pick?.i) && candidates[pick.i] ? pick.i : 0
      return json(toResult(await withRealWalk(candidates[idx], origin, gps), pick || {}))
    }

    // 2. No Google results (no key, nothing open): the Goose recommends from memory, as before
    const filterText = filters.length ? ` Filters: ${filters.join(', ')}.` : ''
    try {
      return json(await askGemini(GEMINI_API_KEY, `You are The Goose, a cheeky but trustworthy travel companion who knows every city's hidden gems.
The user is RIGHT NOW in ${city}, ${country} and wants: "${mood}".${filterText}

Find ONE specific, genuine recommendation that is WALKABLE from the city center — ideally within 15 minutes on foot. Not a generic tourist trap. The kind of place a local friend would whisper to you

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
}`))
    } catch (e) {
      return json({ error: (e as Error).message }, 502)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}))
