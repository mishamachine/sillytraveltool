// Google Maps Platform, server-side only. The key lives in the GOOGLE_MAPS_SERVER_KEY secret and never
// reaches the client. Every helper returns null on failure so callers can fall back.
// Google's terms allow caching place IDs indefinitely and other place content for up to 30 days.

const KEY = () => Deno.env.get('GOOGLE_MAPS_SERVER_KEY') || ''
export const hasGoogle = () => !!KEY()

type Admin = { from: (t: string) => any }

async function call(url: string, init: RequestInit = {}, ms = 8000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const body = await res.json().catch(() => null)
    if (!res.ok) { console.warn(`google ${new URL(url).pathname} ${res.status}: ${body?.error?.message || ''}`.slice(0, 300)); return null }
    return body
  } catch (e) {
    console.warn(`google ${new URL(url).pathname} failed: ${(e as Error).message}`)
    return null
  } finally { clearTimeout(timer) }
}

function placesHeaders(fieldMask: string) {
  return { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY(), 'X-Goog-FieldMask': fieldMask }
}

// ── Cache (public.google_cache, service role only) ─────────────────────────────
export async function cached<T>(admin: Admin | null, key: string, days: number, fn: () => Promise<T | null>): Promise<T | null> {
  if (admin) {
    try {
      const { data } = await admin.from('google_cache').select('data, expires_at').eq('key', key).maybeSingle()
      if (data && new Date(data.expires_at) > new Date()) return data.data as T
    } catch { /* cache is best-effort */ }
  }
  const fresh = await fn()
  if (fresh != null && admin) {
    const expires = new Date(Date.now() + days * 864e5).toISOString()
    try { await admin.from('google_cache').upsert({ key: key.slice(0, 300), data: fresh, expires_at: expires }) } catch { /* best-effort */ }
  }
  return fresh
}

// ── Places API (New) ───────────────────────────────────────────────────────────
const LIST_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'location', 'rating', 'userRatingCount',
  'priceLevel', 'googleMapsUri', 'websiteUri', 'photos', 'primaryType', 'primaryTypeDisplayName', 'editorialSummary',
  'businessStatus', 'regularOpeningHours.weekdayDescriptions', 'currentOpeningHours.openNow',
]

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

export type Place = {
  place_id: string, name: string, address: string, short_address: string | null, lat: number | null, lng: number | null,
  rating: number | null, rating_count: number | null, price_level: number | null, maps_url: string | null,
  website: string | null, photo: string | null, type_label: string | null, primary_type: string | null,
  summary: string | null, open_now: boolean | null, hours: string[] | null, closed: boolean,
}

export function normalizePlace(p: any): Place {
  return {
    place_id: p.id,
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    short_address: p.shortFormattedAddress || null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    price_level: p.priceLevel ? PRICE[p.priceLevel] ?? null : null,
    maps_url: p.googleMapsUri || null,
    website: p.websiteUri || null,
    photo: p.photos?.[0]?.name || null,
    type_label: p.primaryTypeDisplayName?.text || null,
    primary_type: p.primaryType || null,
    summary: p.editorialSummary?.text || null,
    open_now: p.currentOpeningHours?.openNow ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions || null,
    closed: p.businessStatus === "CLOSED_PERMANENTLY" || p.businessStatus === "CLOSED_TEMPORARILY",
  }
}

export async function searchText(textQuery: string, opts: {
  includedType?: string, priceLevels?: string[], openNow?: boolean, minRating?: number,
  near?: { lat: number, lng: number, radius: number }, pageSize?: number, pageToken?: string,
} = {}): Promise<{ places: Place[], next: string | null } | null> {
  if (!hasGoogle()) return null
  const body: Record<string, unknown> = { textQuery, languageCode: 'en', pageSize: opts.pageSize || 20 }
  if (opts.includedType) { body.includedType = opts.includedType; body.strictTypeFiltering = true }
  if (opts.priceLevels) body.priceLevels = opts.priceLevels
  if (opts.openNow) body.openNow = true
  if (opts.minRating) body.minRating = opts.minRating
  if (opts.pageToken) body.pageToken = opts.pageToken
  if (opts.near) body.locationBias = { circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: opts.near.radius } }
  const d = await call('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: placesHeaders([...LIST_FIELDS.map(f => `places.${f}`), 'nextPageToken'].join(',')), body: JSON.stringify(body),
  })
  if (!d) return null
  const places = (d.places || []).map(normalizePlace).filter((p: Place) => p.name)
  return { places, next: d.nextPageToken || null }
}

/** Places of the given types closest to a point (SOS: hospital, police, pharmacy). */
export async function searchNearby(lat: number, lng: number, types: string[], { radius = 15000, max = 5 } = {}): Promise<Place[] | null> {
  if (!hasGoogle()) return null
  const d = await call('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: placesHeaders([...LIST_FIELDS, 'internationalPhoneNumber'].map(f => `places.${f}`).join(',')),
    body: JSON.stringify({
      includedPrimaryTypes: types, maxResultCount: max, rankPreference: 'DISTANCE', languageCode: 'en',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
  })
  if (!d) return null
  return (d.places || []).map((p: any) => ({ ...normalizePlace(p), phone: p.internationalPhoneNumber || null }))
}

export const DETAIL_FIELDS = [...LIST_FIELDS, 'internationalPhoneNumber', 'nationalPhoneNumber', 'utcOffsetMinutes', 'addressComponents']

export async function placeDetails(id: string, fields = LIST_FIELDS): Promise<any | null> {
  if (!hasGoogle() || !/^[\w-]{10,300}$/.test(id)) return null
  return await call(`https://places.googleapis.com/v1/places/${id}?languageCode=en`, { headers: placesHeaders(fields.join(',')) })
}

export async function autocomplete(input: string, opts: { types?: string[], sessionToken?: string, near?: { lat: number, lng: number } } = {}) {
  if (!hasGoogle()) return null
  const body: Record<string, unknown> = { input, languageCode: 'en' }
  if (opts.types) body.includedPrimaryTypes = opts.types
  if (opts.sessionToken) body.sessionToken = opts.sessionToken
  if (opts.near) body.locationBias = { circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: 30000 } }
  const d = await call('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY() }, body: JSON.stringify(body),
  })
  if (!d) return null
  return (d.suggestions || []).map((s: any) => s.placePrediction).filter(Boolean).map((p: any) => ({
    place_id: p.placeId,
    main: p.structuredFormat?.mainText?.text || p.text?.text || '',
    secondary: p.structuredFormat?.secondaryText?.text || '',
  }))
}

/** Short-lived public image URL for a place photo (the key stays server-side). */
export async function photoUri(name: string, maxPx = 640): Promise<string | null> {
  if (!hasGoogle() || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return null
  const d = await call(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxPx}&skipHttpRedirect=true`, { headers: { 'X-Goog-Api-Key': KEY() } })
  return d?.photoUri || null
}

// ── Geocoding ──────────────────────────────────────────────────────────────────
export type Geo = { lat: number, lng: number, city: string | null, country: string | null, country_code: string | null, address: string }

function fromGeocodeResult(r: any): Geo {
  const comp = (t: string) => r.address_components?.find((c: any) => c.types.includes(t))
  const country = comp('country')
  return {
    lat: r.geometry.location.lat, lng: r.geometry.location.lng,
    city: (comp('locality') || comp('postal_town') || comp('administrative_area_level_2') || comp('administrative_area_level_1'))?.long_name || null,
    country: country?.long_name || null,
    country_code: country?.short_name?.toUpperCase() || null,
    address: r.formatted_address || '',
  }
}

export async function geocode(address: string): Promise<Geo | null> {
  if (!hasGoogle()) return null
  const d = await call(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=en&key=${KEY()}`)
  if (d?.status !== 'OK') { if (d) console.warn(`google geocode: ${d.status} ${d.error_message || ''}`); return null }
  return fromGeocodeResult(d.results[0])
}

export async function reverseGeocode(lat: number, lng: number): Promise<Geo | null> {
  if (!hasGoogle()) return null
  const d = await call(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&result_type=locality|postal_town|administrative_area_level_2|country&key=${KEY()}`)
  if (d?.status !== 'OK') { if (d) console.warn(`google reverse geocode: ${d.status} ${d.error_message || ''}`); return null }
  return fromGeocodeResult(d.results[0])
}

// ── Static map (image bytes; the URL carries the key so it is fetched here, not by the client) ──
export async function staticMap(markers: { lat: number, lng: number }[], { w = 600, h = 300, zoom = null as number | null, dark = false } = {}): Promise<Response | null> {
  if (!hasGoogle() || !markers.length) return null
  const pts = markers.slice(0, 20).map(m => `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|')
  const style = dark
    ? '&style=element:geometry|color:0x242f3e&style=element:labels.text.fill|color:0x9aa0a6&style=element:labels.text.stroke|color:0x242f3e&style=feature:water|element:geometry|color:0x17263c&style=feature:road|element:geometry|color:0x38414e'
    : ''
  const url = `https://maps.googleapis.com/maps/api/staticmap?size=${Math.min(w, 640)}x${Math.min(h, 640)}&scale=2${zoom ? `&zoom=${zoom}` : ''}&markers=color:0xB24A17|${pts}${style}&key=${KEY()}`
  try {
    const res = await fetch(url)
    if (!res.ok) { console.warn(`google staticmap ${res.status}`); return null }
    return res
  } catch { return null }
}

// ── Booking enrichment ─────────────────────────────────────────────────────────
/** Match an imported hotel / restaurant / venue to its Google place: place_id, coordinates, full address. */
export async function attachPlace(admin: Admin | null, b: Record<string, any>, city = '') {
  if (!hasGoogle() || b.place_id || b.type === 'flight' || b.type === 'transport') return b
  const name = String(b.hotel_name || b.venue_name || '').trim()
  if (!name) return b
  const where = String(b.hotel_address || b.venue_address || city || '').trim()
  const q = [name, where].filter(Boolean).join(', ').slice(0, 200)
  const p = await cached(admin, `find:${q.toLowerCase()}`, 30, async () => (await searchText(q, { pageSize: 1 }))?.places?.[0] || null)
  if (!p?.place_id) return b
  b.place_id = p.place_id
  b.place_lat = p.lat
  b.place_lng = p.lng
  const addrKey = b.hotel_name ? 'hotel_address' : 'venue_address'
  if (!b[addrKey] || String(b[addrKey]).length < 12) b[addrKey] = p.address
  return b
}

// ── Routes (travel times for "Get there") ──────────────────────────────────────
const ROUTE_MODES = { walk: 'WALK', transit: 'TRANSIT', drive: 'DRIVE' } as const

/** Minutes and metres from origin to destination for walking, transit and driving (null per mode when unavailable). */
export async function routeTimes(from: { lat: number, lng: number }, to: { lat: number, lng: number }) {
  if (!hasGoogle()) return null
  const point = (p: { lat: number, lng: number }) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } })
  const one = async (mode: string) => {
    const d = await call('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY(), 'X-Goog-FieldMask': 'duration,distanceMeters,condition' },
      body: JSON.stringify({ origins: [point(from)], destinations: [point(to)], travelMode: mode }),
    })
    const e = Array.isArray(d) ? d[0] : null
    if (!e || e.condition !== 'ROUTE_EXISTS' || !e.duration) return null
    return { minutes: Math.max(1, Math.round(parseInt(e.duration, 10) / 60)), metres: e.distanceMeters ?? null }
  }
  const entries = await Promise.all(Object.entries(ROUTE_MODES).map(async ([k, m]) => [k, await one(m)] as const))
  return Object.fromEntries(entries)
}
