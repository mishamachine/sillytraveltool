// Open-Meteo helpers shared by the Today view and the trip Weather tab.
import { fetchWithTimeout } from './http'

// WMO weather code → icon name (src/ui/icons) + label
export function weatherInfo(code) {
  if (code == null) return { icon: 'cloud', label: 'No data' }
  if (code === 0) return { icon: 'sun', label: 'Clear' }
  if (code <= 2) return { icon: 'cloud-sun', label: 'Partly cloudy' }
  if (code === 3) return { icon: 'cloud', label: 'Cloudy' }
  if (code <= 48) return { icon: 'fog', label: 'Fog' }
  if (code <= 57) return { icon: 'rain', label: 'Drizzle' }
  if (code <= 67) return { icon: 'rain', label: 'Rain' }
  if (code <= 77) return { icon: 'snow', label: 'Snow' }
  if (code <= 82) return { icon: 'rain', label: 'Showers' }
  if (code <= 86) return { icon: 'snow', label: 'Snow showers' }
  return { icon: 'storm', label: 'Thunderstorm' }
}

/** Trip coordinates: stored lat/lng, else Photon geocode of the city. */
export async function tripCoords(trip) {
  if (trip?.destination_lat && trip?.destination_lng) return { lat: Number(trip.destination_lat), lon: Number(trip.destination_lng) }
  if (!trip?.destination_city) return null
  try {
    const q = `${trip.destination_city} ${trip.destination_country || ''}`.trim()
    const res = await fetchWithTimeout(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`)
    const f = (await res.json()).features?.[0]
    return f ? { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] } : null
  } catch { return null }
}

/** Today + tomorrow: { now: {temp, code}, today: {hi, lo, code, rain}, tomorrow: {...} } or null. */
export async function fetchTodayWeather(lat, lon, unit = 'celsius') {
  try {
    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=${unit}&timezone=auto&forecast_days=2`)
    if (!res.ok) return null
    const d = await res.json()
    const day = i => ({ hi: Math.round(d.daily.temperature_2m_max[i]), lo: Math.round(d.daily.temperature_2m_min[i]), code: d.daily.weather_code[i], rain: d.daily.precipitation_probability_max?.[i] ?? null })
    return { now: { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code }, today: day(0), tomorrow: day(1) }
  } catch { return null }
}

/** Past-trip weather from the archive: { avg, rainyDays } or null. */
export async function fetchTripHistory(lat, lon, start, end, unit = 'celsius') {
  try {
    const res = await fetchWithTimeout(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_mean,precipitation_sum&temperature_unit=${unit}&timezone=auto`)
    if (!res.ok) return null
    const d = await res.json()
    const temps = (d.daily?.temperature_2m_mean || []).filter(v => v != null)
    if (!temps.length) return null
    const rainyDays = (d.daily.precipitation_sum || []).filter(v => v != null && v >= 1).length
    return { avg: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length), rainyDays }
  } catch { return null }
}

/** One-line packing hint for today's forecast. */
export function weatherHint(today) {
  if (!today) return ''
  if (today.rain != null && today.rain >= 50) return 'Rain likely, take a layer'
  if (today.lo <= 8) return 'Cold later, bring a jacket'
  if (today.hi >= 30) return 'Hot, stay hydrated'
  if (today.hi - today.lo >= 10) return 'Cooler tonight, light jacket'
  return 'Comfortable all day'
}
