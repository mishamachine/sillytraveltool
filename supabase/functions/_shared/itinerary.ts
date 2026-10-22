// Checks on a parsed itinerary that don't depend on the AI getting it right:
// connecting legs in order, and the trip's destination (where you stay, not where you fly home to).
import { wallToInstantISO } from './timezones.ts'

type Booking = Record<string, any>

const MOVES = new Set(['flight', 'transport'])
const DAY = 86400000
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
const ms = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : t }

/** "2026-11-14T13:20" → "2026-11-15T13:20" */
function nextDay(wall: string): string {
  const [date, time = ''] = wall.split('T')
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10) + (time ? `T${time}` : '')
}

/**
 * A leg that starts where the previous one landed can't leave before it lands: the confirmation printed "+1" on the
 * arrival and the next leg's date was read from the day heading. Move such legs a day (twice at most).
 * Call after attachZones, with `wall` holding each booking's printed { dep, arr } times.
 * Returns the number of legs moved.
 */
export function fixConnectingLegs(bookings: Booking[], wall: Map<Booking, { dep?: string, arr?: string }>): number {
  let moved = 0
  const legs = bookings.filter(b => MOVES.has(b.type) && ms(b.departure_time) != null)
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1], leg = legs[i]
    if (!norm(prev.arrival_airport) || norm(prev.arrival_airport) !== norm(leg.departure_airport)) continue
    const landed = ms(prev.arrival_time)
    const w = wall.get(leg)
    if (landed == null || !w?.dep || !leg.departure_tz) continue
    for (let n = 0; n < 2 && (ms(leg.departure_time) ?? Infinity) < landed; n++) {
      w.dep = nextDay(w.dep)
      leg.departure_time = wallToInstantISO(w.dep, leg.departure_tz) ?? leg.departure_time
      if (w.arr && leg.arrival_tz) {
        w.arr = nextDay(w.arr)
        leg.arrival_time = wallToInstantISO(w.arr, leg.arrival_tz) ?? leg.arrival_time
      }
      leg.date_adjusted = true
    }
    if (leg.date_adjusted) moved++
  }
  return moved
}

const nights = (b: Booking) => {
  const a = ms(b.check_in_date), z = ms(b.check_out_date)
  return a != null && z != null ? Math.max(0, Math.round((z - a) / DAY)) : 0
}

/**
 * Where the trip is to: the city of the longest hotel stay; for a round trip without hotels, where you turn
 * around (the arrival before the longest gap between legs); otherwise the last arrival.
 * Returns null to keep the AI's answer.
 */
export function pickDestination(bookings: Booking[]): { city: string, airport_code: string | null } | null {
  const stays = bookings.filter(b => b.type === 'hotel' && b.destination_city)
  if (stays.length) {
    const best = stays.reduce((a, b) => (nights(b) > nights(a) ? b : a))
    return { city: best.destination_city, airport_code: null }
  }
  const legs = bookings.filter(b => MOVES.has(b.type))
  if (legs.length < 2) return null
  const first = legs[0], last = legs[legs.length - 1]
  const home = [norm(first.departure_airport), norm(first.departure_city)].filter(Boolean)
  const roundTrip = home.includes(norm(last.arrival_airport)) || (norm(last.destination_city) && home.includes(norm(last.destination_city)))
  if (!roundTrip) return null
  let turn = -1, gap = -1
  for (let i = 0; i < legs.length - 1; i++) {
    const g = (ms(legs[i + 1].departure_time) ?? 0) - (ms(legs[i].arrival_time) ?? 0)
    if (g > gap) { gap = g; turn = i }
  }
  const leg = legs[turn]
  if (!leg?.destination_city && !leg?.arrival_airport) return null
  return { city: leg.destination_city || leg.arrival_airport, airport_code: leg.type === 'flight' ? leg.arrival_airport || null : null }
}
