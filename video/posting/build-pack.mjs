#!/usr/bin/env node
// Silly Travel Tool posting pack builder.
//
// Finds every finished ad (video/ads/*.mp4 and video/generated/*-AD.mp4), checks the last frame for the
// disclosure line (adds it with ffmpeg when missing), exports each ad per platform, cuts thumbnails, probes
// every export and writes POSTING_PACK.md. Nothing is posted, scheduled or uploaded anywhere.
//
//   node build-pack.mjs                 # all ads
//   node build-pack.mjs --only silly-travel-tool-ad-a-forward-it-done
//   node build-pack.mjs --force         # re-encode even if the export is newer than its source
//   node build-pack.mjs --with-creators # also pack the AI-generated creator ads from <video>/generated (off by default)
//
// Options: --video DIR (folder holding ads/ and generated/; default: the checkout that has the MP4s),
//          --out DIR (default <video>/posting). Env: FFMPEG, FFPROBE, CHROME, ADS_FONT_DIR.
// Outputs (not committed): <out>/{tiktok,reels,shorts,youtube-feed,facebook,linkedin}/<ad>.mp4,
//          <out>/thumbnails/<ad>.png + contact-sheet.png, <out>/proof/*, <out>/POSTING_PACK.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined }
const FORCE = process.argv.includes('--force')
const ONLY = arg('--only')
const WITH_CREATORS = process.argv.includes('--with-creators')

const CLAY = '#F4EEE6' // surface-page, same as the ad backgrounds
const INK = '#2A2520', MUTED = '#6B6355', ACCENT = '#B24A17', ACCENT_SOFT = '#F6E9DF', CARD = '#FFFDF9'
const BETA_LINE = 'Silly Travel Tool is in beta.'
const BASE_URL = 'https://sillytraveltool.com/beta/'
const BRAND_TAG = '#sillytraveltool'

// ---------- ad metadata ----------
// key = source file stem. kind: proof | persona | creator (schedule order). thumb = second of the first strong frame.
// disc = what the end card must say; the added frame for proof ads is "Real app footage" because nobody is synthetic there.
const ADS = {
  'silly-travel-tool-ad-a-forward-it-done': {
    name: 'silly-travel-tool-ad-a-forward-it-done', kind: 'proof', title: 'Forward it. Done. (lead cut)', thumb: 1.2, label: 'Real app footage, demo data.',
    hook: 'Still screenshotting your bookings? Goose does the admin. You do the tapas.',
    feature: 'Forward the confirmation email to your Goose inbox and it lands in the trip, with every time in local time.',
    liHook: 'Every booking confirmation, one calm trip plan.',
    liFeature: 'Forward the email and Silly Travel Tool files it into the trip, local times intact.',
    q: 'What is the messiest place you have ever kept a booking confirmation?',
    tags: ['#travelplanning', '#traveltips', '#travelapp'], synthetic: false,
  },
  'silly-travel-tool-ad-b-tools-that-switch': {
    name: 'silly-travel-tool-ad-b-tools-that-switch', kind: 'proof', title: 'Tools that switch', thumb: 1.2, label: 'Real app footage, demo data.',
    hook: 'Cross a border and your tools switch. Goose switches, you just land.',
    feature: 'Currency, local phrases and SOS numbers follow the country you are in.',
    liHook: 'Travel tools that follow the country you are in.',
    liFeature: 'Currency, local phrases and emergency numbers switch as the trip moves on.',
    q: 'Do you know the emergency number for the country you are in right now?',
    tags: ['#traveltips', '#traveltech', '#travelapp'], synthetic: false,
  },
  'silly-travel-tool-ad-c-travel-together': {
    name: 'silly-travel-tool-ad-c-travel-together', kind: 'proof', title: 'Travel together', thumb: 1.2, label: 'Real app footage, demo data.',
    hook: 'Everyone on the flight, one card. Zero “what’s your seat?” texts.',
    feature: 'Invite your travel crew, everyone forwards their own bookings, and the shared flight shows up as a single card.',
    liHook: 'One itinerary for family and group travel.',
    liFeature: 'Shared trips put every traveller on one flight card.',
    q: 'Who is the trip planner in your group?',
    tags: ['#grouptravel', '#familytravel', '#traveltips'], synthetic: false,
  },
  'silly-travel-tool-ad-persona-ana-shared-trip': {
    name: 'silly-travel-tool-ad-persona-ana-shared-trip', kind: 'persona', title: 'Ana, family organiser', thumb: 3, label: 'Fictional traveller, synthetic voice.', who: 'Ana',
    hook: 'Five people, five inboxes, one Goose. Ana has retired as the group’s search engine.',
    feature: 'Everyone forwards their booking to Goose, and each shared flight becomes one card for the whole group.',
    liHook: 'Five travellers, five inboxes, one trip.',
    liFeature: 'Everyone forwards their booking and each shared flight becomes one card.',
    q: 'How many inboxes does your last group trip live in?',
    tags: ['#familytravel', '#grouptravel', '#travelplanning'], synthetic: true,
  },
  'silly-travel-tool-ad-persona-dev-forward-email': {
    name: 'silly-travel-tool-ad-persona-dev-forward-email', kind: 'persona', title: 'Dev, solo backpacker', thumb: 3, label: 'Fictional traveller, synthetic voice.', who: 'Dev',
    hook: 'Screenshots everywhere? Dev’s camera roll is going back to sunsets.',
    feature: 'Forward the confirmation, or paste it in, and it becomes part of the trip in local time.',
    liHook: 'Booking screenshots into a real trip plan.',
    liFeature: 'Forward or paste a confirmation and it is filed into the trip in local time.',
    q: 'How many booking screenshots are on your phone right now?',
    tags: ['#backpacking', '#travelhacks', '#traveltips'], synthetic: true,
  },
  'silly-travel-tool-ad-persona-linda-tools-switch': {
    name: 'silly-travel-tool-ad-persona-linda-tools-switch', kind: 'persona', title: 'Linda, long Europe trip', thumb: 3, label: 'Fictional traveller, synthetic voice.', who: 'Linda',
    hook: 'New country, new currency, new emergency number. Goose didn’t blink.',
    feature: 'Silly Travel Tool switches currency, phrasebook and SOS numbers to the country you are in.',
    liHook: 'New country, new currency, new emergency number.',
    liFeature: 'Currency, phrasebook and SOS numbers switch to the country you are in.',
    q: 'What was the first thing you had to google when you crossed your last border?',
    tags: ['#europetravel', '#traveltips', '#traveltech'], synthetic: true,
  },
  'silly-travel-tool-ad-persona-marcus-today-get-there': {
    name: 'silly-travel-tool-ad-persona-marcus-today-get-there', kind: 'persona', title: 'Marcus, business traveller', thumb: 3, label: 'Fictional traveller, synthetic voice.', who: 'Marcus (business traveller)',
    hook: 'Landing at 6 am. Where next? Goose is up so Marcus doesn’t have to be.',
    feature: 'Today opens on what is next, and Get there is one tap away.',
    liHook: 'Landing at 6 am. Where next?',
    liFeature: 'Today shows what is next, and Get there is one tap away.',
    q: 'What is the first thing you open after you land?',
    tags: ['#businesstravel', '#traveltips', '#traveltech'], synthetic: true,
  },
  'tess-1.1-AD': {
    name: 'silly-travel-tool-creator-tess-1-1', kind: 'creator', title: 'Tess, "the moment it clicked"', thumb: 2.5, label: 'AI-generated creator.', who: 'Tess Hollis',
    hook: 'My confirmation emails are everywhere.',
    feature: 'I forward each one to my Goose inbox and it lands in the trip, with times in local time.',
    liHook: 'Booking confirmations into one calm trip plan.',
    liFeature: 'Forward the email to your Goose inbox and it lands in the trip, local times intact.',
    q: 'Which city’s trains were hardest to keep track of?',
    tags: ['#backpacking', '#travelhacks', '#travelplanning'], synthetic: true,
  },
  'marcus-2.1-AD': {
    name: 'silly-travel-tool-creator-marcus-2-1', kind: 'creator', title: 'Marcus Sterling, "the moment it clicked"', thumb: 2.5, label: 'AI-generated creator.', who: 'Marcus Sterling',
    hook: 'Family trips mean everyone’s bookings are in different inboxes.',
    feature: 'Invite everyone by email, each person forwards their own, and three travellers share one flight card.',
    liHook: 'One shared itinerary for family and group travel.',
    liFeature: 'Invite everyone, each person forwards their own booking, one shared trip.',
    q: 'Who is the trip planner in your house?',
    tags: ['#familytravel', '#grouptravel', '#travelplanning'], synthetic: true,
  },
}
const KIND_ORDER = { proof: 0, persona: 1, creator: 2 }
const DISCLOSURE_END = { proof: 'Real app footage. ' + BETA_LINE, persona: 'Fictional traveller. ' + BETA_LINE, creator: 'AI-generated creator. ' + BETA_LINE }

// ---------- platforms ----------
// utm = utm_source; slots = Pacific time, [post 1 of the day, post 2 of the day]. Starting points; replace with each
// platform's own analytics after week 1.
const PLATFORMS = {
  tiktok: { label: 'TikTok', dir: 'tiktok', utm: 'tiktok', slots: ['6:30 pm', '12:30 pm'], when: 'weekday evenings, 6 to 9 pm PT' },
  reels: { label: 'Instagram Reels', dir: 'reels', utm: 'instagram', slots: ['11:30 am', '7:30 pm'], when: 'weekdays 11 am to 1 pm PT, second slot 7 to 9 pm' },
  shorts: { label: 'YouTube Shorts', dir: 'shorts', utm: 'youtube', slots: ['12:00 pm', '5:00 pm'], when: 'midday 12 to 3 pm PT, second slot 5 pm' },
  facebook: { label: 'Facebook', dir: 'facebook', utm: 'facebook', slots: ['9:00 am', '3:00 pm'], when: 'weekday mornings 9 am to 1 pm PT' },
  linkedin: { label: 'LinkedIn', dir: 'linkedin', utm: 'linkedin', slots: ['8:00 am', '12:00 pm'], when: 'Tuesday to Thursday 7:30 to 9 am PT, weekdays only' },
}
const linkFor = (plat, ad) => `${BASE_URL}?utm_source=${PLATFORMS[plat].utm}&utm_medium=social&utm_campaign=beta_launch&utm_content=${ad.name}`

function hashtagsFor(plat, ad) {
  const [a, b, c] = ad.tags
  if (plat === 'tiktok') return [a, b, c, BRAND_TAG]
  if (plat === 'reels') return [a, b, c, BRAND_TAG]
  if (plat === 'shorts') return [a, b, '#shorts', BRAND_TAG]
  if (plat === 'facebook') return [a, b, BRAND_TAG]
  return [a, '#traveltech', BRAND_TAG]
}
function disclosureLine(ad) {
  return ad.kind === 'creator' ? 'AI-generated creator.' : ad.kind === 'persona' ? 'Fictional traveller, synthetic voice-over.' : 'Real app footage, demo data.'
}
function captionFor(plat, ad) {
  const li = plat === 'linkedin'
  const lines = [li ? ad.liHook : ad.hook, li ? ad.liFeature : ad.feature, BETA_LINE, disclosureLine(ad), `Try the beta: ${linkFor(plat, ad)}`, '', hashtagsFor(plat, ad).join(' ')]
  return lines.join('\n')
}
// Platform label settings (the platforms' own toggles). #ad only if paid promotion is used.
function labelsFor(plat, ad) {
  const ai = ad.synthetic
  const why = ad.kind === 'creator' ? 'synthetic creator' : 'synthetic voice-over'
  switch (plat) {
    case 'tiktok': return ai ? `Turn ON "AI-generated content" (${why}).` : 'AI-generated content toggle: OFF (real footage, no synthetic media).'
    case 'reels': return ai ? `Turn ON "AI info" (${why}).` : 'AI info: not needed (real footage, no synthetic media).'
    case 'shorts': return ai ? `"Altered or synthetic content" = Yes (${why}).` : '"Altered or synthetic content" = No (real footage, no synthetic media).'
    case 'facebook': return ai ? `Turn ON "AI info" (${why}).` : 'AI info: not needed (real footage, no synthetic media).'
    default: return ai ? `No platform toggle; the caption line "${disclosureLine(ad)}" is the label.` : 'No label needed beyond the caption line.'
  }
}

// ---------- tooling ----------
const exists = (p) => p && existsSync(p)
function which(cmd) { try { return execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim() } catch { return null } }
function findFfmpeg() {
  if (exists(process.env.FFMPEG)) return process.env.FFMPEG
  const w = which('ffmpeg'); if (w) return w
  for (const root of [join(REPO, 'video/ads'), '/Users/misha/Documents/silly-travel-tool/video/ads']) {
    try { const p = createRequire(join(root, 'x.js'))('ffmpeg-static'); if (exists(p)) return p } catch {}
  }
  throw new Error('No ffmpeg: set FFMPEG=/path/to/ffmpeg (needs libx264, aac, pad, overlay, scale; drawtext is not required)')
}
let PROBE_ENV = process.env
function findFfprobe(videoRoot) {
  if (exists(process.env.FFPROBE)) return process.env.FFPROBE
  const w = which('ffprobe'); if (w) return w
  const dir = join(videoRoot, 'node_modules/@remotion/compositor-darwin-x64') // Remotion ships ffprobe; it needs its dylibs on the path
  if (exists(join(dir, 'ffprobe'))) { PROBE_ENV = { ...process.env, DYLD_LIBRARY_PATH: dir }; return join(dir, 'ffprobe') }
  const arm = join(videoRoot, 'node_modules/@remotion/compositor-darwin-arm64')
  if (exists(join(arm, 'ffprobe'))) { PROBE_ENV = { ...process.env, DYLD_LIBRARY_PATH: arm }; return join(arm, 'ffprobe') }
  throw new Error('No ffprobe: set FFPROBE=/path/to/ffprobe')
}
function chromePath() {
  const c = [process.env.CHROME, join(homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)
  const p = c.find(exists); if (!p) throw new Error('No Chrome found; set CHROME=/path/to/chrome'); return p
}
function loadPuppeteer(videoRoot) {
  for (const root of [join(REPO, 'video/ads'), join(videoRoot, 'ads'), videoRoot]) {
    try { return createRequire(join(root, 'x.js'))('puppeteer-core') } catch {}
  }
  throw new Error('puppeteer-core not found (run npm install in video/ or video/ads)')
}
function pickVideoRoot() {
  const cands = [arg('--video'), process.env.ADS_VIDEO_DIR, join(REPO, 'video')]
  try {
    const common = execFileSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
    cands.push(join(dirname(common), 'video'))
  } catch {}
  const r = cands.filter(Boolean).find((d) => exists(join(d, 'ads')) && readdirSync(join(d, 'ads')).some((f) => f.endsWith('.mp4')))
  if (!r) throw new Error('No ads/*.mp4 found; pass --video DIR')
  return r
}
const run = (bin, args, env) => new Promise((res, rej) => {
  const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], env: env || process.env }); let err = ''
  p.stderr.on('data', (d) => (err += d)); p.on('error', rej)
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${basename(bin)} ${args.slice(0, 6).join(' ')}... exited ${c}\n${err.split('\n').slice(-12).join('\n')}`))))
})
const runOut = (bin, args, env) => new Promise((res, rej) => {
  const p = spawn(bin, args, { env: env || process.env }); let out = '', err = ''
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('error', rej)
  p.on('close', (c) => (c === 0 ? res(out + err) : rej(new Error(err.split('\n').slice(-8).join('\n')))))
})
async function pool(items, n, fn) {
  const q = [...items]; const workers = Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()) })
  await Promise.all(workers)
}
const fresh = (out, src) => !FORCE && exists(out) && statSync(out).mtimeMs > statSync(src).mtimeMs
const mkdir = (d) => mkdirSync(d, { recursive: true })

// ---------- main ----------
const videoRoot = pickVideoRoot()
const OUT = arg('--out') || join(videoRoot, 'posting')
const WORK = join(OUT, '_work')
const FFMPEG = findFfmpeg(), FFPROBE = findFfprobe(videoRoot)
const puppeteer = loadPuppeteer(videoRoot)
for (const d of ['tiktok', 'reels', 'shorts', 'youtube-feed', 'facebook', 'linkedin', 'thumbnails', 'proof']) mkdir(join(OUT, d))
for (const d of ['src', 'frames', 'html']) mkdir(join(WORK, d))
console.log(`video root ${videoRoot}\nout        ${OUT}\nffmpeg     ${FFMPEG}\nffprobe    ${FFPROBE}`)

// discover
const found = []
for (const f of readdirSync(join(videoRoot, 'ads')).filter((f) => f.endsWith('.mp4')).sort()) found.push({ key: basename(f, '.mp4'), path: join(videoRoot, 'ads', f) })
if (WITH_CREATORS && exists(join(videoRoot, 'generated'))) for (const f of readdirSync(join(videoRoot, 'generated')).filter((f) => /-AD\.mp4$/.test(f)).sort()) found.push({ key: basename(f, '.mp4'), path: join(videoRoot, 'generated', f) })
const unknown = found.filter((f) => !ADS[f.key]).map((f) => f.key)
if (unknown.length) console.warn(`\nWARNING: no caption metadata for ${unknown.join(', ')}; skipped. Add them to ADS in build-pack.mjs and re-run.\n`)
let ads = found.filter((f) => ADS[f.key]).map((f) => ({ ...ADS[f.key], key: f.key, srcOrig: f.path }))
if (ONLY) ads = ads.filter((a) => a.name === ONLY || a.key === ONLY)
ads.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name))
if (!ads.length) throw new Error('nothing to build')
console.log(`ads: ${ads.map((a) => a.name).join(', ')}`)

// ffprobe helpers
async function probe(file) {
  const j = JSON.parse(await runOut(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], PROBE_ENV))
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio')
  const [n, d] = v.r_frame_rate.split('/').map(Number)
  return {
    codec: `${v.codec_name} ${{ 100: 'High', 77: 'Main', 66: 'Baseline' }[v.profile] || v.profile}`, wh: `${v.width}x${v.height}`, fps: +(n / d).toFixed(2), pix: v.pix_fmt,
    dur: +(+j.format.duration).toFixed(2), vkbps: Math.round((v.bit_rate || j.format.bit_rate) / 1000),
    audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch ${Math.round((a.bit_rate || 0) / 1000)} kbps` : 'none',
    mb: +(statSync(file).size / 1048576).toFixed(1),
  }
}

// ---------- Chrome renders (disclosure line, LinkedIn logo, sheets) ----------
async function withChrome(fn) {
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--allow-file-access-from-files'] })
  try { return await fn(browser) } finally { await browser.close() }
}
function fontDir() {
  const c = [process.env.ADS_FONT_DIR, join(REPO, 'video/ads/fonts'), join(videoRoot, 'ads/fonts'), join(WORK, 'fonts')].filter(Boolean)
  return c.find((d) => exists(join(d, 'DMSans.ttf')) && exists(join(d, 'SpaceGrotesk.ttf')))
}
async function ensureFonts() {
  let d = fontDir(); if (d) return d
  d = join(WORK, 'fonts'); mkdir(d)
  const urls = {
    'SpaceGrotesk.ttf': 'https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf',
    'DMSans.ttf': 'https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf',
  }
  for (const [f, u] of Object.entries(urls)) {
    console.log('fetching font', f); const r = await fetch(u); if (!r.ok) throw new Error(`font download failed: ${u}`)
    writeFileSync(join(d, f), Buffer.from(await r.arrayBuffer()))
  }
  return d
}
const fontCss = (fd) => `@font-face{font-family:'Space Grotesk';font-weight:300 700;src:url('${pathToFileURL(join(fd, 'SpaceGrotesk.ttf'))}')}
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url('${pathToFileURL(join(fd, 'DMSans.ttf'))}')}`
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

async function shot(browser, html, file, { w, h, transparent = false, fullPage = false }) {
  const f = join(WORK, 'html', basename(file, '.png') + '.html'); writeFileSync(f, `<!doctype html><meta charset=utf-8>${html}`)
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(f).href); await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await page.screenshot({ path: file, omitBackground: transparent, fullPage }); await page.close()
}

// Disclosure line, positioned exactly where the ad end card would put it under the Beta pill (end card layout:
// column from top:380px, 300x400 logo, 96px title, url, beta pill, then this line 48px below the pill).
// Everything but the line is hidden so the PNG overlays the existing end card.
const pageDisclosure = (fd, svg, text) => `<style>${fontCss(fd)}*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden;background:transparent}body{font-family:'DM Sans',sans-serif}
.c{position:absolute;left:0;right:0;top:380px;display:flex;flex-direction:column;align-items:center}
.logo{width:300px;height:400px;visibility:hidden}
h1{font-family:'Space Grotesk';font-weight:700;font-size:96px;letter-spacing:-.03em;line-height:1;margin-top:56px;visibility:hidden}
.url{font-weight:600;font-size:46px;margin-top:26px;visibility:hidden}
.beta{margin-top:44px;border-radius:999px;padding:12px 34px;font-weight:700;font-size:34px;letter-spacing:.06em;text-transform:uppercase;visibility:hidden}
.disc{margin-top:48px;max-width:760px;text-align:center;font-weight:500;font-size:36px;line-height:1.3;color:${MUTED};text-wrap:balance}</style>
<div class="c"><div class="logo">${svg}</div><h1>Silly Travel Tool</h1><div class="url">sillytraveltool.com</div><div class="beta">Beta</div><div class="disc">${esc(text)}</div></div>`

const sheetHtml = (fd, title, items, cols, thumbW) => `<style>${fontCss(fd)}*{box-sizing:border-box;margin:0}body{background:${CLAY};font-family:'DM Sans',sans-serif;color:${INK};padding:32px;width:${cols * (thumbW + 24) + 64}px}
h1{font-family:'Space Grotesk';font-weight:700;font-size:30px;margin-bottom:20px}
.g{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:24px}
figure{background:${CARD};border-radius:14px;padding:10px;box-shadow:0 4px 14px rgba(120,80,50,.14)}
img{display:block;width:${thumbW - 20}px;height:${Math.round((thumbW - 20) * 16 / 9)}px;border-radius:8px;object-fit:cover}
figcaption{font-size:13px;line-height:1.3;margin-top:8px;color:${MUTED}}figcaption b{display:block;color:${INK};font-size:14px}</style>
<h1>${esc(title)}</h1><div class="g">${items.map((i) => `<figure><img src="${pathToFileURL(i.file).href}"><figcaption><b>${esc(i.label)}</b>${esc(i.sub || '')}</figcaption></figure>`).join('')}</div>`

// ---------- 1. disclosure check / fix ----------
async function lastFrame(src, png) { await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-sseof', '-0.3', '-i', src, '-frames:v', '1', '-update', '1', png]) }
// The disclosure line sits in y 1140..1380 (below the Beta pill, which ends near y 1117). Clay luma is ~238; text is far darker.
async function hasDisclosure(png) {
  const out = await runOut(FFMPEG, ['-hide_banner', '-i', png, '-vf', 'crop=900:240:90:1140,signalstats,metadata=print:key=lavfi.signalstats.YMIN', '-f', 'null', '-'])
  const m = out.match(/YMIN=(\d+(\.\d+)?)/); return m ? +m[1] < 200 : false
}
console.log('\n[1/5] disclosure end cards')
const fd = await ensureFonts()
await withChrome(async (browser) => {
  const svg = readFileSync(join(REPO, 'docs/brand/logos/tag-mark.svg'), 'utf8').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')
  for (const ad of ads) {
    const png = join(WORK, 'frames', `${ad.name}-end-original.png`)
    await lastFrame(ad.srcOrig, png)
    ad.discOriginal = await hasDisclosure(png)
    ad.src = ad.srcOrig; ad.discAction = 'present on the original'
    if (!ad.discOriginal) {
      const text = DISCLOSURE_END[ad.kind]
      const disc = join(WORK, 'src', `${ad.name}-disclosure.png`)
      await shot(browser, pageDisclosure(fd, svg, text), disc, { w: 1080, h: 1920, transparent: true })
      const dur = (await probe(ad.srcOrig)).dur, start = +(dur - 2.6).toFixed(2)
      ad.src = join(WORK, 'src', `${ad.name}.mp4`)
      if (!fresh(ad.src, ad.srcOrig)) {
        await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', ad.srcOrig, '-loop', '1', '-framerate', '30', '-i', disc, '-filter_complex',
          `[1:v]format=rgba,fade=t=in:st=${start}:d=0.3:alpha=1[d];[0:v][d]overlay=0:0:enable='gte(t,${start})':shortest=1,format=yuv420p[v]`,
          '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '14', '-preset', 'medium', '-r', '30', '-c:a', 'copy', '-movflags', '+faststart', ad.src])
      }
      ad.discAction = `ADDED "${text}" over the last ${(dur - start).toFixed(1)} s end card (original had only the Beta pill)`
    }
    const after = join(WORK, 'frames', `${ad.name}-end.png`)
    await lastFrame(ad.src, after)
    ad.discOk = await hasDisclosure(after); ad.endFrame = after
    console.log(`  ${ad.name}: original ${ad.discOriginal ? 'has it' : 'LACKED it'}; final ${ad.discOk ? 'ok' : 'STILL MISSING'}`)
    if (!ad.discOk) throw new Error(`${ad.name}: disclosure not detected after fix`)
  }
})

// ---------- 2. exports ----------
console.log('\n[2/5] exports')
// AudioToolbox AAC in CBR mode really delivers 128 kbps; ffmpeg's native aac encoder only targets it and lands near 75 kbps on speech.
const HAS_AAC_AT = (await runOut(FFMPEG, ['-hide_banner', '-encoders'])).includes('aac_at')
const AUDIO = HAS_AAC_AT ? ['-c:a', 'aac_at', '-aac_at_mode', 'cbr', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '128k']
const H264 = ['-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.2', '-pix_fmt', 'yuv420p', '-crf', '18', '-maxrate', '10M', '-bufsize', '20M', '-preset', 'medium', '-r', '30', '-g', '60',
  ...AUDIO, '-ar', '48000', '-ac', '2', '-movflags', '+faststart']
const enc = (src, out, vf, extraIn = [], fc) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, ...extraIn, ...(fc ? ['-filter_complex', fc, '-map', '[v]', '-map', '0:a?'] : ['-vf', vf]), ...H264, '-shortest', out])
// LinkedIn logo: tag mark at 96x128 for the left pillar.
const logoPng = join(WORK, 'src', 'linkedin-logo.png')
await withChrome((b) => shot(b, `<style>html,body{margin:0;width:96px;height:128px;background:transparent}svg{display:block}</style>${readFileSync(join(REPO, 'docs/brand/logos/tag-mark.svg'), 'utf8').replace(/ width="\d+" height="\d+"/, ' width="96" height="128"')}`, logoPng, { w: 96, h: 128, transparent: true }))
const jobs = []
for (const ad of ads) {
  const master = join(OUT, 'tiktok', `${ad.name}.mp4`)
  jobs.push(async () => {
    if (!fresh(master, ad.src)) await enc(ad.src, master, 'scale=1080:1920:flags=lanczos,setsar=1,fps=30')
    for (const p of ['reels', 'shorts', 'facebook']) { const o = join(OUT, p, `${ad.name}.mp4`); if (!fresh(o, master)) copyFileSync(master, o) }
  })
  jobs.push(async () => { // YouTube feed: 1080x1920 scaled to height 1080 (608 wide), centred on Clay
    const o = join(OUT, 'youtube-feed', `${ad.name}.mp4`)
    if (!fresh(o, ad.src)) await enc(ad.src, o, `scale=-2:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:0:color=${CLAY},setsar=1,fps=30`)
  })
  jobs.push(async () => { // LinkedIn 4:5: scaled to height 1350 (760 wide), pillarboxed on Clay, logo in the left pillar
    const o = join(OUT, 'linkedin', `${ad.name}.mp4`)
    if (!fresh(o, ad.src)) await enc(ad.src, o, null, ['-i', logoPng], `[0:v]scale=-2:1350:flags=lanczos,pad=1080:1350:(ow-iw)/2:0:color=${CLAY},setsar=1,fps=30[b];[b][1:v]overlay=32:32:format=auto,format=yuv420p[v]`)
  })
}
let done = 0
await pool(jobs, 3, async (j) => { await j(); process.stdout.write(`\r  ${++done}/${jobs.length} encode jobs`) })
console.log()

// ---------- 3. thumbnails ----------
console.log('[3/5] thumbnails')
for (const ad of ads) {
  const o = join(OUT, 'thumbnails', `${ad.name}.png`)
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(ad.thumb), '-i', join(OUT, 'tiktok', `${ad.name}.mp4`), '-frames:v', '1', '-update', '1', '-vf', 'scale=1080:1920', o])
  ad.thumbFile = o
}
await withChrome(async (browser) => {
  await shot(browser, sheetHtml(fd, 'Silly Travel Tool posting pack: thumbnails (1080x1920)', ads.map((a) => ({ file: a.thumbFile, label: a.name, sub: `${a.kind}, frame at ${a.thumb}s` })), 5, 300),
    join(OUT, 'thumbnails', 'contact-sheet.png'), { w: 1600, h: 900, fullPage: true })
  await shot(browser, sheetHtml(fd, 'Last-second frame of every export (disclosure end cards)', ads.map((a) => ({ file: a.endFrame, label: a.name, sub: a.discOriginal ? 'disclosure already on the ad' : 'disclosure line added by build-pack.mjs' })), 5, 300),
    join(OUT, 'proof', 'end-frames-sheet.png'), { w: 1600, h: 900, fullPage: true })
})

// ---------- 4. probe ----------
console.log('[4/5] ffprobe')
const rows = []
const platDirs = [['tiktok', 'TikTok'], ['reels', 'Reels'], ['shorts', 'YouTube Shorts'], ['youtube-feed', 'YouTube feed 16:9'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn 4:5']]
for (const ad of ads) for (const [d, label] of platDirs) {
  const f = join(OUT, d, `${ad.name}.mp4`), p = await probe(f)
  const want = d === 'youtube-feed' ? '1920x1080' : d === 'linkedin' ? '1080x1350' : '1080x1920'
  const ok = p.wh === want && p.fps === 30 && p.dur < 60 && /h264 High/.test(p.codec) && /aac/.test(p.audio) && p.pix === 'yuv420p'
  rows.push({ file: `${d}/${ad.name}.mp4`, label, ...p, ok })
}
const bad = rows.filter((r) => !r.ok)
const table = ['| File | Codec | Size | fps | Duration | Video kbps | Audio | MB | Spec |', '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.file} | ${r.codec} ${r.pix} | ${r.wh} | ${r.fps} | ${r.dur} s | ${r.vkbps} | ${r.audio} | ${r.mb} | ${r.ok ? 'pass' : 'FAIL'} |`)].join('\n')
writeFileSync(join(OUT, 'proof', 'ffprobe-table.md'), table + '\n')
console.log(`  ${rows.length} exports probed, ${bad.length} failing`)
if (bad.length) { console.log(bad.map((b) => b.file).join('\n')); process.exitCode = 1 }

// ---------- 5. pack ----------
console.log('[5/5] POSTING_PACK.md')
function voiceNote() {
  const readme = [join(REPO, 'video/ads/README.md'), join(videoRoot, 'ads/README.md')].find(exists)
  if (!readme) return 'See video/ads/README.md.'
  const rowsMd = readFileSync(readme, 'utf8').split('\n').filter((l) => /^\| (Ana|Marcus|Linda|Dev),/.test(l))
  const v = rowsMd.map((l) => { const c = l.split('|').map((s) => s.trim()); return `${c[1].split(',')[0]}: ${c[3]}` })
  return v.length ? v.join('; ') : 'See video/ads/README.md.'
}
const voices = voiceNote()

// schedule: kind order, at most two a day, 7 days. Extra posts go to days 4, 7, 3, 5, 2, 6, 1.
function schedule(list) {
  const n = list.length; if (n > 14) throw new Error('more than 14 ads: cannot keep two a day over 7 days')
  const counts = Array(7).fill(n >= 7 ? 1 : 0)
  if (n < 7) for (let i = 0; i < n; i++) counts[i] = 1
  else for (const i of [3, 6, 2, 4, 1, 5, 0].slice(0, n - 7)) counts[i] = 2
  const days = []; let k = 0
  counts.forEach((c) => days.push(list.slice(k, (k += c))))
  return days
}
const DAYS = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']
const days = schedule(ads)
const WEEKDAY_ONLY = new Set(['linkedin'])
const schedRows = days.map((day, i) => {
  const cells = ['tiktok', 'reels', 'shorts', 'facebook', 'linkedin'].map((p) => {
    if (WEEKDAY_ONLY.has(p) && (DAYS[i] === 'Sat' || DAYS[i] === 'Sun')) return 'skip (weekend)'
    return day.map((a, j) => `${PLATFORMS[p].slots[j]}${day.length > 1 ? ` (${j + 1})` : ''}`).join(' / ')
  })
  return `| ${i + 1} | ${DAYS[i]} | ${day.map((a) => `\`${a.name}\``).join(' + ') || 'rest day'} | ${cells.join(' | ')} |`
})

// captions lint (also run on the final text): no free, no prices, UTMs present, 3-5 hashtags, beta line.
const lint = []
for (const ad of ads) for (const p of Object.keys(PLATFORMS)) {
  const c = captionFor(p, ad), tags = c.match(/#\w+/g) || []
  if (/\bfree\b/i.test(c)) lint.push(`${ad.name}/${p}: contains "free"`)
  if (/[$€£]\s?\d|\b\d+[.,]\d{2}\b|\bper (month|year)\b/i.test(c)) lint.push(`${ad.name}/${p}: looks like a price`)
  if (tags.length < 3 || tags.length > 5) lint.push(`${ad.name}/${p}: ${tags.length} hashtags`)
  if (/#ad\b/i.test(c)) lint.push(`${ad.name}/${p}: #ad without paid promotion`)
  if (!c.includes(BETA_LINE)) lint.push(`${ad.name}/${p}: beta line missing`)
  const u = c.match(/https:\/\/sillytraveltool\.com\/beta\/\?\S+/)?.[0] || ''
  for (const k of ['utm_source=' + PLATFORMS[p].utm, 'utm_medium=social', 'utm_campaign=beta_launch', 'utm_content=' + ad.name]) if (!u.includes(k)) lint.push(`${ad.name}/${p}: link lacks ${k}`)
}
if (lint.length) { console.error('caption lint failed:\n' + lint.join('\n')); process.exit(1) }

const adSection = (ad) => {
  const silent = ad.kind === 'proof' ? ' **Audio**: synthesised 120 bpm rhythm bed (no voice). Fine to post as is; swap in a platform-licensed sound in the app if you prefer.' : ' **Audio**: synthetic voice-over over the synthesised rhythm bed.'
  const out = [`### \`${ad.name}\`: ${ad.title}`, '',
    `- Kind: ${ad.kind === 'proof' ? 'product-proof cut' : ad.kind === 'persona' ? 'fictional-traveller voice-over ad' : 'AI-generated creator ad'}. Thumbnail \`thumbnails/${ad.name}.png\`.${silent}`,
    `- End-card disclosure: ${ad.discAction}.`,
    `- Pinned comment (post right after publishing): **${ad.q}**`, '']
  for (const p of Object.keys(PLATFORMS)) {
    const file = p === 'shorts' ? `shorts/${ad.name}.mp4\`, 16:9 feed variant \`youtube-feed/${ad.name}.mp4` : `${PLATFORMS[p].dir}/${ad.name}.mp4`
    out.push(`**${PLATFORMS[p].label}** (\`${file}\`)`, '', `Labels: ${labelsFor(p, ad)}${p === 'linkedin' || !ad.synthetic ? '' : ' Do not add #ad unless the post is boosted or paid.'}`, '', '```text', captionFor(p, ad), '```', '')
  }
  return out.join('\n')
}

const pack = `# Silly Travel Tool posting pack

Generated by \`video/posting/build-pack.mjs\` on ${new Date().toISOString().slice(0, 10)}. **Nothing here has been posted, scheduled or uploaded.** Every file is ready for you to post by hand (or load into a native scheduler) after the checklist below.

Source rules: \`docs/audit-pack/04_GROWTH_SOCIAL_MARKETING.md\` section 4 (product proof first, one tracked link, no immediate posting, accuracy gate, AI-generated creators labelled).

## What is in the pack (${ads.length} ads)

| Ad | Kind | Length | Voice |
|---|---|---|---|
${ads.map((a) => `| \`${a.name}\` | ${a.kind} | ${rows.find((r) => r.file === `tiktok/${a.name}.mp4`).dur} s | ${a.kind === 'proof' ? 'rhythm bed only (synthesised; licensed sound optional)' : a.kind === 'persona' ? 'synthetic voice-over' : 'creator voice generated with the video'} |`).join('\n')}

Persona voices at build time (from \`video/ads/README.md\`): ${voices}. If another session re-renders the voice-overs, re-run \`node video/posting/build-pack.mjs --force\`.

Folder layout (outside the repo, MP4s and PNGs not committed): \`tiktok/\`, \`reels/\`, \`shorts/\`, \`facebook/\` (1080x1920, identical encode, one file per platform), \`youtube-feed/\` (1920x1080 on Clay), \`linkedin/\` (1080x1350 4:5, Clay pillars, logo top-left), \`thumbnails/\` (1080x1920 PNG per ad plus \`contact-sheet.png\`), \`proof/\` (\`ffprobe-table.md\`, \`end-frames-sheet.png\`).

## Decisions and things to know

1. **Disclosure end cards.** ${ads.filter((a) => !a.discOriginal).length ? `${ads.filter((a) => !a.discOriginal).map((a) => `\`${a.name}\``).join(', ')} had no disclosure line (Beta pill only). Added with ffmpeg as a text frame over the last 2.6 s of the existing end card: "${DISCLOSURE_END.proof}" There is no synthetic person in these cuts, so "Fictional traveller" would be false.` : 'All ads already had the line.'} The persona ads carry "Fictional traveller. ${BETA_LINE}"${WITH_CREATORS ? ` and the creator ads "AI-generated creator. ${BETA_LINE}"` : ''} on their own end cards (verified from the last frame of every file; see \`proof/end-frames-sheet.png\`).
2. **The word "free".** Captions contain none and the ads say none. ${WITH_CREATORS ? 'The two creator ads still say it on screen and in the creator\'s voice ("generous free plan to start on", the one phrase you allowed on 2026-10-25). Before posting those two, confirm the plan really is generous at launch (open item 3 in \`video/generated/campaign-plan.md\`). ' : 'The AI-generated creator ads are not in this pack (pass \`--with-creators\` to include them). '}The site, terms and store copy also still say free in places; not touched here.
3. **#ad.** Left out of every caption because no paid promotion is planned. The creator plan suggested #ad on every video; add it only if you boost or pay a creator-style placement.
4. **Audio and cuts (v2).** Product-proof cuts carry a synthesised 120 bpm rhythm bed (sine and noise bursts made with ffmpeg, no samples, nothing to license) and a ding when a forwarded booking lands in the trip. Persona ads put the synthetic voice-over over the same bed, ducked under the voice. Swap in a licensed in-app sound if you want a real track. ${WITH_CREATORS ? 'The persona ad Marcus (business traveller) and the creator ad Marcus Sterling (family organiser) are different fictional people with the same first name; do not post them back to back.' : ''}
5. **Demo data.** App footage shows fixture data (Sam Rivera, Maria and Tom Silva). The caption line "Real app footage, demo data." is deliberate.
6. **Links.** All captions carry \`${BASE_URL}\` with UTMs. TikTok and Instagram captions are not clickable: also put the URL in the bio for the posting day (or use the Reels link sticker) and keep the caption copy as is.
7. **Exports.** TikTok, Reels, Shorts and Facebook share one encode (1080x1920, 30 fps, H.264 High L4.2, yuv420p, AAC 128k stereo, CRF 18 capped at 10 Mbps, faststart). Re-encoded once from the source cut; no text burned in by the exports.
8. **Posting times** are starting points from general platform patterns, not Silly Travel Tool data. Treat week 1 as the test and move slots to whatever your own analytics show.

## Pre-post checklist (every post)

- [ ] Caption has no "free" and no prices or plan costs anywhere (caption, pinned comment, thumbnail, bio).
- [ ] The disclosure end card shows at the end of the video you are uploading (last second of the file: "Real app footage.", "Fictional traveller." or "AI-generated creator.", plus "${BETA_LINE}").
- [ ] The link is the UTM link for that platform and ad (utm_source, utm_medium=social, utm_campaign=beta_launch, utm_content=ad name) and opens \`${BASE_URL}\`.
- [ ] Platform AI label set where the ad has a synthetic creator or voice (TikTok "AI-generated content", Instagram and Facebook "AI info", YouTube "Altered or synthetic content" = Yes); LinkedIn uses the caption line.
- [ ] No #ad unless the post is paid or boosted.
- [ ] Product-proof cuts carry only the synthesised rhythm bed: post as is, or swap in a licensed in-app sound, volume low.
- [ ] Accuracy gate: every feature named in the caption is in the video and live in the app today; the beta line is in the caption.
- [ ] Pinned comment posted straight after publishing; reply to early comments the same day, no bots, no auto-engagement.
- [ ] Not posted immediately after upload: scheduled in the platform's native scheduler or posted at the slot below.

## 7-day schedule (two posts a day maximum)

Weekdays assume Day 1 is a Tuesday; if you start on another day keep the order and the slots. Order: product-proof cuts, then persona ads, then creator ads. Times are Pacific. "(1)" and "(2)" mean first and second post of that day. LinkedIn is weekdays only: the ads that fall on a weekend skip LinkedIn in week 1 (add them on Day 8 and Day 9, Tue and Wed at 8:00 am, if you want them there). The 16:9 YouTube feed files are optional extras; do not post the same ad as a Short and as a feed video on the same day.

| Day | Weekday | Video | TikTok | Reels | Shorts | Facebook | LinkedIn |
|---|---|---|---|---|---|---|---|
${schedRows.join('\n')}

Best-time starting points: ${Object.values(PLATFORMS).map((p) => `${p.label} ${p.when}`).join('; ')}.

## Captions, labels and pinned comments

Each block is ready to paste. Hashtags are the last line. LinkedIn copy is the same story in a calmer voice.

${ads.map(adSection).join('\n')}

## Appendix: ffprobe of every export

${rows.length} files, ${rows.length - bad.length} pass the spec (TikTok, Reels, Shorts and Facebook: 1080x1920, H.264 High, AAC, 30 fps, under 60 s; feed: 1920x1080; LinkedIn: 1080x1350).

${table}
`
writeFileSync(join(OUT, 'POSTING_PACK.md'), pack)
console.log(`\nwrote ${join(OUT, 'POSTING_PACK.md')}`)
