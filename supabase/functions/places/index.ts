import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  autocomplete, cached, geocode, reverseGeocode, placeDetails, normalizePlace, photoUri, searchNearby, searchText,
  staticMap, DETAIL_FIELDS, routeTimes, withGoogleScope, setGoogleUser,
} from '../_shared/google.ts'
import { resolveZone } from '../_shared/timezones.ts'

// Google Maps Platform for the app, behind auth. The key stays server-side.
// POST { action, ... }:
//   autocomplete { input, kind: 'city' | 'place', session?, lat?, lng? } → { suggestions: [{ place_id, main, secondary }] }
//   city         { place_id, session? } → { city, country, country_code, lat, lng, tz, place_id, photo }
//   place        { place_id, session? } → place details (hours, open now, phone, rating, website, photo)
//   find         { query, lat?, lng? }  → best matching place, or null
//   geocode      { query } → { lat, lng, city, country, country_code, address }
//   reverse      { lat, lng } → same shape
//   photo        { name, w? } → { url } (short-lived public image URL)
//   nearby       { lat, lng, kind: 'hospital' | 'police' | 'pharmacy' } → { places }
//   embassy      { lat, lng, country } → { places }
//   staticmap    { markers: [{ lat, lng }], w?, h?, dark? } → PNG
//   routes       { lat, lng, to_lat, to_lng } → { walk, transit, drive: { minutes, metres } | null }
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v: unknown, lim: number) => { const n = Number(v); return v != null && v !== '' && isFinite(n) && Math.abs(n) <= lim ? n : null }
const NEARBY: Record<string, string[]> = { hospital: ['hospital'], police: ['police'], pharmacy: ['pharmacy'] }

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error } = await anon.auth.getUser(auth.replace('Bearer ', ''))
    if (error || !user) return json({ error: 'Unauthorized' }, 401)
    setGoogleUser(user.id)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const b = await req.json().catch(() => ({}))
    const lat = num(b.lat, 90), lng = num(b.lng, 180)
    const point = lat != null && lng != null ? { lat, lng } : undefined
    const session = str(b.session, 64) || undefined

    switch (b.action) {
      case 'autocomplete': {
        const input = str(b.input, 120)
        if (input.length < 2) return json({ suggestions: [] })
        const types = b.kind === 'city' ? ['locality', 'postal_town', 'administrative_area_level_3'] : undefined
        // Per-keystroke results are not cached: session tokens make the typing + pick one billed session
        return json({ suggestions: (await autocomplete(input, { types, sessionToken: session, near: point })) || [] })
      }

      case 'city': {
        const id = str(b.place_id, 300)
        const out = await cached(admin, `city:${id}`, 30, async () => {
          const d = await placeDetails(id, ['id', 'displayName', 'addressComponents', 'location', 'photos'])
          if (!d) return null
          const comp = (t: string) => d.addressComponents?.find((c: any) => c.types.includes(t))
          const country = comp('country')
          const lat = d.location?.latitude ?? null, lng = d.location?.longitude ?? null
          return {
            place_id: d.id, city: d.displayName?.text || comp('locality')?.longText || '',
            country: country?.longText || '', country_code: (country?.shortText || '').toUpperCase(),
            lat, lng, photo: d.photos?.[0]?.name || null,
            tz: lat != null && lng != null ? await resolveZone(admin, { lat, lng }) : null,
          }
        })
        return out ? json(out) : json({ error: 'City not found' }, 404)
      }

      case 'place': {
        const id = str(b.place_id, 300)
        // Opening hours change: keep details for a day
        const out = await cached(admin, `place:v2:${id}`, 1, async () => {
          const d = await placeDetails(id, DETAIL_FIELDS)
          // country_code: Get there picks ride apps by the place's country, not the trip's
          const country = d?.addressComponents?.find((c: any) => c.types?.includes('country'))
          return d ? {
            ...normalizePlace(d), phone: d.internationalPhoneNumber || d.nationalPhoneNumber || null,
            country_code: (country?.shortText || '').toUpperCase() || null,
          } : null
        })
        return out ? json(out) : json({ error: 'Place not found' }, 404)
      }

      case 'find': {
        const q = str(b.query)
        if (!q) return json({ place: null })
        const out = await cached(admin, `find:${q.toLowerCase()}`, 30, async () => {
          const r = await searchText(q, { pageSize: 1, near: point ? { ...point, radius: 50000 } : undefined })
          return r?.places?.[0] || null
        })
        return json({ place: out })
      }

      case 'geocode': {
        const q = str(b.query)
        if (!q) return json({ error: 'query required' }, 400)
        const out = await cached(admin, `geo:${q.toLowerCase()}`, 30, () => geocode(q))
        return out ? json(out) : json({ error: 'Not found' }, 404)
      }

      case 'reverse': {
        if (!point) return json({ error: 'lat/lng required' }, 400)
        const out = await cached(admin, `rev:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`, 30, () => reverseGeocode(point.lat, point.lng))
        return out ? json(out) : json({ error: 'Not found' }, 404)
      }

      case 'photo': {
        const name = str(b.name, 500)
        const w = Math.min(Math.max(Number(b.w) || 640, 100), 1600)
        // Photo URLs expire; reuse one for a few hours
        const out = await cached(admin, `photo:${name}:${w}`, 0.25, async () => {
          const url = await photoUri(name, w)
          return url ? { url } : null
        })
        return out ? json(out) : json({ error: 'Photo not available' }, 404)
      }

      case 'nearby': {
        const types = NEARBY[str(b.kind, 20)]
        if (!point || !types) return json({ error: 'lat/lng and kind required' }, 400)
        const out = await cached(admin, `near:${b.kind}:${point.lat.toFixed(2)},${point.lng.toFixed(2)}`, 7,
          () => searchNearby(point.lat, point.lng, types))
        return json({ places: out || [] })
      }

      case 'embassy': {
        const country = str(b.country, 80)
        if (!point || !country) return json({ error: 'lat/lng and country required' }, 400)
        const out = await cached(admin, `emb:${country.toLowerCase()}:${point.lat.toFixed(1)},${point.lng.toFixed(1)}`, 30, async () => {
          const r = await searchText(`Embassy of ${country}`, { includedType: 'embassy', pageSize: 3, near: { ...point, radius: 50000 } })
          return r?.places || null
        })
        return json({ places: out || [] })
      }

      case 'staticmap': {
        const markers = (Array.isArray(b.markers) ? b.markers : []).slice(0, 20)
          .map((m: any) => ({ lat: num(m?.lat, 90), lng: num(m?.lng, 180) }))
          .filter((m: any) => m.lat != null && m.lng != null)
        const res = await staticMap(markers, { w: Number(b.w) || 600, h: Number(b.h) || 300, zoom: num(b.zoom, 21), dark: !!b.dark })
        if (!res) return json({ error: 'Map not available' }, 404)
        return new Response(res.body, { headers: { ...CORS, 'Content-Type': res.headers.get('Content-Type') || 'image/png', 'Cache-Control': 'private, max-age=86400' } })
      }

      case 'routes': {
        const toLat = num(b.to_lat, 90), toLng = num(b.to_lng, 180)
        if (!point || toLat == null || toLng == null) return json({ error: 'lat/lng and to_lat/to_lng required' }, 400)
        // Origins rounded to ~100 m and cached briefly: traffic and transit timetables change through the day
        const key = `route:${point.lat.toFixed(3)},${point.lng.toFixed(3)}>${toLat.toFixed(4)},${toLng.toFixed(4)}`
        const out = await cached(admin, key, 1 / 96, () => routeTimes(point, { lat: toLat, lng: toLng }))
        return json(out || { walk: null, transit: null, drive: null })
      }

      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}))
