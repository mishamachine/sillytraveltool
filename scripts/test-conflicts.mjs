#!/usr/bin/env node
// Plan checks (src/lib/conflicts.js) on the flagship trip: none when it's clean, each one when it's broken.
//   node scripts/test-conflicts.mjs
import assert from 'node:assert/strict'
import { planConflicts } from '../src/lib/conflicts.js'
import { addDays } from '../supabase/functions/_shared/route.js'
import { flagshipTrip } from '../src/dev/fixtures/flagship.js'

function wallToISO(date, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number)
  const asUtc = Date.parse(`${date}T00:00:00Z`) + (h * 60 + m) * 60000
  const off = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60000) * 60000
  }
  let t = asUtc - off(asUtc); t = asUtc - off(t)
  return new Date(t).toISOString()
}
const day = n => addDays('2026-11-10', n)
const { trip, bookings } = flagshipTrip({ owner: 'u1', day, wall: (n, hhmm, tz) => wallToISO(day(n), hhmm, tz) })
const kinds = bs => planConflicts(trip, bs).map(c => c.kind)
let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }
const MAD = 'Europe/Madrid'

t('the flagship trip as booked has no warnings', () => assert.deepEqual(planConflicts(trip, bookings), []))
t('two hotels the same night', () => {
  const extra = { id: 'x1', trip_id: trip.id, type: 'hotel', title: 'Hotel Atocha', check_in_date: day(2), check_out_date: day(3) }
  assert.deepEqual(kinds([...bookings, extra]), ['double_hotel'])
})
t('dinner during a train', () => {
  const extra = { id: 'x2', trip_id: trip.id, type: 'restaurant', title: 'Lunch', activity_date: day(4), activity_time: '08:00', local_tz: MAD }
  assert.deepEqual(kinds([...bookings, extra]), ['overlap'])
})
t('tight connection: a flight 30 min after the train arrives', () => {
  const extra = { id: 'x3', trip_id: trip.id, type: 'flight', title: 'BCN → PMI', departure_airport: 'BCN', arrival_airport: 'PMI',
    departure_time: wallToISO(day(8), '14:50', MAD), arrival_time: wallToISO(day(8), '15:45', MAD), departure_tz: MAD, arrival_tz: MAD }
  assert.ok(kinds([...bookings, extra]).includes('tight'))
})
t('a night with nowhere to sleep (Dresden hotel removed)', () => {
  const c = planConflicts(trip, bookings.filter(b => b.title !== 'Hotel Taschenbergpalais'))
  assert.equal(c.length, 1); assert.equal(c[0].kind, 'missing_night'); assert.match(c[0].title, /Nov 22/)
})
t('the same confirmation forwarded twice', () => {
  const twice = { ...bookings.find(b => b.title === 'Hotel Neri'), id: 'dup' }
  assert.deepEqual(kinds([...bookings, twice]), ['duplicate'])
})
console.log(`\n${n} passed`)
