#!/usr/bin/env node
// STT product-proof ads: builds vertical 1080x1920 30fps H.264 cuts from the real app footage.
//
//   node build.mjs a|b|c|all [--footage DIR] [--out DIR] [--keep]
//   node build.mjs --variant persona:ana|marcus|linda|dev|all      (fictional-traveller voice-over ads)
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
const VARIANT = flag('variant', '')
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

// ---------- fictional-traveller voice-over ads ----------
// 0-2 s persona card, 2-18 s voice-over over footage (one scene per spoken line, captions reinforce the key
// phrase), 18-20.4 s result line, 20.4-22.9 s end card with disclosure. Voices: macOS `say` (offline, no
// generated video). With a voice file (voices/<persona>.<ext>, e.g. a Speechify export) the whole script is one
// recording: the phone section is as long as the speech, and scene cuts snap to the pauses nearest each line's
// expected position. Without one, each line is synthesised on its own with `say` into a fixed 16 s phone section.
// [x] = terracotta word.
const PHONE = 16, CARD = 2, RESULT = 2.4, END_P = 2.9, LEAD = 0.4, PRE = 0.3, GAP = [0.3, 0.9]
const TAIL = 0.5, RESULT_V = 1.8 // real-voice ads: result line starts 0.5 s after the last word; ~1.9 s later the end card
const VOICES = resolve(flag('voices', join(HERE, 'voices')))
const VOICE_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'aiff']
const DISCLOSURE = 'Fictional traveller. Silly Travel Tool is in beta.'
const PERSONAS = {
  ana: { name: 'Ana', who: 'Family organiser, five travellers', voice: 'Samantha', rate: 170,
    result: 'One trip. Every [seat].', file: 'ana-shared-trip', lines: [
      { say: 'Five people, five inboxes. I was the one chasing every booking.', clip: '02-forward-lands-in-trip', ss: 3, speed: 1.2, cap: 'Five people, five [inboxes].' },
      { say: 'Now everyone just forwards theirs to Goose.', clip: '02-forward-lands-in-trip', ss: 0.5, speed: 1, cap: 'Everyone forwards to [Goose].' },
      { say: 'One trip. One card for each shared flight, with every seat on it.', clip: '07-shared-trip-card', ss: 2.8, speed: 1, cap: 'One card, [every seat].' },
      { say: 'I finally stopped being the group’s search engine.', clip: '07-shared-trip-card', ss: 5, speed: 1, cap: 'One [trip] for the whole group.' },
    ] },
  marcus: { name: 'Marcus', who: 'Business traveller, early flights', voice: 'Daniel', rate: 175,
    result: 'Landed. Already [moving].', file: 'marcus-today-get-there', lines: [
      { say: 'Landing at six a.m., half asleep. Where do I go next?', clip: '05-today', ss: 0, speed: 0.9, cap: 'Landing at 6 am. Where [next]?' },
      { say: 'Today opens on what’s next, in local time.', clip: '05-today', ss: 0.6, speed: 0.8, cap: 'Today opens on what’s [next].' },
      { say: 'One tap on Get there, and I know how to reach it.', clip: '06-get-there', ss: 3.5, speed: 1, cap: 'One tap: [Get there].' },
      { say: 'No digging through email. I just go.', clip: '06-get-there', ss: 5.5, speed: 0.8, cap: 'No digging. [Local] time.' },
    ] },
  linda: { name: 'Linda', who: 'Three countries, one long trip', voice: 'Moira', rate: 175,
    result: 'Cross the border. Skip the [googling].', file: 'linda-tools-switch', lines: [
      { say: 'New country, new currency, new emergency number. I used to look it all up.', clip: '04-multicity-plan', ss: 0.5, speed: 1, cap: 'New country, new [currency].' },
      { say: 'Now my tools switch the moment the country does.', clip: '09-tools-switch', ss: 0, speed: 0.6, cap: 'Tools that [switch] by country.' },
      { say: 'The right currency, local phrases, ready to show.', clip: '09-tools-switch', ss: 2.5, speed: 0.6, cap: 'Right [currency], local phrases.' },
      { say: 'And SOS shows the numbers for wherever I am.', clip: '09-tools-switch', ss: 6.4, speed: 0.55, cap: '[SOS] for where you are.' },
    ] },
  dev: { name: 'Dev', who: 'Solo backpacker, hostel to hostel', voice: 'Rishi', rate: 170,
    result: 'One trip. Nothing to [hunt] for.', file: 'dev-forward-email', lines: [
      { say: 'Screenshots everywhere. Flights in my photos, hostels in my email.', clip: '01-inbox-first-run', ss: 0.8, speed: 1, cap: '[Screenshots] everywhere.' },
      { say: 'Now I just forward the confirmation to Goose.', clip: '01-inbox-first-run', ss: 2, speed: 1, cap: 'Forward the [confirmation].' },
      { say: 'It lands in the right trip, in local time.', clip: '02-forward-lands-in-trip', ss: 3.5, speed: 1.3, cap: 'Right trip. [Local] time.' },
      { say: 'Got a PDF or a screenshot? Paste it or upload it.', clip: '03-import-sheet', ss: 3, speed: 1, cap: 'Paste it or [upload] it.' },
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

const pageEnd = (fd, svg, disc = '') => `<style>${css(fd)}body{background:${C.page}}
.c{position:absolute;left:0;right:0;top:${disc ? 380 : 420}px;display:flex;flex-direction:column;align-items:center}
.logo{width:300px;height:400px;filter:drop-shadow(0 16px 24px rgba(120,80,50,.25))}
h1{font-family:'Space Grotesk';font-weight:700;font-size:96px;letter-spacing:-.03em;line-height:1;margin-top:56px}
.url{font-weight:600;font-size:46px;color:${C.accent};margin-top:26px;letter-spacing:-.005em}
.beta{margin-top:44px;background:${C.accentSoft};color:${C.accent};border-radius:999px;padding:12px 34px;font-weight:700;font-size:34px;letter-spacing:.06em;text-transform:uppercase}
.disc{margin-top:48px;max-width:760px;text-align:center;font-weight:500;font-size:36px;line-height:1.3;color:${C.muted};text-wrap:balance}</style>
<div class="c"><div class="logo">${svg}</div><h1>Silly Travel Tool</h1><div class="url">sillytraveltool.com</div><div class="beta">Beta</div>${disc ? `<div class="disc">${esc(disc)}</div>` : ''}</div>`

// persona card (0-2 s) and result line (18-20.4 s)
const personaStyle = (fd) => `<style>${css(fd)}body{background:${C.page}}
.c{position:absolute;left:0;right:0;top:440px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 90px}
.av{width:240px;height:240px;border-radius:50%;background:${C.accentSoft};color:${C.accent};display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:130px;box-shadow:0 14px 30px rgba(120,80,50,.16)}
h1{font-family:'Space Grotesk';font-weight:700;font-size:150px;letter-spacing:-.035em;line-height:1;margin-top:52px}
.who{font-weight:500;font-size:50px;line-height:1.25;color:${C.muted};margin-top:26px;text-wrap:balance}
.tag{margin-top:56px;background:${C.card};color:${C.ink};border-radius:999px;padding:14px 38px;font-weight:700;font-size:34px;letter-spacing:.04em;box-shadow:0 6px 16px rgba(120,80,50,.14)}
h2{font-family:'Space Grotesk';font-weight:700;font-size:104px;letter-spacing:-.03em;line-height:1.08;margin-top:56px;text-wrap:balance}
.tagsm{margin-top:56px;font-weight:600;font-size:34px;color:${C.muted}}</style>`
const pagePersona = (fd, p) => `${personaStyle(fd)}<div class="c"><div class="av">${esc(p.name[0])}</div><h1>${esc(p.name)}</h1><div class="who">${esc(p.who)}</div><div class="tag">Fictional traveller</div></div>`
const pageResult = (fd, p) => `${personaStyle(fd)}<div class="c" style="top:560px"><div class="av" style="width:150px;height:150px;font-size:80px">${esc(p.name[0])}</div><h2>${capHtml(p.result)}</h2><div class="tagsm">${esc(p.name)} · Fictional traveller</div></div>`

async function renderAssets(dir, variant, extra) {
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
  const svg = readFileSync(LOGO, 'utf8').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')
  await shot(pageBg(fd), 'bg')
  await shot(pageMask, 'mask', { clip: { x: 0, y: 0, width: SCR.w, height: SCR.h } })
  if (extra) await extra(shot, fd, svg)
  else await shot(pageEnd(fd, svg), 'end')
  for (let i = 0; i < variant.scenes.length; i++) await shot(pageCap(fd, variant.scenes[i].cap), `cap${i}`, { transparent: true })
  await browser.close()
}

// ---------- ffmpeg ----------
const loop = (len, file) => ['-loop', '1', '-framerate', FPS, '-t', len, '-i', file]

// Phone section: bg + scene clips (dissolved, rounded mask, frame) + caption pills.
// Returns inputs, filter graph, output label and the next free input index. `tail` extends the last scene
// so a following dissolve has footage to blend with.
function screenGraph(work, scenes, len, tail = 0) {
  const n = scenes.length, D = scenes.map((s) => s.dur)
  const inputs = [...loop(len, join(work, 'bg.png')), ...loop(len, join(work, 'mask.png'))]
  const fc = []
  scenes.forEach((s, i) => {
    const L = i < n - 1 ? s.dur + XF : s.dur + tail
    const clip = join(FOOTAGE, `${s.clip}-light.mp4`)
    if (!existsSync(clip)) throw new Error(`missing footage ${clip}`)
    inputs.push('-ss', s.ss, '-t', (L * s.speed + 0.5).toFixed(3), '-i', clip)
    fc.push(`[${2 + i}:v]setpts=PTS/${s.speed},fps=${FPS},scale=${SCR.w}:${SCR.h}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${L},trim=duration=${L.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[s${i}]`)
  })
  scenes.forEach((_, i) => inputs.push(...loop(D[i], join(work, `cap${i}.png`))))
  const capIdx = (i) => 2 + n + i

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
  scenes.forEach((s, i) => {
    const d = D[i]
    fc.push(`[${capIdx(i)}:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${(d - 0.2).toFixed(3)}:d=0.2:alpha=1,setpts=PTS+${t0.toFixed(3)}/TB[c${i}]`)
    fc.push(`[${label}][c${i}]overlay=0:0:eof_action=pass[b${i + 1}]`)
    label = `b${i + 1}`; t0 += d
  })
  return { inputs, fc, label, next: 2 + 2 * n }
}

const encode = (ff, inputs, fc, out, audio, total, outFile) => {
  const cmd = ['-y', '-v', 'error', ...inputs, ...audio.inputs,
    '-filter_complex', fc.join(';'), '-map', `[${out}]`, '-map', `${audio.map}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', FPS, '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', audio.bitrate, '-t', total, '-movflags', '+faststart', outFile].map(String)
  const r = spawnSync(ff, cmd, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${outFile}`)
}

async function build(key) {
  const v = VARIANTS[key]
  const ff = await ffmpegPath()
  const work = mkdtempSync(join(tmpdir(), `stt-ad-${key}-`))
  await renderAssets(work, v)

  const screenTotal = v.scenes.reduce((a, s) => a + s.dur, 0)
  const total = screenTotal + END
  const g = screenGraph(work, v.scenes, total)
  const endIdx = g.next
  g.inputs.push(...loop(END, join(work, 'end.png')))
  // end card
  g.fc.push(`[${endIdx}:v]format=rgba,fade=t=in:st=0:d=${XF}:alpha=1,setpts=PTS+${screenTotal.toFixed(3)}/TB[end]`)
  g.fc.push(`[${g.label}][end]overlay=0:0:eof_action=pass,format=yuv420p[out]`)

  mkdirSync(OUT, { recursive: true })
  const outFile = join(OUT, `stt-ad-${key}-${v.name}.mp4`)
  encode(ff, g.inputs, g.fc, 'out', { inputs: ['-f', 'lavfi', '-t', total, '-i', 'anullsrc=r=44100:cl=stereo'], map: endIdx + 1, bitrate: '96k' }, total, outFile)
  if (!KEEP) rmSync(work, { recursive: true, force: true }); else console.log('assets kept in', work)
  console.log(`built ${outFile} (${total}s)`)
}

// ---------- persona voice-over ----------
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a.map(String), { encoding: 'utf8', maxBuffer: 1 << 26, ...o }); if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`); return r }

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

// Schedule scenes from spoken-line lengths: speech i starts at sp[i] (phone-section time); the cut lands PRE s earlier.
function schedule(p, durs) {
  const n = durs.length, sum = durs.reduce((a, b) => a + b, 0)
  const gap = Math.min(GAP[1], (PHONE - LEAD - 0.5 - sum) / (n - 1))
  if (gap < GAP[0]) throw new Error(`${p.name}: voice-over too long (${sum.toFixed(1)} s of speech, gap ${gap.toFixed(2)} s); shorten the script or raise the rate`)
  const sp = []; let t = LEAD
  durs.forEach((d) => { sp.push(t); t += d + gap })
  const start = sp.map((x, i) => (i === 0 ? 0 : x - PRE))
  const dur = start.map((x, i) => (i < n - 1 ? start[i + 1] : PHONE) - x)
  return { sp, dur, end: sp[n - 1] + durs[n - 1] }
}

// Mix the lines on a timeline, loudnorm (two-pass, linear), short fade-out; returns the wav path.
function voiceTrack(ff, work, wavs, starts, total) {
  const inp = wavs.flatMap((w) => ['-i', w])
  const delays = starts.map((t, i) => `[${i}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`)
  const mix = `${delays.join(';')};${starts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${starts.length}:duration=longest:dropout_transition=0,volume=${starts.length},highpass=f=70,apad=whole_dur=${total}`
  const LN = 'I=-16:TP=-1.5:LRA=11'
  const m1 = run(ff, ['-y', '-hide_banner', ...inp, '-filter_complex', `${mix},loudnorm=${LN}:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-'])
  const j = JSON.parse(m1.stderr.slice(m1.stderr.lastIndexOf('{'), m1.stderr.lastIndexOf('}') + 1))
  const out = join(work, 'voice.wav')
  run(ff, ['-y', '-v', 'error', ...inp, '-filter_complex',
    `${mix},loudnorm=${LN}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,aresample=44100[o]`,
    '-map', '[o]', '-t', total, out])
  return out
}


// Voice file -> trimmed 44.1 kHz mono wav (leading/trailing silence removed); returns its duration and the pauses in it.
function prepVoiceFile(ff, file, wav) {
  run(ff, ['-y', '-v', 'error', '-i', file, '-ar', 44100, '-ac', 1,
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', wav])
  const raw = wav.replace(/\.wav$/, '.raw')
  run(ff, ['-y', '-v', 'error', '-i', wav, '-f', 's16le', raw])
  const dur = readFileSync(raw).length / 2 / 44100
  const sd = run(ff, ['-hide_banner', '-i', wav, '-af', 'silencedetect=n=-38dB:d=0.15', '-f', 'null', '-'])
  const starts = [...sd.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1])
  const ends = [...sd.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1])
  const pauses = starts.map((a, i) => ({ a, b: ends[i] ?? dur })).filter((q) => q.a > 0.3 && q.b < dur - 0.1)
  return { dur, pauses }
}

// One recording, n lines: line i is expected where its share of the words says; snap to the closest pause (<= 1.3 s away).
function splitByPauses(p, dur, pauses) {
  const w = p.lines.map((l) => l.say.split(/\s+/).length), tot = w.reduce((a, b) => a + b, 0)
  const bounds = []; let cum = 0
  for (let i = 0; i < w.length - 1; i++) {
    cum += w[i]
    const want = (dur * cum) / tot
    const cand = pauses.filter((q) => !bounds.includes(q)).sort((x, y) => Math.abs((x.a + x.b) / 2 - want) - Math.abs((y.a + y.b) / 2 - want))[0]
    if (cand && Math.abs((cand.a + cand.b) / 2 - want) <= 1.3) bounds.push(cand)
    else { console.warn(`warn ${p.name}: no pause near line ${i + 1}/${i + 2} boundary (${want.toFixed(1)} s); cut placed by word count`); bounds.push({ a: want, b: want }) }
  }
  bounds.sort((x, y) => x.a - y.a)
  return p.lines.map((_, i) => ({ s: i === 0 ? 0 : bounds[i - 1].b, e: i === w.length - 1 ? dur : bounds[i].a }))
}

async function buildPersona(key) {
  const p = PERSONAS[key]
  if (!p) throw new Error(`unknown persona "${key}" (${Object.keys(PERSONAS).join(', ')})`)
  const ff = await ffmpegPath()
  const work = mkdtempSync(join(tmpdir(), `stt-ad-${key}-`))
  const words = p.lines.reduce((a, l) => a + l.say.split(/\s+/).length, 0)
  if (words >= 60) throw new Error(`${p.name}: ${words} spoken words (limit 59)`)
  const vf = p.voiceFile ? resolve(VOICES, p.voiceFile) : VOICE_EXT.map((e) => join(VOICES, `${key}.${e}`)).find(existsSync)
  let wavs, sp, dur, phone, voiceName = p.voice
  if (vf && existsSync(vf)) {
    const wav = join(work, 'voicefile.wav')
    const { dur: vd, pauses } = prepVoiceFile(ff, vf, wav)
    const seg = splitByPauses(p, vd, pauses)
    wavs = [wav]
    sp = seg.map((x) => LEAD + x.s)
    phone = LEAD + vd + TAIL
    dur = sp.map((x, i) => (i < sp.length - 1 ? sp[i + 1] - PRE : phone) - (i === 0 ? 0 : x - PRE))
    voiceName = `${p.speechify || 'voice file'} (${vf.split('/').pop()}, ${(vd).toFixed(1)} s, ${(words / vd * 60).toFixed(0)} wpm)`
    console.log(`${p.name}: line starts ${sp.map((x) => x.toFixed(2)).join(', ')} s, last word ends ${(LEAD + vd).toFixed(2)} s`)
  } else {
    wavs = p.lines.map((l, i) => join(work, `line${i}.wav`))
    const durs = p.lines.map((l, i) => synth(ff, p.voice, p.rate, l.say, wavs[i]))
    const sch = schedule(p, durs)
    sp = sch.sp; dur = sch.dur; phone = PHONE
    console.log(`${p.name} (${p.voice}): speech ${durs.map((d) => d.toFixed(1)).join(' + ')} s`)
  }
  dur.forEach((d, i) => { if (d < 2.5) console.warn(`warn ${p.name}: scene ${i} only ${d.toFixed(2)} s on screen`) })
  const scenes = p.lines.map((l, i) => ({ ...l, dur: dur[i] }))
  const RES = vf ? RESULT_V : RESULT
  console.log(`${p.name} [${voiceName}]: ${words} words, phone section ${phone.toFixed(1)} s`)

  await renderAssets(work, { scenes }, async (shot, fd, svg) => {
    await shot(pagePersona(fd, p), 'card')
    await shot(pageResult(fd, p), 'result')
    await shot(pageEnd(fd, svg, DISCLOSURE), 'end')
  })

  const g = screenGraph(work, scenes, phone + XF, XF)
  const iCard = g.next, iRes = g.next + 1, iEnd = g.next + 2
  g.inputs.push(...loop(CARD + XF, join(work, 'card.png')), ...loop(RES, join(work, 'result.png')), ...loop(END_P, join(work, 'end.png')))
  const norm = (a, b) => `[${a}]fps=${FPS},format=yuv420p,settb=AVTB[${b}]`
  g.fc.push(norm(g.label, 'P'), norm(iCard, 'K'), norm(iRes, 'R'), norm(iEnd, 'E'))
  g.fc.push(`[K][P]xfade=transition=fade:duration=${XF}:offset=${CARD}[X1]`)
  g.fc.push(`[X1][R]xfade=transition=fade:duration=${XF}:offset=${(CARD + phone).toFixed(3)}[X2]`)
  g.fc.push(`[X2][E]xfade=transition=fade:duration=${XF}:offset=${(CARD + phone + RES - XF).toFixed(3)}[out]`)
  const len = CARD + phone + RES - XF + END_P

  const voice = voiceTrack(ff, work, wavs, vf ? [CARD + LEAD] : sp.map((t) => CARD + t), len)
  mkdirSync(OUT, { recursive: true })
  const outFile = join(OUT, `stt-ad-persona-${p.file}.mp4`)
  encode(ff, g.inputs, g.fc, 'out', { inputs: ['-i', voice], map: iEnd + 1, bitrate: '128k' }, len, outFile)
  if (!KEEP) rmSync(work, { recursive: true, force: true }); else console.log('assets kept in', work)
  console.log(`built ${outFile} (${len.toFixed(1)} s)`)
}

if (VARIANT) {
  const [kind, name] = VARIANT.split(':')
  if (kind !== 'persona') throw new Error(`unknown variant "${VARIANT}" (use persona:<name>|all)`)
  for (const k of name === 'all' ? Object.keys(PERSONAS) : [name]) await buildPersona(k)
} else for (const k of which === 'all' ? ['a', 'b', 'c'] : [which]) await build(k)
