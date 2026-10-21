// Local time of the place, not the phone (owner rule). Bookings carry the real instant plus an
// IANA zone: departure_tz (origin), arrival_tz (destination), local_tz (venue); trips carry
// destination_tz. Everything here uses Intl, so it works offline and in the native WebView.
// Same conversion as supabase/functions/_shared/timezones.ts.

export function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

export function isValidZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const zoneOr = (tz) => (isValidZone(tz) ? tz : deviceZone())

const partsCache = new Map()
function partsFormatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }))
  }
  return partsCache.get(tz)
}

/** Wall-clock parts of an instant in a zone: { y, m, d, hh, mm, ss, weekday, date: 'YYYY-MM-DD', time: 'HH:mm' } */
export function partsIn(instant, tz) {
  const zone = zoneOr(tz)
  const p = Object.fromEntries(partsFormatter(zone).formatToParts(new Date(instant)).map(x => [x.type, x.value]))
  const out = { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second, weekday: p.weekday }
  out.date = `${p.year}-${p.month}-${p.day}`
  out.time = `${String(out.hh).padStart(2, '0')}:${p.minute}`
  return out
}

function offsetMs(instantMs, tz) {
  const p = partsIn(instantMs, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(instantMs / 1000) * 1000
}

/** "2026-04-01T13:05" (or date + "13:05") read as local time in `tz` → Date. DST-safe. */
export function wallToInstant(wall, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(wall || '').trim())
  if (!m) return null
  const zone = zoneOr(tz)
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  let t = asUtc - offsetMs(asUtc, zone)
  t = asUtc - offsetMs(t, zone)
  return new Date(t)
}

/** Instant → value for <input type="datetime-local"> in the place's zone. */
export function toWallInput(instant, tz) {
  if (!instant) return ''
  const d = new Date(instant)
  if (isNaN(d.getTime())) return ''
  const p = partsIn(d, tz)
  return `${p.date}T${p.time}`
}

/** "13:05" in the place's zone. */
export function timeIn(instant, tz) {
  return instant ? partsIn(instant, tz).time : ''
}

/** "YYYY-MM-DD" of an instant in the place's zone. */
export function dayIn(instant, tz) {
  return instant ? partsIn(instant, tz).date : null
}

/** Today's date where the trip is. */
export function todayIn(tz) {
  return partsIn(Date.now(), tz).date
}

/** Readable zone name: "Spain Time", "PT"; falls back to the zone's city. */
export function zoneName(tz, at = Date.now()) {
  if (!isValidZone(tz)) return ''
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' }).formatToParts(new Date(at))
    const name = p.find(x => x.type === 'timeZoneName')?.value
    if (name && !/^GMT/.test(name)) return name
  } catch { /* older engines: use the city */ }
  return `${tz.split('/').pop().replace(/_/g, ' ')} time`
}

/** True when the place's clock differs from the phone's right now (worth labelling the time). */
export function differsFromDevice(tz, at = Date.now()) {
  if (!isValidZone(tz)) return false
  return offsetMs(at, tz) !== offsetMs(at, deviceZone())
}

/** All zones for a picker (falls back to a short list on old engines). */
export function allZones() {
  try { return Intl.supportedValuesOf('timeZone') } catch {
    return ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'America/New_York', 'America/Chicago',
      'America/Denver', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney']
  }
}

/** "Thursday" — the weekday of an instant at the place. */
export function weekdayIn(instant, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zoneOr(tz), weekday: 'long' }).format(new Date(instant))
}

/** "Wed, Apr 1 · 13:05" at the place. */
export function dateTimeIn(instant, tz) {
  const d = new Date(instant)
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zoneOr(tz), weekday: 'short', month: 'short', day: 'numeric' }).format(d)
  return `${date} · ${timeIn(d, tz)}`
}
