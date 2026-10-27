// Android emulator check (GitHub Actions, .github/workflows/android.yml): installs the demo APK, drives the app's
// WebView through Chrome DevTools (debug builds allow it), takes screenshots and checks the First Class paywall,
// the free-plan limit, the onboarding tour (Profile → Take the tour), Tools → Tip & split and the Explore tab.
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
sh('adb logcat -c') // so the logcat dump in the artifact covers only this run
const launch = () => sh(`adb shell am start -n ${APP}/.MainActivity`)
const appPid = () => { try { return sh(`adb shell pidof ${APP}`) } catch { return '' } }
launch()

// ── Attach to the WebView's DevTools socket (again after a crash: the socket name carries the new pid) ──
let ws, seq = 0
let pending = new Map()
async function attach() {
  let socket
  for (let i = 0; i < 60 && !socket; i++) {
    await sleep(1000)
    const pid = appPid()
    const all = sh('adb shell cat /proc/net/unix').match(/@webview_devtools_remote_\d+/g) || []
    socket = (all.find(n => pid && n.endsWith(`_${pid}`)) || all[0])?.slice(1) // this process's socket, else any
  }
  if (!socket) throw new Error('WebView DevTools socket not found')
  sh(`adb forward --remove-all`)
  sh(`adb forward tcp:9222 localabstract:${socket}`)
  let target
  for (let i = 0; i < 30 && !target; i++) {
    await sleep(1000)
    target = (await fetch('http://127.0.0.1:9222/json').then(r => r.json()).catch(() => [])).find(t => t.type === 'page')
  }
  if (!target) throw new Error('No WebView page')
  console.log(`attach: pid ${appPid()} socket ${socket} page ${target.url} "${target.title}"`)
  try { ws?.close() } catch { /* already gone */ }
  pending = new Map()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id) }
  await inject()
}
// The helpers (window.__t) live in the page; a reload or a new WebView loses them, so attach() and retries re-inject
async function inject() {
  await evaluate(`
    window.__t = {
      byText: (t, sel = 'button, a, [role=button], [role=radio]') => [...document.querySelectorAll(sel)].find(e => e.innerText?.trim().startsWith(t) || e.getAttribute('aria-label') === t),
      has: (t) => document.body.innerText.includes(t),
      set: (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) },
    }; return true`)
}
// Every call times out, so a page that stops answering fails the run instead of hanging it
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)) }, 15000)
  pending.set(id, (d) => { clearTimeout(timer); resolve(d) })
  ws.send(JSON.stringify({ id, method, params }))
})
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error')
  return r.result?.result?.value
}
// A WebView that stops answering (busy during first load on the software-rendered emulator, or restarted) gets one
// more chance: reattach to the live socket and run the expression again. A second timeout is the real failure.
let retrying = false
async function js(expression) {
  try { return await evaluate(expression) } catch (e) {
    if (retrying || !/DevTools timeout/.test(e.message)) throw e
    retrying = true
    try {
      console.log(`${e.message}: reattaching once`)
      await attach()
      return await evaluate(expression)
    } finally { retrying = false }
  }
}
const logcat = (name) => { try { writeFileSync(`${OUT}/logcat-${name}.txt`, sh('adb logcat -d -t 3000')) } catch { /* no logcat */ } }
await attach()

const shot = async (name) => { await sleep(700); execSync(`adb exec-out screencap -p > ${OUT}/${name}.png`) }

// Page helpers: find by visible text, click, wait, set React inputs (window.__t comes from inject(), run by attach() and after each reload)
async function waitText(t, ms = 15000) {
  for (let i = 0; i < ms / 250; i++) { if (await js(`return __t.has(${JSON.stringify(t)})`)) return true; await sleep(250) }
  return false
}
const click = (t, sel) => js(`const e = __t.byText(${JSON.stringify(t)}${sel ? `, ${JSON.stringify(sel)}` : ''}); if (!e) return false; e.click(); return true`)
const tab = (name) => js(`const a = document.querySelector('a[href="#${name}"]'); a?.click(); return !!a`)
// Close every open sheet, topmost first (the trip-limit paywall sits over the new-trip form: closing only the
// first Close button in DOM order leaves the paywall up, hiding the screens checked after it)
const closeSheets = () => js(`const b = [...document.querySelectorAll('.c-sheet [aria-label="Close"]')]; b.reverse().forEach(e => e.click()); return b.length`)
const sheetsOpen = () => js(`return document.querySelectorAll('.c-sheet').length`)
const ERROR_SCREEN = 'Goose lost the plot' // the ErrorState title (src/ui/States.jsx): an uncaught render error
// One failing section (an exception, not a failed check) must not hide the sections after it
async function section(name, fn) {
  try { await fn() } catch (e) { check(`${name} section ran`, false, e.message); await shot(`99-${name}-error`).catch(() => {}) }
  if (appPid()) return
  // The app process is gone (a WebView renderer crash kills the app): record it, keep the log, start again
  check(`app still running after ${name}`, false, 'process died; see logcat-' + name + '.txt')
  logcat(name)
  launch()
  await attach().catch((e) => check(`app relaunches after ${name}`, false, e.message))
  await waitText('Trips', 30000)
}

try {
  // ── 1. App opens (demo member) ──
  check('app loads', await waitText('Trips', 30000))
  await shot('01-trips')

  // ── 2. Settings → Plan → paywall. The apps never show a web price: only the store's, once it answers ──
  const noDollars = () => js(`return !/\\$\\s?\\d/.test(document.body.innerText)`)
  const openPaywall = async (store) => {
    // Demo stand-in for the store (src/lib/purchases.js): none = sends no prices, prices = sends local prices
    await js(`setTimeout(() => location.replace('/?store=${store}'), 100); return true`)
    await sleep(3000); await inject(); await waitText('Trips', 30000)
    await tab('profile'); await sleep(800)
    await click('Settings'); await waitText('Get First Class')
    await click('Get First Class')
    await waitText('Unlimited reservations'); await sleep(800) // sheet slide-in
  }
  await tab('profile'); await sleep(800)
  await click('Settings')
  check('app build without a store key shows the plan, no way to buy', await waitText('Current plan') && !(await js(`return __t.has('Get First Class')`)))
  check('no dollar prices without a store key', await noDollars())
  await shot('02-settings')
  await openPaywall('none')
  check('paywall opens from Settings', await js(`return __t.has('Unlimited reservations')`))
  check('Buy waits for store prices', await js(`return __t.byText('Subscribe')?.disabled === true`))
  check('store sends no prices: says so, offers a retry', await waitText('Prices are loading') && await js(`return !!__t.byText('Try again')`))
  check('no dollar prices while the store has none', await noDollars())
  check('paywall never mentions web checkout in the app', !(await js(`return /secure payment|sillytraveltool\\.com\\/upgrade/i.test(document.querySelector('.c-sheet').innerText)`)))
  await shot('03-paywall')
  await openPaywall('prices')
  check('store prices shown', await waitText('€13,99 / year') && await noDollars())
  check('Google Play renewal terms', await js(`return __t.has('Google Play') && __t.has('renews automatically')`))
  await js(`document.querySelector('.paywall__plans')?.scrollIntoView({ block: 'start' }); return true`)
  await click('Founders Flock', '[role=radio]')
  await sleep(500)
  check('founders plan selectable', await js(`return __t.byText('Founders Flock', '[role=radio]')?.getAttribute('aria-checked') === 'true'`))
  check('Buy shows the store price', await js(`return !!__t.byText('Buy for €27,99') && !__t.byText('Buy for €27,99').disabled`))
  await shot('04-paywall-plans')
  await closeSheets(); await sleep(600)

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
  await closeSheets(); await sleep(800)
  check('paywall and new-trip form close', (await sheetsOpen()) === 0)

  // ── 4. Onboarding tour, replayed from Profile (the demo APK has no ?onboarding: App.jsx honours it in DEV only) ──
  await section('tour', async () => {
    await tab('profile'); await sleep(800)
    check('profile offers Take the tour', await waitText('Take the tour'))
    await click('Take the tour')
    check('tour opens on its first slide', await waitText('Your whole trip, in one calm place'))
    await shot('06-tour')
    await click('Close')
    check('tour closes back to Profile', await waitText('Take the tour'))
  })

  // ── 5. Explore tab loads ──
  await section('explore', async () => {
    await tab('explore'); await sleep(800)
    let header = false
    for (let i = 0; i < 60 && !header; i++) { header = await js(`return !!document.getElementById('explore-title')`); if (!header) await sleep(250) }
    check('explore loads', header)
    await sleep(2000) // guide sections fetch (demo fixtures) and render
    check('explore shows no error screen', !(await js(`return __t.has(${JSON.stringify(ERROR_SCREEN)}) || __t.has('Guide unavailable')`)))
    await shot('07-explore')
  })

  // ── 6. Tools → Tip & split renders. Last: the error screen (B4 crashed this tool) replaces the whole app, nav included ──
  await section('tip', async () => {
    await tab('tools'); await sleep(800)
    check('tools hub shows Tip & split', await waitText('Tip & split'))
    await click('Tip & split')
    // The "Bill" label is an overline (CSS uppercase), so innerText says "BILL": look for the input itself
    let bill = false
    for (let i = 0; i < 40 && !bill; i++) { bill = await js(`return !!document.getElementById('tip-bill')`); if (!bill) await sleep(250) }
    check('tip tool renders its Bill field', bill)
    check('tip tool shows no error screen', !(await js(`return __t.has(${JSON.stringify(ERROR_SCREEN)})`)))
    await shot('08-tip-split')
  })

  // ── 7. Shared-traveller card: the flagship trip's BCN → BER flight, three travellers, one card. Last: it reloads ──
  await section('shared-leg', async () => {
    await js(`location.href = location.origin + '/?flagship=10'; return true`).catch(() => {}) // page helpers gone after this
    let card = false
    for (let i = 0; i < 60 && !card; i++) {
      await sleep(500)
      // The reload reopens the last tab (Tools): go to Trips, then into the plan
      card = await js(`document.querySelector('a[href="#trips"]:not([aria-current])')?.click()
        ;(document.querySelector('.today-plan') || [...document.querySelectorAll('button')].find(e => e.innerText?.trim().startsWith('Full trip plan')))?.click()
        const c = document.querySelector('.shared-leg'); c?.scrollIntoView({ block: 'center' }); return !!c`).catch(() => false)
    }
    check('shared flight is one card with three travellers', card && await js(`return document.querySelectorAll('.shared-leg__line').length === 3`))
    await shot('09-shared-leg')
  })
} catch (e) {
  check('script ran', false, e.message)
  await shot('99-error').catch(() => {})
} finally {
  logcat('end')
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  ws?.close()
}
process.exit(results.every(r => r.ok) ? 0 : 1)
