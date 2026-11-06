#!/usr/bin/env node
// Analytics consent: region detection, defaults, track() gating, GA consent commands and UTM preservation.
//   node scripts/test-consent.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import {
  isConsentRegion, languageRegion, resolveEnabled, needsChoice, consentDefaults,
  CONSENT_COUNTRIES, NON_CONSENT_ZONES, EXTRA_CONSENT_ZONES,
} from '../src/lib/consent.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }
const env = (timeZone, ...languages) => ({ timeZone, languages })

t('time zone Europe/* counts, with the clear non-EU zones left out', () => {
  for (const z of ['Europe/Berlin', 'Europe/London', 'Europe/Dublin', 'Europe/Zurich', 'Europe/Oslo', 'Atlantic/Canary', 'Atlantic/Reykjavik']) assert.equal(isConsentRegion(env(z, 'en-US')), true, z)
  for (const z of ['Europe/Moscow', 'Europe/Istanbul', 'Europe/Minsk']) assert.equal(isConsentRegion(env(z, 'en-US')), false, z)
  for (const z of ['America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', '']) assert.equal(isConsentRegion(env(z, 'en-US')), false, z)
})
t('language region counts when the time zone does not', () => {
  assert.equal(isConsentRegion(env('America/New_York', 'en-GB')), true)
  assert.equal(isConsentRegion(env('Asia/Tokyo', 'ja-JP', 'de-AT')), true)
  assert.equal(isConsentRegion(env('America/Chicago', 'fr-CH')), true)
  assert.equal(isConsentRegion(env('America/Chicago', 'en-US', 'es-MX', 'pt-BR', 'fr-CA', 'de')), false, 'a bare language has no region')
  assert.equal(isConsentRegion(env('Europe/Moscow', 'ru-RU')), false)
  assert.equal(isConsentRegion({}), false)
})
t('languageRegion reads real tags', () => {
  assert.equal(languageRegion('en-GB'), 'GB'); assert.equal(languageRegion('zh-Hant-TW'), 'TW'); assert.equal(languageRegion('de'), null); assert.equal(languageRegion('es-419'), '419')
})
t('all 27 EU states, EEA, UK and CH are listed', () => {
  assert.equal(CONSENT_COUNTRIES.length, 32)
  for (const c of ['DE', 'FR', 'GB', 'CH', 'NO', 'IS', 'LI', 'IE', 'CY', 'MT']) assert.ok(CONSENT_COUNTRIES.includes(c), c)
})
t('defaults: off in the region until a choice, on elsewhere, a saved choice wins, DNT/GPC starts off', () => {
  assert.equal(resolveEnabled({ pref: null, region: true, browserNo: false }), false)
  assert.equal(resolveEnabled({ pref: null, region: false, browserNo: false }), true)
  assert.equal(resolveEnabled({ pref: null, region: false, browserNo: true }), false)
  assert.equal(resolveEnabled({ pref: 'on', region: true, browserNo: true }), true)
  assert.equal(resolveEnabled({ pref: 'off', region: false, browserNo: false }), false)
})
t('the banner is only for the region and only until a choice is saved', () => {
  assert.equal(needsChoice({ pref: null, region: true }), true)
  assert.equal(needsChoice({ pref: 'off', region: true }), false)
  assert.equal(needsChoice({ pref: 'on', region: true }), false)
  assert.equal(needsChoice({ pref: null, region: false }), false)
})
t('Consent Mode v2 defaults: everything denied in the region; ads always denied', () => {
  assert.deepEqual(consentDefaults(true), { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  assert.equal(consentDefaults(false).analytics_storage, 'granted')
  for (const r of [true, false]) { const d = consentDefaults(r); assert.equal(d.ad_storage, 'denied'); assert.equal(d.ad_user_data, 'denied'); assert.equal(d.ad_personalization, 'denied') }
})
t('the static-page banner script carries the same lists as src/lib/consent.js', () => {
  const js = readFileSync(new URL('../public/legal/consent.js', import.meta.url), 'utf8')
  const list = name => [...new RegExp(`var ${name} = \\[(.*?)\\]`).exec(js)[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  assert.deepEqual(list('COUNTRIES'), CONSENT_COUNTRIES)
  assert.deepEqual(list('NON_ZONES'), NON_CONSENT_ZONES)
  assert.deepEqual(list('EXTRA_ZONES'), EXTRA_CONSENT_ZONES)
  assert.match(js, /var KEY = 'stt_analytics'/)
})

// --- track() and ga.js, loaded through Vite so import.meta.env and the app's own imports resolve -------------------
const store = new Map()
const rows = []
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} }
let tz = 'America/Los_Angeles'
let langs = ['en-US']
const intl = Intl.DateTimeFormat
Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: tz }) } }
Object.defineProperty(globalThis, 'navigator', { value: { get languages() { return langs }, get language() { return langs[0] }, doNotTrack: null, userAgent: 'node' }, configurable: true })
globalThis.window = Object.assign(new EventTarget(), { location: { origin: 'https://sillytraveltool.com', search: '' }, dataLayer: [], innerWidth: 400 })
globalThis.Event = globalThis.Event || class {}
globalThis.document = { createElement: () => ({}), head: { appendChild: () => {} }, addEventListener: () => {}, referrer: '', visibilityState: 'visible' }

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', mode: 'test',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"http://localhost"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"x"' } })
try {
  const ga = await vite.ssrLoadModule('/src/lib/ga.js')
  t('UTM tags survive in page_location; every other parameter is dropped', () => {
    assert.equal(ga.pageLocation('https://sillytraveltool.com', 'explore/honk', '?utm_source=tiktok&utm_medium=social&utm_campaign=goose&token=abc&email=a@b.c'),
      'https://sillytraveltool.com/explore/honk?utm_source=tiktok&utm_medium=social&utm_campaign=goose')
    assert.equal(ga.pageLocation('https://x.test', 'trips', '?code=1&access_token=2'), 'https://x.test/trips')
    assert.equal(ga.pageLocation('https://x.test', 'trips'), 'https://x.test/trips')
    assert.equal(ga.pageLocation('https://x.test', 'trips', '?UTM_term=a&utmx=b&xutm_source=c'), 'https://x.test/trips?UTM_term=a')
  })

  // The real supabase client would try the network: swap in a recorder before analytics.js loads it
  const sb = await vite.ssrLoadModule('/src/lib/supabase.js')
  sb.supabase.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } })
  sb.supabase.from = table => ({ insert: async row => { rows.push({ table, row }) } })
  const a = await vite.ssrLoadModule('/src/lib/analytics.js')
  const flush = () => new Promise(r => setTimeout(r, 20))

  tz = 'Europe/Berlin'
  store.clear()
  assert.equal(a.analyticsEnabled(), false); assert.equal(a.consentChoiceNeeded(), true); n++; console.log('ok  EU visitor, no choice: stats off and the banner is due')
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('EU visitor, no choice: track() sends nothing (no Supabase row, no GA event)', () => {
    assert.equal(rows.length, 0); assert.ok(!window.dataLayer.some(x => x[0] === 'event'))
  })
  a.screenView('explore'); await flush()
  t('EU visitor, no choice: screen views send nothing and nothing is queued for gtag', () => { assert.equal(rows.length, 0); assert.equal(window.dataLayer.length, 0); assert.equal(window.gtag, undefined) })

  a.setAnalyticsEnabled(false)
  t('Reject is remembered and the banner is done', () => { assert.equal(store.get('stt_analytics'), 'off'); assert.equal(a.consentChoiceNeeded(), false); assert.equal(a.analyticsEnabled(), false) })
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('after Reject track() still sends nothing', () => assert.equal(rows.length, 0))

  // Opt in: ga.js is dev-disabled in tests (import.meta.env.DEV), so initGA is a no-op here; the Supabase side is the proof
  a.setAnalyticsEnabled(true); await flush()
  t('Accept is remembered', () => { assert.equal(store.get('stt_analytics'), 'on'); assert.equal(a.analyticsEnabled(), true) })
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('after Accept track() sends to Supabase', () => assert.ok(rows.some(r => r.row.event === 'feature_used')))

  const before = rows.length
  a.setAnalyticsEnabled(false)
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('opting out in Settings stops track() again', () => assert.equal(rows.length, before))

  tz = 'America/Los_Angeles'; store.clear(); rows.length = 0
  t('non-EU visitor with no choice: on by default, no banner', () => { assert.equal(a.analyticsEnabled(), true); assert.equal(a.consentChoiceNeeded(), false) })
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('non-EU visitor: track() sends as today', () => assert.ok(rows.some(r => r.row.event === 'feature_used')))
  a.setAnalyticsEnabled(false); const b2 = rows.length
  await a.track('feature_used', { feature: 'honk' }); await flush()
  t('non-EU visitor: the Settings opt-out works', () => assert.equal(rows.length, b2))

  langs = ['de-DE']; store.clear()
  t('browser language alone (German, US time zone) puts a visitor in the group', () => { assert.equal(a.analyticsEnabled(), false); assert.equal(a.consentChoiceNeeded(), true) })
} finally {
  await vite.close()
  Intl.DateTimeFormat = intl
}
console.log(`\n${n} consent checks passed`)
process.exit(0) // the Supabase client keeps timers alive
