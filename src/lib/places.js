// Google Maps Platform through our `places` Edge Function (the key never reaches the app).
// Everything here fails soft: a null/empty answer means "show the screen without it".
import { supabase } from './supabase'

const memo = new Map()

async function call(action, body = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('places', { body: { action, ...body } })
    return error ? null : data
  } catch { return null }
}

function once(key, fn) {
  if (!memo.has(key)) memo.set(key, fn().then(v => { if (v == null) memo.delete(key); return v }))
  return memo.get(key)
}

/** A per-search session token: typing + the pick are billed by Google as one session. */
export const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

/** Cities matching what the user typed → [{ place_id, main, secondary }]. */
export async function suggestCities(input, session) {
  return (await call('autocomplete', { input, kind: 'city', session }))?.suggestions || []
}

/** Any place (hotel, restaurant, venue, address) → [{ place_id, main, secondary }], biased to `near`. */
export async function suggestPlaces(input, session, near) {
  return (await call('autocomplete', { input, kind: 'place', session, lat: near?.lat, lng: near?.lng }))?.suggestions || []
}

/** City place → { place_id, city, country, country_code, lat, lng, tz, photo }. */
export const cityDetails = (place_id, session) => once(`city:${place_id}`, () => call('city', { place_id, session }))

/** Place → { name, address, lat, lng, rating, rating_count, open_now, hours, phone, website, maps_url, photo }. */
export const placeDetails = (place_id, session) => once(`place:${place_id}`, () => call('place', { place_id, session }))

/** Best match for free text (e.g. "Hotel Arts, Barcelona"), or null. */
export const findPlace = (query, near) => once(`find:${query}`, async () => (await call('find', { query, lat: near?.lat, lng: near?.lng }))?.place || null)

/** Address or place name → { lat, lng, city, country, country_code, address } or null. */
export const geocode = (query) => once(`geo:${query.toLowerCase()}`, () => call('geocode', { query }))

/** Coordinates → { city, country, country_code, ... } or null. */
export const reverseGeocode = (lat, lng) =>
  once(`rev:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`, () => call('reverse', { lat, lng }))

/** Google photo reference → public image URL (expires after a few hours, so memory-only). */
export const photoUrl = (name, w = 640) =>
  name ? once(`photo:${name}:${w}`, async () => (await call('photo', { name, w }))?.url || null) : Promise.resolve(null)

/** Nearest places of a kind: 'hospital' | 'police' | 'pharmacy'. */
export const nearby = (kind, lat, lng) =>
  once(`near:${kind}:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`, async () => (await call('nearby', { kind, lat, lng }))?.places || null)

/** The user's embassy near a point. */
export const embassy = (country, lat, lng) =>
  once(`emb:${country}:${Number(lat).toFixed(1)},${Number(lng).toFixed(1)}`, async () => (await call('embassy', { country, lat, lng }))?.places || null)

/**
 * Static map image as an object URL ({ markers: [{lat, lng}], w, h, dark }). The function returns PNG
 * bytes, which supabase.functions.invoke would read as text, so this one is a plain fetch.
 */
export function staticMapUrl({ markers, w = 600, h = 300, zoom, dark = false }) {
  const pts = (markers || []).filter(m => m && isFinite(m.lat) && isFinite(m.lng))
  if (!pts.length) return Promise.resolve(null)
  const key = `map:${dark}:${w}x${h}:${zoom || ''}:${pts.map(m => `${(+m.lat).toFixed(4)},${(+m.lng).toFixed(4)}`).join('|')}`
  return once(key, async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const base = import.meta.env.VITE_SUPABASE_URL
      if (!session || !base) return null
      const res = await fetch(`${base}/functions/v1/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'staticmap', markers: pts, w, h, zoom, dark }),
      })
      if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null
      return URL.createObjectURL(await res.blob())
    } catch { return null }
  })
}

/** Distance in metres between two { lat, lng } points. */
export function distanceM(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return Math.round(12742000 * Math.asin(Math.sqrt(h)))
}
