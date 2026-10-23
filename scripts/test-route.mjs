#!/usr/bin/env node
// Route rule (supabase/functions/_shared/route.js) on the flagship trip: stops, per-day city, travel days,
// day trips, name. Geocoding is the demo table (src/dev/demoGeo.js).
//   node scripts/test-route.mjs
import assert from 'node:assert/strict'
import { deriveStops, tripLegs, placeOn, routeCities, nameFromStops, zoneOn, addDays } from '../supabase/functions/_shared/route.js'
import { flagshipTrip, FLAGSHIP_DAYS, FLAGSHIP_ROUTE } from '../src/dev/fixtures/flagship.js'
import { demoGeo, demoReverse } from '../src/dev/demoGeo.js'

// Wall-clock time at a place → ISO instant (two-pass, DST-safe)
function wallToISO(date, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number)
  const asUtc = Date.parse(`${date}T00:00:00Z`) + (h * 60 + m) * 60000
  const off = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000
  }
  let t = asUtc - off(asUtc); t = asUtc - off(t)
  return new Date(t).toISOString()
}

const START = '2026-11-10'
const day = n => addDays(START, n)
const { trip, bookings } = flagshipTrip({ owner: 'u1', day, wall: (n, hhmm, tz) => wallToISO(day(n), hhmm, tz) })
const ctx = { resolve: async q => demoGeo(q), reverse: async (lat, lng) => demoReverse(lat, lng) }

const stops = await deriveStops(trip, bookings, ctx)
const legs = await tripLegs(bookings, ctx)
console.log('stops:')
for (const s of stops) console.log(`  ${s.position}. ${s.kind.padEnd(8)} ${s.city.padEnd(10)} ${s.start_date} → ${s.end_date} (${s.nights}n) ${s.tz || ''}`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

t('route strip: Seattle → Madrid → Granada → Seville → Barcelona → Berlin → Dresden → Munich → Rome → Seattle', () => {
  assert.deepEqual(routeCities(stops).map(s => s.city), FLAGSHIP_ROUTE)
})
t('every trip day has the right place', () => {
  for (const [d, want] of Object.entries(FLAGSHIP_DAYS)) assert.equal(placeOn(trip, day(+d), stops, legs).label, want, `day ${d}`)
})
t('nights: Madrid 3, Granada 2, Seville 2, Barcelona 2, Berlin 2, Dresden 1, Munich 2, Rome 2, two on board', () => {
  const nights = Object.fromEntries(stops.filter(s => s.kind === 'stay').map(s => [s.city, s.nights]))
  assert.deepEqual(nights, { Madrid: 3, Granada: 2, Seville: 2, Barcelona: 2, Berlin: 2, Dresden: 1, Munich: 2, Rome: 2 })
  assert.equal(stops.filter(s => s.kind === 'transit').reduce((a, s) => a + s.nights, 0), 2)
})
t('night train: Munich → Rome on day 15; overnight flight from Seattle on day 0', () => {
  assert.equal(stops.find(s => s.kind === 'transit' && s.start_date === day(15))?.city, 'Rome')
  assert.equal(stops.find(s => s.kind === 'transit' && s.start_date === day(0))?.city, 'Madrid')
})
t('Toledo is a day trip from Madrid', () => {
  const tol = stops.find(s => s.city === 'Toledo')
  assert.equal(tol.kind, 'day_trip'); assert.equal(tol.start_date, day(3))
})
t('travel day "now": before the 07:05 train you are in Madrid, after 10:25 in Granada', () => {
  const at = (hhmm) => Date.parse(wallToISO(day(4), hhmm, 'Europe/Madrid'))
  assert.equal(placeOn(trip, day(4), stops, legs, { now: at('06:30') }).city, 'Madrid')
  assert.equal(placeOn(trip, day(4), stops, legs, { now: at('08:30') }).inTransit, true)
  assert.equal(placeOn(trip, day(4), stops, legs, { now: at('12:00') }).city, 'Granada')
})
t('today\'s zone follows the stop: Berlin on day 11, Rome on day 17, Madrid on day 2', () => {
  assert.equal(zoneOn(stops, day(11)), 'Europe/Berlin')
  assert.equal(zoneOn(stops, day(17)), 'Europe/Rome')
  assert.equal(zoneOn(stops, day(2)), 'Europe/Madrid')
})
t('name from stops: Spain, Germany & Italy', () => assert.equal(nameFromStops(stops), 'Spain, Germany & Italy'))
t('single-country trip is named by cities', () => {
  assert.equal(nameFromStops(stops.filter(s => s.country === 'Spain')), 'Madrid, Granada, Seville +1')
})
t('undated trip has no stops; no bookings falls back to the destination', async () => {
  assert.deepEqual(await deriveStops({ ...trip, start_date: null }, bookings, ctx), [])
  assert.equal(placeOn(trip, day(5), [], []).city, 'Madrid')
})
console.log(`\n${n} passed`)
