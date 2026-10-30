// Section tour copy and "seen" memory. Run: node scripts/test-section-tours.mjs
import assert from 'node:assert/strict'
import { SECTION_TOURS, SEEN_PREFIX, hasSeenSection, markSectionSeen } from '../src/lib/sectionTours.js'

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

assert.deepEqual(Object.keys(SECTION_TOURS), ['trips', 'today', 'explore', 'toolbox', 'profile'])
const text = JSON.stringify(SECTION_TOURS)
for (const [k, t] of Object.entries(SECTION_TOURS)) {
  assert.ok(t.cards.length >= 1 && t.cards.length <= 3, `${k}: 1-3 cards`)
  assert.match(t.overline, /^About /)
}
// Wording rules: HONK lives in Explore only; no emoji; no price, trial or AI wording; no numbers
for (const [k, t] of Object.entries(SECTION_TOURS)) {
  assert.equal(/honk/i.test(JSON.stringify(t)), k === 'explore', `${k}: HONK on Explore only`)
}
assert.ok(!/\b(beta|trial|demo|free|AI)\b/i.test(text), 'no restricted words')
assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), 'no emoji')
assert.ok(!/\d{3}|\$/.test(text), 'no phone numbers or prices')
assert.ok(/Goose score/.test(JSON.stringify(SECTION_TOURS.profile)) && !/picks/i.test(text))

// Seen memory: per section, survives a blocked store
const s = mem()
assert.equal(hasSeenSection('trips', s), false)
markSectionSeen('trips', s)
assert.equal(hasSeenSection('trips', s), true)
assert.equal(hasSeenSection('today', s), false)
assert.equal(s.getItem(SEEN_PREFIX + 'trips'), '1')
assert.equal(hasSeenSection('trips', broken), false)
markSectionSeen('trips', broken)
console.log('section tours: ok')
