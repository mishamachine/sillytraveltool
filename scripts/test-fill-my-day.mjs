#!/usr/bin/env node
// Fill my day: the request carries no personal data, the pace maps to the agreed stop counts, a proposal maps to
// plain trip_activities rows, and the Edge Function checks the member's allowance BEFORE any outside call.
//   node scripts/test-fill-my-day.mjs
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import * as F from '../supabase/functions/_shared/fillDay.js'

// ── request builder: only the whitelisted public fields, nothing about the member ──
const req = F.buildRequest({
  city: 'Granada', country: 'Spain', date: '2026-11-14', pace: 'steady', budget: '$$', vibes: ['cafes', 'museums'],
  lat: 37.17731, lng: -3.59861, email: 'a@b.c', name: 'Jo', title: 'Jo birthday trip', bookings: [{}], userId: 'u1',
})
assert.deepEqual(Object.keys(req).sort(), ['budget', 'city', 'country', 'date', 'pace', 'vibes'], 'no coordinates: the server finds the city')
assert.equal(F.buildRequest({ city: 'X', date: '2026-01-01', startAfter: '19:30' }).start_after, '17:00', 'earliest start is capped at 17:00')
assert.equal(F.buildRequest({ city: 'X', date: '2026-01-01', startAfter: '10:15' }).start_after, '10:15')
assert.equal(F.parseRequest({ city: 'X', date: '2026-02-31' }), null, 'a date that does not exist is refused')
assert.ok(!/a@b\.c|Jo|birthday|u1/.test(JSON.stringify(req)), 'no personal data in the request')
assert.deepEqual(F.buildRequest({ city: 'X', date: '2026-01-01', vibes: ['nope', 'cafes', 'cafes', 'parks', 'views', 'walking'] }).vibes, ['cafes', 'parks', 'views'], 'known vibes only, no repeats, at most 3')
assert.deepEqual(F.buildRequest({ city: 'X', date: '2026-01-01', vibes: [] }).vibes, F.MIX, 'none selected = a mix')
assert.equal(F.buildRequest({ city: 'X', date: '2026-01-01', pace: 'zoom', budget: 'free' }).pace, 'steady')
assert.equal(F.buildRequest({ city: 'X', date: '2026-01-01', exclude: ['a', 5, 'b'] }).exclude.length, 2)
assert.equal(F.parseRequest({ city: '', date: '2026-01-01' }), null)
assert.equal(F.parseRequest({ city: 'X', date: 'tomorrow' }), null)
assert.ok(!('lat' in F.parseRequest({ city: 'X', date: '2026-01-01', lat: 1, lng: 2 })), 'coordinates sent by an older app are dropped')
assert.equal(F.parseRequest(null), null)

// ── pace → stop counts (CMO copy: Slow 2-3, Steady 4-5, Packed 6+) ──
assert.deepEqual([F.PACES.slow.min, F.PACES.slow.max], [2, 3])
assert.deepEqual([F.PACES.steady.min, F.PACES.steady.max], [4, 5])
assert.equal(F.PACES.packed.min, 6)
assert.equal(F.DEFAULT_PACE, 'steady'); assert.equal(F.DEFAULT_BUDGET, '$$')

// ── budget and candidates ──
const P = (n, o = {}) => ({ place_id: `p${n}`, name: `Place ${n}`, lat: 37.17 + n / 1000, lng: -3.59, rating: 4.5, rating_count: 100 + n, price_level: 1, closed: false, category: 'sight', minutes: 60, ...o })
const pool = [P(1), P(2, { price_level: 4 }), P(3, { price_level: null }), P(4, { closed: true }), P(1)]
const ids = (b, list = pool) => F.pickCandidates(list, b).map(p => p.place_id).sort()
assert.deepEqual(Object.keys(F.BUDGETS), ['$', '$$', '$$$', '$$$$'])
assert.deepEqual(ids('$'), ['p1', 'p3'], '$: free or inexpensive, no closed, no repeats')
const priced = [0, 1, 2, 3, 4].map(n => P(10 + n, { price_level: n })).concat(P(20, { price_level: null }))
assert.deepEqual(ids('$$', priced), ['p10', 'p11', 'p12', 'p20'], '$$: up to moderate, unpriced stays')
assert.deepEqual(ids('$$$', priced), ['p12', 'p13', 'p20'], '$$$: levels 2-3')
assert.deepEqual(ids('$$$$', priced), ['p13', 'p14', 'p20'], '$$$$: levels 3-4')
assert.equal(F.pickCandidates(priced, '$$$$')[0].price_level, 4, '$$$$ prefers the top level')
assert.equal(F.pickCandidates(priced.filter(p => p.price_level === 3 || p.price_level == null), '$$$')[0].price_level, 3, 'unpriced ranks lower at $$$')
assert.equal(F.buildRequest({ city: 'X', date: '2026-01-01', budget: 'middle' }).budget, '$$', 'an old budget word falls back to $$')

// ── the 14 moods: known ids, cap of 3, evening-only live music ──
assert.deepEqual(Object.keys(F.VIBES), ['cafes', 'streetfood', 'hotspots', 'markets', 'shopping', 'museums', 'monuments', 'history', 'art', 'views', 'parks', 'beaches', 'music', 'walking'])
assert.ok(Object.values(F.VIBES).every(v => v.query && v.category && v.minutes), 'every mood has a search')
const gig = P(30, { after: F.VIBES.music.after, category: 'event' })
assert.equal(F.validatePlan({ stops: [{ i: 0, start: '10:00' }, { i: 1, start: '11:30' }, { i: 2, start: '13:00' }, { i: 3, start: '14:30' }, { i: 4, start: '12:00' }] }, [P(1), P(2), P(3), P(4), gig], 'steady').length, 4, 'live music before 16:00 is dropped')
const bp = F.basicPlan([gig, P(1), P(2), P(3), P(4)], 5)
assert.equal(bp[bp.length - 1].place_id, 'p30'); assert.ok(F.toMin(bp[bp.length - 1].start) >= 16 * 60, 'basic plan puts live music in the evening')
assert.equal(F.retime([{ start: '09:00', minutes: 60, after: '16:00' }], [])[0].start, '16:00')

// ── the AI's answer is checked against the real candidates ──
const cands = [1, 2, 3, 4, 5, 6].map(n => P(n))
const good = { stops: [0, 1, 2, 3].map((i, k) => ({ i, start: `${String(9 + k * 2).padStart(2, '0')}:00`, minutes: 60, reason: 'Nice. 🙂' })) }
const ok = F.validatePlan(good, cands, 'steady')
assert.equal(ok.length, 4); assert.ok(!/🙂/u.test(ok[0].reason), 'emoji stripped')
assert.equal(F.validatePlan({ stops: [{ i: 99, start: '10:00' }, { i: 0, start: '25:00' }] }, cands, 'steady'), null, 'invented places and bad times are refused')
assert.equal(F.validatePlan({ stops: good.stops.slice(0, 2) }, cands, 'steady'), null, 'too few stops for the pace')
assert.equal(F.validatePlan({ stops: [...good.stops, { i: 0, start: '16:00' }] }, cands, 'steady').length, 4, 'a repeated place is dropped')
assert.equal(F.validatePlan(null, cands, 'steady'), null)
const basic = F.basicPlan(cands, 5)
assert.equal(basic.length, 5); assert.equal(basic[0].start, '09:00')
assert.ok(basic.every((s, i) => i === 0 || F.toMin(s.start) > F.toMin(basic[i - 1].start)), 'basic plan runs in time order')

// ── walking time pushes the next stop later; stops that no longer fit are dropped ──
const timed = F.retime([{ start: '09:00', minutes: 60 }, { start: '10:05', minutes: 60 }, { start: '21:50', minutes: 60 }], [20, 10])
assert.equal(timed[1].start, '10:20'); assert.equal(timed[1].walk_min, 20); assert.equal(timed.length, 2, 'a stop starting at 21:50+ is dropped')

// ── hours line for the weekday (Google lists Monday first) ──
const hours = ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: Closed', 'Wednesday: x', 'Thursday: x', 'Friday: x', 'Saturday: 10:00 AM – 2:00 PM', 'Sunday: Closed']
assert.equal(F.hoursFor(hours, '2026-11-14'), '10:00 AM – 2:00 PM', '14 Nov 2026 is a Saturday')

// ── proposal → trip_activities rows ──
const proposal = { date: '2026-11-14', stops: ok.map(s => ({ ...s, address: 'Calle 1', reason: 'Because' })) }
const rows = F.proposalToActivities(proposal, { tripId: 't1', userId: 'u1', keep: ['p1', 'p2', 'p3'] })
assert.equal(rows.length, 3, 'only the stops the member kept')
assert.deepEqual(rows[0], {
  trip_id: 't1', created_by: 'u1', is_idea: false, is_completed: false, source: 'fill_my_day', title: 'Place 1', category: 'sight',
  date: '2026-11-14', time: '09:00', duration_minutes: 60, location_name: 'Place 1', location_address: 'Calle 1',
  location_lat: rows[0].location_lat, location_lng: -3.59, notes: 'Because', place_id: 'p1',
}, 'a dated, timed plan created by the member (RLS: created_by = me)')
assert.equal(F.proposalToActivities(proposal, { tripId: 't1', userId: 'u1', keep: [] }).length, 0)

// ── empty days and country ──
const trip = { start_date: '2026-11-12', end_date: '2026-11-16', destination_city: 'Granada', destination_country: 'Spain' }
assert.deepEqual(F.emptyDays(trip, { '2026-11-13': [1] }, '2026-11-13'), ['2026-11-14', '2026-11-15', '2026-11-16'])
assert.deepEqual(F.emptyDays({ ...trip, start_date: null }, {}, '2026-11-13'), [])
assert.equal(F.countryFor(trip, { city: 'Granada' }), 'Spain'); assert.equal(F.countryFor(trip, { city: 'Madrid', country_code: 'ES' }), 'ES')

// ── the function: allowance first, nothing outside is called when it says no or fails ──
const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'stt-fmd-'))
const stub = { name: 'stub-remote', setup(b) {
  b.onResolve({ filter: /^(https:|jsr:)/ }, a => ({ path: a.path, namespace: 'stub' }))
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', contents: "export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) }, from: () => ({}) })" }))
} }
await build({ entryPoints: [`${root}supabase/functions/fill-my-day/index.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/fmd.mjs`, logLevel: 'error', plugins: [stub] })

const env = { SUPABASE_URL: 'http://db', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', GOOGLE_MAPS_SERVER_KEY: 'g', DEEPSEEK_API_KEY: 'd' }
let handler
globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h } }
let quota = 'true'
let googleRefuses = null // null | 'all' | an endpoint name
let aiText = null // null = a good plan; else the raw text DeepSeek returns
const calls = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push(u)
  if (u.includes('consume_ai_quota')) { if (quota === 'error') return new Response('x', { status: 500 }); return new Response(quota, { status: 200 }) }
  if (u.includes('consume_api_call')) { const ep = JSON.parse(init.body).p_endpoint; return new Response(googleRefuses === 'all' || googleRefuses === ep ? 'false' : 'true', { status: 200 }) }
  if (u.includes('geocode/json')) return new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 37.17, lng: -3.59 } }, address_components: [], formatted_address: 'Granada' }] }), { status: 200 })
  if (u.includes('log_ai_call')) return new Response('', { status: 200 })
  if (u.includes('places:searchText')) return new Response(JSON.stringify({ places: [1, 2, 3, 4, 5, 6].map(n => ({ id: `g${n}`, displayName: { text: `Spot ${n}` }, location: { latitude: 37.17 + n / 1000, longitude: -3.59 }, rating: 4.6, userRatingCount: 200, businessStatus: 'OPERATIONAL' })) }), { status: 200 })
  if (u.includes('computeRouteMatrix')) return new Response(JSON.stringify([{ condition: 'ROUTE_EXISTS', duration: '420s', distanceMeters: 500 }]), { status: 200 })
  if (u.includes('deepseek')) return new Response(JSON.stringify({ model: 'deepseek-chat', usage: {}, choices: [{ message: { content: aiText ?? JSON.stringify({ stops: [0, 1, 2, 3].map((i, k) => ({ i, start: `${String(9 + k * 2).padStart(2, '0')}:00`, minutes: 60, reason: 'Fits.' })) }) } }] }), { status: 200 })
  return new Response('{}', { status: 404 })
}
const origWarn = console.warn; console.warn = () => {}
await import(`${dir}/fmd.mjs`)
const post = (body) => handler(new Request('http://x/functions/v1/fill-my-day', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const outside = () => calls.filter(u => /googleapis|deepseek/.test(u))
const body = { city: 'Granada', country: 'Spain', date: '2026-11-14', pace: 'steady', budget: '$$', vibes: ['cafes'] }

quota = 'false'; calls.length = 0
let res = await post(body)
assert.equal(res.status, 429); assert.equal(outside().length, 0, 'over the allowance: no Google, no AI')
quota = 'error'; calls.length = 0
res = await post({ ...body, city: 'Seville' })
assert.equal(res.status, 429, 'allowance check failing refuses (fail closed)'); assert.equal(outside().length, 0)
quota = 'true'; calls.length = 0
res = await post(body)
const out = await res.json()
assert.equal(res.status, 200); assert.ok(out.stops.length >= 4 && out.stops.length <= 5, 'a Steady day has 4-5 stops')
assert.ok(calls.findIndex(u => u.includes('consume_ai_quota')) < calls.findIndex(u => /googleapis|deepseek/.test(u)), 'allowance is checked before the first outside call')
assert.ok(out.stops.every(s => s.start && s.name && s.place_id), 'times and real place data')
assert.ok(!calls.some(u => /rest\/v1\/(trip_activities|trips)/.test(u)), 'the function writes nothing')
res = await post({ city: '', date: 'x' }); assert.equal(res.status, 400)

// No sign-in: refused before anything else
calls.length = 0
res = await handler(new Request('http://x/functions/v1/fill-my-day', { method: 'POST', body: JSON.stringify(body) }))
assert.equal(res.status, 401); assert.equal(calls.length, 0, 'no auth: nothing called at all')

// The model answers rubbish: a basic day, not an error
aiText = 'not json at all'; calls.length = 0
res = await post({ ...body, city: 'Cordoba' }); let o2 = await res.json()
assert.equal(res.status, 200); assert.equal(o2.source, 'basic'); assert.ok(o2.stops.length >= 4, 'bad model output falls back to the basic plan')
aiText = null

// Google says no: empty answers carry a reason, and the AI is not called
googleRefuses = 'text_search'; calls.length = 0
res = await post({ ...body, city: 'Malaga' }); o2 = await res.json()
assert.deepEqual([res.status, o2.stops.length, o2.reason], [200, 0, 'google_unavailable'])
assert.ok(!calls.some(u => u.includes('deepseek')), 'no places, no model call')
googleRefuses = 'geocode'; calls.length = 0
res = await post({ ...body, city: 'Ronda' }); o2 = await res.json()
assert.equal(o2.reason, 'geocode_failed')
googleRefuses = null
console.warn = origWarn
console.log('fill my day: request has no personal data, pace counts, proposal to plans, allowance checked before any outside call')
