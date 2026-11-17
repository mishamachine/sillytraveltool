#!/usr/bin/env node
// Silly Travel Tool ads v2: light-hearted, energetic vertical cuts (1080x1920, 30 fps, H.264) from the real app footage.
//
//   node build.mjs a|b|c|all [--footage DIR] [--out DIR] [--keep]
//   node build.mjs --variant persona:ana|marcus|linda|dev|all      (fictional-traveller voice-over ads)
//
// Captions, phone frame and end card are rendered with headless Chrome (real Space Grotesk / DM Sans, Clay
// tokens). Pop-in animation (quick scale-up plus a tilt) is rendered as short PNG sequences, so ffmpeg only has
// to composite: screen clips -> snap transitions (0.15 s xfade slides/zoom) -> rounded mask -> phone frame ->
// caption pops -> "In the trip" ding badge -> bouncing end card. Audio is a 120 bpm rhythm bed synthesised by
// ffmpeg (sine + noise bursts, no samples, no licensing) plus a ding and a thud; persona ads add a `say`
// voice-over with the bed ducked under it. Scene cuts sit on the beat (0.5 s grid).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const VARIANT = flag('variant', '')
const which = args.find((a) => !a.startsWith('--') && ['a', 'b', 'c', 'all'].includes(a)) || 'all'
const OUT = resolve(flag('out', HERE))
const KEEP = args.includes('--keep')
const LOGO = join(HERE, '../../docs/brand/logos/tag-mark.svg')

// Footage: --footage, $ADS_FOOTAGE, ../app-footage, or the main checkout's video/app-footage (worktrees).
function footageDir() {
  const c = [flag('footage', ''), process.env.ADS_FOOTAGE, join(HERE, '../app-footage')]
  const r = spawnSync('git', ['-C', HERE, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
  if (r.status === 0) c.push(join(dirname(r.stdout.trim()), 'video/app-footage'))
  const d = c.filter(Boolean).map((p) => resolve(p)).find((p) => existsSync(p))
  if (!d) throw new Error('No footage folder; pass --footage DIR')
  return d
}
const FOOTAGE = footageDir()

// Clay tokens (docs/brand/brand-tokens.json)
const C = { page: '#F4EEE6', card: '#FFFDF9', ink: '#2A2520', accent: '#B24A17', accentSoft: '#F6E9DF', muted: '#6B6355' }

// Frame geometry. Text lives in y 288..1632 (middle 70%); the phone may run lower, it carries no text we need.
const W = 1080, H = 1920, FPS = 30, XF = 0.15, BEAT = 0.5 // 120 bpm
const SCR = { w: 600, h: 1300, x: 240, y: 530, r: 58, bezel: 16 }
const CAP = { top: 300, boxH: 200, clipY: 200, clipH: 400 }
const BADGE = { clipY: 1440, clipH: 240 }
const POP = 9 // pop-in frames (0.3 s)
const POP_S = POP / FPS
const SNAPS = ['slideleft', 'slideright', 'zoomin', 'slideup']
const END_ANIM = 1.3 // seconds of bounce-in on the end card
const NAME = 'Silly Travel Tool'
const DISCLOSURE_PROOF = `Real app footage. ${NAME} is in beta.`
const DISCLOSURE_PERSONA = `Fictional traveller. ${NAME} is in beta.`

// ---------- scripts ----------
// Product-proof scenes: clip stem, source start `ss`, playback `speed`, shown `dur` (s, multiple of 0.5 so cuts
// land on the beat), caption ([x] = terracotta pill word). `ding` = seconds into the scene when the "In the trip"
// badge and ding fire. The last scene of each ad carries its one playful Goose line.
const VARIANTS = {
  a: { name: 'forward-it-done', scenes: [
    { clip: '01-inbox-first-run', ss: 0.8, speed: 1, dur: 2.5, cap: 'Still [screenshotting] your bookings?' },
    { clip: '02-forward-lands-in-trip', ss: 0.5, speed: 1.5, dur: 3, cap: 'Forward the email. [Goose] files it.', ding: 0.4 },
    { clip: '04-multicity-plan', ss: 0.5, speed: 1.4, dur: 2.5, cap: 'One trip. Every city. [Local] time.' },
    { clip: '05-today', ss: 0.3, speed: 1, dur: 2.5, cap: 'What’s [next]? Right there.' },
    { clip: '07-shared-trip-card', ss: 2.6, speed: 1, dur: 2.5, cap: 'Everyone on the flight. One [card].' },
    { clip: '08-guide-honk', ss: 5.6, speed: 1, dur: 3, cap: 'Goose does the admin. You do the [tapas].' },
  ] },
  b: { name: 'tools-that-switch', scenes: [
    { clip: '09-tools-switch', ss: 0, speed: 0.5, dur: 2.5, cap: 'Tools that switch by [country].' },
    { clip: '09-tools-switch', ss: 1.1, speed: 0.7, dur: 2.5, cap: 'The right [currency]. Already set.' },
    { clip: '09-tools-switch', ss: 2.7, speed: 0.7, dur: 2.5, cap: 'Local [phrases], ready to show.' },
    { clip: '09-tools-switch', ss: 6.4, speed: 0.7, dur: 2.5, cap: '[SOS] with local numbers.' },
    { clip: '04-multicity-plan', ss: 4.5, speed: 1, dur: 3, cap: 'Goose [switches]. You just land.' },
  ] },
  c: { name: 'travel-together', scenes: [
    { clip: '07-shared-trip-card', ss: 0, speed: 1, dur: 2.5, cap: 'One trip, [shared] with Maria and Tom.' },
    { clip: '07-shared-trip-card', ss: 4, speed: 1, dur: 3, cap: 'One card for [everyone] on the flight.' },
    { clip: '05-today', ss: 0.3, speed: 1, dur: 2.5, cap: '[Today], with Maria and Tom.' },
    { clip: '07-shared-trip-card', ss: 5, speed: 1, dur: 3, cap: 'Zero “what’s your [seat]?” texts.' },
  ] },
}

// Fictional-traveller voice-over ads. Card (1.5 s) -> voice-over (one scene and one caption per spoken line;
// cuts land on the beat, speech starts 0.25 s after the cut) -> result line (2 s) -> end card.
// `say` is the spoken text (under 45 words per ad), the last line of each ad is the one playful line.
// Voices: macOS `say` (offline). Each line is synthesised on its own so scenes follow the speech.
const CARD = 1.5, RESULT = 2, END_P = 2.8, END_PRODUCT = 2.8, LEAD = 0.25, GAP_MAX = 0.5
const PERSONAS = {
  ana: { name: 'Ana', who: 'Family organiser, five travellers', voice: 'Samantha', rate: 190,
    result: 'One trip. Every [seat].', file: 'ana-shared-trip', lines: [
      { say: 'Five people, five inboxes. Total chaos.', clip: '02-forward-lands-in-trip', ss: 3, speed: 1.2, cap: 'Five people, five [inboxes].' },
      { say: 'Now everyone just forwards theirs to Goose.', clip: '02-forward-lands-in-trip', ss: 0.5, speed: 1, cap: 'Everyone forwards to [Goose].', ding: 0.5 },
      { say: 'One trip. One card for each shared flight.', clip: '07-shared-trip-card', ss: 2.8, speed: 1, cap: 'One card per shared [flight].' },
      { say: 'Every seat on it. Done.', clip: '07-shared-trip-card', ss: 5, speed: 1, cap: 'Every [seat], right there.' },
      { say: 'I’ve retired as the group’s search engine.', clip: '07-shared-trip-card', ss: 6.2, speed: 1, cap: 'Search engine: [retired].' },
    ] },
  marcus: { name: 'Marcus', who: 'Business traveller, early flights', voice: 'Daniel', rate: 190,
    result: 'Landed. Already [moving].', file: 'marcus-today-get-there', lines: [
      { say: 'Landing at six a.m. Where now?', clip: '05-today', ss: 0, speed: 0.9, cap: 'Landing at 6 am. Where [next]?' },
      { say: 'Today opens on what’s next, in local time.', clip: '05-today', ss: 0.6, speed: 0.8, cap: 'Today opens in [local] time.' },
      { say: 'One tap on Get there, and I’m moving.', clip: '06-get-there', ss: 3.5, speed: 1, cap: 'One tap: [Get there].' },
      { say: 'No digging through email. I just go.', clip: '06-get-there', ss: 5.5, speed: 0.8, cap: 'No digging through [email].' },
      { say: 'Goose is up, so I don’t have to be.', clip: '05-today', ss: 3, speed: 1, cap: 'Goose is [up]. Yawn freely.' },
    ] },
  linda: { name: 'Linda', who: 'Three countries, one long trip', voice: 'Moira', rate: 185,
    result: 'Cross the border. Skip the [googling].', file: 'linda-tools-switch', lines: [
      { say: 'New country, new currency, new SOS number.', clip: '04-multicity-plan', ss: 0.5, speed: 1, cap: 'New country, new [currency].' },
      { say: 'I used to google all of it.', clip: '04-multicity-plan', ss: 5, speed: 1, cap: 'No more [googling].' },
      { say: 'Now my tools switch when the country does.', clip: '09-tools-switch', ss: 0, speed: 0.6, cap: 'Tools that [switch] by country.' },
      { say: 'Right currency, local phrases, SOS.', clip: '09-tools-switch', ss: 1.5, speed: 0.7, cap: 'Currency, [phrases], SOS.' },
      { say: 'Border crossed. Goose didn’t blink.', clip: '09-tools-switch', ss: 6.4, speed: 0.6, cap: 'Goose didn’t even [blink].' },
    ] },
  dev: { name: 'Dev', who: 'Solo backpacker, hostel to hostel', voice: 'Rishi', rate: 185,
    result: 'One trip. Nothing to [hunt] for.', file: 'dev-forward-email', lines: [
      { say: 'Screenshots everywhere. Hostels in my email.', clip: '01-inbox-first-run', ss: 0.8, speed: 1, cap: '[Screenshots] everywhere.' },
      { say: 'Now I just forward the confirmation to Goose.', clip: '01-inbox-first-run', ss: 2, speed: 1, cap: 'Forward the [confirmation].' },
      { say: 'It lands in the right trip, in local time.', clip: '02-forward-lands-in-trip', ss: 3.5, speed: 1.3, cap: 'Right trip. [Local] time.', ding: 0.6 },
      { say: 'Got a PDF? Paste it or upload it.', clip: '03-import-sheet', ss: 3, speed: 1, cap: 'Paste it or [upload] it.' },
      { say: 'My camera roll can go back to sunsets.', clip: '02-forward-lands-in-trip', ss: 5.5, speed: 1, cap: 'Camera roll: [sunsets] only.' },
    ] },
}

// ---------- tools ----------
async function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  const { createRequire } = await import('node:module')
  return createRequire(join(HERE, 'x.js'))('ffmpeg-static')
}
function chromePath() {
  const cands = [
    process.env.CHROME,
    ...['chromium-1248/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
      .map((p) => join(homedir(), 'Library/Caches/ms-playwright', p)),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  const p = cands.find((c) => existsSync(c))
  if (!p) throw new Error('No Chrome found; set CHROME=/path/to/chrome')
  return p
}
const FONT_URLS = {
  'SpaceGrotesk.ttf': 'https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf',
  'DMSans.ttf': 'https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf',
}
async function ensureFonts() {
  const dir = join(HERE, 'fonts'); mkdirSync(dir, { recursive: true })
  for (const [f, u] of Object.entries(FONT_URLS)) {
    if (existsSync(join(dir, f))) continue
    console.log('fetching font', f)
    const r = await fetch(u); if (!r.ok) throw new Error(`font download failed: ${u}`)
    writeFileSync(join(dir, f), Buffer.from(await r.arrayBuffer()))
  }
  return dir
}
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a.map(String), { encoding: 'utf8', maxBuffer: 1 << 26, ...o }); if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`); return r }

// ---------- assets (HTML -> PNG) ----------
const css = (fontDir) => `
@font-face{font-family:'Space Grotesk';font-weight:300 700;src:url('${pathToFileURL(join(fontDir, 'SpaceGrotesk.ttf'))}')}
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url('${pathToFileURL(join(fontDir, 'DMSans.ttf'))}')}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:'DM Sans',sans-serif;color:${C.ink};position:relative}
.pop{transform-origin:50% 50%;opacity:0;will-change:transform}`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
// [word] -> terracotta pill highlight
const capHtml = (t) => esc(t).replace(/\[(.+?)\]([.,!?”’]*)/g, `<span style="white-space:nowrap"><span class="hl">$1</span>$2</span>`)
const HL = `.hl{display:inline-block;background:${C.accent};color:${C.card};border-radius:26px;padding:0 20px 4px;margin:0 2px;transform:rotate(-2deg)}`

// Animation driver injected into every animated page: `.pop` pops (scale-up with overshoot plus a tilt that
// settles), `.drop` bounces in from above. data-d = delay (s), data-tilt = final tilt (deg), data-kick = start tilt.
const DRIVER = `<script>
const eob=(p)=>{const c1=1.9,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2)};
const bounce=(x)=>{const n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d)return n*(x-=1.5/d)*x+.75;if(x<2.5/d)return n*(x-=2.25/d)*x+.9375;return n*(x-=2.625/d)*x+.984375};
window.R=(t)=>{
  document.querySelectorAll('.pop').forEach((e)=>{const d=+e.dataset.d||0,dur=+e.dataset.dur||0.3,tf=+e.dataset.tilt||0,k=e.dataset.kick===undefined?9:+e.dataset.kick;
    const p=Math.min(1,Math.max(0,(t-d)/dur)); if(p<=0){e.style.opacity=0;return}
    const b=eob(p); e.style.opacity=1; e.style.transform='scale('+(0.3+0.7*b)+') rotate('+(tf+k*(1-b)*(tf>=0?-1:1))+'deg)'});
  document.querySelectorAll('.drop').forEach((e)=>{const d=+e.dataset.d||0,dur=+e.dataset.dur||0.85,p=Math.min(1,Math.max(0,(t-d)/dur));
    e.style.transform='translateY('+(-900*(1-bounce(p)))+'px) rotate('+(10*(1-p)*Math.cos(p*9))+'deg)'});
};
</script>`

const pageBg = (fd) => `<style>${css(fd)}body{background:${C.page}}
.shadow{position:absolute;left:${SCR.x - SCR.bezel}px;top:${SCR.y - SCR.bezel}px;width:${SCR.w + 2 * SCR.bezel}px;height:${SCR.h + 2 * SCR.bezel}px;border-radius:${SCR.r + SCR.bezel}px;background:${C.ink};box-shadow:0 34px 70px rgba(120,80,50,.30),0 10px 24px rgba(120,80,50,.16)}
.glass{position:absolute;left:${SCR.x - 3}px;top:${SCR.y - 3}px;width:${SCR.w + 6}px;height:${SCR.h + 6}px;border-radius:${SCR.r + 3}px;background:#000}</style>
<div class="shadow"></div><div class="glass"></div>`

const pageMask = `<style>html,body{margin:0;background:#000}div{width:${SCR.w}px;height:${SCR.h}px;border-radius:${SCR.r}px;background:#fff}</style><div></div>`

const pageCap = (fd, t, tilt) => `<style>${css(fd)}body{background:transparent}${HL}
.box{position:absolute;left:0;right:0;top:${CAP.top}px;height:${CAP.boxH}px;display:flex;align-items:center;justify-content:center}
.pill{max-width:960px;background:${C.card};border-radius:56px;padding:28px 46px 34px;text-align:center;font-family:'Space Grotesk';font-weight:700;font-size:62px;line-height:1.2;text-wrap:balance;letter-spacing:-.02em;box-shadow:0 10px 26px rgba(120,80,50,.18),inset 0 -4px 0 rgba(120,80,50,.06)}</style>
<div class="box"><div class="pill pop" data-tilt="${tilt}">${capHtml(t)}</div></div>${DRIVER}`

// "In the trip" badge: terracotta pill with a check, pops where a forwarded booking lands.
const pageBadge = (fd) => `<style>${css(fd)}body{background:transparent}
.box{position:absolute;left:0;right:0;top:${BADGE.clipY}px;height:${BADGE.clipH}px;display:flex;align-items:center;justify-content:center}
.b{display:flex;align-items:center;gap:20px;background:${C.accent};color:${C.card};border-radius:999px;padding:20px 44px 20px 26px;font-family:'Space Grotesk';font-weight:700;font-size:56px;letter-spacing:-.01em;box-shadow:0 14px 30px rgba(120,80,50,.35)}
.ck{width:70px;height:70px;border-radius:50%;background:${C.card};display:flex;align-items:center;justify-content:center}</style>
<div class="box"><div class="b pop" data-tilt="2" data-kick="-12"><div class="ck"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="${C.accent}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>In the trip</div></div>${DRIVER}`

const pageEnd = (fd, svg, disc) => `<style>${css(fd)}body{background:${C.page}}
.c{position:absolute;left:0;right:0;top:380px;display:flex;flex-direction:column;align-items:center}
.logo{width:300px;height:400px;filter:drop-shadow(0 16px 24px rgba(120,80,50,.25))}
h1{font-family:'Space Grotesk';font-weight:700;font-size:96px;letter-spacing:-.03em;line-height:1;margin-top:56px}
.url{font-weight:600;font-size:46px;color:${C.accent};margin-top:26px;letter-spacing:-.005em}
.beta{margin-top:44px;background:${C.accentSoft};color:${C.accent};border-radius:999px;padding:12px 34px;font-weight:700;font-size:34px;letter-spacing:.06em;text-transform:uppercase}
.disc{margin-top:48px;max-width:760px;text-align:center;font-weight:500;font-size:36px;line-height:1.3;color:${C.muted};text-wrap:balance}</style>
<div class="c"><div class="logo drop" data-d="0">${svg}</div><h1 class="pop" data-d="0.4" data-tilt="-1.5">${NAME}</h1><div class="url pop" data-d="0.55" data-tilt="1">sillytraveltool.com</div><div class="beta pop" data-d="0.7" data-tilt="-2">Beta</div><div class="disc pop" data-d="0.85">${esc(disc)}</div></div>${DRIVER}`

// persona card (0-1.5 s) and result line
const personaStyle = (fd) => `<style>${css(fd)}body{background:${C.page}}${HL}
.c{position:absolute;left:0;right:0;top:440px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 90px}
.av{width:240px;height:240px;border-radius:50%;background:${C.accentSoft};color:${C.accent};display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:130px;box-shadow:0 14px 30px rgba(120,80,50,.16)}
h1{font-family:'Space Grotesk';font-weight:700;font-size:150px;letter-spacing:-.035em;line-height:1;margin-top:52px}
.who{font-weight:500;font-size:50px;line-height:1.25;color:${C.muted};margin-top:26px;text-wrap:balance}
.tag{margin-top:56px;background:${C.card};color:${C.ink};border-radius:999px;padding:14px 38px;font-weight:700;font-size:34px;letter-spacing:.04em;box-shadow:0 6px 16px rgba(120,80,50,.14)}
h2{font-family:'Space Grotesk';font-weight:700;font-size:104px;letter-spacing:-.03em;line-height:1.2;margin-top:56px;text-wrap:balance}
.tagsm{margin-top:56px;font-weight:600;font-size:34px;color:${C.muted}}</style>${DRIVER}`
const pagePersona = (fd, p) => `${personaStyle(fd)}<div class="c"><div class="av pop" data-d="0" data-tilt="-4">${esc(p.name[0])}</div><h1 class="pop" data-d="0.12" data-tilt="1.5">${esc(p.name)}</h1><div class="who pop" data-d="0.24">${esc(p.who)}</div><div class="tag pop" data-d="0.36" data-tilt="-2">Fictional traveller</div></div>`
const pageResult = (fd, p) => `${personaStyle(fd)}<div class="c" style="top:560px"><div class="av pop" data-d="0" data-tilt="3" style="width:150px;height:150px;font-size:80px">${esc(p.name[0])}</div><h2 class="pop" data-d="0.1" data-tilt="-1.5">${capHtml(p.result)}</h2><div class="tagsm pop" data-d="0.3">${esc(p.name)} · Fictional traveller</div></div>`

let browserP
async function openBrowser() {
  if (!browserP) {
    const { default: puppeteer } = await import(pathToFileURL(join(HERE, 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).href)
    browserP = puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--allow-file-access-from-files'] })
  }
  return browserP
}
async function renderAssets(dir, scenes, extra) {
  const fd = await ensureFonts()
  const browser = await openBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
  const load = async (html, file) => {
    const f = join(dir, `${file}.html`); writeFileSync(f, `<!doctype html><meta charset=utf-8>${html}`)
    await page.goto(pathToFileURL(f).href); await page.evaluate(() => document.fonts.ready)
  }
  const shot = async (html, file, opts = {}) => {
    await load(html, file)
    await page.screenshot({ path: join(dir, `${file}.png`), omitBackground: !!opts.transparent, ...(opts.clip ? { clip: opts.clip } : {}) })
  }
  // PNG sequence: `${name}_f00..` for the first `secs` seconds, `${name}_final.png` for the settled frame.
  const anim = async (html, name, secs, opts = {}) => {
    await load(html, name)
    const n = Math.round(secs * FPS)
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.R(t), i / FPS)
      await page.screenshot({ path: join(dir, `${name}_f${String(i).padStart(2, '0')}.png`), omitBackground: !!opts.transparent, ...(opts.clip ? { clip: opts.clip } : {}) })
    }
    await page.evaluate(() => window.R(99))
    await page.screenshot({ path: join(dir, `${name}_final.png`), omitBackground: !!opts.transparent, ...(opts.clip ? { clip: opts.clip } : {}) })
  }
  const svg = readFileSync(LOGO, 'utf8').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')
  await shot(pageBg(fd), 'bg')
  await shot(pageMask, 'mask', { clip: { x: 0, y: 0, width: SCR.w, height: SCR.h } })
  await extra(anim, fd, svg)
  const capClip = { x: 0, y: CAP.clipY, width: W, height: CAP.clipH }
  for (let i = 0; i < scenes.length; i++) await anim(pageCap(fd, scenes[i].cap, i % 2 ? 2 : -2), `cap${i}`, POP_S, { transparent: true, clip: capClip })
  if (scenes.some((s) => s.ding !== undefined)) await anim(pageBadge(fd), 'badge', POP_S, { transparent: true, clip: { x: 0, y: BADGE.clipY, width: W, height: BADGE.clipH } })
  await page.close()
}

// ---------- ffmpeg ----------
const loop = (len, file) => ['-loop', '1', '-framerate', FPS, '-t', len.toFixed(3), '-i', file]
const seq = (file) => ['-framerate', FPS, '-i', file]
const fmt = (n) => (+n).toFixed(3)

// Phone section: bg + scene clips (snap transitions, rounded mask, frame) + caption pops + ding badges.
// `tail` extends the last scene so a following section transition has footage to blend with.
function screenGraph(work, scenes, len, tail = 0) {
  const n = scenes.length, D = scenes.map((s) => s.dur)
  const inputs = [...loop(len, join(work, 'bg.png')), ...loop(len, join(work, 'mask.png'))]
  let idx = 2
  const fc = []
  scenes.forEach((s, i) => {
    const L = i < n - 1 ? s.dur + XF : s.dur + tail
    const clip = join(FOOTAGE, `${s.clip}-light.mp4`)
    if (!existsSync(clip)) throw new Error(`missing footage ${clip}`)
    inputs.push('-ss', s.ss, '-t', (L * s.speed + 0.5).toFixed(3), '-i', clip)
    fc.push(`[${idx}:v]setpts=PTS/${s.speed},fps=${FPS},scale=${SCR.w}:${SCR.h}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${L},trim=duration=${L.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[s${i}]`)
    idx++
  })

  // snap transitions between screens (0.15 s slides / zoom), on the beat
  let cur = 's0', acc = 0
  for (let i = 1; i < n; i++) {
    acc += D[i - 1]
    fc.push(`[${cur}][s${i}]xfade=transition=${SNAPS[(i - 1) % SNAPS.length]}:duration=${XF}:offset=${fmt(acc)}[x${i}]`)
    cur = `x${i}`
  }
  fc.push(`[${cur}]format=yuva420p[scr]`, `[1:v]format=gray[m]`, `[scr][m]alphamerge[scrm]`)
  fc.push(`[0:v][scrm]overlay=${SCR.x}:${SCR.y}:eof_action=pass,format=yuv420p[base0]`)

  // pop-in overlays: pop sequence + hold of the settled frame, each as one RGBA stream from t0 to t0 + length
  let label = 'base0', step = 0
  const pop = (name, t0, length, y) => {
    const a = idx++, b = idx++
    inputs.push(...seq(join(work, `${name}_f%02d.png`)), ...loop(Math.max(length - POP_S, 0.1), join(work, `${name}_final.png`)))
    fc.push(`[${a}:v]format=rgba,fps=${FPS}[${name}a]`, `[${b}:v]format=rgba,fps=${FPS}[${name}b]`)
    fc.push(`[${name}a][${name}b]concat=n=2:v=1:a=0,setpts=PTS+${fmt(t0)}/TB[${name}p]`)
    fc.push(`[${label}][${name}p]overlay=0:${y}:eof_action=pass:enable='between(t,${fmt(t0)},${fmt(t0 + length)})'[o${step}]`)
    label = `o${step++}`
  }
  let t0 = 0
  const dings = []
  scenes.forEach((s, i) => {
    pop(`cap${i}`, t0, D[i], CAP.clipY)
    if (s.ding !== undefined) dings.push(t0 + s.ding)
    t0 += D[i]
  })
  // ding badges share one rendered sequence; each use needs its own input pair
  dings.forEach((t, k) => {
    const a = idx++, b = idx++
    inputs.push(...seq(join(work, 'badge_f%02d.png')), ...loop(1.2, join(work, 'badge_final.png')))
    fc.push(`[${a}:v]format=rgba,fps=${FPS}[bga${k}]`, `[${b}:v]format=rgba,fps=${FPS}[bgb${k}]`)
    fc.push(`[bga${k}][bgb${k}]concat=n=2:v=1:a=0,setpts=PTS+${fmt(t)}/TB[bg${k}]`)
    fc.push(`[${label}][bg${k}]overlay=0:${BADGE.clipY}:eof_action=pass:enable='between(t,${fmt(t)},${fmt(t + POP_S + 1.2)})'[o${step}]`)
    label = `o${step++}`
  })
  return { inputs, fc, label, next: idx, dings }
}

// Ordered sections joined by 0.15 s snap transitions. Each stream except the last must already be len + XF long.
function chain(fc, secs) {
  const norm = (a, b) => `[${a}]fps=${FPS},format=yuv420p,setsar=1,settb=AVTB[${b}]`
  secs.forEach((s, i) => fc.push(norm(s.label, `Q${i}`)))
  let cur = 'Q0', acc = 0
  for (let i = 1; i < secs.length; i++) {
    acc += secs[i - 1].len
    const out = i === secs.length - 1 ? 'out' : `Y${i}`
    fc.push(`[${cur}][Q${i}]xfade=transition=${['slideleft', 'zoomin', 'slideleft'][(i - 1) % 3]}:duration=${XF}:offset=${fmt(acc)}[${out}]`)
    cur = out
  }
  return acc + secs[secs.length - 1].len
}

// Animated end card: bounce-in sequence + hold.
function endStream(inputs, fc, idx, work, name, holdLen, label) {
  inputs.push(...seq(join(work, `${name}_f%02d.png`)), ...loop(holdLen, join(work, `${name}_final.png`)))
  fc.push(`[${idx}:v]format=yuv420p,fps=${FPS},setsar=1[${label}a]`, `[${idx + 1}:v]format=yuv420p,fps=${FPS},setsar=1[${label}b]`)
  fc.push(`[${label}a][${label}b]concat=n=2:v=1:a=0,setpts=PTS-STARTPTS[${label}]`)
  return idx + 2
}

const encode = (ff, inputs, fc, out, audio, total, outFile) => {
  const cmd = ['-y', '-v', 'error', ...inputs, '-i', audio,
    '-filter_complex', fc.join(';'), '-map', `[${out}]`, '-map', `${inputs.filter((x) => x === '-i').length}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', FPS, '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(3), '-movflags', '+faststart', outFile].map(String)
  const r = spawnSync(ff, cmd, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${outFile} (status ${r.status}, signal ${r.signal})`)
}

// ---------- sound: 120 bpm rhythm bed, ding, thud (all synthesised from sine and noise bursts) ----------
// aevalsrc expressions; t = seconds. Beat = 0.5 s. Kick on every beat, clap on 2 and 4, hats on the off-beats,
// a bouncy bass and a pentatonic pluck lead. Everything is a sine or a noise burst: no samples, no licensing.
const pick = (k, arr) => arr.reduceRight((acc, f, i) => (f ? `if(eq(${k},${i}),${f},${acc})` : acc), '0')
const BED = {
  kick: 'sin(2*PI*(50*mod(t,0.5)+3.2*(1-exp(-28*mod(t,0.5)))))*exp(-9*mod(t,0.5))*0.9',
  clap: 'if(gte(mod(t,1),0.5),(random(0)*2-1)*exp(-26*(mod(t,1)-0.5)),0)*0.55',
  hat: '(random(1)*2-1)*exp(-70*mod(t+0.25,0.5))*0.45',
  bass: `sin(2*PI*${pick('floor(mod(t,2)/0.25)', [65.41, 0, 98, 65.41, 0, 87.31, 98, 0])}*mod(t,0.25))*exp(-9*mod(t,0.25))*0.55`,
  lead: `(sin(2*PI*${pick('floor(mod(t,4)/0.25)', [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 880, 0, 783.99, 0, 659.25, 523.25, 0, 392, 0])}*mod(t,0.25))+0.3*sin(4*PI*${pick('floor(mod(t,4)/0.25)', [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 880, 0, 783.99, 0, 659.25, 523.25, 0, 392, 0])}*mod(t,0.25)))*exp(-14*mod(t,0.25))*0.22`,
}
const DING = '(sin(2*PI*1318.5*t)*0.6+sin(2*PI*2637*t)*0.25+sin(2*PI*3951*t)*0.1)*exp(-5.5*t)*min(1,t/0.003)*0.8'
const THUD = 'sin(2*PI*(45*t+2.5*(1-exp(-30*t))))*exp(-8*t)*0.9'
const aeval = (expr, d) => `aevalsrc='${expr}':s=44100:d=${d}`

function ebur(ff, file) {
  const r = spawnSync(ff, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' })
  const t = r.stderr.slice(r.stderr.lastIndexOf('Summary:'))
  return { I: +(t.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), TP: +(t.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]) }
}

let soundsCache
function makeSounds(ff, _work) {
  if (soundsCache) return soundsCache
  const work = mkdtempSync(join(tmpdir(), 'sillytraveltool-sound-'))
  const bedRaw = join(work, 'bed_raw.wav'), bed = join(work, 'bed.wav')
  const g = [
    `${aeval(BED.kick, 8)},lowpass=f=220[k]`,
    `${aeval(BED.clap, 8)},highpass=f=900,lowpass=f=7000[c]`,
    `${aeval(BED.hat, 8)},highpass=f=6500[h]`,
    `${aeval(BED.bass, 8)},lowpass=f=500[b]`,
    `${aeval(BED.lead, 8)},highpass=f=250[l]`,
    '[k][c][h][b][l]amix=inputs=5:normalize=0,lowpass=f=9000,aformat=sample_rates=44100:channel_layouts=stereo[o]',
  ]
  run(ff, ['-y', '-v', 'error', '-filter_complex', g.join(';'), '-map', '[o]', bedRaw])
  // bed sits at -24 LUFS on its own (two-pass loudnorm, linear); ads add gain on top
  const m = run(ff, ['-y', '-hide_banner', '-i', bedRaw, '-af', 'loudnorm=I=-24:TP=-3:LRA=11:print_format=json', '-f', 'null', '-'])
  const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf('{'), m.stderr.lastIndexOf('}') + 1))
  run(ff, ['-y', '-v', 'error', '-i', bedRaw, '-af', `loudnorm=I=-24:TP=-3:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=44100`, bed])
  const ding = join(work, 'ding.wav'), thud = join(work, 'thud.wav')
  run(ff, ['-y', '-v', 'error', '-filter_complex', `${aeval(DING, 1.2)},aformat=channel_layouts=stereo[o]`, '-map', '[o]', ding])
  run(ff, ['-y', '-v', 'error', '-filter_complex', `${aeval(THUD, 0.5)},aformat=channel_layouts=stereo[o]`, '-map', '[o]', thud])
  return (soundsCache = { bed, ding, thud })
}

// Final audio for an ad. `sfx` = [{ t, kind: 'ding'|'thud' }]; `voice` = optional normalised voice wav.
function audioTrack(ff, work, snd, total, sfx, voice) {
  const out = join(work, 'audio.wav')
  const inp = ['-stream_loop', '-1', '-i', snd.bed, ...sfx.flatMap((s) => ['-i', snd[s.kind]]), ...(voice ? ['-i', voice] : [])]
  const vi = 1 + sfx.length
  const g = []
  g.push(`[0:a]atrim=duration=${fmt(total)},asetpts=PTS-STARTPTS,volume=${voice ? '2dB' : '0dB'}[bed]`)
  sfx.forEach((s, i) => g.push(`[${1 + i}:a]adelay=${Math.round(s.t * 1000)}:all=1,volume=${s.kind === 'ding' ? '-9dB' : '-5dB'}[fx${i}]`))
  const parts = []
  if (voice) {
    g.push(`[${vi}:a]aformat=channel_layouts=stereo,asplit=2[v1][v2]`)
    g.push('[bed][v1]sidechaincompress=threshold=0.015:ratio=6:attack=10:release=350:makeup=1[duck]')
    parts.push('[duck]', '[v2]')
  } else parts.push('[bed]')
  sfx.forEach((_, i) => parts.push(`[fx${i}]`))
  g.push(`${parts.join('')}amix=inputs=${parts.length}:duration=longest:dropout_transition=0,volume=${parts.length},afade=t=out:st=${fmt(total - 0.5)}:d=0.5,apad=whole_dur=${fmt(total)},alimiter=limit=0.8:level=disabled[o]`)
  run(ff, ['-y', '-v', 'error', ...inp, '-filter_complex', g.join(';'), '-map', '[o]', '-t', fmt(total), '-ar', 44100, out])
  return out
}

// ---------- end card (rendered once per disclosure text) ----------
const endCache = new Map()
async function endCard(disc) {
  if (endCache.has(disc)) return endCache.get(disc)
  const dir = mkdtempSync(join(tmpdir(), 'sillytraveltool-end-'))
  const fd = await ensureFonts()
  const browser = await openBrowser()
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
  const svg = readFileSync(LOGO, 'utf8').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')
  const f = join(dir, 'end.html'); writeFileSync(f, `<!doctype html><meta charset=utf-8>${pageEnd(fd, svg, disc)}`)
  await page.goto(pathToFileURL(f).href); await page.evaluate(() => document.fonts.ready)
  const n = Math.round(END_ANIM * FPS)
  for (let i = 0; i < n; i++) { await page.evaluate((t) => window.R(t), i / FPS); await page.screenshot({ path: join(dir, `end_f${String(i).padStart(2, '0')}.png`) }) }
  await page.evaluate(() => window.R(99)); await page.screenshot({ path: join(dir, 'end_final.png') })
  await page.close()
  endCache.set(disc, dir)
  return dir
}

// ---------- product-proof ads ----------
async function build(key) {
  const v = VARIANTS[key]
  const ff = await ffmpegPath()
  const work = mkdtempSync(join(tmpdir(), `sillytraveltool-ad-${key}-`))
  const endDir = await endCard(DISCLOSURE_PROOF)
  await renderAssets(work, v.scenes, async () => {})
  const snd = makeSounds(ff, work)

  const screenTotal = v.scenes.reduce((a, s) => a + s.dur, 0)
  const total = screenTotal + END_PRODUCT
  const g = screenGraph(work, v.scenes, screenTotal + XF, XF)
  const endIdx = g.inputs.filter((x) => x === '-i').length
  endStream(g.inputs, g.fc, endIdx, endDir, 'end', END_PRODUCT - END_ANIM, 'E')
  const len = chain(g.fc, [{ label: g.label, len: screenTotal }, { label: 'E', len: END_PRODUCT }])

  const sfx = [...g.dings.map((t) => ({ t: t + 0.0, kind: 'ding' })), { t: screenTotal + 0.3, kind: 'thud' }]
  const audio = audioTrack(ff, work, snd, len, sfx, null)
  mkdirSync(OUT, { recursive: true })
  const outFile = join(OUT, `silly-travel-tool-ad-${key}-${v.name}.mp4`)
  encode(ff, g.inputs, g.fc, 'out', audio, len, outFile)
  const l = ebur(ff, audio)
  if (!KEEP) rmSync(work, { recursive: true, force: true }); else console.log('assets kept in', work)
  console.log(`built ${outFile} (${len.toFixed(1)} s, audio ${l.I} LUFS, peak ${l.TP} dBFS)`)
}

// ---------- persona voice-over ----------
// say -> trimmed 44.1 kHz mono wav; returns duration in seconds (measured from the raw PCM).
function synth(ff, voice, rate, text, wav) {
  const aiff = wav.replace(/\.wav$/, '.aiff')
  run('say', ['-v', voice, '-r', rate, '-o', aiff, text])
  run(ff, ['-y', '-v', 'error', '-i', aiff, '-ar', 44100, '-ac', 1,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', wav])
  const raw = wav.replace(/\.wav$/, '.raw')
  run(ff, ['-y', '-v', 'error', '-i', wav, '-f', 's16le', raw])
  return readFileSync(raw).length / 2 / 44100
}

// Cuts land on the beat grid and never inside the previous line; speech starts LEAD s after its cut.
const grid = (x) => Math.ceil(x / BEAT - 1e-6) * BEAT
function schedule(durs) {
  const n = durs.length, cut = [0], sp = [LEAD]
  for (let i = 1; i < n; i++) { cut.push(grid(sp[i - 1] + durs[i - 1])); sp.push(cut[i] + LEAD) }
  const phone = grid(sp[n - 1] + durs[n - 1] + 0.4)
  const dur = cut.map((c, i) => (i < n - 1 ? cut[i + 1] : phone) - c)
  return { sp, cut, dur, phone }
}

// Mix the lines on a timeline, loudnorm (two-pass, linear); returns the wav path.
function voiceTrack(ff, work, wavs, starts, total) {
  const inp = wavs.flatMap((w) => ['-i', w])
  const delays = starts.map((t, i) => `[${i}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`)
  const mix = `${delays.join(';')};${starts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${starts.length}:duration=longest:dropout_transition=0,volume=${starts.length},highpass=f=70,apad=whole_dur=${total}`
  const LN = 'I=-16:TP=-1.5:LRA=11'
  const m1 = run(ff, ['-y', '-hide_banner', ...inp, '-filter_complex', `${mix},loudnorm=${LN}:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-'])
  const j = JSON.parse(m1.stderr.slice(m1.stderr.lastIndexOf('{'), m1.stderr.lastIndexOf('}') + 1))
  const out = join(work, 'voice.wav')
  run(ff, ['-y', '-v', 'error', ...inp, '-filter_complex',
    `${mix},loudnorm=${LN}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=44100[o]`,
    '-map', '[o]', '-t', total, out])
  return out
}

async function buildPersona(key) {
  const p = PERSONAS[key]
  if (!p) throw new Error(`unknown persona "${key}" (${Object.keys(PERSONAS).join(', ')})`)
  const ff = await ffmpegPath()
  const work = mkdtempSync(join(tmpdir(), `sillytraveltool-ad-${key}-`))
  const wavs = p.lines.map((l, i) => join(work, `line${i}.wav`))
  const durs = p.lines.map((l, i) => synth(ff, p.voice, p.rate, l.say, wavs[i]))
  const words = p.lines.reduce((a, l) => a + l.say.split(/\s+/).length, 0)
  if (words >= 45) throw new Error(`${p.name}: ${words} spoken words (limit 44)`)
  const { sp, cut, dur, phone } = schedule(durs)
  dur.forEach((d, i) => { if (d < 1.9 || d > 3.6) console.warn(`warn ${p.name}: scene ${i} is ${d.toFixed(2)} s`) })
  const scenes = p.lines.map((l, i) => ({ ...l, dur: dur[i] }))
  console.log(`${p.name} (${p.voice}): ${words} words, speech ${durs.map((d) => d.toFixed(1)).join(' + ')} s, scenes ${dur.join('/')} s`)

  const endDir = await endCard(DISCLOSURE_PERSONA)
  await renderAssets(work, scenes, async (anim, fd) => {
    await anim(pagePersona(fd, p), 'card', 0.8)
    await anim(pageResult(fd, p), 'result', 0.7)
  })
  const snd = makeSounds(ff, work)

  const g = screenGraph(work, scenes, phone + XF, XF)
  let idx = g.inputs.filter((x) => x === '-i').length
  idx = endStream(g.inputs, g.fc, idx, work, 'card', CARD + XF - 0.8, 'K')
  idx = endStream(g.inputs, g.fc, idx, work, 'result', RESULT + XF - 0.7, 'R')
  endStream(g.inputs, g.fc, idx, endDir, 'end', END_P - END_ANIM, 'E')
  const len = chain(g.fc, [{ label: 'K', len: CARD }, { label: g.label, len: phone }, { label: 'R', len: RESULT }, { label: 'E', len: END_P }])

  const voice = voiceTrack(ff, work, wavs, sp.map((t) => CARD + t), len)
  const endAt = CARD + phone + RESULT
  const sfx = [...g.dings.map((t) => ({ t: CARD + t, kind: 'ding' })), { t: endAt + 0.3, kind: 'thud' }]
  const audio = audioTrack(ff, work, snd, len, sfx, voice)
  mkdirSync(OUT, { recursive: true })
  const outFile = join(OUT, `silly-travel-tool-ad-persona-${p.file}.mp4`)
  encode(ff, g.inputs, g.fc, 'out', audio, len, outFile)
  const l = ebur(ff, audio)
  if (!KEEP) rmSync(work, { recursive: true, force: true }); else console.log('assets kept in', work)
  console.log(`built ${outFile} (${len.toFixed(1)} s, audio ${l.I} LUFS, peak ${l.TP} dBFS)`)
}

try {
  if (VARIANT) {
    const [kind, name] = VARIANT.split(':')
    if (kind !== 'persona') throw new Error(`unknown variant "${VARIANT}" (use persona:<name>|all)`)
    const failed = []
    for (const k of name === 'all' ? Object.keys(PERSONAS) : [name]) {
      try { await buildPersona(k) } catch (e) { console.error(`FAILED ${k}: ${e.message}`); failed.push(k) }
    }
    if (failed.length) process.exitCode = 1
  } else for (const k of which === 'all' ? ['a', 'b', 'c'] : [which]) await build(k)
} finally {
  if (browserP) await (await browserP).close()
}
