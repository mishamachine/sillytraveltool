// Round 2: "Arcade" (a real 32 x 32 sprite) and "Waddle" (silly but cute), after the owner passed on round 1.
// Run: node docs/brand/mascot-options/build2.mjs
// Sprites are pixel grids exported as true PNGs (nearest-neighbour, integer scales) and as crisp SVG rects.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { L, DK, PALETTES, svg, ol, tagMark, appTile } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// =============================================================================================
// A. ARCADE
// =============================================================================================
// K ink · W cream · S shade · Y beak and feet · A terracotta (scarf, lower beak) · B sky (title screen only)
const ARCADE_PALETTES = {
  nes: { name: 'NES', K: L.ink, W: L.card, S: L.lineStrong, Y: L.beak, A: L.accent, B: L.info },
  // Game Boy: four greens from the success tokens (ink, success, dark-mode success, success-soft).
  gb: { name: 'Game Boy', K: L.ink, W: '#E7F2EC', S: '#86C9A0', Y: '#86C9A0', A: '#2D6E4A', B: '#2D6E4A' },
}

const HEAD = [
  '................................',
  '..............KKKKKK............',
  '............KKWWWWWWKK..........',
  '...........KWWWWWWWWWWK.........',
  '..........KWWWWWWWWWWWWK........',
  '..........KWWWWWWWWWWWWK........',
  '.........KWWWWWWWWWWWWWWK.......',
  '.........KWWWWWWWWGKKWWWK.......',
  '.........KWWWWWWWWKKKWWWWKKKK...',
  '.........KWWWWWWWWKKKWWWWYYYYK..',
  '.........KWWWWWWWWWWWWWWWYYYYYK.',
  '.........KWSWWWWWWWWWWWWKKKKKK..',
  '.........KWSWWWWWWWWWWWWAAAAK...',
  '..........KSWWWWWWWWWWWWKKKK....',
  '..........KSSWWWWWWWWWWWK.......',
  '.....KKK...KSSWWWWWWWWWK........',
]
const BODY = [
  '....KAAAKKKKAAAAAAAAAAAK........',
  '.....KAAAAAAAAAAAAAAAAAK........',
  '.KK...KKKKKAAAAAAAAAAAKKK.......',
  '.KWK..KKWWWWWWWWWWWWWWWWWK......',
  '.KWWKKWWWWWWWWWWWWWWWWWWWWK.....',
  '.KWWWWWWSSSSSSSWWWWWWWWWWWK.....',
  '.KWWWWWSWWWWWWWSWWWWWWWWWWWK....',
  '..KWWWWWSWWWWWWWSWWWWWWWWWWK....',
  '..KWWWWWWSSSSSSSWWWWWWWWWWSK....',
  '...KSWWWWWWWWWWWWWWWWWWWWSK.....',
  '....KSSWWWWWWWWWWWWWWWWSSK......',
  '.....KKKKKKKKKKKKKKKKKKKK.......',
]
const LEGS = {
  stand: [
    '..........KYK....KYK............',
    '.........KYYYK..KYYYK...........',
    '.........KYYYYK.KYYYYK..........',
    '..........KKKK...KKKK...........',
  ],
  walkA: [
    '........KYK........KYK..........',
    '.......KYYYK......KYYYK.........',
    '.......KYYYYK.....KYYYYK........',
    '........KKKK.......KKKK.........',
  ],
  walkB: [
    '..........KYK....KYK............',
    '..........KYYYK..KYK............',
    '..........KKKKK.KYYYYK..........',
    '................KKKKK...........',
  ],
}
const EYE_SHUT = ['.........KWWWWWWWWWWWWWWWK.......', '.........KWWWWWWWWKKKWWWWKKKK...', '.........KWWWWWWWWWWWWWWWYYYYK..']
const HONK_HEAD = [
  '.........KWWWWWWWWGKKWWWK.......',
  '.........KWWWWWWWWKKKWWWWKKKKK..',
  '.........KWWWWWWWWKKKWWWWYYYYYK.',
  '.........KWWWWWWWWWWWWWWKYYYYK..',
  '.........KWSWWWWWWWWWWWWKAAAK...',
  '.........KWSWWWWWWWWWWWWKKAAAK..',
  '..........KSWWWWWWWWWWWWWKKKK...',
]
const pad = (rows, w = 32) => rows.map(r => r.padEnd(w, '.').slice(0, w))
function frame(name) {
  let head = [...HEAD]
  if (name === 'blink') head.splice(7, 3, ...EYE_SHUT)
  if (name === 'honk') head.splice(7, 7, ...HONK_HEAD)
  const legs = LEGS[name === 'walkA' ? 'walkA' : name === 'walkB' ? 'walkB' : 'stand']
  return pad([...head, ...BODY, ...legs])
}
// Honk: the sprite plus a pixel speech bubble saying HONK, on a 48 x 32 canvas.
const FONT = {
  H: ['K.K', 'K.K', 'KKK', 'K.K', 'K.K'], O: ['KKK', 'K.K', 'K.K', 'K.K', 'KKK'],
  N: ['K..K', 'KK.K', 'K.KK', 'K..K', 'K..K'], K: ['K.K', 'K.K', 'KK.', 'K.K', 'K.K'], '!': ['K', 'K', 'K', '.', 'K'],
}
function honkFrame() {
  const g = frame('honk').map(r => r.padEnd(48, '.').split(''))
  const put = (x, y, c) => { if (y >= 0 && y < 32 && x >= 0 && x < 48) g[y][x] = c }
  // bubble x 27..47, y 0..10, tail toward the beak
  for (let x = 28; x <= 46; x++) { put(x, 0, 'K'); put(x, 8, 'K'); for (let y = 1; y < 8; y++) put(x, y, 'W') }
  for (let y = 1; y < 8; y++) { put(27, y, 'K'); put(47, y, 'K') }
  put(28, 9, 'K'); put(29, 9, 'K'); put(28, 10, 'K'); put(29, 9, 'W'); put(30, 9, 'K'); put(29, 8, 'W')
  let x = 29
  for (const ch of 'HONK!') {
    FONT[ch].forEach((row, dy) => [...row].forEach((c, dx) => { if (c === 'K') put(x + dx, 2 + dy, 'A') }))
    x += FONT[ch][0].length + 1
  }
  return g.map(r => r.join(''))
}
// Title screen: the idle sprite in a pixel luggage tag with three lives, 40 x 52.
function titleBadge() {
  const W = 40, H = 52
  const g = Array.from({ length: H }, () => Array(W).fill('.'))
  const inTag = (x, y) => {
    if (x < 1 || x > 38 || y < 1 || y > 50) return false
    const top = 1 + Math.max(0, 9 - x, x - 30) // chamfered top corners
    return y >= top && !(y === 50 && (x === 1 || x === 38))
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inTag(x, y)) g[y][x] = 'A'
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== 'A') continue
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inTag(x + dx, y + dy))
    if (n) g[y][x] = 'K'
  }
  // punched hole and string
  for (const [x, y] of [[19, 4], [20, 4], [18, 5], [21, 5], [18, 6], [21, 6], [19, 7], [20, 7]]) g[y][x] = 'K'
  for (const [x, y] of [[19, 5], [20, 5], [19, 6], [20, 6]]) g[y][x] = '.'
  // window: sky behind the sprite
  for (let y = 10; y < 44; y++) for (let x = 3; x < 37; x++) g[y][x] = (y === 10 || y === 43 || x === 3 || x === 36) ? 'K' : 'B'
  frame('idle').forEach((row, dy) => [...row].forEach((c, dx) => { if (c !== '.') g[11 + dy][4 + dx] = c }))
  // three lives
  const heart = ['K.K', 'KKK', '.K.']
  for (let i = 0; i < 3; i++) heart.forEach((row, dy) => [...row].forEach((c, dx) => { if (c === 'K') g[45 + dy][13 + i * 6 + dx] = 'W' }))
  return g.map(r => r.join(''))
}
// 12 x 12 sprite for 24 px slots (drawn at 2x).
const ARCADE_ICON = [
  '....KKKK....',
  '...KWWWWK...',
  '...KWWWKWKKK',
  '...KWWWWWYYK',
  '...KWWWWKKK.',
  '...KAAAAK...',
  'KK.KWWWWWK..',
  'KWKWWWWWWWK.',
  'KWWWSSSWWWK.',
  '.KKKKKKKKK..',
  '...YY..YY...',
  '...YY..YY...',
]

const ARCADE_FRAMES = { idle: frame('idle'), blink: frame('blink'), walkA: frame('walkA'), walkB: frame('walkB'), honk: honkFrame(), title: titleBadge(), icon: ARCADE_ICON }

// ---- Pixel output ----
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
function pngFromGrid(rows, pal, scale = 1, bg) {
  const h = rows.length, w = rows[0].length, W = w * scale, H = h * scale
  const raw = Buffer.alloc((W * 4 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const ch = rows[Math.floor(y / scale)][Math.floor(x / scale)]
      const col = pal[ch] || bg
      const o = y * (W * 4 + 1) + 1 + x * 4
      if (col) { const [r, g, b] = hex(col); raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255 }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function svgFromGrid(rows, pal, bg) {
  const h = rows.length, w = rows[0].length
  let r = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''
  rows.forEach((row, y) => {
    // merge horizontal runs of one colour into one rect
    let x = 0
    while (x < w) {
      const ch = row[x], col = pal[ch]
      let e = x + 1
      while (e < w && row[e] === ch) e++
      if (col) r += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${col}"/>`
      x = e
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 8}" height="${h * 8}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${r}</svg>\n`
}
// App icon: the title-screen tag at 4x on a terracotta square (256 x 256).
function arcadeAppIcon(pal) {
  const t = svgFromGrid(ARCADE_FRAMES.title, pal).replace(/<svg[^>]*>/, '').replace('</svg>\n', '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64" shape-rendering="crispEdges">` +
    `<rect width="64" height="64" fill="${pal === ARCADE_PALETTES.gb ? pal.A : L.accent}"/><g transform="translate(12 6)">${t}</g></svg>\n`
}

// =============================================================================================
// B. WADDLE (silly but cute)
// =============================================================================================
const W_BODY = 'M128 104 C180 100 218 138 216 178 C214 212 182 226 132 226 C84 226 50 212 48 176 C46 140 78 108 128 104 Z'
const foot = (p, x, y, r = 0) =>
  `<path transform="translate(${x} ${y}) rotate(${r})" d="M-24 4 C-26 -6 -6 -10 6 -8 C14 -16 30 -14 27 -5 C38 -5 38 6 29 7 C33 15 18 17 11 11 C0 15 -22 14 -24 4 Z" fill="${p.mono ? p.body : p.beak2}" ${ol(p, 6)}/>`
const leg = (p, x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${p.line}" stroke-width="20" stroke-linecap="round"/>` +
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${p.mono ? p.body : p.beak2}" stroke-width="8" stroke-linecap="round"/>`
// Eye whites stay light in dark mode so the big eyes keep reading; in one colour they take the ground.
const white = p => p.name === 'dark' ? DK.ink : p.mono ? p.body : L.card
const pupil = p => p.name === 'dark' ? DK.page : p.line
function eyeOpen(p, cx, cy, look = [6, 6], r = 12) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="22" ry="27" fill="${white(p)}" ${ol(p, 6)}/>` +
    `<circle cx="${cx + look[0]}" cy="${cy + look[1]}" r="${r}" fill="${pupil(p)}"/>` +
    `<circle cx="${cx + look[0] + 4}" cy="${cy + look[1] - 5}" r="4" fill="${white(p)}"/>`
}
// The lazy lid: the top half of the eye covered by a droopy, slightly tilted eyelid.
const lazyLid = (p, cx, cy) =>
  `<path d="M${cx - 23} ${cy + 2} C${cx - 22} ${cy - 34} ${cx + 22} ${cy - 34} ${cx + 23} ${cy - 2} C${cx + 8} ${cy + 3} ${cx - 8} ${cy + 5} ${cx - 23} ${cy + 2} Z" fill="${p.body}" ${ol(p, 6)}/>`
const spiral = (p, cx, cy) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="22" ry="27" fill="${white(p)}" ${ol(p, 6)}/>` +
  `<path d="M${cx} ${cy} m-2 0 a3 3 0 1 1 5 2 a7 7 0 1 1 -11 -6 a11 11 0 1 1 3 18 a14 14 0 0 1 -9 -12" stroke="${pupil(p)}" stroke-width="4" stroke-linecap="round"/>`
const tuft = p => `<path d="M122 26 C112 8 128 0 134 14 C136 2 152 2 146 20 M140 22 C150 12 160 18 154 26" stroke="${p.line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
const head = p => `<circle cx="128" cy="82" r="60" fill="${p.body}" ${ol(p)}/>`
const blush = p => p.mono ? '' : `<ellipse cx="86" cy="112" rx="15" ry="9" fill="${p.blush}" opacity=".3"/>`
const beakGrin = p =>
  `<path d="M146 112 L214 118 C210 134 180 142 160 134 C150 130 146 122 146 112 Z" fill="${p.mono ? p.body : p.beak2}" ${ol(p, 6)}/>` +
  `<path d="M138 90 C154 78 184 80 206 90 C220 96 232 104 232 112 C232 120 222 122 212 120 L146 114 C136 108 134 98 138 90 Z" fill="${p.mono ? p.body : p.beak}" ${ol(p, 6)}/>` +
  `<path d="M146 112 Q138 112 134 104" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>` +
  `<circle cx="190" cy="96" r="3" fill="${p.line}"/>`
const scarf = (p, tail = 'down') =>
  `<path d="M78 128 C108 146 150 146 182 124 L186 142 C152 164 106 164 76 146 Z" fill="${p.acc}" ${ol(p, 6)}/>` +
  (tail === 'down'
    ? `<path d="M160 148 C168 170 160 186 172 202 L188 192 C178 178 184 162 178 142 Z" fill="${p.acc}" ${ol(p, 6)}/>`
    : `<path d="M86 142 C66 146 50 136 34 144 L30 128 C48 120 64 132 84 128 Z" fill="${p.acc}" ${ol(p, 6)}/>`) +
  `<circle cx="170" cy="146" r="10" fill="${p.acc}" ${ol(p, 6)}/>`
const chest = p => p.mono ? '' : `<ellipse cx="148" cy="176" rx="44" ry="36" fill="${p.hi}" opacity="${p.name === 'dark' ? '.35' : '1'}"/>`

function waddle(p, pose = 'proud') {
  if (pose === 'proud') {
    return (
      leg(p, 104, 216, 100, 230) + leg(p, 152, 216, 156, 230) + foot(p, 98, 234, -6) + foot(p, 160, 234, 6) +
      `<path d="M70 148 C40 152 34 196 70 198 C64 184 70 168 84 162 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
      `<path d="M194 150 C226 156 228 196 194 196 C200 182 196 166 182 160 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
      `<path d="${W_BODY}" fill="${p.body}" ${ol(p)}/>` + chest(p) +
      `<path d="M126 170 Q132 176 126 182 M142 186 Q148 192 142 198" stroke="${p.line}" stroke-width="4" stroke-linecap="round" opacity=".5"/>` +
      tuft(p) + head(p) + scarf(p, 'down') + blush(p) +
      eyeOpen(p, 102, 76, [6, 8]) + eyeOpen(p, 150, 74, [6, 8]) + lazyLid(p, 150, 74) +
      `<path d="M80 42 Q96 34 112 42" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>` +
      beakGrin(p)
    )
  }
  if (pose === 'waddle') {
    return (
      `<path d="M14 150 H40 M8 172 H34 M18 194 H44" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>` +
      leg(p, 150, 214, 158, 232) + foot(p, 164, 236, 4) +
      `<g transform="rotate(8 128 200)">` +
      `<path d="M66 140 C34 120 26 150 38 168 C50 164 62 160 78 160 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
      `<path d="M200 140 C230 116 242 146 232 166 C220 162 206 160 188 162 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
      leg(p, 92, 204, 64, 206) + foot(p, 48, 204, -34) +
      `<path d="${W_BODY}" fill="${p.body}" ${ol(p)}/>` + chest(p) +
      tuft(p) + head(p) + scarf(p, 'back') + blush(p) +
      eyeOpen(p, 102, 76, [8, 2], 13) + eyeOpen(p, 150, 74, [8, 2], 13) +
      beakGrin(p) + `</g>` +
      `<path d="M78 236 Q88 230 98 236 M150 248 Q160 242 170 248" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>`
    )
  }
  // lost the plot: spiral eyes, beak agape, map held upside down, little stars orbiting
  const star = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill="${p.mono ? p.line : p.beak}" ${ol(p, 3)}/>`
  return (
    leg(p, 100, 216, 92, 230) + leg(p, 154, 216, 166, 230) + foot(p, 86, 234, -14) + foot(p, 172, 232, 18) +
    `<path d="${W_BODY}" fill="${p.body}" ${ol(p)}/>` +
    tuft(p) + head(p) + scarf(p, 'down') + blush(p) +
    spiral(p, 102, 76) + spiral(p, 150, 74) +
    `<path d="M146 112 C176 124 206 130 216 124 C214 146 184 152 160 140 C152 136 148 124 146 112 Z" fill="${p.mono ? p.body : p.beak2}" ${ol(p, 6)}/>` +
    `<path d="M160 128 C176 134 196 136 204 132 C196 142 176 144 162 138 Z" fill="${p.mono ? p.line : p.acc2}"/>` +
    `<path d="M138 88 C154 74 184 74 206 82 C220 88 232 94 232 102 C232 110 222 112 212 110 L146 112 C136 106 134 96 138 88 Z" fill="${p.mono ? p.body : p.beak}" ${ol(p, 6)}/>` +
    // the map, upside down: route, fold lines and a north arrow pointing at the floor
    `<g transform="rotate(-8 130 182)">` +
    `<rect x="78" y="150" width="108" height="66" rx="4" fill="${p.mono ? p.body : p.blueSoft}" ${ol(p, 6)}/>` +
    `<path d="M114 150 V216 M150 150 V216" stroke="${p.mono ? p.line : p.blue}" stroke-width="3" opacity=".6"/>` +
    `<path d="M90 162 C108 170 104 196 130 190 C150 186 152 206 172 204" stroke="${p.trail}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 10"/>` +
    `<path d="M166 162 V180 M160 174 L166 182 L172 174 M160 158 L160 146" stroke="${p.line}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M174 154 V166 L180 154 V166" transform="rotate(180 177 160)" stroke="${p.line}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g>` +
    `<path d="M64 170 C46 170 46 196 72 196" fill="${p.body2}" ${ol(p, 6)}/>` +
    `<path d="M198 168 C218 170 218 196 190 194" fill="${p.body2}" ${ol(p, 6)}/>` +
    star(40, 46) + star(214, 36, .8) + star(226, 160, .7) +
    `<path d="M24 92 C24 78 46 78 44 92 C43 100 34 100 34 108 M34 120 v1" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>`
  )
}
function waddleIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="10.5" cy="12.5" r="8"/><path d="M15.6 14.2c1.8-1 4.6-1 6 .1-1.2 2-4 2.6-6 1.4"/>` +
    `<path d="M9.5 4.6c-.6-1.6.8-2.6 1.6-1.4.4-1 1.8-.8 1.4.6"/></g>` +
    `<circle cx="8" cy="11" r="2.6" stroke="${c}" stroke-width="1.5"/><circle cx="13.2" cy="10.8" r="2.6" stroke="${c}" stroke-width="1.5"/>` +
    `<circle cx="8.7" cy="11.6" r="1.1" fill="${c}"/><path d="M10.6 10.4h5.2" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/><circle cx="13.9" cy="11.6" r="1.1" fill="${c}"/>`
}

export const WADDLE_POSES = [
  { id: 'proud', name: 'Proud', concept: 'Chest out, wings on hips, one eye lazily half-shut and a grin that is up to something.' },
  { id: 'waddle', name: 'Mid-waddle', concept: 'Leaning into the step, one big foot up, wings out for balance, scarf streaming.' },
  { id: 'lost', name: 'Lost the plot', concept: 'Spiral eyes, beak agape, the map held upside down, a question mark and orbiting stars.' },
]

// =============================================================================================
// Contact sheet 2
// =============================================================================================
function contactSheet2() {
  const px = (pal, f, w, cls = '') => `<img class="px ${cls}" src="png/arcade/${pal}-${f}@1x.png" width="${w}" alt="">`
  const anim = (pal, a, b, cls, w = 128) => `<span class="anim ${cls}">${px(pal, a, w)}${px(pal, b, w, 'b')}</span>`
  const arcadePanel = (pk) => {
    const name = ARCADE_PALETTES[pk].name
    return `
    <article class="card">
      <header><p class="over">Arcade · ${name}</p><h2>${pk === 'gb' ? 'Game Boy, four greens' : 'NES, five colours'}</h2>
      <p class="concept">${pk === 'gb' ? 'Four shades from the success tokens (ink, green, mint, mist), like a 1989 handheld screen.' : 'Ink, cream, shadow, beak yellow and terracotta. A big head, a stubby body and a chunky beak, with a one-pixel glint in the eye.'}</p></header>
      <div class="panels">
        <div class="panel light">${px(pk, 'idle', 256, 'big')}<div class="sizes">${px(pk, 'idle', 64)}<span>64 (2x)</span>${px(pk, 'icon', 24)}<span>24</span></div></div>
        <div class="panel dark">${px(pk, 'idle', 256, 'big')}<div class="sizes">${px(pk, 'idle', 64)}<span>64 (2x)</span>${px(pk, 'icon', 24)}<span>24</span></div></div>
      </div>
      <h3>Frames at 4x</h3>
      <div class="frames">
        <figure>${px(pk, 'idle', 128)}<figcaption>Idle</figcaption></figure>
        <figure>${px(pk, 'blink', 128)}<figcaption>Blink</figcaption></figure>
        <figure>${px(pk, 'walkA', 128)}<figcaption>Walk 1</figcaption></figure>
        <figure>${px(pk, 'walkB', 128)}<figcaption>Walk 2</figcaption></figure>
        <figure class="wide">${px(pk, 'honk', 192)}<figcaption>Honk</figcaption></figure>
      </div>
      <div class="frames">
        <figure>${anim(pk, 'idle', 'blink', 'blink')}<figcaption>Idle + blink (live)</figcaption></figure>
        <figure>${anim(pk, 'walkA', 'walkB', 'walk')}<figcaption>Walk cycle (live)</figcaption></figure>
        <figure class="scales">${px(pk, 'idle', 32)}${px(pk, 'idle', 128)}${px(pk, 'idle', 256)}<figcaption>1x · 4x · 8x</figcaption></figure>
      </div>
      <div class="frames">
        <figure>${px(pk, 'title', 160)}<figcaption>Title screen tag (4x)</figcaption></figure>
        <figure><img class="appicon" src="svg/9-arcade/${pk}-app-icon.svg" width="160" height="160" alt=""><figcaption>App icon</figcaption></figure>
        <figure>${px(pk, 'title', 40)} ${px(pk, 'title', 80)}<figcaption>Tag at 1x and 2x</figcaption></figure>
      </div>
    </article>`
  }
  const w = (f) => `svg/10-waddle/${f}.svg`
  const pose = (ps) => `
    <article class="card">
      <header><p class="over">Waddle · ${ps.name}</p><h2>${ps.name}</h2><p class="concept">${ps.concept}</p></header>
      <div class="panels">
        <div class="panel light"><img class="big" src="${w(ps.id)}" width="256" height="256" alt=""><div class="sizes"><img src="${w(ps.id)}" width="64" height="64" alt=""><span>64</span><img class="ic" src="${w('icon-24')}" width="24" height="24" alt=""><span>24</span></div></div>
        <div class="panel dark"><img class="big" src="${w(ps.id + '-dark')}" width="256" height="256" alt=""><div class="sizes"><img src="${w(ps.id + '-dark')}" width="64" height="64" alt=""><span>64</span><img class="ic" src="${w('icon-24-dark')}" width="24" height="24" alt=""><span>24</span></div></div>
      </div>
    </article>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Goose round two</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--page:${L.page};--card:${L.card};--ink:${L.ink};--ink2:#5A5247;--muted:#6B6355;--accent:${L.accent};--dpage:${DK.page}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 "DM Sans",system-ui,sans-serif}
main{max-width:1640px;margin:0 auto;padding:48px 40px 64px}
h1,h2,h3{font-family:"Space Grotesk",system-ui,sans-serif;letter-spacing:-.02em;margin:0}
h1{font-size:44px;line-height:1;letter-spacing:-.03em}h2{font-size:26px;line-height:1.15}h3{font-size:15px;margin:18px 0 8px;color:var(--muted)}
.section{font-size:30px;margin:40px 0 6px}
.over{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:0 0 6px}
.lede{font-size:17px;color:var(--ink2);max-width:960px;margin:14px 0 0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:18px}
.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.card{background:var(--card);border-radius:28px;padding:26px;box-shadow:0 10px 30px rgba(120,80,50,.12),inset 0 -4px 0 rgba(120,80,50,.05)}
.concept{color:var(--ink2);margin:8px 0 18px;min-height:44px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.three .panels{grid-template-columns:1fr}
.panel{border-radius:22px;padding:14px;display:flex;gap:14px;align-items:center;justify-content:center}
.panel.light{background:var(--page)}.panel.dark{background:var(--dpage)}
.panel .big{border-radius:16px;width:256px;height:auto}
.px{image-rendering:pixelated;image-rendering:crisp-edges}
.sizes{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:64px}
.sizes span{font-size:12px;font-weight:500;color:var(--muted);margin-bottom:10px}.dark .sizes span{color:#B3A796}
.frames{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
figure{margin:0;background:var(--page);border-radius:18px;padding:12px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px}
figure.scales{flex-direction:row;align-items:flex-end;flex-wrap:wrap;justify-content:center}
figure.scales figcaption{width:100%}
figure .appicon{border-radius:36px}
figcaption{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.anim{position:relative;display:inline-block;line-height:0}
.anim .b{position:absolute;left:0;top:0;opacity:0}
.walk .b{animation:flip .5s steps(1) infinite}
.blink .b{animation:blink 3s steps(1) infinite}
@keyframes flip{50%{opacity:1}}
@keyframes blink{90%{opacity:1}96%{opacity:0}}
.kit{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}
@media (max-width:1100px){.grid,.grid.three{grid-template-columns:1fr}}
</style></head><body><main>
<p class="over">Silly Travel Tool · mascot exploration, round two · not in the app</p>
<h1>Goose, round two</h1>
<p class="lede">Two directions, pushed further, each with variants. <b>Arcade</b> is a real 32 x 32 sprite with true PNGs at whole-number scales, a two-frame walk, an idle blink and a honk. <b>Waddle</b> is the silly-but-cute Goose, still with an ink outline and cream fill so it sits in the Clay system.</p>
<h2 class="section">A · Arcade</h2>
<div class="grid">${arcadePanel('nes')}${arcadePanel('gb')}</div>
<h2 class="section">B · Waddle</h2>
<div class="grid three">${WADDLE_POSES.map(pose).join('')}</div>
<div class="card" style="margin-top:24px"><h2>Waddle kit</h2>
  <div class="kit">
    <figure><img src="${w('proud-mono')}" width="140" height="140" alt=""><figcaption>One colour</figcaption></figure>
    <figure><img src="${w('waddle-mono')}" width="140" height="140" alt=""><figcaption>One colour, waddle</figcaption></figure>
    <figure><img src="${w('tag')}" width="140" height="140" alt=""><figcaption>In the tag</figcaption></figure>
    <figure><img class="appicon" src="${w('app-icon')}" width="140" height="140" alt="" style="border-radius:32px"><figcaption>App icon</figcaption></figure>
    <figure><span><img src="${w('icon-24')}" width="24" height="24" alt=""> <img src="${w('icon-24')}" width="16" height="16" alt=""> <img src="${w('icon-24')}" width="72" height="72" alt=""></span><figcaption>24 · 16 · 72 px icon</figcaption></figure>
  </div>
</div>
</main></body></html>
`
}

// =============================================================================================
// Write
// =============================================================================================
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const A = join(HERE, 'svg', '9-arcade'), AP = join(HERE, 'png', 'arcade'), B = join(HERE, 'svg', '10-waddle')
  for (const d of [A, AP, B]) mkdirSync(d, { recursive: true })
  for (const [pk, pal] of Object.entries(ARCADE_PALETTES)) {
    for (const [fk, rows] of Object.entries(ARCADE_FRAMES)) {
      writeFileSync(join(A, `${pk}-${fk}.svg`), svgFromGrid(rows, pal))
      for (const s of [1, 4, 8]) writeFileSync(join(AP, `${pk}-${fk}@${s}x.png`), pngFromGrid(rows, pal, s))
    }
    // walk cycle strip (idle, walkA, walkB, walkA) for the sheet animation
    const strip = ['walkA', 'walkB'].map(f => ARCADE_FRAMES[f])
    writeFileSync(join(AP, `${pk}-walk-strip@1x.png`), pngFromGrid(strip[0].map((r, y) => r + strip[1][y]), pal, 1))
    writeFileSync(join(A, `${pk}-app-icon.svg`), arcadeAppIcon(pal))
  }
  writeFileSync(join(HERE, 'png', 'arcade-nes-idle-512.png'), pngFromGrid(ARCADE_FRAMES.idle, { ...ARCADE_PALETTES.nes, '.': L.card }, 16))

  const dir = { slug: '10-waddle', draw: (p, ex) => waddle(p, ex === 'normal' ? 'proud' : ex) }
  for (const pose of WADDLE_POSES) {
    writeFileSync(join(B, `${pose.id}.svg`), svg(waddle(PALETTES.light, pose.id), { bg: L.card }))
    writeFileSync(join(B, `${pose.id}-dark.svg`), svg(waddle(PALETTES.dark, pose.id), { bg: DK.page }))
    writeFileSync(join(B, `${pose.id}-mono.svg`), svg(waddle(PALETTES.mono, pose.id), { bg: L.card }))
  }
  writeFileSync(join(B, 'tag.svg'), tagMark(dir))
  writeFileSync(join(B, 'app-icon.svg'), appTile(dir))
  writeFileSync(join(B, 'icon-24.svg'), svg(waddleIcon(L.ink), { size: 24, view: '0 0 24 24' }))
  writeFileSync(join(B, 'icon-24-dark.svg'), svg(waddleIcon(DK.ink), { size: 24, view: '0 0 24 24' }))
  writeFileSync(join(HERE, 'index-2.html'), contactSheet2())
  console.log('wrote arcade, waddle and index-2.html')
}
