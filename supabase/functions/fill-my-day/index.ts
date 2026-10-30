import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { geocode, searchText, routeOne, cached, hasGoogle, withGoogleScope, setGoogleUser } from '../_shared/google.ts'
import { PACES, BUDGETS, VIBES, DAY_START, parseRequest, pickCandidates, basicPlan, validatePlan, retime, hoursFor, estWalk, toMin } from '../_shared/fillDay.js'

// Fill my day: real places from Google for the stop's city, ordered into a timed day by the AI. A proposal only:
// nothing is written here. The request carries a city, a country, a date and the chosen chips, so no AI consent is
// needed (like city guides and HONK). The member's AI and Google allowances are checked before any outside call,
// and both fail closed.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const PRICE = ['free', '$', '$$', '$$$', '$$$$']

async function askAi(key: string, prompt: string) {
  // 15 s: the answer comes back well inside the app's 50 s, and a slow model falls back to the basic day
  const res = await geminiFetch(key, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 1200 } }, { timeoutMs: 15000 })
  if (!res.ok) throw new Error(`AI error ${res.status}`)
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || ''
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {
    const m = cleaned.match(/(\{[\s\S]*\})/)
    if (m) return JSON.parse(m[0])
    throw new Error('Unreadable answer')
  }
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

    const r = parseRequest(await req.json().catch(() => null))
    if (!r) return json({ error: 'city and date required' }, 400)
    const KEY = Deno.env.get('GEMINI_API_KEY')
    if (!KEY && !Deno.env.get('DEEPSEEK_API_KEY')) return json({ error: 'AI key not configured' }, 500)
    if (!hasGoogle()) return json({ error: 'Places are not available right now.' }, 503)

    // The member's allowance first: nothing outside is called until it says yes (fails closed)
    if (!(await checkAiQuota(user.id))) return json({ error: QUOTA_MESSAGE }, 429)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const where = `${r.city}, ${r.country}`.replace(/, $/, '')
    const origin = await cached(admin, `geo:${where.toLowerCase()}`, 30, () => geocode(where)).catch(() => null)
    // Empty answers say why, so the app can tell "nothing fits" from "not right now"
    const empty = (reason: string) => json({ stops: [], date: r.date, reason })
    if (!origin) return empty('geocode_failed')

    // One search per vibe (at most 3), cached for a week per city
    let refused = 0
    const found = await Promise.all(r.vibes.map(async (v: string) => {
      const key = `fmd:${where.toLowerCase()}:${v}:${origin.lat.toFixed(2)},${origin.lng.toFixed(2)}`.slice(0, 280)
      const res = await cached(admin, key, 7, () => searchText(`${VIBES[v].query} in ${r.city}`, { minRating: 4.0, near: { lat: origin.lat, lng: origin.lng, radius: 3500 }, pageSize: 10 })).catch(() => null)
      if (res == null) refused++
      return (res?.places || []).map((p: any) => ({ ...p, category: VIBES[v].category, minutes: VIBES[v].minutes, vibe: v }))
    }))
    const skip = new Set(r.exclude || [])
    const cands = pickCandidates(found.flat().filter((p: any) => !skip.has(p.place_id)), r.budget)
    const pace = PACES[r.pace as keyof typeof PACES]
    if (refused === r.vibes.length) return empty('google_unavailable')
    if (cands.length < pace.min) return empty('too_few_places')

    const from = r.start_after && toMin(r.start_after) > toMin(DAY_START) ? r.start_after : DAY_START
    let stops = null as any[] | null, source = 'ai'
    try {
      const list = cands.map((p: any, i: number) => ({ i, name: p.name, kind: p.type_label, vibe: p.vibe, rating: p.rating, price: p.price_level != null ? PRICE[p.price_level] : null, hours: hoursFor(p.hours, r.date) || null, area: p.short_address }))
      const ai = await askAi(KEY || '', `You plan one travel day in ${where} on ${r.date}. Choose ${pace.min} to ${pace.max} of these REAL places and put them in a sensible walking order with start times (24h HH:MM) from ${from} to ${'21:30'}. Budget: ${BUDGETS[r.budget as keyof typeof BUDGETS].label}. Moods: ${r.vibes.map((v: string) => VIBES[v].label).join(', ')}.
Rules: use only the index "i" from the list; respect opening hours when given; leave a meal-sized stop around midday if a food place is included; keep neighbouring stops close together. No emoji.
Places: ${JSON.stringify(list)}
Return ONLY JSON: { "stops": [ { "i": 0, "start": "09:30", "minutes": 60, "reason": "one short plain sentence on why it fits" } ] }`)
      stops = validatePlan(ai, cands, r.pace, from)
    } catch (e) { console.warn(`fill-my-day plan: ${(e as Error).message}`) }
    if (!stops) { source = 'basic'; stops = basicPlan(cands, pace.max, from) }

    // Real walking minutes between neighbours (Routes), else the straight-line estimate
    const walks = await Promise.all(stops.slice(1).map(async (s: any, i: number) => {
      const a = stops![i]
      if (a.lat == null || s.lat == null) return estWalk(a, s)
      const w = await routeOne({ lat: a.lat, lng: a.lng }, { lat: s.lat, lng: s.lng }, 'WALK')
      return w?.minutes ?? estWalk(a, s)
    }))
    const timed = retime(stops, walks)
    if (timed.length < pace.min) return empty('too_few_places')

    return json({
      date: r.date, source,
      stops: timed.map((s: any) => ({
        place_id: s.place_id, name: s.name, type: s.type_label || '', category: s.category, address: s.short_address || s.address,
        lat: s.lat, lng: s.lng, rating: s.rating, maps_url: s.maps_url || '', start: s.start, minutes: s.minutes,
        walk_min: s.walk_min, reason: s.reason,
      })),
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}))
