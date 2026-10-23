import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { attachZones, resolveZone } from '../_shared/timezones.ts'
import { attachPlace, withGoogleScope, setGoogleUser } from '../_shared/google.ts'
import { fixConnectingLegs, pickDestination, readItinerary } from '../_shared/itinerary.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    setGoogleUser(user.id)

    // { emailText } (pasted text or a spreadsheet as text) or { file: { name, mime, data: base64 }, transcribe }
    const body = await req.json()
    const emailText = String(body.emailText ?? '').slice(0, 20000)
    const file = body.file && typeof body.file.data === 'string' ? { mime: String(body.file.mime || ''), data: body.file.data } : null
    if (!emailText && !file) return new Response(JSON.stringify({ error: 'emailText or file required' }), { status: 400, headers: CORS })
    if (file && file.data.length > 8_000_000) return new Response(JSON.stringify({ error: 'That file is too big (6 MB at most)' }), { status: 413, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    if (!(await checkAiQuota(user.id))) {
      return new Response(JSON.stringify({ error: QUOTA_MESSAGE }), { status: 429, headers: CORS })
    }

    const read = await readItinerary(GEMINI_API_KEY, { text: file ? null : emailText, file, transcribe: !!body.transcribe })
    if (read.error) return new Response(JSON.stringify({ error: read.error }), { status: read.status || 502, headers: CORS })
    const result = read.result
    if (typeof result.read_text === 'string') result.read_text = result.read_text.slice(0, 3000)

    // Local time: attach each place's zone and turn printed local times into instants
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const zoneOf = new Map<string, Promise<string | null>>()
    const cityZone = (city: string | null) => {
      if (!city) return Promise.resolve(null)
      if (!zoneOf.has(city)) zoneOf.set(city, resolveZone(admin, { query: city }))
      return zoneOf.get(city)!
    }
    const aiCity = result.ultimate_destination?.city || null
    const wall = new Map<Record<string, any>, { dep?: string, arr?: string }>()
    for (const b of result.bookings) {
      wall.set(b, { dep: b.departure_time || undefined, arr: b.arrival_time || undefined })
      const legTz = await cityZone(b.destination_city || aiCity)
      await attachZones(admin, b, { fallbackTz: legTz, city: b.destination_city || aiCity || '' })
    }
    // Don't trust the AI on these two: connecting legs in order, and the destination is where you stay
    fixConnectingLegs(result.bookings, wall)
    const picked = pickDestination(result.bookings)
    if (picked) result.ultimate_destination = { ...(result.ultimate_destination || {}), ...picked }
    const destCity = result.ultimate_destination?.city || null
    result.ultimate_destination = { ...(result.ultimate_destination || {}), tz: await cityZone(destCity) }
    await Promise.all(result.bookings.map((b: any) => attachPlace(admin, b, b.destination_city || destCity || '')))

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
}))
