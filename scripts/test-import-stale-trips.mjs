#!/usr/bin/env node
// Paste import: a trip the email importer created after the sheet's trip list loaded must be found, not duplicated.
// ImportSheet refetches when it opens and again just before creating a trip (src/lib/importMatch.js). Geocoding and the
// server are faked; the matcher is the real one (supabase/functions/_shared/tripMatch.js, src/lib/tripPick.js).
//   node scripts/test-import-stale-trips.mjs
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'stt-import-'))
const stubs = { '/lib/supabase': 'export const supabase = {}', '/lib/places': "export const geocode = async q => globalThis.__geo[q] || null" }
await build({
  entryPoints: [`${root}src/lib/importMatch.js`], bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/m.mjs`, logLevel: 'error',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /.*/ }, a => { const hit = Object.keys(stubs).find(k => a.path.startsWith('.') && a.path.endsWith(k.slice(k.lastIndexOf('/')))); return hit ? { path: hit, namespace: 'stub' } : null })
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js', resolveDir: root }))
  } }],
})
globalThis.__geo = { 'LIS airport': { lat: 38.77, lng: -9.13 }, 'Lisbon': { lat: 38.72, lng: -9.14 } }
const { matchTrip, matchOnFreshTrips } = await import(`${dir}/m.mjs`)

let n = 0
const t = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
// Trip rows in the shape fetchTrips returns (trips.*, trip_stops(*))
const trip = (id, o = {}) => ({ id, title: id, status: 'planning', start_date: '2099-03-10', end_date: '2099-03-17', destination_city: 'Lisbon',
  destination_lat: 38.72, destination_lng: -9.14, trip_stops: [], trip_collaborators: [], ...o })
const home = trip('seattle-weekend', { start_date: '2099-01-05', end_date: '2099-01-06', destination_city: 'Seattle', destination_lat: 47.61, destination_lng: -122.33 })
const emailTrip = trip('lisbon-from-email')
// The pasted confirmation: a Lisbon hotel inside the email trip's dates
const bookings = [{ type: 'hotel', title: 'Hotel Avenida', hotel_name: 'Hotel Avenida', check_in_date: '2099-03-11', check_out_date: '2099-03-14', place_lat: 38.72, place_lng: -9.14 }]
const dest = { city: 'Lisbon' }

await t('stale list (opened before the email arrived): no match, so the sheet would create a duplicate', async () => {
  assert.equal(await matchTrip([home], dest, bookings), null)
})
await t('fresh list with the email trip: it matches', async () => {
  assert.equal((await matchTrip([home, emailTrip], dest, bookings)).id, 'lisbon-from-email')
})
await t('refetch before create: the stale store gets the email trip and the match is offered instead of a new trip', async () => {
  let store = [home]; let fetches = 0
  const offered = new Set()
  const m = await matchOnFreshTrips({ refresh: async () => { fetches++; store = [home, emailTrip] }, getTrips: () => store, ultimateDestination: dest, bookings, offered })
  assert.equal(fetches, 1); assert.equal(m.id, 'lisbon-from-email'); assert.ok(offered.has('lisbon-from-email'))
})
await t('offered once: if the traveller still wants a new trip, the next check lets the create go through', async () => {
  const offered = new Set()
  const args = { refresh: async () => {}, getTrips: () => [home, emailTrip], ultimateDestination: dest, bookings, offered }
  assert.ok(await matchOnFreshTrips(args)); assert.equal(await matchOnFreshTrips(args), null)
})
await t('nothing new on the server: no match, create proceeds', async () => {
  assert.equal(await matchOnFreshTrips({ refresh: async () => {}, getTrips: () => [home], ultimateDestination: dest, bookings }), null)
})
await t('a failed refetch is not fatal: matches on what the store holds', async () => {
  const m = await matchOnFreshTrips({ refresh: async () => { throw new Error('offline') }, getTrips: () => [home, emailTrip], ultimateDestination: dest, bookings })
  assert.equal(m.id, 'lisbon-from-email')
})
await t('view-only and finished trips are still never offered', async () => {
  const viewer = trip('shared', { _myRole: 'viewer' }); const past = trip('old', { start_date: '2020-03-10', end_date: '2020-03-17' })
  assert.equal(await matchOnFreshTrips({ refresh: async () => {}, getTrips: () => [home, viewer, past], ultimateDestination: dest, bookings }), null)
})
console.log(`\n${n} import freshness checks passed`)
