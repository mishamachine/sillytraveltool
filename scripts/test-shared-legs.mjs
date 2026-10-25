#!/usr/bin/env node
// Shared legs (src/lib/sharedLegs.js): travellers on the same flight or train group into one card, and only then.
// Fixture list from docs/audit-pack/06 §4.2, plus the plan checks that must not warn on a shared leg (D4).
//   node scripts/test-shared-legs.mjs
import assert from 'node:assert/strict'
import { legKey, groupSharedLegs, nearMisses, travellerName } from '../src/lib/sharedLegs.js'
import { planConflicts } from '../src/lib/conflicts.js'
import { addDays } from '../supabase/functions/_shared/route.js'
import { flagshipTrip, MARIA } from '../src/dev/fixtures/flagship.js'

const ME = 'u-me', MARIA_ID = 'u-maria', TOM = 'u-tom'
const LIS = 'Europe/Lisbon', NYC = 'America/New_York'
let n = 0
const flight = (x = {}) => ({
  id: `b${++n}`, trip_id: 't1', type: 'flight', title: 'LIS → JFK', airline: 'Delta', flight_number: 'DL 263',
  departure_airport: 'LIS', arrival_airport: 'JFK', departure_time: '2026-04-12T08:15:00Z', arrival_time: '2026-04-12T16:05:00Z',
  departure_tz: LIS, arrival_tz: NYC, created_by: ME, ...x,
})
const train = (x = {}) => ({
  id: `b${++n}`, trip_id: 't1', type: 'transport', transport_mode: 'train', title: 'Madrid → Granada', airline: 'Renfe AVE',
  flight_number: null, departure_airport: 'Madrid Atocha', arrival_airport: 'Granada', departure_time: '2026-11-14T06:05:00Z',
  departure_tz: 'Europe/Madrid', created_by: ME, ...x,
})
const groups = (rows, me = ME) => [...new Set(groupSharedLegs(rows, me).values())]
const one = (rows, me) => { const g = groups(rows, me); assert.equal(g.length, 1, `expected one shared leg, got ${g.length}`); return g[0].items }
const none = (rows) => assert.equal(groups(rows).length, 0, 'expected no shared leg')

let passed = 0
const t = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`) }

t('two travellers, one flight: one card, two lines, mine first', () => {
  const mine = flight({ seat_number: '14A' }), maria = flight({ created_by: MARIA_ID, passenger_name: 'Maria Silva', seat_number: '14B' })
  assert.deepEqual(one([maria, mine]).map(b => b.id), [mine.id, maria.id])
})
t('three travellers, seat and confirmation mixed: all three, others by name', () => {
  const rows = [
    flight({ created_by: TOM, passenger_name: 'Tom Silva', seat_number: null, confirmation_number: 'XYZ789' }),
    flight({ seat_number: '14A', confirmation_number: null }),
    flight({ created_by: MARIA_ID, passenger_name: 'Maria Silva', seat_number: '14B', confirmation_number: 'XYZ789' }),
  ]
  assert.deepEqual(one(rows).map(b => b.passenger_name || 'me'), ['me', 'Maria Silva', 'Tom Silva'])
})
t('same flight number on a different day: separate', () => {
  none([flight(), flight({ created_by: MARIA_ID, departure_time: '2026-04-13T08:15:00Z' })])
})
t('same number, different route: separate', () => {
  none([flight(), flight({ created_by: MARIA_ID, arrival_airport: 'BOS' })])
  none([flight(), flight({ created_by: MARIA_ID, departure_airport: 'OPO' })])
})
t('different departure minute: separate, and counted as one near miss', () => {
  const rows = [flight(), flight({ created_by: MARIA_ID, departure_time: '2026-04-12T08:20:00Z' })]
  none(rows)
  assert.equal(nearMisses(rows), 1)
  assert.equal(nearMisses([flight(), flight({ created_by: MARIA_ID })]), 0, 'an exact match is not a near miss')
  assert.equal(nearMisses([flight(), flight({ created_by: MARIA_ID, departure_time: '2026-04-13T08:20:00Z' })]), 0, 'another day is not a near miss')
})
t('seconds inside the same minute still match', () => {
  assert.equal(one([flight(), flight({ created_by: MARIA_ID, departure_time: '2026-04-12T08:15:30Z' })]).length, 2)
})
t('missing flight number (or route, or time): separate', () => {
  none([flight(), flight({ created_by: MARIA_ID, flight_number: null })])
  none([flight({ flight_number: null }), flight({ created_by: MARIA_ID, flight_number: null })])
  none([flight({ arrival_airport: null }), flight({ created_by: MARIA_ID, arrival_airport: null })])
  none([flight({ departure_time: null }), flight({ created_by: MARIA_ID, departure_time: null })])
  assert.equal(legKey(flight({ flight_number: '263', airline: null })), null, 'a bare number needs its airline')
})
t('"DL 263" and "DL263" (and "dl-263") are one flight', () => {
  assert.equal(one([flight({ flight_number: 'DL 263' }), flight({ created_by: MARIA_ID, flight_number: 'DL263' }), flight({ created_by: TOM, flight_number: 'dl-263' })]).length, 3)
  assert.equal(one([flight({ flight_number: '263' }), flight({ created_by: MARIA_ID, flight_number: '263', airline: 'delta' })]).length, 2, 'bare number + airline')
})
t('city names or dates alone never group', () => {
  none([flight({ departure_airport: 'LIS' }), flight({ created_by: MARIA_ID, departure_airport: 'Lisbon' })])
  none([flight({ flight_number: 'DL 263' }), flight({ created_by: MARIA_ID, flight_number: 'TP 201' })])
})
t('train and ferry: by mode, operator or number, stations and minute', () => {
  assert.equal(one([train(), train({ created_by: MARIA_ID, departure_airport: ' madrid  atocha ' })]).length, 2, 'stations normalised')
  assert.equal(one([train({ flight_number: 'AVE 03112' }), train({ created_by: MARIA_ID, flight_number: 'AVE03112', airline: 'Renfe' })]).length, 2, 'number wins over operator')
  none([train({ flight_number: 'AVE 03112' }), train({ created_by: MARIA_ID })]) // one has a number, one doesn't
  none([train(), train({ created_by: MARIA_ID, transport_mode: 'bus' })])
  none([train(), train({ created_by: MARIA_ID, airline: 'Iryo' })])
  const ferry = x => train({ transport_mode: 'ferry', title: 'Algeciras → Tanger', airline: 'FRS', departure_airport: 'Algeciras', arrival_airport: 'Tanger Med', ...x })
  assert.equal(one([ferry(), ferry({ created_by: MARIA_ID })]).length, 2)
  none([train({ transport_mode: 'car' }), train({ transport_mode: 'car', created_by: MARIA_ID })]) // car rentals never
  none([train({ airline: null }), train({ airline: null, created_by: MARIA_ID })]) // no operator, no number
})
t('a connection is two cards, each with its own group', () => {
  const leg2 = x => flight({ title: 'JFK → SFO', flight_number: 'DL 1450', departure_airport: 'JFK', arrival_airport: 'SFO', departure_time: '2026-04-12T18:30:00Z', ...x })
  const rows = [flight(), flight({ created_by: MARIA_ID }), flight({ created_by: TOM }), leg2(), leg2({ created_by: MARIA_ID })]
  assert.deepEqual(groups(rows).map(g => g.items.length).sort(), [2, 3])
})
t('one traveller twice: alone it is not a shared card; with others it is two lines', () => {
  none([flight(), flight()])
  const rows = [flight(), flight(), flight({ created_by: MARIA_ID })]
  assert.equal(one(rows).length, 3)
})
t('eight travellers: one card of eight, mine first', () => {
  const names = ['Hana', 'Ben', 'Gil', 'Ada', 'Eve', 'Cai', 'Dov']
  const rows = [...names.map((p, i) => flight({ created_by: `u${i}`, passenger_name: p })), flight({ passenger_name: 'Me' })]
  const items = one(rows)
  assert.equal(items.length, 8)
  assert.deepEqual(items.map(travellerName), ['Me', 'Ada', 'Ben', 'Cai', 'Dov', 'Eve', 'Gil', 'Hana'])
})
t('different trips never group', () => {
  none([flight(), flight({ created_by: MARIA_ID, trip_id: 't2' })])
})
t('activities and hotels are never grouped (v1: flights and transport)', () => {
  const hotel = x => ({ id: `b${++n}`, trip_id: 't1', type: 'hotel', title: 'Hotel Neri', check_in_date: '2026-04-12', ...x })
  none([hotel(), hotel({ created_by: MARIA_ID })])
  none([{ ...flight(), _kind: 'activity' }, { ...flight({ created_by: MARIA_ID }), _kind: 'activity' }])
})
t('a name-less traveller is "Traveller"', () => assert.equal(travellerName(flight({ passenger_name: '  ' })), 'Traveller'))

// Plan checks (D4): two travellers on one family booking are not "in the plan twice", and not a tight connection
const trip = { id: 't1', destination_tz: LIS }
const kinds = rows => planConflicts(trip, rows).map(c => c.kind)
t('D4: one family booking, two travellers: no duplicate, no tight connection', () => {
  const rows = [flight({ created_by: MARIA_ID, passenger_name: 'Maria Silva', confirmation_number: 'XYZ789' }),
    flight({ created_by: MARIA_ID, passenger_name: 'Tom Silva', confirmation_number: 'XYZ789' }),
    flight({ confirmation_number: 'ABC123' })]
  assert.deepEqual(kinds(rows), [])
})
t('D4: the same traveller forwarding one booking twice still warns', () => {
  assert.deepEqual(kinds([flight({ confirmation_number: 'ABC123' }), flight({ confirmation_number: 'ABC123' })]), ['duplicate'])
})
t('a real tight connection after a shared leg still warns', () => {
  const rows = [flight(), flight({ created_by: MARIA_ID }),
    flight({ title: 'JFK → SFO', flight_number: 'DL 1450', departure_airport: 'JFK', arrival_airport: 'SFO', departure_time: '2026-04-12T16:35:00Z', arrival_time: '2026-04-12T23:00:00Z' })]
  assert.deepEqual(kinds(rows), ['tight'])
})

// The demo fixture the cloud emulators screenshot (?demo&flagship=9)
t('flagship fixture: BCN → BER is one card of three, no plan warnings', () => {
  const { trip: fsTrip, bookings } = flagshipTrip({ owner: ME, day: d => addDays('2026-11-10', d), wall: (d, hhmm) => `${addDays('2026-11-10', d)}T${hhmm}:00Z` })
  const g = groups(bookings)
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].items.map(b => [b.passenger_name, b.seat_number, b.created_by === MARIA]), [['Sam Rivera', '14A', false], ['Maria Silva', '14B', true], ['Tom Silva', '14C', true]])
  assert.deepEqual(planConflicts(fsTrip, bookings), [])
})
console.log(`\n${passed} passed`)
