import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap, checkAiQuota, GUIDE_QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { geocode, searchText, cached, withGoogleScope, setGoogleUser, type Place, type Geo } from '../_shared/google.ts'
import { validPlaceName, canonicalPlace, sanitizeSection, cleanText, excludeFromCache } from './validate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sections the AI writes on its own
const AI_SECTIONS = ['overview', 'see_neighbourhoods', 'see_daytrips', 'move', 'events']
// A section stops growing here: "load more" can't be used to pile up AI calls on one cache row
const MAX_SECTION_ITEMS = 60

// Sections built from real Google places; the AI only writes the Goose's words for them (stage 'voice').
// Neighbourhoods, day trips, overview, move and events stay Gemini-written (Places has no good source).
const PLACE_SECTIONS: Record<string, { query: string, type?: string, price?: string[], minRating?: number, restaurant?: boolean }> = {
  eat_cheap:   { query: 'best cheap eats and local favourites', type: 'restaurant', price: ['PRICE_LEVEL_INEXPENSIVE'], minRating: 4, restaurant: true },
  eat_mid:     { query: 'best restaurants', type: 'restaurant', price: ['PRICE_LEVEL_MODERATE'], minRating: 4, restaurant: true },
  eat_splurge: { query: 'best fine dining restaurants', type: 'restaurant', price: ['PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'], minRating: 4, restaurant: true },
  see_temples: { query: 'famous temples, churches, cathedrals, mosques and shrines', minRating: 4 },
  see_museums: { query: 'best museums and galleries', type: 'museum', minRating: 4 },
  see_parks:   { query: 'best parks and gardens', type: 'park', minRating: 4 },
}

const km = (a: { lat: number, lng: number }, b: { lat: number, lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Up to 60 Google candidates for a section near the city, skipping closed places and names already shown. */
async function placeCandidates(section: string, city: string, country: string, center: Geo, exclude: string[]): Promise<Place[] | null> {
  const s = PLACE_SECTIONS[section]
  const skip = new Set(exclude.map(n => n.toLowerCase()))
  // Same-named cities exist (Granada, Spain / Nicaragua / Mexico City's Granada): stay within 40 km of this one
  const near = (p: Place) => p.lat == null || p.lng == null || km(center, { lat: p.lat, lng: p.lng }) <= 40
  // Google doesn't always honour priceLevels: keep the section's price band (one step wider if that leaves too few)
  const band = s.price ? s.price.map(p => PRICE_RANK[p]) : null
  const inBand = (p: Place, slack = 0) => !band || p.price_level == null || (p.price_level >= Math.min(...band) - slack && p.price_level <= Math.max(...band) + slack)
  const out: Place[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 3; page++) {
    const r = await searchText(`${s.query} in ${city}, ${country}`, {
      includedType: s.type, priceLevels: s.price, minRating: s.minRating, pageToken,
      near: { lat: center.lat, lng: center.lng, radius: 20000 },
    })
    if (!r) { if (page === 0) return null; break }
    out.push(...r.places.filter(p => !p.closed && near(p) && !skip.has(p.name.toLowerCase()) && !out.some(o => o.place_id === p.place_id)))
    if (out.filter(p => inBand(p)).length >= 18 || !r.next) break // 18 good candidates is plenty for 15 cards; more pages cost time
    pageToken = r.next
  }
  const strict = out.filter(p => inBand(p))
  return strict.length >= 8 ? strict : out.filter(p => inBand(p, 1))
}

const PRICE_RANK: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 }

// Well-rated AND well-reviewed first: 4.8 from 30 reviews ranks below 4.6 from 8,000
const placeScore = (p: { rating: number | null, rating_count: number | null }) => (p.rating || 0) * Math.log10((p.rating_count || 0) + 10)

/**
 * Facts stage: the 15 best Google places as cards, Goose text still to come (pending: true).
 * The order is fixed here so the Goose's words can "ink in" later without cards jumping around.
 */
function factItems(section: string, city: string, places: Place[]) {
  const restaurant = PLACE_SECTIONS[section].restaurant
  const top = places.slice().sort((a, b) => placeScore(b) - placeScore(a)).slice(0, 15)
  // Google's data still goes through the cache guard (lengths, control characters); its websiteUri is trusted
  const googleSites = new Map(top.map(p => [p.place_id, p.website]))
  return sanitizeSection(top.map(p => ({
    name: p.name,
    ...(restaurant ? { cuisine: p.type_label || '', price_tier: p.price_level ?? null } : { type: p.type_label || '' }),
    address: p.short_address || p.address,
    summary: p.summary || '',
    description: '',
    goose_quip: '',
    goose_score: null as number | null,
    is_goose_pick: false,
    pending: true,
    google_maps_query: `${p.name} ${city}`,
    official_url: p.website || '',
    place_id: p.place_id, maps_url: p.maps_url, rating: p.rating, rating_count: p.rating_count,
    photo: p.photo, lat: p.lat, lng: p.lng, hours: p.hours,
  })), { fromAi: false, googleSites }) as any[]
}

function voicePrompt(section: string, city: string, country: string, items: any[]): string {
  const restaurant = PLACE_SECTIONS[section].restaurant
  const list = items.map((p, i) => ({ i, name: p.name, type: p.cuisine || p.type, rating: p.rating, reviews: p.rating_count, price: p.price_tier, summary: p.summary, area: p.address }))
  return `You are The Goose — opinionated, slightly cheeky travel guide with genuine insider knowledge of ${city}, ${country}.
These are REAL places from Google Maps (rating out of 5, reviews = number of Google reviews):
${JSON.stringify(list)}

Write for EVERY place in the list, keeping the index. Return ONLY a valid JSON object, no markdown:
{ "items": [ { "i": 0, ${restaurant ? '"cuisine": "specific cuisine", ' : '"type": "specific type/era/style", '}"description": "2 sentences — ${restaurant ? 'what to order, the vibe' : 'what you see and why it matters'}", "goose_quip": "${restaurant ? 'witty one-liner specific to this place' : 'what most tourists miss or get wrong here'}", "goose_score": 8.4, "is_goose_pick": false } ] }
goose_score is your own score out of 10. Mark is_goose_pick: true for at most 2 places in this list. Never invent facts that contradict the data.`
}

/** Voice stage: merge the Goose's words into the pending cards, in place. */
function withVoice(section: string, items: any[], targets: any[], words: any[]) {
  const restaurant = PLACE_SECTIONS[section].restaurant
  const byId = new Map<string, any>()
  for (const w of words) if (Number.isInteger(w?.i) && targets[w.i]) byId.set(targets[w.i].place_id, w)
  const asked = new Set(targets.map(t => t.place_id))
  return items.map(it => {
    if (!it.pending || !asked.has(it.place_id)) return it // not in this batch: stays pending for the next call
    const g = byId.get(it.place_id)
    const { pending: _p, ...rest } = it
    if (!g) return { ...rest, description: rest.summary || '' } // no words for this one: show Google's summary
    return {
      ...rest,
      ...(restaurant ? { cuisine: cleanText(g.cuisine, 60) || it.cuisine } : { type: cleanText(g.type, 60) || it.type }),
      description: cleanText(g.description, 400) || it.summary || '',
      goose_quip: cleanText(g.goose_quip, 200),
      goose_score: typeof g.goose_score === 'number' && Number.isFinite(g.goose_score) ? g.goose_score : null,
      is_goose_pick: !!g.is_goose_pick,
    }
  })
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
items must have EXACTLY 15 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 1, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'eat_mid') {
    return `You are The Goose — opinionated travel guide with genuine insider food knowledge.
Return ONLY a valid JSON object for mid-range dining in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 2, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'eat_splurge') {
    return `You are The Goose — opinionated travel guide with genuine insider food knowledge.
Return ONLY a valid JSON object for splurge dining in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "actual restaurant name", "cuisine": "specific cuisine", "price_tier": 3, "address": "real street address", "description": "2 sentences — what to order, the vibe", "goose_quip": "witty one-liner specific to this place", "goose_score": 8.4, "rating_estimate": 8.4, "is_goose_pick": false, "google_maps_query": "restaurant name ${city}" }
Mark is_goose_pick: true for the 1-2 best picks. Use real restaurants in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_temples') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for temples, shrines and religious sites in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "real place name", "type": "specific type/era/style", "address": "real address or area", "description": "2 sentences on what you see and why it matters", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "place name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real places in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_neighbourhoods') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for neighbourhoods and districts to explore in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "real neighbourhood name", "type": "character/vibe e.g. bohemian, historic, foodie", "address": "area or district", "description": "2 sentences on the vibe and what to do there", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "neighbourhood name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real neighbourhoods in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_museums') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for museums and galleries in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "real museum name", "type": "type e.g. art, history, science", "address": "real address", "description": "2 sentences on the collection and why to go", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "museum name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real museums in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_parks') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for parks, gardens and outdoor spaces in ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
{ "name": "real park name", "type": "type e.g. urban park, botanical garden, waterfront", "address": "real address or area", "description": "2 sentences on what makes it worth visiting", "goose_quip": "what most tourists miss or get wrong here", "is_goose_pick": false, "official_url": "real URL or empty string", "wikipedia_url": "real wikipedia URL or empty string", "google_maps_query": "park name ${city}" }
Mark is_goose_pick: true for the 1-2 best. Use real parks in ${city}, ${country}.${excludeClause}`
  }

  if (section === 'see_daytrips') {
    return `You are The Goose — opinionated travel guide.
Return ONLY a valid JSON object for day trips from ${city}, ${country}. No markdown, no preamble. Raw JSON only.
{ "items": [] }
items must have EXACTLY 15 objects:
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

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    setGoogleUser(user.id)

    const raw = await req.json()
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    const section = cap(raw.section || 'overview', 40)
    if (!PLACE_SECTIONS[section] && !AI_SECTIONS.includes(section)) return reply({ error: 'Unknown section' }, 400)
    // Only plain place names reach the geocoder; the prompt and the cache key then use Google's names, never the
    // body's (audit S3: a crafted city could otherwise steer the prompt or write into another city's cache)
    const askedCity = validPlaceName(raw.city), askedCountry = validPlaceName(raw.country)
    if (!askedCity || !askedCountry) return reply({ error: 'city and country must be plain place names' }, 400)

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    // stage: 'facts' = Google cards only, fast, no AI; 'voice' = the Goose's words for pending cards;
    // omitted = both in one call (older app builds)
    const stage = raw.stage === 'facts' || raw.stage === 'voice' ? raw.stage : 'full'

    // Shared cache is server-written only (clients have read access)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const query = `${askedCity}, ${askedCountry}`
    const center = await cached(admin, `geo:${query.toLowerCase()}`, 30, () => geocode(query)).catch(() => null)
    const place = canonicalPlace(center)
    if (!center || !place) return reply({ error: 'We could not find that city' }, 422)
    const { city, country, key: destinationKey } = place

    let cachedRow: any = null
    let freshIds: Set<string> | null = null // load-more in one call: older builds expect only the new items back
    {
      const { data } = await admin.from('guide_cache_sections').select('data, expires_at')
        .eq('destination_key', destinationKey).eq('section', section).maybeSingle()
      cachedRow = data && new Date(data.expires_at) > new Date() ? data : null
    }
    // "Load more" only appends to a section already cached under this same key, and steers away from the names
    // in that section; the request's exclude_names is just the trigger, never prompt text
    const baseItems = Array.isArray(cachedRow?.data?.items) ? cachedRow.data.items : null
    const wantsMore = Array.isArray(raw.exclude_names) && raw.exclude_names.length > 0
    if (wantsMore && baseItems && baseItems.length >= MAX_SECTION_ITEMS) return reply({ section, items: [] }) // nothing more to add
    const isLoadMore = wantsMore && !!baseItems
    const exclude_names = isLoadMore ? excludeFromCache(baseItems) : []
    {
      const needsVoice = stage !== 'facts' && cachedRow?.data?.voice_pending
      if (!isLoadMore && cachedRow?.data && !needsVoice && stage !== 'voice') return reply(cachedRow.data)
      if (stage === 'voice' && cachedRow?.data && !cachedRow.data.voice_pending) return reply(cachedRow.data)
    }
    const writeCache = async (data: any) => {
      const expires = new Date(); expires.setDate(expires.getDate() + 7)
      const { error: cacheErr } = await admin.from('guide_cache_sections').upsert({
        destination_key: destinationKey, destination_city: city, destination_country: country,
        section, data, generated_at: new Date().toISOString(), expires_at: expires.toISOString(),
      }, { onConflict: 'destination_key,section' })
      if (cacheErr) console.error('guide_cache_sections write failed:', cacheErr.message)
    }

    // ── Facts: real places from Google, no AI ──
    if (PLACE_SECTIONS[section] && stage !== 'voice' && (isLoadMore || !cachedRow?.data)) {
      const places = await placeCandidates(section, city, country, center, exclude_names)
      if (places?.length) {
        const fresh = factItems(section, city, places)
        const data = isLoadMore && Array.isArray(cachedRow?.data?.items)
          ? { ...cachedRow.data, items: [...cachedRow.data.items, ...fresh], voice_pending: true }
          : { section, items: fresh, source: 'google', voice_pending: true }
        await writeCache(data)
        if (stage === 'facts') return reply(isLoadMore ? { section, items: fresh, voice_pending: true } : data)
        cachedRow = { data }
        if (isLoadMore) freshIds = new Set(fresh.map(f => f.place_id))
      }
    }

    // Guide sections go into the shared cache for everyone: their own daily allowance, not the user's AI requests
    if (!(await checkAiQuota(user.id, 'guide'))) return reply({ error: GUIDE_QUOTA_MESSAGE }, 429)

    const askGemini = async (prompt: string, maxOutputTokens = 3000) => {
      const gemRes = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens } }, { timeoutMs: 35000 }) // 15 items take DeepSeek a while
      if (!gemRes.ok) throw new Error(`Gemini error: ${(await gemRes.text()).slice(0, 200)}`)
      const text = (await gemRes.json()).candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('No content from Gemini')
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      try { return JSON.parse(cleaned) } catch {
        const m = cleaned.match(/(\{[\s\S]*\})/)
        if (m) return JSON.parse(m[0])
        throw new Error('Failed to parse Gemini response')
      }
    }

    // ── Voice: the Goose's words for the pending cards ──
    if (PLACE_SECTIONS[section] && cachedRow?.data?.voice_pending && Array.isArray(cachedRow.data.items)) {
      const items = cachedRow.data.items
      const targets = items.filter((it: any) => it.pending).slice(0, 15)
      try {
        const words = (await askGemini(voicePrompt(section, city, country, targets), 5000))?.items
        const merged = withVoice(section, items, targets, Array.isArray(words) ? words : [])
        const data = { ...cachedRow.data, items: merged, voice_pending: merged.some((it: any) => it.pending) }
        await writeCache(data)
        return reply(freshIds ? { section, items: merged.filter((it: any) => freshIds!.has(it.place_id)) } : data)
      } catch (e) {
        // Leave the cards pending so the next viewer retries; the app stops waiting for this one
        console.warn(`guide voice: ${(e as Error).message}`)
        return reply({ ...cachedRow.data, voice_error: true })
      }
    }
    if (stage === 'voice') return reply({ error: 'Nothing waiting for the Goose: load the facts first' }, 409)

    // ── AI-only sections (overview, neighbourhoods, day trips, transit, events), or Google unavailable ──
    let result
    try { result = await askGemini(buildPrompt(city, country, section, exclude_names), 5000) } catch (e) {
      console.warn(`guide ${section}: ${(e as Error).message}`)
      return reply({ error: (e as Error).message }, 502)
    }
    // Everything the AI wrote is checked before anyone sees it: links allow-listed, text capped and cleaned
    result = sanitizeSection(result && typeof result === 'object' && !Array.isArray(result) ? result : {})
    const content = { ...result, section }
    // Load-more appends to the cached section; a fresh load replaces it
    await writeCache(isLoadMore && Array.isArray(cachedRow?.data?.items)
      ? { ...cachedRow.data, items: [...cachedRow.data.items, ...(Array.isArray(result?.items) ? result.items : [])] }
      : content)
    return reply(content)

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
}))
