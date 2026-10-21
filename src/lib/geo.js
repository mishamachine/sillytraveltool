import { fetchJson } from './http'

// One-shot device position. Resolves { latitude, longitude } or rejects.
export function getCurrentPosition({ timeout = 10000, maximumAge = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(err),
      { timeout, maximumAge, enableHighAccuracy: false },
    )
  })
}

// Coordinates → { countryCode, countryName, city } using BigDataCloud's free
// client-side endpoint (made for in-browser use, no key). Falls back to Nominatim.
export async function reverseGeocodeCountry(latitude, longitude, ms = 6000) {
  const lat = Number(latitude).toFixed(4)
  const lon = Number(longitude).toFixed(4)
  try {
    const d = await fetchJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      {}, ms,
    )
    if (d?.countryCode) {
      return { countryCode: d.countryCode.toUpperCase(), countryName: d.countryName || d.countryCode, city: d.city || d.locality || null }
    }
  } catch { /* try fallback */ }
  const d = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=5&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }, ms,
  )
  const cc = d?.address?.country_code
  if (!cc) throw new Error('Country not found')
  return { countryCode: cc.toUpperCase(), countryName: d.address.country || cc.toUpperCase(), city: d.address.city || d.address.town || null }
}
