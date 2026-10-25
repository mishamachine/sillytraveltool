import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { resolveZone, isValidZone } from '../_shared/timezones.ts'
import { withGoogleScope, setGoogleUser } from '../_shared/google.ts'

// POST { iata?, query?, lat?, lng? } → { tz } — the IANA time zone of an airport, station, venue or point.
// Signed-in users only. Results are cached in public.timezone_cache (service role).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error } = await anon.auth.getUser(auth.replace('Bearer ', ''))
    if (error || !user) return json({ error: 'Unauthorized' }, 401)
    setGoogleUser(user.id)

    const body = await req.json().catch(() => ({}))
    const lat = body.lat == null ? null : Number(body.lat)
    const lng = body.lng == null ? null : Number(body.lng)
    const input = {
      iata: typeof body.iata === 'string' ? body.iata.slice(0, 3) : null,
      query: typeof body.query === 'string' ? body.query.slice(0, 200) : null,
      lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
      lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
    }
    if (!input.iata && !input.query && (input.lat == null || input.lng == null)) return json({ error: 'iata, query or lat/lng required' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const tz = await resolveZone(admin, input)
    return json({ tz: isValidZone(tz) ? tz : null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}))
