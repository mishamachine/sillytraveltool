#!/usr/bin/env node
// Moving bookings (OutsideDatesSheet -> tripsStore.moveBookings): only what the server saved leaves the old trip.
// An RLS-denied update answers with no error and zero rows; the free-plan reservation trigger raises 'upgrade:reservations'
// (supabase/migrations/20261023170100). The database is faked here; its rules are not run.
//   node scripts/test-move-bookings.mjs
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'stt-move-'))
// Stand-ins for the modules that need a browser or a live project
const stubs = {
  '/lib/supabase': "export const supabase = globalThis.__db",
  '/store/authStore': "export const useAuthStore = { getState: () => ({}) }; export const checkAndAwardBadges = async () => {}",
  '/store/uiStore': "export const useUIStore = { getState: () => ({}) }",
  '/lib/analytics': "export const track = (n, p) => globalThis.__events.push([n, p])",
  '/store/planStore': "export const upgradeError = e => { if (!/upgrade:reservations/.test(e?.message || '')) return e; const x = new Error('The free plan has 5 reservations per trip. First Class makes it unlimited.'); x.upgrade = 'reservations'; return x }",
}
await build({
  entryPoints: [`${root}src/store/tripsStore.js`], bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/store.mjs`, logLevel: 'error',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      const hit = Object.keys(stubs).find(k => (a.path.endsWith(k) && a.path.startsWith('.')))
      return hit ? { path: hit, namespace: 'stub' } : null
    })
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js', resolveDir: root }))
  } }],
})

globalThis.__events = []
// A fake bookings table: `answer` is what the next update returns
let answer
const calls = []
globalThis.__db = { from: table => { calls.push(['from', table]); return { update: v => { calls.push(['update', v]); return { in: (col, ids) => { calls.push(['in', col, ids]); return { select: async cols => { calls.push(['select', cols]); return answer } } } } } } } }
const { useTripsStore } = await import(`${dir}/store.mjs`)

const B = n => ({ id: `b${n}`, trip_id: 't1', title: `Booking ${n}`, type: 'hotel' })
const reset = (list, extra = {}) => {
  globalThis.__events.length = 0
  useTripsStore.setState({ bookings: list, datePrompt: null, refreshStops: () => {}, fillDatesIfUndated: async () => {}, ...extra })
}
const rejects = async (fn) => { try { await fn() } catch (e) { return e } assert.fail('should have thrown') }
const move = list => { calls.length = 0; return useTripsStore.getState().moveBookings(list, 't2') }
const left = () => useTripsStore.getState().bookings.map(b => b.id)

// Success: every row comes back, they leave the old trip, no message
reset([B(1), B(2), B(3)]); answer = { data: [{ id: 'b1' }, { id: 'b2' }], error: null }
await move([B(1), B(2)])
assert.deepEqual(left(), ['b3'], 'saved bookings leave the old trip')
assert.deepEqual(calls, [['from', 'bookings'], ['update', { trip_id: 't2' }], ['in', 'id', ['b1', 'b2']], ['select', 'id']], 'updates the target trip for exactly these ids and asks for the saved ids back')
assert.deepEqual(globalThis.__events, [['booking_moved', { count: 2 }]])

// RLS denied: no error, zero rows. The booking stays and the message is plain
reset([B(1)]); answer = { data: [], error: null }
let e = await rejects(() => move([B(1)]))
assert.equal(e.message, "You can't move bookings into that trip")
assert.deepEqual(left(), ['b1'], 'a refused booking stays in place')
assert.deepEqual(globalThis.__events, [], 'nothing was moved, nothing is tracked')

// Same when the server sends null data
reset([B(1)]); answer = { data: null, error: null }
e = await rejects(() => move([B(1)]))
assert.equal(e.message, "You can't move bookings into that trip"); assert.deepEqual(left(), ['b1'])

// Free-limit trigger: the whole statement fails, nothing moves, the limit message shows
reset([B(1), B(2)]); answer = { data: null, error: { message: 'upgrade:reservations', hint: 'Free plan: 5 reservations per trip. First Class lifts the limit.' } }
e = await rejects(() => move([B(1), B(2)]))
assert.match(e.message, /free plan has 5 reservations per trip/i); assert.equal(e.upgrade, 'reservations')
assert.deepEqual(left(), ['b1', 'b2'])

// Any other error passes through and nothing moves
reset([B(1)]); answer = { data: null, error: { message: 'network down' } }
e = await rejects(() => move([B(1)]))
assert.equal(e.message, 'network down'); assert.deepEqual(left(), ['b1'])

// Partial: only the saved one moves, the message says so, and a retry offers only the one left
reset([B(1), B(2), B(3)], { datePrompt: { tripId: 't1', bookings: [B(1), B(2), B(3)] } }); answer = { data: [{ id: 'b2' }], error: null }
e = await rejects(() => move([B(1), B(2), B(3)]))
assert.equal(e.message, "Moved 1 of 3 bookings. 2 bookings couldn't be moved into that trip and stay where they were.")
assert.deepEqual(left(), ['b1', 'b3'], 'only the saved booking leaves')
assert.deepEqual(useTripsStore.getState().datePrompt.bookings.map(b => b.id), ['b1', 'b3'])
assert.deepEqual(globalThis.__events, [['booking_moved', { count: 1 }]])

reset([B(1), B(2)]); answer = { data: [{ id: 'b1' }], error: null }
e = await rejects(() => move([B(1), B(2)]))
assert.equal(e.message, "Moved 1 of 2 bookings. 1 booking couldn't be moved into that trip and stays where it was.")

// A throw in the follow-ups (stops, dates) cannot skip the local state or the message
reset([B(1), B(2)], { datePrompt: { tripId: 't1', bookings: [B(1), B(2)] }, fillDatesIfUndated: async () => { throw new Error('dates failed') } }); answer = { data: [{ id: 'b1' }], error: null }
e = await rejects(() => move([B(1), B(2)]))
assert.match(e.message, /^Moved 1 of 2 bookings/); assert.deepEqual(left(), ['b2'])
assert.deepEqual(useTripsStore.getState().datePrompt.bookings.map(b => b.id), ['b2'])

console.log('move bookings: ok')
