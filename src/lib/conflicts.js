// Plan checks that never block saving (docs/MULTI_CITY_PLAN.md §3d): two hotels the same night, reservations that
// overlap, connections too tight to make, nights with nowhere to sleep, and the same booking twice.
// Pure: bookings in, [{ id, kind, title, detail, ids }] out. Self-contained so scripts/test-conflicts.mjs runs in Node.
import { dayIn, addDays } from '../../supabase/functions/_shared/route.js'
import { legKey, travellerOf } from './sharedLegs.js'

const MIN = 60000
const LENGTH_MIN = { restaurant: 90, activity: 120, other: 60 } // how long a reservation lasts when it has no end
const isLeg = b => b.type === 'flight' || (b.type === 'transport' && !!b.arrival_airport && b.arrival_airport !== b.departure_airport)
const fmt = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const name = b => b.title || b.hotel_name || b.venue_name || 'A booking'

/** Wall-clock 'YYYY-MM-DD' + 'HH:MM' at a zone → ms (DST-safe enough for a check: two passes). */
function wallMs(date, time, tz) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number)
  const asUtc = Date.parse(`${date}T00:00:00Z`) + (h * 60 + m) * MIN
  if (!tz) return asUtc
  const off = t => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]))
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / MIN) * MIN
    } catch { return 0 }
  }
  let t = asUtc - off(asUtc); t = asUtc - off(t)
  return t
}

/** A booking's busy time: { start, end } in ms, or null without a clock time. */
function interval(b, tripTz) {
  if (isLeg(b) && b.departure_time) {
    const start = Date.parse(b.departure_time)
    const end = b.arrival_time ? Date.parse(b.arrival_time) : start + 60 * MIN
    return { start, end: Math.max(end, start) }
  }
  if (b.activity_date && b.activity_time) {
    const start = wallMs(b.activity_date, b.activity_time, b.local_tz || tripTz)
    return { start, end: start + (LENGTH_MIN[b.type] || 60) * MIN }
  }
  return null
}

export function planConflicts(trip, bookings = []) {
  const mine = bookings.filter(b => !b.trip_id || b.trip_id === trip.id)
  const out = []
  const add = (kind, title, detail, ids) => out.push({ id: `${kind}:${ids.join(',')}`, kind, title, detail, ids })

  // Same booking twice: same confirmation number, type and start, for the same traveller (a family on one
  // booking is one row per traveller, not a duplicate)
  const seen = new Map()
  for (const b of mine) {
    const start = b.departure_time || b.check_in_date || (b.activity_date ? `${b.activity_date} ${b.activity_time || ''}` : '')
    const key = `${b.confirmation_number ? `${b.type}|${b.confirmation_number}` : `${b.type}|${name(b).toLowerCase()}`}|${start}|${travellerOf(b)}`
    if (!start) continue
    if (seen.has(key)) add('duplicate', `${name(b)} is in the plan twice`, 'Same booking, same time. Delete one.', [seen.get(key).id, b.id])
    else seen.set(key, b)
  }
  const dupIds = new Set(out.flatMap(c => c.ids.slice(1)))
  const uniq = mine.filter(b => !dupIds.has(b.id))

  // Two hotels the same night
  const hotels = uniq.filter(b => b.type === 'hotel' && b.check_in_date)
    .map(b => ({ b, in: b.check_in_date, out: b.check_out_date && b.check_out_date > b.check_in_date ? b.check_out_date : addDays(b.check_in_date, 1) }))
    .sort((a, b) => (a.in < b.in ? -1 : 1))
  for (let i = 0; i < hotels.length; i++) {
    for (let j = i + 1; j < hotels.length && hotels[j].in < hotels[i].out; j++) {
      const night = hotels[j].in > hotels[i].in ? hotels[j].in : hotels[i].in
      add('double_hotel', `Two hotels on ${fmt(night)}`, `${name(hotels[i].b)} and ${name(hotels[j].b)}`, [hotels[i].b.id, hotels[j].b.id])
    }
  }

  // Reservations and journeys that overlap
  const timed = uniq.map(b => ({ b, t: interval(b, trip.destination_tz) })).filter(x => x.t).sort((a, b) => a.t.start - b.t.start)
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].t.start < timed[i].t.end; j++) {
      const a = timed[i].b, c = timed[j].b
      if (isLeg(a) && isLeg(c)) continue // connecting legs are checked below
      const day = dayIn(new Date(timed[j].t.start).toISOString(), c.local_tz || c.departure_tz || trip.destination_tz)
      add('overlap', `${name(a)} overlaps ${name(c)}`, `On ${fmt(day)}`, [a.id, c.id])
    }
  }

  // Connections too tight: a flight needs 90 minutes after landing, anything else 45
  // Travellers on the same flight or train are one leg
  const legs = timed.filter((x, i, all) => isLeg(x.b) && !(legKey(x.b) && all.slice(0, i).some(y => legKey(y.b) === legKey(x.b))))
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1], next = legs[i]
    const gap = (next.t.start - prev.t.end) / MIN
    const need = next.b.type === 'flight' ? 90 : 45
    if (gap >= 0 && gap < need) {
      add('tight', `Tight connection: ${Math.round(gap)} min`, `${name(prev.b)} lands, then ${name(next.b)} leaves. Allow ${need} min.`, [prev.b.id, next.b.id])
    } else if (gap < 0) {
      add('tight', `${name(next.b)} leaves before ${name(prev.b)} arrives`, 'Check the times on both.', [prev.b.id, next.b.id])
    }
  }

  // Nights with nowhere to sleep (only once a hotel is booked: a trip with no hotels may be staying with friends)
  if (trip.start_date && trip.end_date && hotels.length) {
    const covered = new Set()
    for (const h of hotels) for (let d = h.in; d < h.out; d = addDays(d, 1)) covered.add(d)
    for (const x of legs) {
      const dep = dayIn(x.b.departure_time, x.b.departure_tz), arr = dayIn(x.b.arrival_time || x.b.departure_time, x.b.arrival_tz)
      for (let d = dep; d < arr; d = addDays(d, 1)) covered.add(d) // a night on board
    }
    const lastLeg = legs[legs.length - 1]
    const homeFrom = lastLeg ? dayIn(lastLeg.b.arrival_time || lastLeg.b.departure_time, lastLeg.b.arrival_tz) : null
    const firstLeg = legs[0]
    const leaves = firstLeg ? dayIn(firstLeg.b.departure_time, firstLeg.b.departure_tz) : null
    const missing = []
    for (let d = trip.start_date; d < trip.end_date; d = addDays(d, 1)) {
      if (covered.has(d) || (homeFrom && d >= homeFrom) || (leaves && d < leaves)) continue
      missing.push(d)
    }
    if (missing.length) {
      const list = missing.slice(0, 3).map(fmt).join(', ') + (missing.length > 3 ? ` +${missing.length - 3}` : '')
      add('missing_night', missing.length === 1 ? `Where are you sleeping on ${fmt(missing[0])}?` : `No place to sleep booked for ${missing.length} nights`,
        missing.length === 1 ? 'No hotel or overnight journey that night.' : list, missing)
    }
  }
  return out
}
