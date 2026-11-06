#!/usr/bin/env node
// Trip matching rule (supabase/functions/_shared/tripMatch.js): dates and distance, never city names.
//   node scripts/test-trip-match.mjs
import assert from 'node:assert/strict'
import { bestTrip, rankTrips, wallSpan } from '../supabase/functions/_shared/tripMatch.js'

const C = {
  seattle: { lat: 47.61, lng: -122.33 }, tacoma: { lat: 47.25, lng: -122.44 }, madrid: { lat: 40.42, lng: -3.70 },
  granada: { lat: 37.18, lng: -3.60 }, toledo: { lat: 39.86, lng: -4.03 }, barcelona: { lat: 41.39, lng: 2.17 },
  berlin: { lat: 52.52, lng: 13.40 }, munich: { lat: 48.14, lng: 11.58 }, rome: { lat: 41.90, lng: 12.50 },
  tokyo: { lat: 35.68, lng: 139.69 },
}
const trip = (id, start, end, at, points = []) => ({ id, start_date: start, end_date: end, status: 'planning', destination_lat: at.lat, destination_lng: at.lng, points })
let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

// Flagship: Madrid trip so far 10–13 Nov with a Granada hotel; trains and flights arrive one by one
const spain = trip('spain', '2026-11-10', '2026-11-13', C.madrid, [C.granada])
const home = trip('seattle-weekend', '2026-12-05', '2026-12-06', C.seattle)

t('train Granada → Barcelona the day after the trip ends extends it', () => {
  const m = bestTrip([spain, home], { start: '2026-11-14', end: '2026-11-14', points: [C.granada, C.barcelona] })
  assert.equal(m.trip.id, 'spain'); assert.equal(m.fit, 'edge'); assert.deepEqual(m.widen, { start_date: '2026-11-10', end_date: '2026-11-14' })
})
t('flight Barcelona → Berlin inside the dates joins even though Berlin is new', () => {
  const m = bestTrip([spain], { start: '2026-11-12', end: '2026-11-12', points: [C.barcelona, C.berlin] })
  assert.equal(m.trip.id, 'spain'); assert.equal(m.fit, 'inside'); assert.equal(m.widen, null)
})
t('hotel in Rome 3 days after the end, nowhere near the route: no match', () => {
  assert.equal(bestTrip([spain], { start: '2026-11-16', end: '2026-11-18', points: [C.rome] }), null)
})
t('hotel checkout after the end widens an inside match', () => {
  const m = bestTrip([spain], { start: '2026-11-12', end: '2026-11-15', points: [C.madrid] })
  assert.equal(m.fit, 'inside'); assert.equal(m.widen.end_date, '2026-11-15')
})
t('booking 5 days away on the route: no match (new trip)', () => {
  assert.equal(bestTrip([spain], { start: '2026-11-19', end: '2026-11-19', points: [C.madrid] }), null)
})
t('undated trip for the city gets dates', () => {
  const und = { id: 'und', start_date: null, end_date: null, status: 'planning', destination_lat: C.tokyo.lat, destination_lng: C.tokyo.lng }
  const m = bestTrip([spain, und], { start: '2027-03-01', end: '2027-03-05', points: [C.tokyo] })
  assert.equal(m.trip.id, 'und'); assert.equal(m.fit, 'undated')
})
t('guide save in Tacoma during a live Seattle stay goes to that trip, not a new city trip', () => {
  const live = trip('pnw', '2026-10-20', '2026-10-25', C.seattle)
  const m = bestTrip([spain, live], { start: null, points: [C.tacoma] }, { today: '2026-10-22' })
  assert.equal(m.trip.id, 'pnw'); assert.equal(m.fit, 'live')
})
t('guide save in Toledo before the trip suggests the upcoming Spain trip', () => {
  const m = bestTrip([spain, home], { start: null, points: [C.toledo] }, { today: '2026-10-22' })
  assert.equal(m.trip.id, 'spain'); assert.equal(m.fit, 'upcoming')
})
t('guide save in Munich with no trip nearby: nothing suggested', () => {
  assert.equal(bestTrip([spain, home], { start: null, points: [C.munich] }, { today: '2026-10-22' }), null)
})
t('two trips on the same day: the nearer wins', () => {
  const a = trip('a', '2026-11-01', '2026-11-20', C.rome), b = trip('b', '2026-11-01', '2026-11-20', C.berlin)
  assert.equal(rankTrips([a, b], { start: '2026-11-05', points: [C.munich] })[0].trip.id, 'b')
})
t('cancelled trips never match', () => {
  assert.equal(bestTrip([{ ...spain, status: 'cancelled' }], { start: '2026-11-12', points: [C.madrid] }), null)
})
t('wallSpan reads printed dates', () => {
  assert.deepEqual(wallSpan({ departure_time: '2026-11-14T22:10', arrival_time: '2026-11-15T07:05' }), { start: '2026-11-14', end: '2026-11-15' })
  assert.deepEqual(wallSpan({ check_in_date: '2026-11-10', check_out_date: '2026-11-13' }), { start: '2026-11-10', end: '2026-11-13' })
  assert.equal(wallSpan({}), null)
})
t('overlapping dates in another region: no match (Berlin train during a New York trip)', () => {
  const ny = trip('ny', '2026-11-12', '2026-11-16', { lat: 40.64, lng: -73.78 }, [{ lat: 47.45, lng: -122.31 }])
  assert.equal(bestTrip([ny], { start: '2026-11-12', end: '2026-11-14', points: [C.berlin, { lat: 53.55, lng: 10.0 }] }), null)
  // Los Angeles → Sydney: LAX is 1,500 km from Seattle, still another region
  assert.equal(bestTrip([ny], { start: '2026-11-14', end: '2026-11-16', points: [{ lat: 33.94, lng: -118.41 }, { lat: -33.94, lng: 151.18 }] }), null)
})
t('overlapping dates within the region still join (Barcelona hotel on a Madrid trip; unknown place joins)', () => {
  assert.equal(bestTrip([spain], { start: '2026-11-11', end: '2026-11-12', points: [C.barcelona] }).fit, 'inside')
  assert.equal(bestTrip([spain], { start: '2026-11-11', end: '2026-11-12', points: [] }).fit, 'inside')
})
t('leaving from the same part of the world is not the same region (Seattle-Rome during Vancouver-Tokyo)', () => {
  const yvr = { lat: 49.19, lng: -123.18 }, hnd = { lat: 35.55, lng: 139.78 }, sea = { lat: 47.45, lng: -122.31 }, fco = { lat: 41.8, lng: 12.25 }
  const tokyo = { ...trip('tokyo', '2027-04-21', '2027-04-22', C.tokyo, [yvr, hnd]), origin: yvr }
  const rome = { start: '2027-04-15', end: '2027-04-26', points: [sea, fco, sea], origin: sea }
  assert.equal(bestTrip([tokyo], rome), null)
  // and the mirror: Tokyo arriving while the Rome trip exists
  const romeTrip = { ...trip('rome', '2027-04-15', '2027-04-26', C.rome, [sea, fco]), origin: sea }
  assert.equal(bestTrip([romeTrip], { start: '2027-04-21', end: '2027-04-22', points: [yvr, hnd], origin: yvr }), null)
  // still joins: the way back from the trip's stop, a hotel where the trip leaves from, a leg on to the same region
  assert.equal(bestTrip([romeTrip], { start: '2027-04-26', end: '2027-04-26', points: [fco, sea], origin: fco }).trip.id, 'rome')
  assert.equal(bestTrip([tokyo], { start: '2027-04-20', end: '2027-04-21', points: [yvr] }).trip.id, 'tokyo')
  assert.equal(bestTrip([romeTrip], { start: '2027-04-18', end: '2027-04-18', points: [sea, C.barcelona], origin: sea }).trip.id, 'rome')
})
console.log(`\n${n} passed`)
