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
  ['jfk', 40.64, -73.78, 'New York', 'US'], ['lis', 38.77, -9.13, 'Lisbon', 'PT'], ['lisbon', 38.72, -9.14, 'Lisbon', 'PT'], ['memmo', 38.71, -9.13, 'Lisbon', 'PT'],
  ['belcanto', 38.71, -9.14, 'Lisbon', 'PT'], ['fado', 38.71, -9.13, 'Lisbon', 'PT'],
  ['tarifa', 36.01, -5.60, 'Tarifa', 'ES'], ['tangier', 35.77, -5.80, 'Tangier', 'MA'],
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
  if (u.includes('consume_api_call')) return json(true) // Google quota check (fails closed when it errors)
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
  // Never named after home, even when the flight home came first and there's no home city
  assert.notEqual(t.destination_city, 'San Francisco', `${label}: trip named after home`)
  assert.equal(t.title, `Trip to ${t.destination_city}`)
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

// No home city, no hotels: the flight home then the flight out → named after where the first leg lands
{
  const db = makeDb()
  PARSED['14c-home-early'] = { ...PARSED['14-flight-delta-multileg-home'], departure_time: '2027-04-13T11:30', arrival_time: '2027-04-13T19:05' }
  for (const id of ['14c-home-early', '01-flight-united-sfo-lhr']) {
    current = id
    const out = await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
    assert.ok(out.success, out.error)
  }
  assert.equal(db.tables.trips.length, 1); assert.equal(db.tables.trips[0].title, 'Trip to London')
  console.log('flight home first, then flight out (no home city): Trip to London')
}

// As parsed live: the two-leg Delta email read as its first leg only (LIS → JFK), sent first → still not named after home
{
  const real = PARSED['14-flight-delta-multileg-home']
  PARSED['14-flight-delta-multileg-home'] = { ...real, arrival_airport: 'JFK', arrival_time: '2027-04-20T14:05', destination_city: 'New York' }
  await replay(['14-flight-delta-multileg-home', ...ids.slice(0, 13)], 'home flight first, read as LIS→JFK')
  PARSED['14-flight-delta-multileg-home'] = real
}
// A trip with a night at its destination keeps its name: London hotel, then the train to Paris and a night there
{
  const db = makeDb()
  for (const id of ['02-hotel-hoxton-london', '05-train-eurostar-london-paris', '06-hotel-airbnb-paris']) {
    current = id
    const out = await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
    assert.ok(out.success, out.error)
  }
  assert.equal(db.tables.trips.length, 1); assert.equal(db.tables.trips[0].title, 'Trip to London')
  console.log('London hotel + Eurostar + Paris stay: stays Trip to London')
}

// A connecting flight in one email: every leg is filed (LIS → JFK → SFO), and forwarding it again adds nothing
{
  const db = makeDb()
  PARSED['14m-two-legs'] = { type: 'flight', title: 'LIS -> JFK', confirmation_number: 'GV5T2K', airline: 'Delta', flight_number: 'DL 263',
    departure_airport: 'LIS', arrival_airport: 'JFK', departure_time: '2027-04-20T11:15', arrival_time: '2027-04-20T14:05', destination_city: 'New York',
    more_legs: [{ title: 'JFK -> SFO', flight_number: 'DL 416', departure_airport: 'JFK', arrival_airport: 'SFO', departure_time: '2027-04-20T17:30', arrival_time: '2027-04-20T21:02' }] }
  const send = async id => { current = id; return (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json() }
  const a = await send('14m-two-legs')
  assert.equal(a.legs.length, 2, JSON.stringify(a))
  assert.deepEqual(db.tables.bookings.map(b => b.flight_number).sort(), ['DL 263', 'DL 416'])
  assert.ok(db.tables.bookings.every(b => b.confirmation_number === 'GV5T2K' && b.airline === 'Delta'))
  assert.equal(db.tables.trips.length, 1)
  const b = await send('14m-two-legs')
  assert.ok(b.legs.every(l => l.duplicate), JSON.stringify(b)); assert.equal(db.tables.bookings.length, 2)
  console.log('connecting flight email: both legs filed, re-forward adds nothing')
}

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

// Shared trips: a traveller who joined someone else's trip with edit rights forwards their own bookings
{
  const send = async (db, user, id) => { current = id; return (await ingestEmail(db, { id: user, home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json() }
  // Owner's London trip, 11–17 Apr, with their hotel; `role`/`status` for u2 vary per case
  const sharedDb = (role, status = 'accepted') => {
    const db = makeDb()
    db.tables.trips.push({ id: 'trip-shared', owner_id: 'owner', title: 'London with friends', destination_city: 'London', destination_lat: 51.51, destination_lng: -0.13, start_date: '2027-04-11', end_date: '2027-04-17', status: 'planning' })
    db.tables.trip_collaborators.push({ id: 'c-owner', trip_id: 'trip-shared', user_id: 'owner', role: 'owner', status: 'accepted' })
    db.tables.trip_collaborators.push({ id: 'c-u2', trip_id: 'trip-shared', user_id: 'u2', role, status })
    db.tables.bookings.push({ id: 'b-owner-hotel', trip_id: 'trip-shared', created_by: 'owner', type: 'hotel', title: 'The Hoxton, Shoreditch', hotel_name: 'The Hoxton, Shoreditch', hotel_address: '81 Great Eastern Street, London', check_in_date: '2027-04-11', check_out_date: '2027-04-14', source: 'manual' })
    return db
  }
  const shared = db => db.tables.trips.find(t => t.id === 'trip-shared')

  // Can edit: the flight lands in the shared trip, credited to u2; the owner's dates stay put (flight leaves 10 Apr)
  let db = sharedDb('collaborator')
  let out = await send(db, 'u2', '01-flight-united-sfo-lhr')
  assert.equal(out.trip_id, 'trip-shared', JSON.stringify(out))
  assert.equal(db.tables.trips.length, 1)
  assert.equal(db.tables.bookings.find(b => b.id === out.booking_id).created_by, 'u2')
  assert.equal(shared(db).start_date, '2027-04-11'); assert.equal(shared(db).end_date, '2027-04-17')
  assert.equal(shared(db).title, 'London with friends')
  // Their museum ticket lands there too
  out = await send(db, 'u2', '03-museum-british-museum')
  assert.equal(out.trip_id, 'trip-shared')
  console.log('shared trip (can edit): flight and ticket land in the owner\'s trip, credited to the traveller; dates and name unchanged')

  // Two travellers on the same flight: both keep their booking
  db = sharedDb('collaborator')
  const a = await send(db, 'owner', '01-flight-united-sfo-lhr')
  const b = await send(db, 'u2', '01-flight-united-sfo-lhr')
  assert.ok(!a.duplicate && !b.duplicate, JSON.stringify([a, b]))
  assert.equal(db.tables.bookings.filter(x => x.flight_number === 'UA 901').length, 2)
  assert.deepEqual(db.tables.bookings.filter(x => x.flight_number === 'UA 901').map(x => x.created_by).sort(), ['owner', 'u2'])
  // …and the same traveller forwarding it twice still gets one
  const again = await send(db, 'u2', '01-flight-united-sfo-lhr')
  assert.equal(again.duplicate, true, JSON.stringify(again))
  console.log('same flight, two travellers: both kept; the same traveller forwarding again: duplicate')

  // View only, or an invite not yet accepted: the traveller's own new trip, the shared trip untouched
  for (const [role, status] of [['viewer', 'accepted'], ['collaborator', 'pending']]) {
    db = sharedDb(role, status)
    out = await send(db, 'u2', '01-flight-united-sfo-lhr')
    assert.notEqual(out.trip_id, 'trip-shared', `${role}/${status}: ${JSON.stringify(out)}`)
    assert.equal(db.tables.trips.find(t => t.id === out.trip_id).owner_id, 'u2')
    assert.equal(db.tables.bookings.filter(x => x.trip_id === 'trip-shared').length, 1)
  }
  console.log('view only / pending invite: the traveller gets their own trip; the shared trip is untouched')

  // The traveller also has their own London trip on the same dates: the shared trip wins
  db = sharedDb('collaborator')
  db.tables.trips.push({ id: 'trip-own', owner_id: 'u2', title: 'Trip to London', destination_city: 'London', destination_lat: 51.51, destination_lng: -0.13, start_date: '2027-04-11', end_date: '2027-04-14', status: 'planning' })
  out = await send(db, 'u2', '02-hotel-hoxton-london')
  assert.equal(out.trip_id, 'trip-shared', JSON.stringify(out))
  console.log('own trip and shared trip both fit: the shared trip wins')

  // Somewhere the shared trip doesn't go: the traveller's own new trip
  db = sharedDb('collaborator')
  out = await send(db, 'u2', '10-hotel-expedia-lisbon')
  assert.notEqual(out.trip_id, 'trip-shared')
  assert.equal(db.tables.trips.find(t => t.id === out.trip_id).owner_id, 'u2')
  assert.equal(shared(db).end_date, '2027-04-17')
  console.log('booking elsewhere (Lisbon): the traveller\'s own new trip; shared trip unchanged')
}
// A ferry out and back under one reference and no service number: both legs are kept (the return leg must not
// overwrite the outbound one). Forwarding either again is still a duplicate, and a real change still updates in place.
{
  const db = makeDb()
  const out1 = { type: 'transport', transport_mode: 'ferry', title: 'Ferry to Tangier', airline: 'FRS', confirmation_number: 'FR-88213', departure_airport: 'Tarifa', arrival_airport: 'Tangier Med', departure_time: '2027-04-12T09:00', arrival_time: '2027-04-12T10:00', destination_city: 'Tangier' }
  PARSED['15-ferry-out'] = out1
  PARSED['15-ferry-back'] = { ...out1, title: 'Ferry to Tarifa', departure_airport: 'Tangier Med', arrival_airport: 'Tarifa', departure_time: '2027-04-15T17:00', arrival_time: '2027-04-15T18:00', destination_city: 'Tarifa' }
  PARSED['15-ferry-out-later'] = { ...out1, change_type: 'change', departure_time: '2027-04-12T11:00', arrival_time: '2027-04-12T12:00' }
  const send = async id => { current = id; return (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json() }
  const a = await send('15-ferry-out'), b = await send('15-ferry-back')
  assert.ok(a.success && b.success && !a.duplicate && !b.duplicate && !b.updated, JSON.stringify([a, b]))
  assert.equal(db.tables.bookings.length, 2, 'ferry out and back: two bookings')
  assert.deepEqual(db.tables.bookings.map(x => x.departure_airport).sort(), ['Tangier Med', 'Tarifa'])
  const dep = id => db.tables.bookings.find(x => x.id === id).departure_time
  const backTime = dep(b.booking_id)
  // The same email again: duplicates, nothing changes
  assert.equal((await send('15-ferry-back')).duplicate, true)
  assert.equal((await send('15-ferry-out')).duplicate, true)
  assert.equal(db.tables.bookings.length, 2)
  // Same origin and day, new time: updated in place, and only that leg
  const c = await send('15-ferry-out-later')
  assert.equal(c.updated, true, JSON.stringify(c)); assert.equal(c.booking_id, a.booking_id)
  assert.equal(db.tables.bookings.length, 2); assert.equal(dep(b.booking_id), backTime)
  console.log('ferry out and back, one reference, no service number: both legs kept; re-forwards are duplicates; a time change updates only its own leg')
}
// With service numbers the leg is still matched by number alone (a rescheduled day keeps its booking), and a leg
// without one on either side needs the origin AND the day
{
  const db = makeDb()
  const ref = { type: 'transport', transport_mode: 'train', confirmation_number: 'TRN-1', airline: 'Renfe', destination_city: 'Granada' }
  PARSED['16-train-a'] = { ...ref, title: 'Madrid -> Granada', flight_number: 'AVE 03', departure_airport: 'Madrid Atocha', arrival_airport: 'Granada', departure_time: '2027-04-12T07:05', arrival_time: '2027-04-12T10:25' }
  PARSED['16-train-a-moved'] = { ...PARSED['16-train-a'], change_type: 'change', departure_time: '2027-04-13T07:05', arrival_time: '2027-04-13T10:25' }
  PARSED['16-train-b-nonumber'] = { ...ref, title: 'Granada -> Madrid', departure_airport: 'Granada', arrival_airport: 'Madrid Atocha', departure_time: '2027-04-14T16:00', arrival_time: '2027-04-14T19:20', destination_city: 'Madrid' }
  const send = async id => { current = id; return (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json() }
  const a = await send('16-train-a')
  const moved = await send('16-train-a-moved')
  assert.equal(moved.updated, true, JSON.stringify(moved)); assert.equal(moved.booking_id, a.booking_id)
  const b = await send('16-train-b-nonumber')   // the stored leg has a number, this one has none: origin differs → a second leg
  assert.ok(b.success && b.booking_id !== a.booking_id && !b.updated && !b.duplicate, JSON.stringify(b))
  assert.equal(db.tables.bookings.length, 2)
  console.log('train legs: matched by service number when both have one; a leg without one needs the same origin and day')
}

// D5: every booking from one email carries that email's id, so the free-plan counter counts emails, not legs
{
  const db = makeDb()
  PARSED['17-three-legs'] = { type: 'flight', title: 'LIS -> JFK', confirmation_number: 'X9Y8Z7', airline: 'Delta', flight_number: 'DL 263',
    departure_airport: 'LIS', arrival_airport: 'JFK', departure_time: '2027-04-20T11:15', arrival_time: '2027-04-20T14:05', destination_city: 'New York',
    more_legs: [
      { title: 'JFK -> ATL', flight_number: 'DL 416', departure_airport: 'JFK', arrival_airport: 'ATL', departure_time: '2027-04-20T17:30', arrival_time: '2027-04-20T19:50' },
      { title: 'ATL -> SFO', flight_number: 'DL 902', departure_airport: 'ATL', arrival_airport: 'SFO', departure_time: '2027-04-20T21:15', arrival_time: '2027-04-20T23:30' },
    ] }
  current = '17-three-legs'
  const out = await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '', emailId: 'resend-email-111' })).json()
  assert.equal(out.legs.length, 3, JSON.stringify(out))
  assert.equal(db.tables.bookings.length, 3)
  assert.ok(db.tables.bookings.every(b => b.raw_email_id === 'resend-email-111'), JSON.stringify(db.tables.bookings.map(b => b.raw_email_id)))
  // A different email gets its own id; with no id (a test harness, an old caller) the column stays null
  current = '01-flight-united-sfo-lhr'
  await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '', emailId: 'resend-email-222' })).json()
  current = '03-museum-british-museum'
  await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '' })).json()
  assert.equal(new Set(db.tables.bookings.map(b => b.raw_email_id).filter(Boolean)).size, 2)
  assert.equal(db.tables.bookings.filter(b => b.raw_email_id == null).length, 1)
  // The AI cannot set it
  PARSED['17b-injected'] = { ...PARSED['04-restaurant-opentable-dishoom'], raw_email_id: 'attacker' }
  current = '17b-injected'
  await (await ingestEmail(db, { id: 'u1', home_city: null }, { subject: 's', fromAddress: 'f', bodyText: 'b', GEMINI_API_KEY: '', emailId: 'resend-email-333' })).json()
  assert.ok(!db.tables.bookings.some(b => b.raw_email_id === 'attacker'))
  // A spreadsheet of several rows is one email too
  const sheet = makeDb()
  const bytes = new Uint8Array(readFileSync(`${root}supabase/tests/files/flagship-itinerary.xlsx`))
  current = null
  await ingestEmail(sheet, { id: 'u1', home_city: null }, { subject: 'Our trip', fromAddress: 'me', bodyText: 'see attached', GEMINI_API_KEY: '', emailId: 'resend-email-444',
    attachments: [{ name: 'flagship-itinerary.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes }] })
  assert.equal(sheet.tables.bookings.length, 4); assert.ok(sheet.tables.bookings.every(b => b.raw_email_id === 'resend-email-444'))
  console.log('raw_email_id: a 3-leg email and a 4-row spreadsheet each stamp one id on every row; none from the AI; null when no id')
}

console.log('\nall replays: one trip, 14 bookings, 10–20 Apr; attachments filed')
