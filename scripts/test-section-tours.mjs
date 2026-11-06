// Section tours: copy, step logic, scenes and "seen" memory. Run: node scripts/test-section-tours.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  SECTION_TOURS, ART_REUSED, SEEN_PREFIX, hasSeenSection, markSectionSeen,
  clampStep, nextStep, prevStep, isLastStep, stepLabel, swipeTarget, keyTarget, tourFor,
} from '../src/lib/sectionTours.js'
import { SCENES, resolveStages, tapsOn } from '../src/lib/sectionTourScenes.js'
import { ICON_NAMES } from '../src/ui/icons/paths.js'

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

// ---------- Tours as data ----------
assert.deepEqual(Object.keys(SECTION_TOURS), ['trips', 'today', 'explore', 'honk', 'toolbox', 'profile'])
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}]/u
const allText = JSON.stringify([SECTION_TOURS, SCENES])
assert.ok(!EMOJI.test(allText), 'no emoji')
assert.ok(!/\b(beta|trial|demo|free|AI)\b/i.test(allText), 'no restricted words')
assert.ok(!/travell|colour|programme|favour/i.test(allText), 'US spelling')
assert.ok(!/Guide and FAQ|Open the Guide/.test(JSON.stringify(SECTION_TOURS.profile) + JSON.stringify(SCENES['profile-help'])), 'Profile calls it Help and FAQ')
assert.ok(!/@|D-\d{3}|drive\.google|Babar|Misha|Al-Jazari|Ziryab|Nizam|Todar/.test(allText), 'nothing internal in public copy')

for (const [k, t] of Object.entries(SECTION_TOURS)) {
  const [lo, hi] = k === 'honk' ? [3, 5] : [4, 7]
  assert.ok(t.steps.length >= lo && t.steps.length <= hi, `${k}: ${lo}-${hi} steps (has ${t.steps.length})`)
  assert.match(t.overline, /^About /)
  assert.equal(new Set(t.steps.map(s => s.id)).size, t.steps.length, `${k}: unique step ids`)
  for (const s of t.steps) {
    assert.ok(s.title && s.body, `${k}/${s.id}: title and body`)
    assert.ok(s.title.length <= 40, `${k}/${s.id}: title short`)
    assert.ok(s.body.length <= 170, `${k}/${s.id}: body short`)
    assert.ok(ART_REUSED.includes(s.art) || SCENES[s.art], `${k}/${s.id}: art "${s.art}" exists`)
  }
  assert.ok(t.tryIt?.label, `${k}: Try it label`)
  assert.ok(t.tryIt.action === 'new-trip' || t.tryIt.target, `${k}: Try it does something`)
}
// HONK lives in its own tour only; the Goose score is named on Profile only
for (const [k, t] of Object.entries(SECTION_TOURS)) {
  assert.equal(/honk/i.test(JSON.stringify(t)), k === 'honk', `${k}: HONK in the honk tour only`)
  assert.equal(/Goose score/.test(JSON.stringify(t)), k === 'profile', `${k}: Goose score on Profile only`)
}

// Every "Try it" target exists as a data-tour attribute in the app source
const walk = d => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
const src = walk('src').filter(f => /\.jsx$/.test(f) && !f.includes('SectionTour')).map(f => readFileSync(f, 'utf8')).join('\n')
for (const [k, t] of Object.entries(SECTION_TOURS)) {
  if (t.tryIt.target) assert.ok(new RegExp(`data-tour=(\"|\{[^}]*')${t.tryIt.target}`).test(src), `${k}: data-tour="${t.tryIt.target}" is in the app`)
}
// The section tours are wired to their screens (honk waits for its tab)
for (const k of ['trips', 'today', 'explore', 'toolbox', 'profile']) assert.ok(src.includes(`section="${k}"`), `${k}: has an "i" button`)

// ---------- Scenes ----------
const walkBlocks = (scene, fn) => [...Object.values(scene.screens), ...Object.values(scene.sheets || {})].forEach(v => v.blocks.forEach(fn))
for (const [id, sc] of Object.entries(SCENES)) {
  const stages = resolveStages(sc)
  assert.ok(stages.length >= 2, `${id}: has a script`)
  stages.forEach((st, i) => {
    assert.ok(sc.screens[st.screen], `${id}[${i}]: screen exists`)
    if (st.sheet) assert.ok(sc.sheets?.[st.sheet], `${id}[${i}]: sheet exists`)
    if (st.tap) assert.ok(tapsOn(sc, st).has(st.tap), `${id}[${i}]: tap "${st.tap}" is on screen`)
    if (st.cap) assert.ok(st.cap.text.length <= 60, `${id}[${i}]: caption short`)
  })
  assert.deepEqual(stages.filter(s => s.cap).map(s => s.cap.n), stages.filter(s => s.cap).map((_, i) => i + 1), `${id}: captions numbered in order`)
  assert.ok(stages.some(s => s.cap), `${id}: has a caption`)
  // icons are real
  const icons = []
  Object.values(sc.screens).forEach(v => v.action && icons.push(v.action.icon))
  walkBlocks(sc, b => {
    ;[b.icon, b.btn?.icon, ...(b.items || []).map(i => (i && typeof i === 'object' && !Array.isArray(i) ? i.icon : null))].forEach(i => i && icons.push(i))
    if (b.t === 'badges') b.items.forEach(([i]) => icons.push(i))
    if (b.t === 'tabs') b.items.forEach(([, , i]) => i && icons.push(i))
  })
  icons.forEach(i => assert.ok(ICON_NAMES.includes(i), `${id}: icon "${i}" exists`))
}
// Carry-forward rules
const demo = resolveStages({ screens: { a: {}, b: {} }, script: [{ screen: 'a', sheet: 'x', cap: 'one' }, { toast: 't' }, { screen: 'b', sheet: null, cap: 'two' }] })
assert.deepEqual(demo.map(s => [s.screen, s.sheet, s.toast, s.cap?.n]), [['a', 'x', undefined, 1], ['a', 'x', 't', undefined], ['b', null, undefined, 2]])

// ---------- Step logic ----------
assert.equal(clampStep(-3, 5), 0); assert.equal(clampStep(9, 5), 4); assert.equal(clampStep(NaN, 5), 0); assert.equal(clampStep(2.7, 5), 2)
assert.equal(nextStep(0, 5), 1); assert.equal(nextStep(4, 5), 4)
assert.equal(prevStep(1, 5), 0); assert.equal(prevStep(0, 5), 0)
assert.equal(isLastStep(4, 5), true); assert.equal(isLastStep(3, 5), false)
assert.equal(stepLabel(1, 6), 'Step 2 of 6')
assert.equal(swipeTarget(2, 5, -80), 3); assert.equal(swipeTarget(2, 5, 80), 1); assert.equal(swipeTarget(2, 5, 20), 2)
assert.equal(swipeTarget(4, 5, -80), 4); assert.equal(swipeTarget(0, 5, 80), 0)
assert.equal(keyTarget(2, 5, 'ArrowRight'), 3); assert.equal(keyTarget(2, 5, 'ArrowLeft'), 1)
assert.equal(keyTarget(2, 5, 'Home'), 0); assert.equal(keyTarget(2, 5, 'End'), 4); assert.equal(keyTarget(2, 5, 'a'), null)
assert.equal(tourFor('nope'), null)

// Walking a whole tour forward and back lands on the same steps
for (const [k, t] of Object.entries(SECTION_TOURS)) {
  const n = t.steps.length
  let i = 0
  const seen = [i]
  while (!isLastStep(i, n)) { i = nextStep(i, n); seen.push(i) }
  assert.deepEqual(seen, t.steps.map((_, j) => j), `${k}: forward visits every step`)
  while (i > 0) i = prevStep(i, n)
  assert.equal(i, 0)
}

// ---------- Seen memory: per section, survives a blocked store ----------
const s = mem()
assert.equal(hasSeenSection('trips', s), false)
markSectionSeen('trips', s)
assert.equal(hasSeenSection('trips', s), true)
assert.equal(hasSeenSection('today', s), false)
assert.equal(s.getItem(SEEN_PREFIX + 'trips'), '1')
assert.equal(hasSeenSection('trips', broken), false)
markSectionSeen('trips', broken)
assert.equal(hasSeenSection('trips', null), false)
console.log('section tours: ok')
