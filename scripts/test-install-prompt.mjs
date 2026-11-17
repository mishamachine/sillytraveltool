#!/usr/bin/env node
// "Add to home screen": the pop-up limits, the device gating, the events and the iOS branch.
//   node scripts/test-install-prompt.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  INSTALL_COPY, EVENTS, MIN_GAP_MS, MAX_DISMISSALS, STORAGE_KEY, LEGACY_DISMISSED_KEY,
  readEnv, iosStepsParts, countsAsDismissal, surfaceAvailable, installMethod, stepsText, readState, markShown, markDismissed, markDone, markOnboardingShown, evaluate,
} from '../src/lib/installPrompt.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }
const memory = (init = {}) => {
  const m = { ...init }
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, raw: m }
}
const brokenStorage = { getItem() { throw new Error('private window') }, setItem() { throw new Error('private window') } }
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 14, 12)
const web = { native: false, standalone: false, ios: false, iosSafari: false }
const base = { state: { last_shown: NOW - 15 * DAY, dismissals: 0, done: false, ok: true }, now: NOW, env: web, signedIn: true, busy: false, shownThisVisit: false }
const verdict = (over) => evaluate({ ...base, ...over, state: { ...base.state, ...(over?.state || {}) } })

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
}
const win = (ua, { standalone = false, navStandalone } = {}) => ({
  navigator: { userAgent: ua, platform: 'x', maxTouchPoints: 0, ...(navStandalone === undefined ? {} : { standalone: navStandalone }) },
  matchMedia: q => ({ matches: standalone && q === '(display-mode: standalone)' }),
})

t('wording: final strings, no question mark, no offline claim', () => {
  assert.equal(INSTALL_COPY.title, 'Add Silly Travel Tool to your home screen')
  assert.equal(INSTALL_COPY.add, 'Add')
  assert.equal(INSTALL_COPY.notNow, 'Not now')
  assert.equal(INSTALL_COPY.gotIt, 'Got it')
  assert.equal(INSTALL_COPY.iosSteps, 'Tap Share, then Add to Home Screen.')
  assert.equal(INSTALL_COPY.settingsRow, 'Add to home screen')
  for (const v of Object.values(INSTALL_COPY)) assert.ok(!/offline|faster|full screen|store/i.test(v), v)
  assert.ok(!INSTALL_COPY.title.includes('?'))
})

t('events: three short names, no props anywhere in the UI code', () => {
  assert.deepEqual(EVENTS, { shown: 'install_prompt_shown', dismissed: 'install_prompt_dismissed', accepted: 'install_accepted' })
  const ui = readFileSync(new URL('../src/components/shared/InstallPrompt.jsx', import.meta.url), 'utf8')
  const calls = [...ui.matchAll(/track\(([^)]*)\)/g)].map(m => m[1])
  assert.ok(calls.length >= 4)
  for (const c of calls) assert.match(c, /^EVENTS\.(shown|dismissed|accepted)$/, `track(${c}) must pass the event only`)
})

t('never in the store apps, never when installed (standalone or iOS navigator.standalone)', () => {
  assert.equal(readEnv({ capacitor: { isNativePlatform: () => true }, win: win(UA.android) }).native, true)
  assert.equal(readEnv({ capacitor: { isNativePlatform: () => false }, win: win(UA.android) }).native, false)
  assert.equal(readEnv({ capacitor: { isNativePlatform: () => { throw new Error('no bridge') } }, win: win(UA.android) }).native, false)
  assert.equal(readEnv({ win: win(UA.android, { standalone: true }) }).standalone, true)
  assert.equal(readEnv({ win: win(UA.iosSafari, { navStandalone: true }) }).standalone, true)
  assert.equal(readEnv({ win: win(UA.iosSafari, { navStandalone: false }) }).standalone, false)
  const s = { done: false }
  assert.equal(surfaceAvailable(web, s), true)
  assert.equal(surfaceAvailable({ ...web, native: true }, s), false)
  assert.equal(surfaceAvailable({ ...web, standalone: true }, s), false)
  assert.equal(surfaceAvailable(web, { done: true }), false)
  assert.equal(verdict({ env: { ...web, native: true } }), 'unavailable')
  assert.equal(verdict({ env: { ...web, standalone: true } }), 'unavailable')
  assert.equal(verdict({ state: { done: true } }), 'unavailable')
})

t('shows when eligible: web, signed in, 15 days since last, idle, first time this visit', () => {
  assert.equal(verdict(), 'show')
})

t('at least 14 days apart', () => {
  assert.equal(verdict({ state: { last_shown: NOW - (MIN_GAP_MS - 1) } }), 'gap')
  assert.equal(verdict({ state: { last_shown: NOW - MIN_GAP_MS } }), 'show')
  assert.equal(verdict({ state: { last_shown: NOW - DAY } }), 'gap')
})

t('stops for good after 2 dismissals', () => {
  assert.equal(MAX_DISMISSALS, 2)
  assert.equal(verdict({ state: { dismissals: 1 } }), 'show')
  assert.equal(verdict({ state: { dismissals: 2 } }), 'dismissed')
  assert.equal(verdict({ state: { dismissals: 5, last_shown: NOW - 400 * DAY } }), 'dismissed')
})

t('at most once per visit', () => {
  assert.equal(verdict({ shownThisVisit: true }), 'visit')
})

t('not on the first visit: nothing stored starts the clock instead of showing', () => {
  assert.equal(verdict({ state: { last_shown: null } }), 'first_visit')
})

t('never mid-task, and never signed out', () => {
  assert.equal(verdict({ busy: true }), 'busy')
  assert.equal(verdict({ signedIn: false }), 'signed_out')
})

t('no usable localStorage (private window): never shows', () => {
  const s = readState(brokenStorage)
  assert.equal(s.ok, false)
  assert.equal(evaluate({ ...base, state: s }), 'storage')
  assert.equal(markShown(brokenStorage, NOW), null)
  assert.equal(markDismissed(brokenStorage), null)
})

t('counters: shown stamps the time, each pop-up dismissal adds 1, install sets done', () => {
  const st = memory()
  assert.deepEqual(readState(st), { last_shown: null, dismissals: 0, done: false, ok: true })
  markShown(st, NOW)
  markDismissed(st)
  markDismissed(st)
  assert.deepEqual(JSON.parse(st.raw[STORAGE_KEY]), { last_shown: NOW, dismissals: 2, done: false })
  markDone(st)
  assert.equal(readState(st).done, true)
  assert.equal(evaluate({ ...base, state: readState(st), now: NOW + 99 * DAY }), 'unavailable')
})

t('onboarding step starts the 14-day gap and is not a dismissal', () => {
  const st = memory()
  markOnboardingShown(st, NOW)
  const s = readState(st)
  assert.equal(s.dismissals, 0)
  assert.equal(evaluate({ ...base, state: s, now: NOW + 13 * DAY }), 'gap')
  assert.equal(evaluate({ ...base, state: s, now: NOW + 14 * DAY }), 'show')
})

t('the old toast key counts as 1 dismissal; a corrupt record is treated as empty', () => {
  assert.equal(readState(memory({ [LEGACY_DISMISSED_KEY]: '1' })).dismissals, 1)
  assert.equal(readState(memory({ [LEGACY_DISMISSED_KEY]: '1', [STORAGE_KEY]: JSON.stringify({ dismissals: 1 }) })).dismissals, 1)
  assert.equal(readState(memory({ [LEGACY_DISMISSED_KEY]: '1', [STORAGE_KEY]: JSON.stringify({ dismissals: 2 }) })).dismissals, 2)
  const bad = readState(memory({ [STORAGE_KEY]: '{nope' }))
  assert.equal(bad.ok, false)
})

t('iOS branch: Safari gets the Share steps, other iOS browsers are sent to Safari, never a browser prompt', () => {
  const safari = readEnv({ win: win(UA.iosSafari) })
  const chrome = readEnv({ win: win(UA.iosChrome) })
  assert.equal(safari.ios, true); assert.equal(safari.iosSafari, true)
  assert.equal(chrome.ios, true); assert.equal(chrome.iosSafari, false)
  assert.equal(installMethod(safari, false), 'ios-safari')
  assert.equal(installMethod(safari, true), 'ios-safari')
  assert.equal(installMethod(chrome, false), 'ios-other')
  assert.equal(stepsText('ios-safari'), 'Tap Share, then Add to Home Screen.')
  assert.equal(stepsText('ios-other'), 'Open this page in Safari, then tap Share, then Add to Home Screen.')
})

t('iOS steps sentence is built from the one string, split around Share for the icon', () => {
  const { before, after } = iosStepsParts()
  assert.equal(`${before} ${after}`.replace(/\s+/g, ' ').replace(' ,', ','), 'Tap Share, then Add to Home Screen.')
  assert.equal(before, 'Tap Share')
  assert.equal(after, ', then Add to Home Screen.')
  const ui = readFileSync(new URL('../src/components/shared/InstallPrompt.jsx', import.meta.url), 'utf8')
  assert.ok(!ui.includes('then Add to Home Screen'), 'the sentence must not be duplicated in JSX')
})

t('pop-up closed after Add (steps view) is not a dismissal; from the offer it is; other surfaces never', () => {
  assert.equal(countsAsDismissal({ popup: true, view: 'ask' }), true)
  assert.equal(countsAsDismissal({ popup: true, view: 'steps' }), false)
  assert.equal(countsAsDismissal({ popup: false, view: 'ask' }), false)
  assert.equal(countsAsDismissal({ popup: false, view: 'steps' }), false)
  const ui = readFileSync(new URL('../src/components/shared/InstallPrompt.jsx', import.meta.url), 'utf8')
  assert.match(ui, /if \(countsAsDismissal\(\{ popup, view \}\)\)/, 'dismiss() must gate on countsAsDismissal')
})

t('iPadOS that reports as a Mac is still iOS', () => {
  const ipad = readEnv({ win: { navigator: { userAgent: UA.iosSafari.replace('iPhone', 'Macintosh'), platform: 'MacIntel', maxTouchPoints: 5 }, matchMedia: () => ({ matches: false }) } })
  assert.equal(ipad.ios, true)
})

t('Android and desktop: browser prompt when saved, menu hint when not', () => {
  const android = readEnv({ win: win(UA.android) })
  assert.equal(android.ios, false)
  assert.equal(installMethod(android, true), 'prompt')
  assert.equal(installMethod(android, false), 'menu')
  assert.equal(stepsText('menu'), 'Open your browser menu, then Install app or Add to Home screen.')
})

console.log(`\n${n} install-prompt checks passed`)
