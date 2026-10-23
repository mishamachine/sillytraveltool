// Android emulator check (GitHub Actions, .github/workflows/android.yml): installs the demo APK, drives the app's
// WebView through Chrome DevTools (debug builds allow it), takes screenshots and checks the First Class paywall.
// Needs a booted emulator (adb) and an APK built with VITE_DEMO=1 VITE_DEMO_PARAMS=limits=1.
// Usage: node scripts/android-emu-shots.mjs [apk]   →   shots/*.png + shots/results.json; exits 1 when a check fails.
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const APK = process.argv[2] || 'android/app/build/outputs/apk/debug/app-debug.apk'
const APP = 'com.sillytraveltool.app'
const OUT = process.env.OUT || 'shots'
mkdirSync(OUT, { recursive: true })
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// ── Install and launch ──
sh(`adb install -r ${APK}`)
sh(`adb shell am start -n ${APP}/.MainActivity`)

// ── Attach to the WebView's DevTools socket ──
let socket
for (let i = 0; i < 60 && !socket; i++) {
  await sleep(1000)
  socket = (sh('adb shell cat /proc/net/unix').match(/@(webview_devtools_remote_\d+)/) || [])[1]
}
if (!socket) throw new Error('WebView DevTools socket not found')
sh(`adb forward tcp:9222 localabstract:${socket}`)
let target
for (let i = 0; i < 30 && !target; i++) {
  await sleep(1000)
  target = (await fetch('http://127.0.0.1:9222/json').then(r => r.json()).catch(() => [])).find(t => t.type === 'page')
}
if (!target) throw new Error('No WebView page')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id) }
// Every call times out, so a page that stops answering fails the run instead of hanging it
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)) }, 15000)
  pending.set(id, (d) => { clearTimeout(timer); resolve(d) })
  ws.send(JSON.stringify({ id, method, params }))
})
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error')
  return r.result?.result?.value
}
const shot = async (name) => { await sleep(700); execSync(`adb exec-out screencap -p > ${OUT}/${name}.png`) }

// Page helpers: find by visible text, click, wait, set React inputs
await js(`
  window.__t = {
    byText: (t, sel = 'button, a, [role=button], [role=radio]') => [...document.querySelectorAll(sel)].find(e => e.innerText?.trim().startsWith(t) || e.getAttribute('aria-label') === t),
    has: (t) => document.body.innerText.includes(t),
    set: (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) },
  }; return true`)
async function waitText(t, ms = 15000) {
  for (let i = 0; i < ms / 250; i++) { if (await js(`return __t.has(${JSON.stringify(t)})`)) return true; await sleep(250) }
  return false
}
const click = (t, sel) => js(`const e = __t.byText(${JSON.stringify(t)}${sel ? `, ${JSON.stringify(sel)}` : ''}); if (!e) return false; e.click(); return true`)
const tab = (name) => js(`const a = document.querySelector('a[href="#${name}"]'); a?.click(); return !!a`)

try {
  // ── 1. App opens (demo member) ──
  check('app loads', await waitText('Trips', 30000))
  await shot('01-trips')

  // ── 2. Settings → Plan → paywall ──
  await tab('profile'); await sleep(800)
  await click('Settings')
  check('settings shows Get First Class', await waitText('Get First Class'))
  await shot('02-settings')
  await click('Get First Class')
  check('paywall opens from Settings', await waitText('Unlimited reservations'))
  await sleep(800) // sheet slide-in
  check('app build without a store key says coming soon', await waitText('First Class in the app is coming soon'))
  check('paywall never mentions web checkout in the app', !(await js(`return /secure payment|sillytraveltool\\.com\\/upgrade/i.test(document.querySelector('.c-sheet').innerText)`)))
  await shot('03-paywall')
  await js(`document.querySelector('.paywall__plans')?.scrollIntoView({ block: 'start' }); return true`)
  await click('Founders offer', '[role=radio]')
  await sleep(500)
  check('founders plan selectable', await js(`return __t.byText('Founders offer', '[role=radio]')?.getAttribute('aria-checked') === 'true'`))
  await shot('04-paywall-plans')
  await js(`document.querySelector('.c-sheet [aria-label="Close"]')?.click(); return true`)
  await sleep(600)

  // ── 3. Free-plan limit: a new trip opens the paywall ──
  await tab('trips'); await sleep(800)
  await click('All trips'); await sleep(600)
  await click('New trip')
  check('new trip form opens', await waitText('Who’s going') || await waitText("Who's going"))
  await js(`__t.set(document.querySelector('[role=dialog] input[role=combobox], [role=dialog] input'), 'Paris'); return true`)
  let picked = false
  for (let i = 0; i < 40 && !picked; i++) { await sleep(250); picked = await js(`const o = [...document.querySelectorAll('[role=option] button')].find(e => /Paris/.test(e.innerText || '')); if (!o) return false; o.click(); return true`) }
  await js(`const [d, r] = document.querySelectorAll('[role=dialog] input[type=date]'); __t.set(d, '2026-12-01'); __t.set(r, '2026-12-05'); return true`)
  await click('Add trip')
  check('trip limit opens the paywall', await waitText('You have 2 upcoming trips'), picked ? '' : '(city suggestion not picked)')
  await shot('05-trip-limit')
} catch (e) {
  check('script ran', false, e.message)
  await shot('99-error').catch(() => {})
} finally {
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  ws.close()
}
process.exit(results.every(r => r.ok) ? 0 : 1)
