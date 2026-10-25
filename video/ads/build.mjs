#!/usr/bin/env node
// STT product-proof ads: builds vertical 1080x1920 30fps H.264 cuts from the real app footage.
//
//   node build.mjs a|b|c|all [--footage DIR] [--out DIR] [--keep]
//
// Captions, device frame and end card are rendered to PNG with headless Chrome (real Space Grotesk /
// DM Sans, Clay tokens), then ffmpeg composites: screen clips -> xfade dissolves -> rounded mask ->
// device frame overlay -> caption overlays -> end card. No generated media, silent audio track.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const which = args.find((a) => !a.startsWith('--') && ['a', 'b', 'c', 'all'].includes(a)) || 'all'
const FOOTAGE = resolve(flag('footage', process.env.STT_FOOTAGE || join(HERE, '../app-footage')))
const OUT = resolve(flag('out', join(HERE, 'out')))
const KEEP = args.includes('--keep')
const LOGO = join(HERE, '../../docs/brand/logos/tag-mark.svg')

// Clay tokens (docs/brand/brand-tokens.json)
const C = { page: '#F4EEE6', card: '#FFFDF9', ink: '#2A2520', accent: '#B24A17', accentSoft: '#F6E9DF', muted: '#6B6355' }

// Frame geometry. Text lives in y 288..1632 (middle 70%); the phone may run lower, it carries no text we need.
const W = 1080, H = 1920, FPS = 30, XF = 0.4
const SCR = { w: 600, h: 1300, x: 240, y: 530, r: 58, bezel: 16 }
const CAP = { top: 300, boxH: 200 }

// Scenes: clip file stem, source start `ss`, playback `speed`, shown `dur` (s), caption ([x] = terracotta word).
const END = 3
const VARIANTS = {
  a: { name: 'forward-it-done', scenes: [
    { clip: '01-inbox-first-run', ss: 0.8, speed: 1, dur: 2.6, cap: 'Still [screenshotting] your bookings?' },
    { clip: '02-forward-lands-in-trip', ss: 0.5, speed: 1.5, dur: 3.6, cap: 'Forward the email. [Goose] files it.' },
    { clip: '04-multicity-plan', ss: 0.5, speed: 1.4, dur: 3.6, cap: 'One trip, every city, [local] time.' },
    { clip: '05-today', ss: 0.3, speed: 1, dur: 3.6, cap: 'Travel day: what’s [next], how to get there.' },
    { clip: '07-shared-trip-card', ss: 2.6, speed: 1, dur: 3.6, cap: 'Everyone on the flight, one [card].' },
  ] },
  b: { name: 'tools-that-switch', scenes: [
    { clip: '09-tools-switch', ss: 0, speed: 0.5, dur: 3, cap: 'Tools that switch by [country].' },
    { clip: '09-tools-switch', ss: 1.3, speed: 0.4, dur: 3, cap: 'The right [currency], already set.' },
    { clip: '09-tools-switch', ss: 2.7, speed: 0.6, dur: 3, cap: 'Local [phrases], ready to show.' },
    { clip: '09-tools-switch', ss: 6.4, speed: 0.55, dur: 3, cap: '[SOS] with local numbers.' },
  ] },
  c: { name: 'travel-together', scenes: [
    { clip: '07-shared-trip-card', ss: 0, speed: 1, dur: 4, cap: 'One trip, [shared] with Maria and Tom.' },
    { clip: '07-shared-trip-card', ss: 4, speed: 1, dur: 4, cap: 'One card for [everyone] on the flight.' },
    { clip: '05-today', ss: 0.3, speed: 1, dur: 4, cap: '[Today], with Maria and Tom.' },
  ] },
}

// ---------- tools ----------
const req = (m) => import(pathToFileURL(join(HERE, 'node_modules', m, 'package.json')).href).then(() => m)
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

// ---------- assets (HTML -> PNG) ----------
const css = (fontDir) => `
@font-face{font-family:'Space Grotesk';font-weight:300 700;src:url('${pathToFileURL(join(fontDir, 'SpaceGrotesk.ttf'))}')}
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url('${pathToFileURL(join(fontDir, 'DMSans.ttf'))}')}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:'DM Sans',sans-serif;color:${C.ink};position:relative}`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const capHtml = (t) => esc(t).replace(/\[(.+?)\]/g, `<span style="color:${C.accent}">$1</span>`)

const pageBg = (fd) => `<style>${css(fd)}body{background:${C.page}}
.shadow{position:absolute;left:${SCR.x - SCR.bezel}px;top:${SCR.y - SCR.bezel}px;width:${SCR.w + 2 * SCR.bezel}px;height:${SCR.h + 2 * SCR.bezel}px;border-radius:${SCR.r + SCR.bezel}px;background:${C.ink};box-shadow:0 34px 70px rgba(120,80,50,.30),0 10px 24px rgba(120,80,50,.16)}
.glass{position:absolute;left:${SCR.x - 3}px;top:${SCR.y - 3}px;width:${SCR.w + 6}px;height:${SCR.h + 6}px;border-radius:${SCR.r + 3}px;background:#000}</style>
<div class="shadow"></div><div class="glass"></div>`

const pageMask = `<style>html,body{margin:0;background:#000}div{width:${SCR.w}px;height:${SCR.h}px;border-radius:${SCR.r}px;background:#fff}</style><div></div>`

const pageCap = (fd, t) => `<style>${css(fd)}body{background:transparent}
.box{position:absolute;left:0;right:0;top:${CAP.top}px;height:${CAP.boxH}px;display:flex;align-items:center;justify-content:center}
.pill{max-width:940px;background:${C.card};border-radius:56px;padding:30px 48px 34px;text-align:center;font-family:'Space Grotesk';font-weight:700;font-size:60px;line-height:1.14;text-wrap:balance;letter-spacing:-.02em;box-shadow:0 8px 22px rgba(120,80,50,.14),inset 0 -4px 0 rgba(120,80,50,.05)}</style>
<div class="box"><div class="pill">${capHtml(t)}</div></div>`

const pageEnd = (fd, svg) => `<style>${css(fd)}body{background:${C.page}}
.c{position:absolute;left:0;right:0;top:420px;display:flex;flex-direction:column;align-items:center}
.logo{width:300px;height:400px;filter:drop-shadow(0 16px 24px rgba(120,80,50,.25))}
h1{font-family:'Space Grotesk';font-weight:700;font-size:96px;letter-spacing:-.03em;line-height:1;margin-top:56px}
.url{font-weight:600;font-size:46px;color:${C.accent};margin-top:26px;letter-spacing:-.005em}
.beta{margin-top:44px;background:${C.accentSoft};color:${C.accent};border-radius:999px;padding:12px 34px;font-weight:700;font-size:34px;letter-spacing:.06em;text-transform:uppercase}</style>
<div class="c"><div class="logo">${svg}</div><h1>Silly Travel Tool</h1><div class="url">sillytraveltool.com</div><div class="beta">Beta</div></div>`

async function renderAssets(dir, variant) {
  const fd = await ensureFonts()
  const { default: puppeteer } = await import(pathToFileURL(join(HERE, 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).href)
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--allow-file-access-from-files'] })
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
  const shot = async (html, file, opts = {}) => {
    const f = join(dir, `${file}.html`); writeFileSync(f, `<!doctype html><meta charset=utf-8>${html}`)
    await page.goto(pathToFileURL(f).href); await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(dir, `${file}.png`), omitBackground: !!opts.transparent, ...(opts.clip ? { clip: opts.clip } : {}) })
  }
  await shot(pageBg(fd), 'bg')
  await shot(pageMask, 'mask', { clip: { x: 0, y: 0, width: SCR.w, height: SCR.h } })
  const svg = readFileSync(LOGO, 'utf8').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')
  await shot(pageEnd(fd, svg), 'end')
  for (let i = 0; i < variant.scenes.length; i++) await shot(pageCap(fd, variant.scenes[i].cap), `cap${i}`, { transparent: true })
  await browser.close()
}

// ---------- ffmpeg ----------
async function build(key) {
  const v = VARIANTS[key]
  const ff = await ffmpegPath()
  const work = mkdtempSync(join(tmpdir(), `stt-ad-${key}-`))
  await renderAssets(work, v)

  const D = v.scenes.map((s) => s.dur)
  const screenTotal = D.reduce((a, b) => a + b, 0)
  const total = screenTotal + END
  const n = v.scenes.length
  const inputs = []
  const fc = []

  // 0: bg, 1: mask, 2..: clips, then captions, then end card
  inputs.push('-loop', '1', '-framerate', FPS, '-t', total, '-i', join(work, 'bg.png'))
  inputs.push('-loop', '1', '-framerate', FPS, '-t', total, '-i', join(work, 'mask.png'))
  v.scenes.forEach((s, i) => {
    const L = i < n - 1 ? s.dur + XF : s.dur
    const clip = join(FOOTAGE, `${s.clip}-light.mp4`)
    if (!existsSync(clip)) throw new Error(`missing footage ${clip}`)
    inputs.push('-ss', s.ss, '-t', (L * s.speed + 0.5).toFixed(3), '-i', clip)
    fc.push(`[${2 + i}:v]setpts=PTS/${s.speed},fps=${FPS},scale=${SCR.w}:${SCR.h}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${L},trim=duration=${L.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[s${i}]`)
  })
  v.scenes.forEach((_, i) => inputs.push('-loop', '1', '-framerate', FPS, '-t', D[i] + (i < n - 1 ? 0 : 0), '-i', join(work, `cap${i}.png`)))
  inputs.push('-loop', '1', '-framerate', FPS, '-t', END, '-i', join(work, 'end.png'))
  const capIdx = (i) => 2 + n + i
  const endIdx = 2 + 2 * n

  // dissolves between screens
  let cur = 's0', acc = 0
  for (let i = 1; i < n; i++) {
    acc += D[i - 1]
    fc.push(`[${cur}][s${i}]xfade=transition=fade:duration=${XF}:offset=${acc.toFixed(3)}[x${i}]`)
    cur = `x${i}`
  }
  fc.push(`[${cur}]format=yuva420p[scr]`, `[1:v]format=gray[m]`, `[scr][m]alphamerge[scrm]`)
  fc.push(`[0:v][scrm]overlay=${SCR.x}:${SCR.y}:eof_action=pass,format=yuv420p[base0]`)

  // captions: visible from scene start to next scene start, 0.2 s fades
  let t0 = 0, label = 'base0'
  v.scenes.forEach((s, i) => {
    const d = D[i]
    fc.push(`[${capIdx(i)}:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${(d - 0.2).toFixed(3)}:d=0.2:alpha=1,setpts=PTS+${t0.toFixed(3)}/TB[c${i}]`)
    fc.push(`[${label}][c${i}]overlay=0:0:eof_action=pass[b${i + 1}]`)
    label = `b${i + 1}`; t0 += d
  })
  // end card
  fc.push(`[${endIdx}:v]format=rgba,fade=t=in:st=0:d=${XF}:alpha=1,setpts=PTS+${screenTotal.toFixed(3)}/TB[end]`)
  fc.push(`[${label}][end]overlay=0:0:eof_action=pass,format=yuv420p[out]`)

  mkdirSync(OUT, { recursive: true })
  const outFile = join(OUT, `stt-ad-${key}-${v.name}.mp4`)
  const cmd = ['-y', '-v', 'error', ...inputs,
    '-f', 'lavfi', '-t', total, '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', fc.join(';'), '-map', '[out]', '-map', `${endIdx + 1}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', FPS, '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '96k', '-t', total, '-movflags', '+faststart', outFile].map(String)
  const r = spawnSync(ff, cmd, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${key}`)
  if (!KEEP) rmSync(work, { recursive: true, force: true }); else console.log('assets kept in', work)
  console.log(`built ${outFile} (${total}s)`)
}

for (const k of which === 'all' ? ['a', 'b', 'c'] : [which]) await build(k)
