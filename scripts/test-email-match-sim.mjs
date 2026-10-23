#!/usr/bin/env node
// Offline replay of the 14 booking-email fixtures through receive-booking-email/ingest.ts: the AI, Google and the
// database are faked, so this checks trip matching only (dates + distance, extend, fold), in order and shuffled.
//   node scripts/test-email-match-sim.mjs
import { build } from 'esbuild'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname
const fixtures = JSON.parse(readFileSync(`${root}supabase/tests/fixtures/booking-emails.json`, 'utf8')).emails

// What the AI returns for each fixture (times as printed, local)
const PARSED = {
  '01-flight-united-sfo-lhr': { type: 'flight', title: 'Flight to London', confirmation_number: 'K7QW2M', flight_number: 'UA 901', departure_airport: 'SFO', arrival_airport: 'LHR', departure_time: '2027-04-10T16:25', arrival_time: '2027-04-11T10:45', destination_city: 'London' },
  '02-hotel-hoxton-london': { type: 'hotel', title: 'The Hoxton, Shoreditch', confirmation_number: '4471.902.385', hotel_name: 'The Hoxton, Shoreditch', hotel_address: '81 Great Eastern Street, London', check_in_date: '2027-04-11', check_out_date: '2027-04-14', destination_city: 'London' },
  '03-museum-british-museum': { type: 'activity', title: 'Silk Roads', confirmation_number: 'BM-20391847', venue_name: 'British Museum', venue_address: 'Great Russell Street, London', activity_date: '2027-04-12', activity_time: '11:00', destination_city: 'London' },
  '04-restaurant-opentable-dishoom': { type: 'restaurant', title: 'Dinner at Dishoom', confirmation_number: '182930475', venue_name: 'Dishoom Shoreditch', venue_address: '7 Boundary Street, London', activity_date: '2027-04-12', activity_time: '19:30', destination_city: 'London' },
  '05-train-eurostar-london-paris': { type: 'transport', transport_mode: 'train', title: 'Eurostar to Paris', confirmation_number: 'QHT8XL', flight_number: '9014', departure_airport: 'London St Pancras International', arrival_airport: 'Paris Gare du Nord', departure_time: '2027-04-14T08:01', arrival_time: '2027-04-14T11:20', destination_city: 'Paris' },
  '06-hotel-airbnb-paris': { type: 'hotel', title: 'Bright loft in Le Marais', hotel_name: 'Bright loft in Le Marais', hotel_address: 'Le Marais, Paris', check_in_date: '2027-04-14', check_out_date: '2027-04-17', destination_city: 'Paris' },
  '07-museum-louvre': { type: 'activity', title: 'Louvre', confirmation_number: 'LV-7720193', venue_name: 'Musée du Louvre', activity_date: '2027-04-15', activity_time: '09:30', destination_city: 'Paris' },
  '08-restaurant-thefork-septime': { type: 'restaurant', title: 'Dinner at Septime', confirmation_number: 'TF-55821904', venue_name: 'Septime', activity_date: '2027-04-16', activity_time: '19:45', destination_city: 'Paris' },
  '09-flight-tap-paris-lisbon': { type: 'flight', title: 'Flight to Lisbon', confirmation_number: 'ZR4N7P', flight_number: 'TP 433', departure_airport: 'CDG', arrival_airport: 'LIS', departure_time: '2027-04-17T10:10', arrival_time: '2027-04-17T11:45', destination_city: 'Lisbon' },
  '10-hotel-expedia-lisbon': { type: 'hotel', title: 'Memmo Alfama', confirmation_number: '72649180133', hotel_name: 'Memmo Alfama', check_in_date: '2027-04-17', check_out_date: '2027-04-20', destination_city: 'Lisbon' },
  '11-restaurant-sevenrooms-belcanto': { type: 'restaurant', title: 'Dinner at Belcanto', confirmation_number: '7RX-339104', venue_name: 'Belcanto', activity_date: '2027-04-18', activity_time: '20:30', destination_city: 'Lisbon' },
  '12-activity-getyourguide-fado': { type: 'activity', title: 'Fado Show', confirmation_number: 'GYG-K93LX2HQ', venue_name: 'Fado in Alfama', activity_date: '2027-04-19', activity_time: '21:00', destination_city: 'Lisbon' },
  '13-car-hertz-lisbon': { type: 'transport', transport_mode: 'car', title: 'Hertz rental', confirmation_number: 'H8812047563', departure_airport: 'Lisbon Airport', arrival_airport: 'Lisbon Airport', departure_time: '2027-04-18T09:00', arrival_time: '2027-04-19T18:00', destination_city: 'Lisbon' },
  '14-flight-delta-multileg-home': { type: 'flight', title: 'Flight home', confirmation_number: 'GV5T2K', flight_number: 'DL 167', departure_airport: 'LIS', arrival_airport: 'SFO', departure_time: '2027-04-20T11:30', arrival_time: '2027-04-20T19:05', destination_city: 'San Francisco' },
}

// What the AI reads from the flagship spreadsheet (supabase/tests/files/flagship-itinerary.xlsx), first rows
const SHEET_BOOKINGS = [
  { type: 'flight', title: 'SEA -> MAD', flight_number: 'IB 6852', confirmation_number: 'K7Q2LM', departure_airport: 'SEA', arrival_airport: 'MAD', departure_time: '2026-11-10T13:05', arrival_time: '2026-11-11T08:40', destination_city: 'Madrid' },
  { type: 'hotel', title: 'Hotel Urban Letras', hotel_name: 'Hotel Urban Letras', hotel_address: 'Madrid', check_in_date: '2026-11-11', check_out_date: '2026-11-14', confirmation_number: '58213377', destination_city: 'Madrid' },
  { type: 'transport', transport_mode: 'train', title: 'Madrid -> Granada', flight_number: 'AVE', confirmation_number: 'RNF8812', departure_airport: 'Madrid Atocha', arrival_airport: 'Granada', departure_time: '2026-11-14T07:05', arrival_time: '2026-11-14T10:25', destination_city: 'Granada' },
  { type: 'hotel', title: 'Casa Morisca', hotel_name: 'Casa Morisca', hotel_address: 'Granada', check_in_date: '2026-11-14', check_out_date: '2026-11-16', confirmation_number: 'CM-3310', destination_city: 'Granada' },
]

// A frequent-flyer statement email
let LOYALTY = { email_kind: 'loyalty', loyalty: { program_name: 'Iberia Plus', member_number: 'IB 55 2219 004', member_name: 'Sam Rivera', tier: 'Silver', points_balance: '18,250', points_as_of: '2026-10-01' } }

// Fake geography: first keyword found in the query wins
const GEO = [
  ['sfo', 37.62, -122.38, 'San Francisco', 'US'], ['san francisco', 37.77, -122.42, 'San Francisco', 'US'],
  ['lhr', 51.47, -0.45, 'London', 'GB'], ['st pancras', 51.53, -0.13, 'London', 'GB'], ['london', 51.51, -0.13, 'London', 'GB'],
  ['hoxton', 51.53, -0.08, 'London', 'GB'], ['british museum', 51.52, -0.13, 'London', 'GB'], ['dishoom', 51.52, -0.08, 'London', 'GB'],
  ['gare du nord', 48.88, 2.36, 'Paris', 'FR'], ['cdg', 49.01, 2.55, 'Paris', 'FR'], ['paris', 48.86, 2.35, 'Paris', 'FR'],
  ['marais', 48.86, 2.36, 'Paris', 'FR'], ['louvre', 48.86, 2.34, 'Paris', 'FR'], ['septime', 48.85, 2.38, 'Paris', 'FR'],
  ['madrid', 40.42, -3.70, 'Madrid', 'ES'], ['mad airport', 40.47, -3.57, 'Madrid', 'ES'], ['atocha', 40.41, -3.69, 'Madrid', 'ES'],
  ['granada', 37.18, -3.60, 'Granada', 'ES'], ['sea airport', 47.45, -122.31, 'Seattle', 'US'],
  ['madrid', 40.42, -3.70, 'Madrid', 'ES'], ['mad airport', 40.47, -3.57, 'Madrid', 'ES'], ['atocha', 40.41, -3.69, 'Madrid', 'ES'],
  ['granada', 37.18, -3.60, 'Granada', 'ES'], ['sea airport', 47.45, -122.31, 'Seattle', 'US'],
  ['lis', 38.77, -9.13, 'Lisbon', 'PT'], ['lisbon', 38.72, -9.14, 'Lisbon', 'PT'], ['memmo', 38.71, -9.13, 'Lisbon', 'PT'],
  ['belcanto', 38.71, -9.14, 'Lisbon', 'PT'], ['fado', 38.71, -9.13, 'Lisbon', 'PT'],
]
const lookup = q => { const s = q.toLowerCase(); const g = GEO.find(([k]) => s.includes(k)); return g && { lat: g[1], lng: g[2], city: g[3], cc: g[4] } }

// ── Minimal in-memory Supabase ──
function makeDb() {
  const tables = { loyalty_cards: [], trips: [], bookings: [], trip_activities: [], trip_collaborators: [], google_cache: [], timezone_cache: [] }
  let seq = 0
  function q(table) {
    const filters = []; let op = 'select', payload = null, single = false, lim = Infinity
    const rows = () => tables[table].filter(r => filters.every(f => f(r)))
    const api = {
      select() { return api }, order() { return api },
      eq(k, v) { filters.push(r => String(r[k]) === String(v)); return api },
      neq(k, v) { filters.push(r => String(r[k]) !== String(v)); return api },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return api },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return api },
      limit(n) { lim = n; return api },
      single() { single = true; return api }, maybeSingle() { single = true; return api },
      insert(p) { op = 'insert'; payload = p; return api },
      update(p) { op = 'update'; payload = p; return api },
      delete() { op = 'delete'; return api },
      upsert(p) { op = 'upsert'; payload = p; return api },
      then(res, rej) {
        try {
          let data
          if (op === 'insert') { const row = { id: `${table}-${++seq}`, ...payload }; tables[table].push(row); data = single ? row : [row] }
          else if (op === 'update') { rows().forEach(r => Object.assign(r, payload)); data = null }
          else if (op === 'delete') { const keep = tables[table].filter(r => !filters.every(f => f(r))); tables[table] = keep; data = null }
          else if (op === 'upsert') { tables[table].push(payload); data = null }
          else { const r = rows().slice(0, lim).map(x => ({ ...x })); data = single ? r[0] ?? null : r }
          res({ data, error: null })
        } catch (e) { rej(e) }
      },
    }
    return api
  }
  // RPCs the ingest uses: dates only grow; the per-user lock is always free here
  const rpc = async (name, args) => {
    if (name === 'widen_trip') {
      const t = tables.trips.find(x => x.id === args.p_trip)
      if (!t) return { data: [], error: null }
      t.start_date = !t.start_date || args.p_start < t.start_date ? args.p_start : t.start_date
      t.end_date = !t.end_date || args.p_end > t.end_date ? args.p_end : t.end_date
      return { data: [{ start_date: t.start_date, end_date: t.end_date }], error: null }
    }
    return { data: name === 'take_ingest_lock' ? true : null, error: null }
  }
  return { tables, from: q, rpc }
}

// ── Fake network: AI, geocoding, places, time zones ──
let current = null
globalThis.Deno = { env: { get: k => ({ GOOGLE_MAPS_SERVER_KEY: 'fake', DEEPSEEK_API_KEY: 'fake', SUPABASE_URL: 'http://db' })[k] } }
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), json = b => new Response(JSON.stringify(b), { status: 200 })
  if (u.includes('consume_ai_quota')) return json(true)
  if (u.includes('deepseek')) {
    const prompt = JSON.parse(init.body).messages[0].content
    const answer = prompt.includes('Spreadsheet itinerary') ? { bookings: SHEET_BOOKINGS } : current === 'loyalty' ? LOYALTY : current === 'newsletter' ? { email_kind: 'other', title: 'Deals' } : PARSED[current]
    return json({ choices: [{ message: { content: JSON.stringify(answer) } }] })
  }
  if (u.includes('geocode/json')) {
    const g = lookup(decodeURIComponent(new URL(u).searchParams.get('address') || ''))
    return json(g ? { status: 'OK', results: [{ geometry: { location: { lat: g.lat, lng: g.lng } }, address_components: [{ types: ['locality'], long_name: g.city }, { types: ['country'], long_name: g.cc, short_name: g.cc }], formatted_address: g.city }] } : { status: 'ZERO_RESULTS' })
  }
  if (u.includes('places:searchText')) {
    const g = lookup(JSON.parse(init.body).textQuery)
    return json({ places: g ? [{ id: `pl_${g.lat}_${g.lng}_xxxxxxxx`, displayName: { text: 'Place' }, formattedAddress: `${g.city} address long enough`, location: { latitude: g.lat, longitude: g.lng } }] : [] })
  }
  if (u.includes('timezone/json')) return json({ status: 'OK', timeZoneId: 'Europe/London' })
  return new Response('{}', { status: 404 })
}

const dir = mkdtempSync(join(tmpdir(), 'stt-sim-'))
await build({ entryPoints: [`${root}supabase/functions/receive-booking-email/ingest.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/ingest.mjs`, logLevel: 'error' })
const { ingestEmail } = await import(`${dir}/ingest.mjs`)

async function replay(order, label, { home_city = null } = {}) {
  const db = makeDb()
  const profile = { id: 'u1', home_city }
  for (const id of order) {
    const f = fixtures.find(x => x.id === id)
    current = id
    const res = await ingestEmail(db, profile, { subject: f.subject, fromAddress: f.from, bodyText: f.text, GEMINI_API_KEY: '' })
    const out = await res.json()
    assert.ok(out.success, `${id}: ${out.error}`)
  }
  const trips = db.tables.trips
  const t = trips[0]
  console.log(`${label}: ${trips.length} trip(s): ${trips.map(x => `${x.title} ${x.start_date}→${x.end_date} (${db.tables.bookings.filter(b => b.trip_id === x.id).length})`).join('; ')}`)
  assert.equal(trips.length, 1, `${label}: expected one trip`)
  assert.equal(db.tables.bookings.length, 14)
  assert.ok(db.tables.bookings.every(b => b.trip_id === t.id))
  assert.equal(t.start_date, '2027-04-10'); assert.equal(t.end_date, '2027-04-20')
  return db
}

const ids = fixtures.map(f => f.id)
await replay(ids, 'in order')
await replay([...ids].reverse(), 'reversed')
// Deterministic shuffles
let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
for (let i = 0; i < 5; i++) await replay([...ids].sort(() => rnd() - 0.5), `shuffle ${i + 1}`)
// With a home city: the flight home must not start a "Trip to San Francisco"
await replay(['14-flight-delta-multileg-home', ...ids.slice(0, 13)], 'home flight first, home=San Francisco', { home_city: 'San Francisco' })

// Re-forwarding a flight doesn't duplicate it
{
  const db = await replay(ids, 'then re-forward 3 emails')
  for (const id of ['01-flight-united-sfo-lhr', '05-train-eurostar-london-paris', '02-hotel-hoxton-london']) {
    current = id
    const f = fixtures.find(x => x.id === id)
    const out = await (await ingestEmail(db, { id: 'u1' }, { subject: f.subject, fromAddress: f.from, bodyText: f.text, GEMINI_API_KEY: '' })).json()
    assert.equal(out.duplicate, true, `${id} should be a duplicate: ${JSON.stringify(out)}`)
  }
  assert.equal(db.tables.bookings.length, 14)
  console.log('re-forwarded flight, train and hotel: no duplicates')
  // A change email: the hotel now checks out a day later (same booking number) → updated in place, not a 15th booking
  PARSED['02b-hotel-change'] = { ...PARSED['02-hotel-hoxton-london'], change_type: 'change', check_out_date: '2027-04-15' }
  current = '02b-hotel-change'
  let out = await (await ingestEmail(db, { id: 'u1' }, { subject: 'Your booking has changed', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
  assert.equal(out.updated, true, JSON.stringify(out)); assert.deepEqual(out.changed, ['check_out_date'])
  assert.equal(db.tables.bookings.length, 14)
  assert.equal(db.tables.bookings.find(b => b.confirmation_number === '4471.902.385').check_out_date, '2027-04-15')
  // A flight time change: same flight, new departure time → updated
  PARSED['01b-flight-change'] = { ...PARSED['01-flight-united-sfo-lhr'], change_type: 'change', departure_time: '2027-04-10T17:10', arrival_time: '2027-04-11T11:30' }
  current = '01b-flight-change'
  out = await (await ingestEmail(db, { id: 'u1' }, { subject: 'Schedule change', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
  assert.equal(out.updated, true, JSON.stringify(out)); assert.ok(out.changed.includes('departure_time'))
  assert.equal(db.tables.bookings.length, 14)
  // A cancellation: marked, not deleted
  PARSED['11b-cancel'] = { ...PARSED['11-restaurant-sevenrooms-belcanto'], change_type: 'cancellation' }
  current = '11b-cancel'
  out = await (await ingestEmail(db, { id: 'u1' }, { subject: 'Reservation cancelled', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
  assert.equal(out.cancelled, true)
  assert.match(db.tables.bookings.find(b => b.confirmation_number === '7RX-339104').title, /^Cancelled · /)
  assert.equal(db.tables.bookings.length, 14)
  console.log('change emails: hotel check-out and flight time updated in place; cancellation marked; still 14 bookings')
}
// An emailed spreadsheet itinerary: every row filed, one trip
{
  const db = makeDb()
  const bytes = new Uint8Array(readFileSync(`${root}supabase/tests/files/flagship-itinerary.xlsx`))
  current = null
  const out = await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 'Our trip', fromAddress: 'me', bodyText: 'see attached', GEMINI_API_KEY: '',
    attachments: [{ name: 'flagship-itinerary.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes }] })).json()
  assert.equal(out.from_attachments, true); assert.equal(out.count, 4)
  assert.equal(db.tables.trips.length, 1); assert.equal(db.tables.trips[0].start_date, '2026-11-10'); assert.equal(db.tables.trips[0].end_date, '2026-11-16')
  console.log(`spreadsheet attachment: ${out.count} bookings → 1 trip ${db.tables.trips[0].start_date}→${db.tables.trips[0].end_date}`)
}
// Loyalty statements file into the Loyalty wallet (and update the same card next time); newsletters are ignored
{
  const db = makeDb()
  const send = async (id) => { current = id; return (await ingestEmail(db, { id: 'u1' }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json() }
  const a = await send('loyalty')
  assert.equal(a.loyalty, true); assert.equal(db.tables.loyalty_cards.length, 1); assert.equal(db.tables.loyalty_cards[0].points_balance, 18250)
  LOYALTY = { email_kind: 'loyalty', loyalty: { ...LOYALTY.loyalty, member_number: 'IB552219004', tier: 'Gold', points_balance: 21000, points_as_of: '2026-11-01' } }
  const b = await send('loyalty')
  assert.equal(b.updated, true); assert.equal(db.tables.loyalty_cards.length, 1); assert.equal(db.tables.loyalty_cards[0].tier, 'Gold')
  const c = await send('newsletter')
  assert.equal(c.ignored, true); assert.equal(db.tables.bookings.length, 0); assert.equal(db.tables.trips.length, 0)
  console.log('loyalty statement → card added, then updated (Gold, 21000 pts); newsletter ignored')
}
console.log('\nall replays: one trip, 14 bookings, 10–20 Apr; attachments filed')
