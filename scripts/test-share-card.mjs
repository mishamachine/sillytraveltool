#!/usr/bin/env node
// Share card: data-to-card mapping, privacy exclusions, safe areas and contrast.
//   node scripts/test-share-card.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildShareCard, tripDays, monthLine, routeOf, gooseLine, shareCaption, badgesEarnedOn, CARD_SIZES } from '../src/lib/shareCard.js'
import { drawShareCard, SAFE_TOP, SAFE_BOTTOM } from '../src/lib/shareCardDraw.js'
import { SHARE_CARD_LOOKS, BADGES } from '../src/lib/tokens.js'
import { ICONS } from '../src/ui/icons/paths.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

// Booking and stop rows in the real table shapes, loaded with identifying detail that must never reach the card
const SECRETS = ['XK92QZ', 'Jane Doe', 'Hotel Fictional Palace', '12 Rue Exemple', 'LH 1234', '412.50', 'P1234567', 'jane@example.com']
const booking = (type, extra = {}) => ({
  id: 'b', trip_id: 't1', type, title: 'Hotel Fictional Palace', confirmation_number: 'XK92QZ', passenger_name: 'Jane Doe',
  address: '12 Rue Exemple', flight_number: 'LH 1234', price: 412.5, currency: 'EUR', notes: 'P1234567 jane@example.com', ...extra,
})
const stop = (position, city, country, country_code, kind = 'stay') => ({ position, city, country, country_code, kind, start_date: '2026-10-01', end_date: '2026-10-03', nights: 2, tz: 'Europe/Lisbon', lat: 38.7, lng: -9.1 })
const trip = (o = {}) => ({ id: 'trip-1', title: 'Portugal in October', status: 'completed', start_date: '2026-10-02', end_date: '2026-10-14', destination_city: 'Lisbon', destination_country: 'Portugal', destination_country_code: 'PT', ...o })
const STOPS = [stop(0, 'Seattle', 'United States', 'US', 'home'), stop(1, 'Lisbon', 'Portugal', 'PT'), stop(2, 'Porto', 'Portugal', 'PT'), stop(3, 'Lisbon', 'Portugal', 'PT'), stop(4, 'Madrid', 'Spain', 'ES'), stop(5, 'Atlantic', 'x', 'XX', 'transit'), stop(6, 'Seattle', 'United States', 'US', 'home')]
const BOOKINGS = [booking('flight'), booking('flight'), booking('hotel'), booking('restaurant')]
const STATS = { trips_completed: 5, goose_score: 1240, total_flights: 14 }
const BADGE_ROWS = [
  { badge_id: 'wheels_up', badge_name: 'Finally Left', badge_tier: 'easy', unlocked_at: '2026-10-05T10:00:00Z' },
  { badge_id: 'continent_hopper', badge_name: 'x', badge_tier: 'medium', unlocked_at: '2026-10-10T10:00:00Z' },
  { badge_id: 'first_trip', badge_name: 'x', badge_tier: 'easy', unlocked_at: '2025-01-01T10:00:00Z' }, // not on this trip
]
const build = (o = {}) => buildShareCard({ trip: trip(), stops: STOPS, bookings: BOOKINGS, stats: STATS, badges: BADGE_ROWS, ...o })

t('days, month line and route use stays only, first city first, no repeats', () => {
  assert.equal(tripDays(trip()), 13)
  assert.equal(tripDays(trip({ start_date: '2026-10-02', end_date: '2026-10-02' })), 1)
  assert.equal(tripDays(trip({ start_date: null, end_date: null })), null)
  assert.equal(monthLine(trip()), 'Oct 2026')
  assert.equal(monthLine(trip({ end_date: '2026-11-03' })), 'Oct – Nov 2026')
  assert.equal(monthLine(trip({ start_date: '2026-12-28', end_date: '2027-01-04' })), 'Dec 2026 – Jan 2027')
  const r = routeOf(trip(), STOPS)
  assert.deepEqual(r.cities, ['Lisbon', 'Porto', 'Madrid'])
  assert.equal(r.countryCount, 2)
})

t('full trip: trio, extras, score and badges', () => {
  const m = build()
  assert.deepEqual(m.trio.map(s => [s.value, s.label]), [[13, 'days'], [3, 'cities'], [2, 'countries']])
  assert.deepEqual(m.extras.map(s => [s.value, s.label]), [[2, 'flights'], [5, 'trips completed']])
  assert.equal(m.score, 1240)
  assert.deepEqual(m.badges.map(b => b.id), ['wheels_up', 'continent_hopper'])
  assert.equal(m.dateLine, 'Oct 2026')
  assert.equal(m.overline, 'TRIP RECAP')
  assert.equal(m.cta, 'Plan yours with Silly Travel Tool')
})

t('a stat shows only when above zero', () => {
  const m = build({ bookings: [booking('hotel')], stats: { trips_completed: 0, goose_score: 0 }, badges: [] })
  assert.deepEqual(m.extras, [])
  assert.equal(m.score, null)
  assert.deepEqual(m.badges, [])
  const none = build({ stops: [], trip: trip({ destination_city: null, destination_country: null, destination_country_code: null }) })
  assert.deepEqual(none.trio.map(s => s.label), ['days'])
  assert.equal(none.route.cities.length, 0)
})

t('one-city trip falls back to the destination and the days line', () => {
  const m = build({ stops: [], bookings: [] })
  assert.deepEqual(m.route, { cities: [], more: 0 }) // no route strip for one city
  assert.deepEqual(m.trio.map(s => [s.value, s.label]), [[13, 'days in Portugal']]) // one giant number, no city or country counts
  assert.equal(m.gooseLine, '13 days away. Goose is proud.') // no flights
  // country missing: falls back to the city
  const noCountry = build({ stops: [], bookings: [], trip: trip({ destination_country: null, destination_country_code: null }) })
  assert.equal(noCountry.trio[0].label, 'days in Lisbon')
})

t('six cities: route shows five then +1 more; badges cap at four', () => {
  const cities = ['Lisbon', 'Porto', 'Madrid', 'Seville', 'Granada', 'Valencia'].map((c, i) => stop(i, c, 'Portugal', 'PT'))
  const rows = ['wheels_up', 'first_trip', 'first_pin', 'packing_pro', 'money_goose', 'first_honk'].map(id => ({ badge_id: id, badge_name: id, badge_tier: 'easy', unlocked_at: '2026-10-06T00:00:00Z' }))
  const m = build({ stops: cities, badges: rows })
  assert.equal(m.route.cities.length, 5)
  assert.equal(m.route.more, 1)
  assert.equal(m.badges.length, 4)
  assert.equal(m.trio[1].value, 6)
})

t('Goose line: 2+ flights use the flights line, then 2+ cities, else the days line', () => {
  assert.equal(gooseLine({ days: 6, cities: 3, flights: 3 }), '3 flights. Zero lost in the inbox.')
  assert.equal(gooseLine({ days: 6, cities: 3, flights: 2 }), '2 flights. Zero lost in the inbox.')
  assert.equal(gooseLine({ days: 6, cities: 3, flights: 1 }), '3 cities, one tidy itinerary.')
  assert.equal(gooseLine({ days: 7, cities: 1, flights: 1 }), '7 days away. Goose is proud.')
  assert.equal(gooseLine({ days: 1, cities: 1, flights: 0 }), '1 day away. Goose is proud.')
  assert.equal(gooseLine({ days: 0, cities: 0, flights: 0 }), 'Goose approves.')
  assert.equal(build().gooseLine, '2 flights. Zero lost in the inbox.') // the sample trip has two flights
})

t('hide dates removes the date line only; edited title is used', () => {
  const m = build({ hideDates: true, title: '  Our   big trip  ' })
  assert.equal(m.dateLine, null)
  assert.equal(m.title, 'Our big trip')
  assert.equal(build({ title: '' }).title, 'My trip')
  assert.equal(build({ title: 'x'.repeat(200) }).title.length, 60)
  // a long title is cut at a word, never mid-word
  const cut = build({ title: 'The extremely long and winding trip name that nobody asked for but here we are anyway' }).title
  assert.equal(cut, 'The extremely long and winding trip name that nobody asked…')
  assert.ok(cut.length <= 60)
})

t('caption is the agreed text with the tracked link, no price or "free" or AI wording', () => {
  const c = build().caption
  assert.equal(c, 'Portugal in October: 13 days, 3 cities. Planned with Silly Travel Tool. sillytraveltool.com/?utm_source=recap_share&utm_medium=card')
  assert.equal(shareCaption({ title: 'A', days: 1, cities: 1 }), 'A: 1 day, 1 city. Planned with Silly Travel Tool. sillytraveltool.com/?utm_source=recap_share&utm_medium=card')
  assert.doesNotMatch(JSON.stringify(build()), /\bfree\b|\bAI\b|\$|€|price/i)
  assert.equal(build().alt, 'Trip recap card: Portugal in October, 13 days, 3 cities.')
})

t('privacy: nothing from bookings, travellers or addresses reaches the card model', () => {
  const json = JSON.stringify(build())
  for (const s of SECRETS) assert.ok(!json.includes(s), `leaked ${s}`)
  // stops carry coordinates and zones; neither is read
  assert.ok(!/38\.7|Europe\/Lisbon/.test(json))
  // booking rows are only counted
  const poisoned = build({ bookings: [booking('flight', { passenger_name: 'Zed Quux', confirmation_number: 'ZZ99ZZ' })] })
  assert.ok(!JSON.stringify(poisoned).includes('Zed Quux') && !JSON.stringify(poisoned).includes('ZZ99ZZ'))
})

// A drawing context that records every string drawn and where
function recorder() {
  const calls = []
  const ctx = new Proxy({ font: '', calls }, {
    get(target, k) {
      if (k in target) return target[k]
      if (k === 'measureText') return s => ({ width: String(s).length * (parseFloat(/(\d+(\.\d+)?)px/.exec(target.font)?.[1]) || 16) * 0.55 })
      if (k === 'fillText') return (s, x, y) => calls.push({ s, x, y, color: target.fillStyle, size: parseFloat(/(\d+(\.\d+)?)px/.exec(target.font)?.[1]) })
      return () => {}
    },
    set(target, k, v) { target[k] = v; return true },
  })
  return { ctx, calls }
}
const assets = { goose() {}, icon() {} }
const draw = (model, size, look = 'dark') => { const r = recorder(); drawShareCard(r.ctx, model, { size, palette: SHARE_CARD_LOOKS[look], assets }); return r.calls }

t('renderer draws only model strings (no booking data), for both looks and sizes', () => {
  const allowed = new Set()
  const m = build()
  const add = s => s && allowed.add(String(s))
  ;[m.overline, m.title, m.dateLine, m.gooseLine, m.cta, m.site, 'Goose score', m.score?.toLocaleString('en-US'), ...m.route.cities, ...m.trio.flatMap(s => [s.value, s.label]), ...m.extras.flatMap(s => [s.value, s.label])].forEach(add)
  for (const size of ['story', 'square']) for (const look of ['dark', 'terracotta']) {
    for (const c of draw(m, size, look)) {
      assert.ok([...allowed].some(a => a.includes(c.s.replace('…', ''))), `unexpected text "${c.s}"`)
      for (const s of SECRETS) assert.ok(!c.s.includes(s))
    }
  }
})

t('story: all text sits between the top 250 px and the bottom 340 px, worst case content', () => {
  const six = ['Lisbon', 'Porto Alegre do Norte', 'Madrid', 'Seville', 'Granada', 'Valencia'].map((c, i) => stop(i, c, 'x' + i, 'C' + i))
  const rows = ['wheels_up', 'first_trip', 'first_pin', 'packing_pro'].map(id => ({ badge_id: id, badge_name: id, badge_tier: 'easy', unlocked_at: '2026-10-06T00:00:00Z' }))
  const worst = build({ stops: six, badges: rows, title: 'A very long trip name that keeps going and going across the whole page twice over', trip: trip({ id: 'trip-b' }) })
  const calls = draw(worst, 'story')
  const H = CARD_SIZES.story.h
  assert.equal(CARD_SIZES.story.w, 1080); assert.equal(H, 1920)
  for (const c of calls) {
    assert.ok(c.y >= SAFE_TOP, `"${c.s}" at y=${c.y} is inside the top ${SAFE_TOP}px`)
    assert.ok(c.y + c.size <= H - SAFE_BOTTOM, `"${c.s}" ends at ${c.y + c.size}, inside the bottom ${SAFE_BOTTOM}px`)
  }
  // the title wraps to at most three lines and never loses a word mid-way: every title line is whole words from the title
  const titleLines = calls.filter(c => c.size >= 72 && c.y < 700 && !/^\d+$/.test(c.s) && c.s !== worst.dateLine)
  assert.ok(titleLines.length <= 3 && titleLines.length >= 1)
  for (const c of titleLines) for (const w of c.s.replace('…', '').split(' ')) assert.ok(worst.title.replace('…', '').split(' ').includes(w), `"${w}" is cut mid-word`)
})

t('story fills the safe area: content runs from the top band down to the call to action at about y=1560', () => {
  const calls = draw(build(), 'story')
  const last = calls.at(-1)
  assert.ok(last.y + last.size >= 1520 && last.y + last.size <= 1580, `footer ends at ${last.y + last.size}`)
  // the big numbers are the hero
  assert.ok(Math.max(...calls.filter(c => /^\d+$/.test(c.s)).map(c => c.size)) >= 150)
  const one = draw(build({ stops: [], bookings: [] }), 'story')
  assert.ok(one.some(c => c.s === '13' && c.size >= 200), 'giant ' + JSON.stringify(one.slice(0, 8)))
  assert.ok(one.some(c => c.s === 'days in Portugal'))
  assert.ok(!one.some(c => c.s === 'Lisbon'), 'no route strip for one city')
})

t('a long title with a long unbroken word wraps then cuts at a word, not mid-word', () => {
  const m = build({ title: 'Seventeen unbelievably spectacular wonderful marvellous adventurous holidays abroad' })
  for (const c of draw(m, 'story').filter(c => c.size >= 72 && c.y < 700 && !/^\d+$/.test(c.s) && c.s !== m.dateLine)) for (const w of c.s.replace('…', '').split(' ')) assert.ok(m.title.replace('…', '').split(' ').includes(w), `"${w}"`)
})

t('square: everything inside 1080 x 1080', () => {
  const calls = draw(build(), 'square')
  for (const c of calls) assert.ok(c.y >= 0 && c.y + c.size <= 1080, `"${c.s}" y=${c.y}`)
})

t('every colour actually drawn has 4.5:1 or better on everything it can sit on (background, disc, chip)', () => {
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  for (const look of ['dark', 'terracotta']) for (const size of ['story', 'square']) {
    const P = SHARE_CARD_LOOKS[look]
    for (const c of draw(build(), size, look)) {
      for (const under of ['bg', 'disc']) assert.ok(ratio(c.color, P[under]) >= 4.5, `${look} "${c.s}" ${c.color} on ${under} = ${ratio(c.color, P[under]).toFixed(2)}`)
      if (c.color === P.text) assert.ok(ratio(P.text, P.chip) >= 4.5)
    }
  }
})

t('palette: every text and fill pair has contrast of at least 4.5:1, and matches the brand tokens', () => {
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  for (const [look, P] of Object.entries(SHARE_CARD_LOOKS)) {
    for (const fg of ['text', 'soft', 'accent']) for (const bg of ['bg', 'disc', 'chip']) {
      if (fg === 'accent' && bg === 'chip') continue
      assert.ok(ratio(P[fg], P[bg]) >= 4.5, `${look}: ${fg} on ${bg} = ${ratio(P[fg], P[bg]).toFixed(2)}`)
    }
  }
  const tokens = readFileSync(new URL('../docs/brand/brand-tokens.json', import.meta.url), 'utf8').toUpperCase()
  for (const hex of [SHARE_CARD_LOOKS.dark.bg, SHARE_CARD_LOOKS.terracotta.bg, SHARE_CARD_LOOKS.dark.text, SHARE_CARD_LOOKS.dark.soft, SHARE_CARD_LOOKS.dark.accent]) assert.ok(tokens.includes(hex), `${hex} is not a brand token`)
})

t('every badge icon exists in the icon set', () => {
  for (const [id, b] of Object.entries(BADGES)) assert.ok(ICONS[b.icon], `${id} icon ${b.icon}`)
  assert.ok(ICONS.award)
})

t('badgesEarnedOn: only the trip window and three days after', () => {
  assert.deepEqual(badgesEarnedOn(trip(), BADGE_ROWS).map(b => b.id), ['wheels_up', 'continent_hopper'])
  assert.deepEqual(badgesEarnedOn(trip({ start_date: null, end_date: null }), BADGE_ROWS), [])
})

console.log(`\n${n} passed`)
