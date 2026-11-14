#!/usr/bin/env node
// Add to Home Screen rules (src/lib/installPrompt.js) and store link resolution (src/lib/appLinks.js).
//   node scripts/test-install-prompt.mjs
import assert from 'node:assert/strict'
import { recordVisit, isDue, markShown, markDone, guideKind, eligible, KEY } from '../src/lib/installPrompt.js'
import { resolveStoreLinks, APP_STORE_URL, ANDROID_GROUP_URL } from '../src/lib/appLinks.js'

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

// Visits: one per browser session, a reload in the same session does not count
const local = mem()
let session = mem()
assert.equal(recordVisit(local, session), 1)
assert.equal(recordVisit(local, session), 1, 'reload in the same session')
assert.equal(isDue(local, 1), false, 'first visit never prompts')
session = mem()
assert.equal(recordVisit(local, session), 2)
assert.equal(isDue(local, 2), true, '2nd visit prompts')
markShown(local, 2)
assert.equal(isDue(local, 2), false, 'once per visit: not again after shown (reload, dismiss)')
session = mem()
assert.equal(recordVisit(local, session), 3)
assert.equal(isDue(local, 3), true, '3rd visit prompts')
markShown(local, 3)
assert.equal(isDue(local, 3), false)
for (let v = 4; v < 8; v++) { session = mem(); assert.equal(recordVisit(local, session), v); assert.equal(isDue(local, v), false, `visit ${v} never prompts`) }

// Installing from the sheet ends it
const l2 = mem()
recordVisit(l2, mem()); recordVisit(l2, mem())
markDone(l2)
assert.equal(isDue(l2, 2), false, 'installed: never again')

// Dismissed the old install toast: treated as done
const old = mem(); recordVisit(old, mem()); recordVisit(old, mem()); old.setItem('install_banner_dismissed', '1')
assert.equal(isDue(old, 2), false, 'old toast dismissed: no sheet')

// Blocked or corrupt storage: no visit counted, never due, no throw
assert.equal(recordVisit(broken, mem()), 0)
assert.equal(isDue(broken, 2), false)
markShown(broken, 2); markDone(broken)
const bad = mem(); bad.setItem(KEY, '{nope')
assert.equal(recordVisit(bad, mem()), 1, 'corrupt state restarts the count')

// Platform guide: Safari on iPhone/iPad only; Chrome on iOS and everything else get no manual guide
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
assert.equal(guideKind({ ua: SAFARI }), 'ios')
assert.equal(guideKind({ ua: IPADOS, maxTouchPoints: 5 }), 'ios')
assert.equal(guideKind({ ua: IPADOS, maxTouchPoints: 0 }), '', 'desktop Safari')
assert.equal(guideKind({ ua: IOS_CHROME }), '')
assert.equal(guideKind({ ua: ANDROID }), '')

// Never in the native app or an installed app
assert.equal(eligible({ native: true, standalone: false }), false)
assert.equal(eligible({ native: false, standalone: true }), false)
assert.equal(eligible({ native: false, standalone: false }), true)

// Store links: App Store off by default, Android only once android_url is shown, group falls back
assert.deepEqual(resolveStoreLinks(null), { ios: null, iosSoon: '/beta/', android: null })
assert.deepEqual(resolveStoreLinks({ web_url: 'https://sillytraveltool.com/', android_url: null, show_ios_store: false }), { ios: null, iosSoon: '/beta/', android: null })
assert.equal(resolveStoreLinks({ show_ios_store: true }).ios, APP_STORE_URL)
assert.equal(resolveStoreLinks({ show_ios_store: true }).iosSoon, null, 'App Store on: no waitlist row')
assert.equal(resolveStoreLinks({}).ios, null, 'App Store off by default: no App Store link')
assert.equal(APP_STORE_URL, 'https://apps.apple.com/app/id6826753531')
const P = 'https://play.google.com/apps/testing/com.sillytraveltool.app'
assert.deepEqual(resolveStoreLinks({ android_url: P }).android, { group: ANDROID_GROUP_URL, install: P })
assert.equal(resolveStoreLinks({ android_url: P, android_group_url: 'https://groups.google.com/g/x' }).android.group, 'https://groups.google.com/g/x')
assert.equal(resolveStoreLinks({ android_url: 'http://insecure.example' }).android, null, 'https only')
assert.equal(resolveStoreLinks({ android_url: P, android_group_url: 'javascript:alert(1)' }).android.group, ANDROID_GROUP_URL)

console.log('install prompt + store links: all checks passed')
