#!/usr/bin/env node
// Explore's default city: current/upcoming trip, else latest past trip, else last viewed, else none (popular row).
//   node scripts/test-explore-default.mjs
import assert from 'node:assert/strict'
import { pickDefaultCity, pastTrips, POPULAR_CITIES, readLastCity, saveLastCity, LAST_CITY_KEY } from '../src/lib/exploreDefault.js'

const trip = (id, city, start, end, status = 'planning') => ({ id, destination_city: city, destination_country: `${city}land`, destination_country_code: 'XX', start_date: start, end_date: end, status })
const old = trip('a', 'Rome', '2024-03-01', '2024-03-08'), older = trip('b', 'Paris', '2023-05-01', '2023-05-05')
const cancelled = trip('c', 'Oslo', '2025-01-01', '2025-01-05', 'cancelled'), undated = trip('d', 'Lima', null, null)
const last = { city: 'Kyoto', country: 'Japan', country_code: 'JP' }
let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

t('current trip city wins', () => assert.equal(pickDefaultCity({ current: { city: 'Madrid', country: 'Spain', country_code: 'ES' }, upcoming: trip('u', 'Berlin', '2099-01-01', '2099-01-05'), trips: [old], lastViewed: last }).city, 'Madrid'))
t('else the next upcoming trip', () => assert.equal(pickDefaultCity({ upcoming: trip('u', 'Berlin', '2099-01-01', '2099-01-05'), trips: [old], lastViewed: last }).city, 'Berlin'))
t('else the most recent past trip', () => {
  assert.equal(pickDefaultCity({ trips: [older, old, cancelled, undated], lastViewed: last }).city, 'Rome')
  assert.deepEqual(pastTrips([older, old, cancelled, undated]).map(x => x.id), ['a', 'b'])
})
t('past trip beats the last viewed city', () => assert.equal(pickDefaultCity({ trips: [older], lastViewed: last }).city, 'Paris'))
t('else the last viewed city', () => assert.equal(pickDefaultCity({ trips: [], lastViewed: last }).city, 'Kyoto'))
t('only cancelled or undated trips fall through to last viewed', () => assert.equal(pickDefaultCity({ trips: [cancelled, undated], lastViewed: last }).city, 'Kyoto'))
t('race: trips not loaded yet, the remembered city must not win; once loaded it does', () => {
  assert.equal(pickDefaultCity({ trips: [], lastViewed: last, tripsReady: false }), null)
  assert.equal(pickDefaultCity({ trips: [], lastViewed: last, tripsReady: true }).city, 'Kyoto')
  assert.equal(pickDefaultCity({ trips: [old], lastViewed: last, tripsReady: false }).city, 'Rome') // trips present always win
})
t('nothing at all: null, so Explore shows the popular row', () => {
  assert.equal(pickDefaultCity({}), null)
  assert.equal(pickDefaultCity({ trips: [] , lastViewed: null }), null)
})
t('popular cities are a fixed list with city, country and code', () => {
  assert.equal(POPULAR_CITIES.length, 8)
  assert.ok(POPULAR_CITIES.every(c => c.city && c.country && /^[A-Z]{2}$/.test(c.country_code)))
})
t('last city: round trip, bad data and blocked storage are safe', () => {
  const store = {}
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v } }
  assert.equal(readLastCity(), null)
  saveLastCity(last); assert.deepEqual(readLastCity(), last)
  store[LAST_CITY_KEY] = '{not json'; assert.equal(readLastCity(), null)
  store[LAST_CITY_KEY] = '{"city":42}'; assert.equal(readLastCity(), null)
  globalThis.localStorage = { getItem() { throw new Error('off') }, setItem() { throw new Error('off') } }
  assert.equal(readLastCity(), null); saveLastCity(last)
  delete globalThis.localStorage
})
console.log(`${n} passed`)
