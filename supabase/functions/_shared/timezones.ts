// Local-time handling for bookings (owner rule: every booking is in the local time of the place
// it happens). A booking time is stored as the real instant (timestamptz) plus the IANA zone of the
// place: departure_tz (origin), arrival_tz (destination), local_tz (hotel / restaurant / venue).
// Booking emails print local wall-clock times, so we read them as printed and convert them here.
import { AIRPORT_TZ } from './airportZones.ts'
import { allowGoogle } from './google.ts'

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i

export function hasOffset(value: string): boolean {
  return OFFSET_RE.test(value.trim())
}

export function isValidZone(tz: unknown): tz is string {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// Milliseconds the zone is ahead of UTC at a given instant.
function offsetMs(instantMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs))
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(instantMs / 1000) * 1000
}

// "2026-04-01T13:05" read as local time in `tz` → ISO instant. DST-safe (two-pass).
export function wallToInstantISO(wall: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall.trim())
  if (!m) return null
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
  let t = asUtc - offsetMs(asUtc, tz)
  t = asUtc - offsetMs(t, tz)
  return new Date(t).toISOString()
}

type Admin = { from: (t: string) => any }

async function cacheGet(admin: Admin | null, key: string): Promise<string | null> {
  if (!admin) return null
  try {
    const { data } = await admin.from('timezone_cache').select('tz').eq('key', key).maybeSingle()
    return data?.tz || null
  } catch { return null }
}

async function cachePut(admin: Admin | null, key: string, tz: string, source: string) {
  if (!admin) return
  try { await admin.from('timezone_cache').upsert({ key, tz, source }) } catch { /* cache is best-effort */ }
}

async function getJson(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SillyTravelTool/1.0 (hello@sillytraveltool.com)' } })
    return res.ok ? await res.json() : null
  } catch { return null } finally { clearTimeout(timer) }
}

// Google answers 200 with a status like REQUEST_DENIED when the key or API is misconfigured; log why (never the key)
function googleWarn(api: string, d: any) {
  console.warn(`google ${api} fell back: ${d?.status ?? 'no response'}${d?.error_message ? ` — ${d.error_message}` : ''}`)
}

async function zoneForCoords(lat: number, lng: number): Promise<{ tz: string, source: string } | null> {
  const key = Deno.env.get('GOOGLE_MAPS_SERVER_KEY')
  if (key && await allowGoogle('timezone')) {
    const d = await getJson(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`)
    if (d?.status === 'OK' && isValidZone(d.timeZoneId)) return { tz: d.timeZoneId, source: 'google' }
    googleWarn('timezone', d)
  }
  const d = await getJson(`https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lng}`)
  if (isValidZone(d?.timeZone)) return { tz: d.timeZone, source: 'timeapi' }
  return null
}

async function coordsForQuery(query: string): Promise<{ lat: number, lng: number } | null> {
  const key = Deno.env.get('GOOGLE_MAPS_SERVER_KEY')
  if (key && await allowGoogle('geocode')) {
    const d = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`)
    const loc = d?.results?.[0]?.geometry?.location
    if (loc) return { lat: loc.lat, lng: loc.lng }
    googleWarn('geocode', d)
  }
  const d = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`)
  const c = d?.features?.[0]?.geometry?.coordinates
  return c ? { lat: c[1], lng: c[0] } : null
}

/**
 * Time zone for a place. Tries, in order: IATA airport table, cache, Google (geocode + Time Zone
 * API, if GOOGLE_MAPS_SERVER_KEY is set), then free fallbacks (Photon + timeapi.io).
 */
export async function resolveZone(
  admin: Admin | null,
  { iata, query, lat, lng }: { iata?: string | null, query?: string | null, lat?: number | null, lng?: number | null },
): Promise<string | null> {
  const code = (iata || '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(code) && AIRPORT_TZ[code]) return AIRPORT_TZ[code]

  if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
    const key = `ll:${lat.toFixed(2)},${lng.toFixed(2)}`
    const hit = await cacheGet(admin, key)
    if (hit) return hit
    const z = await zoneForCoords(lat, lng)
    if (z) { await cachePut(admin, key, z.tz, z.source); return z.tz }
    return null
  }

  const q = (query || (code ? `${code} airport` : '')).trim().toLowerCase().slice(0, 200)
  if (!q) return null
  const key = `q:${q}`
  const hit = await cacheGet(admin, key)
  if (hit) return hit
  const c = await coordsForQuery(q)
  if (!c) return null
  const z = await zoneForCoords(c.lat, c.lng)
  if (z) { await cachePut(admin, key, z.tz, z.source); return z.tz }
  return null
}

const IATA_RE = /\b([A-Z]{3})\b/

/**
 * Fill departure_tz / arrival_tz / local_tz on a parsed booking and turn wall-clock times into
 * instants. `fallbackTz` is the trip's destination zone (or the destination city's zone).
 */
export async function attachZones(admin: Admin | null, b: Record<string, any>, { fallbackTz = null as string | null, city = '' } = {}) {
  const place = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const airportCode = (s: string) => (b.type === 'flight' ? (IATA_RE.exec(s.toUpperCase())?.[1] || null) : null)

  if (b.departure_time || b.departure_airport) {
    const dep = place(b.departure_airport)
    b.departure_tz = isValidZone(b.departure_tz) ? b.departure_tz
      : await resolveZone(admin, { iata: airportCode(dep), query: dep ? `${dep}${b.type === 'flight' ? ' airport' : ''}` : null }) || fallbackTz
  }
  if (b.arrival_time || b.arrival_airport) {
    const arr = place(b.arrival_airport)
    b.arrival_tz = isValidZone(b.arrival_tz) ? b.arrival_tz
      : await resolveZone(admin, { iata: airportCode(arr), query: arr ? `${arr}${b.type === 'flight' ? ' airport' : ''}` : null }) || fallbackTz
  }
  if (b.check_in_date || b.activity_date || b.hotel_address || b.venue_address) {
    const addr = place(b.hotel_address) || place(b.venue_address) || [place(b.hotel_name) || place(b.venue_name), city].filter(Boolean).join(', ')
    b.local_tz = isValidZone(b.local_tz) ? b.local_tz : (addr ? await resolveZone(admin, { query: addr }) : null) || fallbackTz
  }

  // Times printed on a confirmation are local to the place: convert with that place's zone.
  for (const [field, zone] of [['departure_time', b.departure_tz], ['arrival_time', b.arrival_tz]] as const) {
    const v = b[field]
    if (typeof v !== 'string' || !v.trim()) continue
    if (hasOffset(v)) { const d = new Date(v); b[field] = isNaN(d.getTime()) ? null : d.toISOString(); continue }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) continue // date only: keep for the caller to treat as a date
    b[field] = zone ? wallToInstantISO(v, zone) : (() => { const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString() })()
  }
  return b
}
