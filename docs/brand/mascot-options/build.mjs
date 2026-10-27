// Builds the eight Goose mascot directions into svg/<slug>/*.svg.
// Run: node docs/brand/mascot-options/build.mjs
// Every shape is hand-placed path data in a 0 0 256 256 frame (icons: 0 0 24 24). Colours come only from
// brand-tokens.json and dark-tokens.json. Nothing here is used by the app.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// ---- Tokens (light: brand-tokens.json, dark: dark-tokens.json) ----
export const L = {
  page: '#F4EEE6', card: '#FFFDF9', sunk: '#E9E0D4', lineStrong: '#D6C8B8', ink: '#2A2520',
  accent: '#B24A17', accentHover: '#8E3A12', accentSoft: '#F6E9DF', terra: '#C4561E',
  info: '#3E5C8A', infoSoft: '#E6EEF8', success: '#2D6E4A',
  feather: '#F0EBE3', wing: '#E8E3DB', beak: '#E8A820', beakShade: '#D4910A',
}
export const DK = {
  page: '#1C1814', card: '#28221C', sunk: '#13100D', inverse: '#3A3129', lineStrong: '#5A5045',
  ink: '#F4EEE6', accent: '#F0895A', accentSoft: '#3D2619', info: '#9DB9E3',
}

// Palettes map roles to tokens. `ground` is what the goose sits on; mono palettes use one ink plus the ground.
export const PALETTES = {
  light: {
    name: 'light', ground: L.card, line: L.ink, body: L.feather, body2: L.wing, shade: L.sunk, hi: L.card,
    beak: L.beak, beak2: L.beakShade, acc: L.accent, acc2: L.terra, blush: L.terra, eye: L.ink, eyeW: L.card,
    soft: L.accentSoft, blue: L.info, blueSoft: L.infoSoft, trail: L.accent, mono: false,
  },
  dark: {
    name: 'dark', ground: DK.page, line: DK.ink, body: DK.inverse, body2: DK.card, shade: DK.sunk, hi: DK.lineStrong,
    beak: L.beak, beak2: L.beakShade, acc: DK.accent, acc2: DK.accent, blush: DK.accent, eye: DK.ink, eyeW: DK.inverse,
    soft: DK.accentSoft, blue: DK.info, blueSoft: DK.card, trail: DK.accent, mono: false,
  },
  mono: {
    name: 'mono', ground: L.card, line: L.ink, body: L.card, body2: L.card, shade: L.card, hi: L.card,
    beak: L.card, beak2: L.ink, acc: L.ink, acc2: L.ink, blush: 'none', eye: L.ink, eyeW: L.card,
    soft: 'none', blue: L.ink, blueSoft: L.card, trail: L.ink, mono: true,
  },
  // Cream goose inside the terracotta tag (the logo mark).
  tag: {
    name: 'tag', ground: L.accent, line: L.card, body: L.accent, body2: L.accent, shade: L.accent, hi: L.accent,
    beak: L.accent, beak2: L.card, acc: L.card, acc2: L.card, blush: 'none', eye: L.card, eyeW: L.accent,
    soft: 'none', blue: L.card, blueSoft: L.accent, trail: L.card, mono: true, inTag: true,
  },
}

export const svg = (inner, { size = 256, view = '0 0 256 256', bg } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${view}" fill="none">` +
  (bg ? `<rect x="-1000" y="-1000" width="3000" height="3000" fill="${bg}"/>` : '') + inner + '</svg>\n'

// Outline stroke attributes at 256 scale.
export const ol = (p, w = 7) => `stroke="${p.line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`

// ============================================================================================
// 1. Three-Piece: a bold geometric goose from a half-disc, a capsule and a triangle.
// ============================================================================================
function threePiece(p, ex = 'normal') {
  const body = p.mono ? p.line : p.acc
  const beak = p.mono ? p.line : p.beak
  const neck = p.line
  const cut = p.ground
  let beakShapes = `<path d="M188 56 L246 76 L188 96 Z" fill="${beak}"/>`
  let eye = `<circle cx="181" cy="62" r="8" fill="${cut}"/><circle cx="183" cy="62" r="4" fill="${neck}"/>`
  let extra = ''
  if (ex === 'honk') {
    beakShapes = `<path d="M188 54 L246 52 L188 76 Z" fill="${beak}"/><path d="M188 82 L240 102 L188 98 Z" fill="${p.mono ? p.line : p.beak2}"/>`
    eye = `<circle cx="180" cy="60" r="11" fill="${cut}"/><circle cx="181" cy="60" r="4" fill="${neck}"/>`
    extra = `<path d="M214 36 L224 18 M232 44 L248 32 M226 120 L244 128" stroke="${p.line}" stroke-width="7" stroke-linecap="round"/>`
  }
  return (
    `<path d="M32 146 H208 A88 88 0 0 1 32 146 Z" fill="${body}"/>` +
    beakShapes +
    `<rect x="158" y="34" width="46" height="146" rx="23" fill="${neck}" stroke="${cut}" stroke-width="8"/>` +
    `<path d="M164 86 Q181 104 198 86" stroke="${cut}" stroke-width="7" stroke-linecap="round"/>` +
    eye + extra
  )
}
function threePieceIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M3 13h15a7.5 7.5 0 0 1-15 0z"/><rect x="13" y="2.8" width="5" height="10.2" rx="2.5"/>` +
    `<path d="M18 5l3.5 1.5L18 8"/></g><circle cx="15.5" cy="5.6" r="1" fill="${c}"/>`
}

// ============================================================================================
// 2. One Line: one unbroken stroke and one dot.
// ============================================================================================
const ONE_LINE_BODY =
  'M30 132 C52 150 100 152 140 138 C158 130 146 96 148 74 C150 50 176 40 194 56 ' +
  'L230 70 L196 80 C182 90 176 104 180 122 C186 146 210 156 206 182 ' +
  'C200 214 150 222 108 210 '
const ONE_LINE_WING = 'C78 200 72 168 100 164 C126 160 150 172 160 192'
const ONE_LINE_LOST =
  'C66 198 60 150 100 160 C140 170 120 214 92 194 C70 178 104 140 132 158 ' +
  'C160 176 150 206 132 196 C116 186 140 166 168 184 C196 202 214 232 246 226'
function oneLine(p, ex = 'normal') {
  const w = p.mono ? 9 : 9
  const disc = p.inTag || p.mono ? '' : `<circle cx="132" cy="134" r="104" fill="${p.soft}"/>`
  const beak = p.mono ? '' : `<path d="M194 57 L228 70 L196 79 Z" fill="${p.beak}"/>`
  const lost = ex === 'lost'
  const d = ONE_LINE_BODY + (lost ? ONE_LINE_LOST : ONE_LINE_WING)
  const eye = lost
    ? `<path d="M177 61 a4 4 0 1 1 4 4 a7 7 0 1 1 -7 -9" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="178" cy="60" r="6.5" fill="${p.line}"/>`
  return disc + beak + `<path d="${d}" stroke="${p.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` + eye
}
function oneLineIcon(c) {
  return `<path d="M2.8 12.2c2 1.7 6.6 1.9 10.2.6 1.6-.8.6-4.1.8-6.1.2-2.3 2.6-3.2 4.2-1.7l3.4 1.3-3.2.9` +
    `c-1.3.9-1.8 2.2-1.4 3.9.5 2.2 2.7 3.1 2.4 5.6-.6 3-5.2 3.7-9.1 2.6-2.7-.9-3.2-3.9-.6-4.2 2.4-.3 4.6.8 5.4 2.6"` +
    ` stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.4" cy="5.7" r="1" fill="${c}"/>`
}

// ============================================================================================
// 3. Clay Pebble: a squishy, soft-shaded clay goose with no neck at all.
// ============================================================================================
const PEBBLE = 'M128 30 C162 30 176 58 172 84 C169 104 158 114 164 130 C196 140 216 170 212 198 C208 226 174 238 128 238 ' +
  'C82 238 48 226 44 198 C40 170 60 140 92 130 C98 114 87 104 84 84 C80 58 94 30 128 30 Z'
function pebble(p, ex = 'normal', id = 'pb') {
  const shading = p.mono ? '' :
    `<clipPath id="${id}"><path d="${PEBBLE}"/></clipPath>` +
    `<g clip-path="url(#${id})"><path d="${PEBBLE}" fill="${p.shade}"/>` +
    `<path d="${PEBBLE}" transform="translate(-12 -9)" fill="${p.body}"/>` +
    `<ellipse cx="106" cy="54" rx="14" ry="9" transform="rotate(-30 106 54)" fill="${p.hi}"/>` +
    `<ellipse cx="86" cy="168" rx="16" ry="10" transform="rotate(-40 86 168)" fill="${p.hi}"/></g>`
  const feet = p.mono ? p.line : p.beak2
  const eyes = ex === 'wink'
    ? `<path d="M98 74 Q107 63 116 74" stroke="${p.eye}" stroke-width="6" stroke-linecap="round"/>` +
      `<circle cx="150" cy="72" r="8" fill="${p.eye}"/><circle cx="153" cy="69" r="2.6" fill="${p.eyeW}"/>`
    : `<circle cx="106" cy="72" r="8" fill="${p.eye}"/><circle cx="109" cy="69" r="2.6" fill="${p.eyeW}"/>` +
      `<circle cx="150" cy="72" r="8" fill="${p.eye}"/><circle cx="153" cy="69" r="2.6" fill="${p.eyeW}"/>`
  const beak = ex === 'wink'
    ? `<path d="M108 92 C114 84 142 84 148 92 C146 112 110 112 108 92 Z" fill="${p.beak}" ${ol(p, 5)}/>` +
      `<path d="M113 96 Q128 106 143 96" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>`
    : `<path d="M108 92 C114 84 142 84 148 92 C144 106 112 106 108 92 Z" fill="${p.beak}" ${ol(p, 5)}/>`
  return (
    `<ellipse cx="102" cy="240" rx="18" ry="9" fill="${feet}" ${ol(p, 5)}/>` +
    `<ellipse cx="154" cy="240" rx="18" ry="9" fill="${feet}" ${ol(p, 5)}/>` +
    `<ellipse cx="46" cy="184" rx="13" ry="25" transform="rotate(28 46 184)" fill="${p.body2}" ${ol(p, 6)}/>` +
    `<ellipse cx="210" cy="184" rx="13" ry="25" transform="rotate(-28 210 184)" fill="${p.body2}" ${ol(p, 6)}/>` +
    `<path d="M128 30 C122 14 136 4 144 14" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>` +
    (p.mono ? `<path d="${PEBBLE}" fill="${p.body}"/>` : shading) +
    `<path d="${PEBBLE}" ${ol(p, 7)}/>` +
    (p.mono ? '' : `<circle cx="96" cy="94" r="9" fill="${p.blush}" opacity=".22"/><circle cx="160" cy="94" r="9" fill="${p.blush}" opacity=".22"/>`) +
    eyes + beak
  )
}
function pebbleIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 3.2c2.8 0 3.9 2.4 3.5 4.6-.2 1.4-1 2-.6 3.2 2.6.8 4.4 3.2 4 5.6-.4 2.5-3.2 3.6-6.9 3.6s-6.5-1.1-6.9-3.6c-.4-2.4 1.4-4.8 4-5.6.4-1.2-.4-1.8-.6-3.2-.4-2.2.7-4.6 3.5-4.6z"/>` +
    `<path d="M10.8 8.6h2.4"/></g>` +
    `<circle cx="10.3" cy="6.5" r=".95" fill="${c}"/><circle cx="13.7" cy="6.5" r=".95" fill="${c}"/>`
}

// ============================================================================================
// 4. Carry-On: a long-necked traveller mid-stride, scarf flying, carry-on held in the beak.
// ============================================================================================
const CO_BODY =
  'M30 116 C48 122 64 128 82 128 C108 124 134 124 152 128 C154 104 160 82 168 66 C174 50 190 42 202 52 ' +
  'C206 55 208 58 209 62 L240 70 L210 77 C200 82 192 92 190 108 C188 124 194 136 200 150 ' +
  'C208 176 190 198 154 202 C118 206 78 200 60 178 C50 164 46 148 50 138 C42 134 34 126 30 116 Z'
function carryOn(p, ex = 'normal') {
  const leg = p.mono ? p.line : p.beak2
  const surprised = ex === 'surprised'
  const legs =
    `<path d="M108 200 L92 232 M92 232 L74 234 M92 232 L102 240" stroke="${leg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M146 200 L164 228 M164 228 L184 226 M164 228 L162 240" stroke="${leg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
  const motion = `<path d="M10 150 H34 M4 168 H36 M14 186 H44" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>`
  const scarf =
    `<path d="M152 116 C140 108 120 100 98 104 C112 92 126 84 152 96 Z" fill="${p.acc}" ${ol(p, 5)}/>` +
    `<path d="M150 112 C132 116 112 120 92 130 C110 108 130 98 152 104 Z" fill="${p.acc2}" ${ol(p, 5)}/>` +
    `<path d="M156 92 C170 96 184 98 194 96 L192 116 C180 118 166 116 152 112 Z" fill="${p.acc}" ${ol(p, 5)}/>`
  const wing = `<path d="M74 150 C100 132 146 134 170 156 C146 176 102 178 74 150 Z" fill="${p.body2}" ${ol(p, 5)}/>` +
    `<path d="M96 154 Q118 160 140 156" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>`
  const caseFill = p.mono ? p.body : p.blue
  const band = p.mono ? p.line : p.blueSoft
  const suitcase = (x, y, r = 0) =>
    `<g transform="rotate(${r} ${x + 20} ${y + 20})">` +
    `<path d="M${x + 12} ${y} V${y - 10} H${x + 28} V${y}" stroke="${p.line}" stroke-width="5" stroke-linejoin="round"/>` +
    `<rect x="${x}" y="${y}" width="40" height="34" rx="6" fill="${caseFill}" ${ol(p, 5)}/>` +
    `<path d="M${x + 12} ${y + 4} V${y + 30} M${x + 28} ${y + 4} V${y + 30}" stroke="${band}" stroke-width="4" stroke-linecap="round"/></g>`
  const eye = surprised
    ? `<circle cx="196" cy="60" r="9" fill="${p.eyeW}" ${ol(p, 4)}/><circle cx="197" cy="60" r="4" fill="${p.eye}"/>` +
      `<path d="M184 42 Q194 34 206 40" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
    : `<circle cx="196" cy="61" r="5.5" fill="${p.eye}"/>`
  const beakHold = surprised
    ? suitcase(200, 150, 18) + `<path d="M226 126 L232 116 M240 134 L250 128 M214 130 L214 118" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M226 74 V88" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>` + suitcase(206, 98)
  const beakFill = surprised
    ? `<path d="M209 62 L242 58 L210 70 Z" fill="${p.mono ? p.line : p.beak}"/><path d="M210 74 L238 86 L208 80 Z" fill="${p.mono ? p.line : p.beak2}"/>`
    : `<path d="M209 62 L240 70 L210 77 Z" fill="${p.mono ? p.line : p.beak}"/>`
  return legs + motion + `<path d="${CO_BODY}" fill="${p.body}" ${ol(p)}/>` + beakFill + wing + scarf + eye + beakHold
}
function carryOnIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M2.5 10.5c2.5 1.4 5.5 1.6 9.2 1.3.1-2.2.5-4.3 1.2-5.9.6-1.5 2.1-2.2 3.2-1.2l3.4 1-3 .8` +
    `c-1.2.9-1.4 2.4-1 4 .9 3.1-.3 5.6-4 5.9-3 .3-6.3-.6-7.4-2.6-.6-1.1-.8-2.2-1.6-3.3z"/>` +
    `<path d="M8.5 17.5L7.2 21M12.5 17.5l1.6 3.3M12.6 9.6L8.4 8.2"/></g>` +
    `<circle cx="15.6" cy="5.6" r=".9" fill="${c}"/>`
}

// ============================================================================================
// 5. Pixel Honk: a 16 x 16 pixel goose, perfect at 16 and 32 px.
// ============================================================================================
// K outline, W feather, G wing, Y beak, O beak shade / feet, E eye, A scarf. Cell = 16 px.
const PIXEL = {
  normal: [
    '................',
    '........KKKK....',
    '.......KWWWWK...',
    '.......KWWEWKKK.',
    '.......KWWWWYYYK',
    '........KWWOOOK.',
    '........KWWKKK..',
    '........KAAK....',
    '.KK.....KWWK....',
    '.KWK...KWWWWK...',
    '.KWWKKKWWWWWWK..',
    '.KWGGGGGGWWWWK..',
    '..KWGGGGGWWWWK..',
    '...KWWWWWWWWK...',
    '....KKKKKKKK....',
    '......OO..OO....',
  ],
  surprised: [
    '................',
    '........KKKK....',
    '.......KWWEEK...',
    '.......KWWEEKKK.',
    '.......KWWWWYYYK',
    '........KWWK....',
    '........KWWOOOK.',
    '........KAAKKK..',
    '.KK.....KWWK....',
    '.KWK...KWWWWK...',
    '.KWWKKKWWWWWWK..',
    '.KWGGGGGGWWWWK..',
    '..KWGGGGGWWWWK..',
    '...KWWWWWWWWK...',
    '....KKKKKKKK....',
    '......OO..OO....',
  ],
}
// 12 x 12 one-colour version for the 24 px icon (2 px cells).
const PIXEL_ICON = [
  '......XXX...',
  '.....XXXXX..',
  '.....XX.XXXX',
  '.....XXXXXX.',
  '......XXX...',
  '......XX....',
  'X.....XX....',
  'XX...XXXX...',
  'XXXXXXXXXX..',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '...X....X...',
]
function pixelRects(rows, colours, cell) {
  let out = ''
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = colours[ch]
    if (fill && fill !== 'none') out += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`
  }))
  return `<g shape-rendering="crispEdges">${out}</g>`
}
function pixel(p, ex = 'normal') {
  const rows = PIXEL[ex] || PIXEL.normal
  const c = p.mono
    ? { K: p.line, W: p.body, G: p.body, Y: p.line, O: p.line, E: p.line, A: p.line }
    : { K: p.line, W: p.body, G: p.body2 === p.body ? p.shade : p.shade, Y: p.beak, O: p.beak2, E: p.eye, A: p.acc }
  return pixelRects(rows, c, 16)
}
function pixelIcon(c) { return pixelRects(PIXEL_ICON, { X: c }, 2) }

// ============================================================================================
// 6. True North: the goose from above, the arrow on your map, trailing a dotted route.
// ============================================================================================
const TN_BODY = 'M128 96 C170 96 186 140 184 176 C182 208 160 230 128 236 C96 230 74 208 72 176 C70 140 86 96 128 96 Z'
function trueNorth(p, ex = 'normal') {
  const lost = ex === 'lost'
  const trail = lost
    ? `<path d="M30 238 C10 200 60 180 80 200 C100 220 60 250 44 226 C30 200 70 160 100 170" stroke="${p.trail}" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 15"/>`
    : `<path d="M18 244 C40 224 52 204 78 190" stroke="${p.trail}" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 15"/>`
  const ring = p.mono || p.inTag ? '' : `<circle cx="128" cy="128" r="112" fill="${p.soft}"/>`
  const eyeL = lost ? `<path d="M110 38 l8 8 m0 -8 l-8 8" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>` : `<circle cx="116" cy="42" r="5" fill="${p.eye}"/>`
  const eyeR = lost ? `<path d="M138 38 l8 8 m0 -8 l-8 8" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>` : `<circle cx="140" cy="42" r="5" fill="${p.eye}"/>`
  const goose =
    `<path d="M114 230 L128 254 L142 230 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
    `<path d="M115 36 C115 14 121 2 128 2 C135 2 141 14 141 36 Z" fill="${p.mono ? p.line : p.beak}" ${ol(p, 6)}/>` +
    `<rect x="115" y="50" width="26" height="62" rx="13" fill="${p.body}" ${ol(p)}/>` +
    `<ellipse cx="128" cy="44" rx="20" ry="22" fill="${p.body}" ${ol(p)}/>` +
    eyeL + eyeR +
    `<path d="${TN_BODY}" fill="${p.body}" ${ol(p)}/>` +
    `<path d="M84 138 C84 182 104 214 128 234 C152 214 172 182 172 138 C150 124 106 124 84 138 Z" fill="${p.body2}" ${ol(p, 6)}/>` +
    `<path d="M128 132 V226 M100 150 C104 180 112 200 124 216 M156 150 C152 180 144 200 132 216" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
  const rot = lost ? 'rotate(-150 128 140) scale(.8)' : 'rotate(32 128 140) scale(.8)'
  return ring + trail + `<g transform="translate(26 24) ${rot}">${goose}</g>` +
    (lost ? `<path d="M196 40 a26 26 0 1 1 -12 -14 M184 18 l2 10 l-10 2" stroke="${p.line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` : '')
}
function trueNorthIcon(c) {
  return `<g transform="rotate(32 12 12)" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 9.4c3 0 4.2 3 4 5.6-.2 2.6-1.8 4.6-4 5.6-2.2-1-3.8-3-4-5.6-.2-2.6 1-5.6 4-5.6z"/>` +
    `<path d="M9.4 12.8c1.2-.6 2-.2 2.6 1 .6-1.2 1.4-1.6 2.6-1M12 9.4V7.2"/>` +
    `<ellipse cx="12" cy="5" rx="1.7" ry="2"/><path d="M11.4 3.1l.6-1.6.6 1.6"/></g>`
}

// ============================================================================================
// 7. Hello: a head-on goose face, badge-shaped, with two eyes and a front-view beak.
// ============================================================================================
function hello(p, ex = 'normal', id = 'hl') {
  const wink = ex === 'wink'
  const disc = p.inTag || p.mono ? '' : `<circle cx="128" cy="128" r="120" fill="${p.soft}"/>`
  const neck = `<path d="M100 180 C98 210 92 232 86 252 L170 252 C164 232 158 210 156 180 Z" fill="${p.body}" ${ol(p)}/>`
  const neckClip = p.inTag || p.mono ? neck
    : `<clipPath id="${id}"><circle cx="128" cy="128" r="120"/></clipPath><g clip-path="url(#${id})">${neck}</g>`
  const eyeL = wink
    ? `<path d="M80 100 Q96 84 112 100" stroke="${p.line}" stroke-width="7" stroke-linecap="round"/>`
    : `<ellipse cx="96" cy="96" rx="16" ry="19" fill="${p.eyeW}" ${ol(p, 6)}/><circle cx="99" cy="99" r="8" fill="${p.eye}"/>`
  const eyeR = `<ellipse cx="160" cy="96" rx="16" ry="19" fill="${p.eyeW}" ${ol(p, 6)}/><circle cx="157" cy="99" r="8" fill="${p.eye}"/>`
  const brows = wink
    ? `<path d="M144 66 Q160 58 176 66" stroke="${p.line}" stroke-width="6" stroke-linecap="round"/>`
    : ''
  // A domestic goose's knob sits above the beak: the one detail that says goose, not duck.
  const knob = `<ellipse cx="128" cy="118" rx="15" ry="13" fill="${p.mono ? p.line : p.beak2}" ${ol(p, 6)}/>`
  const beak = wink
    ? `<path d="M98 132 C106 120 150 120 158 132 C158 164 142 182 128 182 C114 182 98 164 98 132 Z" fill="${p.beak}" ${ol(p, 6)}/>` +
      `<path d="M104 150 Q128 170 152 144" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M98 132 C106 120 150 120 158 132 C158 162 142 180 128 180 C114 180 98 162 98 132 Z" fill="${p.beak}" ${ol(p, 6)}/>` +
      `<path d="M104 152 Q128 162 152 152" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
  return disc + neckClip +
    `<path d="M120 34 C112 16 126 6 132 20 C136 8 152 10 144 30" stroke="${p.line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M128 30 C180 30 202 72 200 112 C198 156 168 196 128 196 C88 196 58 156 56 112 C54 72 76 30 128 30 Z" fill="${p.body}" ${ol(p)}/>` +
    (p.mono ? '' : `<circle cx="78" cy="136" r="12" fill="${p.blush}" opacity=".22"/><circle cx="178" cy="136" r="12" fill="${p.blush}" opacity=".22"/>`) +
    eyeL + eyeR + brows + knob + beak +
    `<circle cx="119" cy="138" r="2.5" fill="${p.line}"/><circle cx="137" cy="138" r="2.5" fill="${p.line}"/>`
}
function helloIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 3.6c4.6 0 6.6 3.4 6.4 6.6-.2 3.6-2.9 6.4-6.4 6.4s-6.2-2.8-6.4-6.4C5.4 7 7.4 3.6 12 3.6z"/>` +
    `<path d="M8.6 12.4c1.6-1.3 5.2-1.3 6.8 0-.4 1.8-1.8 2.4-3.4 2.4s-3-.6-3.4-2.4zM9.6 16.6L9 21M14.4 16.6L15 21"/></g>` +
    `<circle cx="9.6" cy="9.2" r="1.1" fill="${c}"/><circle cx="14.4" cy="9.2" r="1.1" fill="${c}"/>`
}

// ============================================================================================
// 8. Origami: a folded-paper goose in a long glide, half paper plane.
// ============================================================================================
function origami(p, ex = 'normal') {
  const lost = ex === 'lost'
  const f = p.mono
    ? { a: p.body, b: p.body, c: p.body, d: p.body, beak: p.line }
    : { a: p.hi, b: p.body, c: p.shade, d: p.body2, beak: p.beak }
  const s = `stroke="${p.line}" stroke-width="5" stroke-linejoin="round"`
  const paper =
    `<path d="M150 104 L86 30 L120 132 Z" fill="${f.c}" ${s}/>` +                       // far wing
    `<path d="M168 98 L34 176 L112 146 Z" fill="${f.a}" ${s}/>` +                         // back
    `<path d="M112 146 L34 176 L124 168 Z" fill="${f.d}" ${s}/>` +                        // belly
    `<path d="M168 98 L112 146 L124 168 Z" fill="${f.b}" ${s}/>` +                        // chest
    `<path d="M146 124 L62 230 L124 160 Z" fill="${f.a}" ${s}/>` +                        // near wing top
    `<path d="M124 160 L62 230 L136 176 Z" fill="${f.c}" ${s}/>` +                        // near wing fold
    `<path d="M166 100 L204 60 L214 76 L176 116 Z" fill="${f.b}" ${s}/>` +                // neck
    `<path d="M204 60 L240 58 L214 76 Z" fill="${f.beak}" ${s}/>` +                       // beak
    (lost
      ? `<path d="M196 62 l8 8 m0 -8 l-8 8" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>`
      : `<circle cx="201" cy="68" r="4.5" fill="${p.eye}"/>`)
  const trail = lost ? '' :
    `<path d="M26 112 C44 120 58 132 70 150 M14 138 C30 146 42 156 50 168" stroke="${p.trail}" stroke-width="6" stroke-linecap="round" stroke-dasharray="14 12"/>`
  if (!lost) return trail + paper
  return `<path d="M60 30 C150 -10 236 50 200 130 C180 176 120 170 126 130 C130 104 170 110 160 136" stroke="${p.trail}" stroke-width="6" stroke-linecap="round" stroke-dasharray="14 12"/>` +
    `<g transform="translate(142 170) rotate(118) scale(.7) translate(-136 -128)">${paper}</g>` +
    `<path d="M34 196 l14 -6 M30 214 l18 0 M36 232 l14 6" stroke="${p.line}" stroke-width="5" stroke-linecap="round"/>`
}
function origamiIcon(c) {
  return `<g stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M2.6 15.8L15.2 8.6l3.6-3.8 3 .1-2.4 1.7-3.6 3.8-6 9.8-.4-6.1z"/><path d="M9.4 14.1L2.6 15.8M15.2 8.6l-5.8 5.5"/></g>` +
    `<circle cx="16.9" cy="7.6" r="1" fill="${c}"/>`
}

// ---- Direction list -------------------------------------------------------------------------
export const DIRECTIONS = [
  { slug: '1-three-piece', name: 'Three-Piece', draw: threePiece, icon: threePieceIcon, ex: 'honk', exLabel: 'Honk',
    concept: 'A bold geometric goose from three shapes: a half-disc body, a capsule neck and a triangle beak, with a Canada-goose chinstrap.' },
  { slug: '2-one-line', name: 'One Line', draw: oneLine, icon: oneLineIcon, ex: 'lost', exLabel: 'Lost the plot',
    concept: 'One unbroken stroke and one dot. Calm and elegant, and it can draw itself on screen.' },
  { slug: '3-clay-pebble', name: 'Clay Pebble', draw: pebble, icon: pebbleIcon, ex: 'wink', exLabel: 'Wink',
    concept: 'A squishy, neckless pebble of clay with soft shading, two dot eyes and stubby wings. The Clay design system as a creature.' },
  { slug: '4-carry-on', name: 'Carry-On', draw: carryOn, icon: carryOnIcon, ex: 'surprised', exLabel: 'Surprised',
    concept: 'A long-necked traveller mid-stride: terracotta scarf flying, tiny carry-on held in the beak, places to be.' },
  { slug: '5-pixel-honk', name: 'Pixel Honk', draw: pixel, icon: pixelIcon, ex: 'surprised', exLabel: 'Surprised',
    concept: 'A 16 x 16 pixel goose with a terracotta collar. Pixel-perfect at 16 and 32 px, retro boarding-pass charm.' },
  { slug: '6-true-north', name: 'True North', draw: trueNorth, icon: trueNorthIcon, ex: 'lost', exLabel: 'Lost the plot',
    concept: 'The goose from above, heading north-east on a dotted route. It is the arrow on your map.' },
  { slug: '7-hello', name: 'Hello', draw: hello, icon: helloIcon, ex: 'wink', exLabel: 'Wink',
    concept: 'Head-on, badge-shaped, two eyes and a front-view beak. Made for avatars, app tiles and eye contact.' },
  { slug: '8-origami', name: 'Origami', draw: origami, icon: origamiIcon, ex: 'lost', exLabel: 'Lost the plot',
    concept: 'A goose folded from paper in a long glide: half crane, half paper plane, all forward motion.' },
]

// ---- Tag (logo mark) and app-icon tile ---------------------------------------------------------
const TAG = 'M88 22 L168 22 L212 66 L212 214 Q212 234 192 234 L64 234 Q44 234 44 214 L44 66 Z'
const inTag = (inner) => `<g transform="translate(52 76) scale(.6)">${inner}</g>`
export function tagMark(dir) {
  return svg(
    `<path d="M128 40 C126 20 140 6 162 8" stroke="${L.ink}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="${TAG}" fill="${L.accent}" stroke="${L.ink}" stroke-width="5" stroke-linejoin="round"/>` +
    `<circle cx="128" cy="48" r="11" fill="${L.page}" stroke="${L.ink}" stroke-width="4"/>` +
    inTag(dir.draw(PALETTES.tag, 'normal', `${dir.slug}-t`)),
    { bg: L.page })
}
export function appTile(dir) {
  return svg(
    `<path d="${TAG}" fill="${L.card}"/>` +
    `<circle cx="128" cy="48" r="11" fill="${L.accent}"/>` +
    inTag(dir.draw({ ...PALETTES.light, ground: L.card, inTag: true }, 'normal', `${dir.slug}-a`)),
    { bg: L.accent })
}

// ---- Contact sheet ------------------------------------------------------------------------------
function contactSheet() {
  const f = (d, file) => `svg/${d.slug}/${file}.svg`
  const card = (d, i) => `
  <article class="card">
    <header><p class="over">Direction ${i + 1}</p><h2>${d.name}</h2><p class="concept">${d.concept}</p></header>
    <div class="panels">
      <div class="panel light">
        <img class="big" src="${f(d, 'goose')}" width="256" height="256" alt="${d.name}, light">
        <div class="sizes"><img src="${f(d, 'goose')}" width="64" height="64" alt=""><span>64</span>
          <img class="ic" src="${f(d, 'icon-24')}" width="24" height="24" alt=""><span>24</span></div>
      </div>
      <div class="panel dark">
        <img class="big" src="${f(d, 'goose-dark')}" width="256" height="256" alt="${d.name}, dark">
        <div class="sizes"><img src="${f(d, 'goose-dark')}" width="64" height="64" alt=""><span>64</span>
          <img class="ic" src="${f(d, 'icon-24-dark')}" width="24" height="24" alt=""><span>24</span></div>
      </div>
    </div>
    <div class="kit">
      <figure><img src="${f(d, 'goose-mono')}" width="104" height="104" alt=""><figcaption>One colour</figcaption></figure>
      <figure><img src="${f(d, 'expression')}" width="104" height="104" alt=""><figcaption>${d.exLabel}</figcaption></figure>
      <figure><img src="${f(d, 'tag')}" width="104" height="104" alt=""><figcaption>In the tag</figcaption></figure>
      <figure><img class="appicon" src="${f(d, 'app-icon')}" width="104" height="104" alt=""><figcaption>App icon</figcaption></figure>
    </div>
  </article>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Goose directions</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--page:${L.page};--card:${L.card};--sunk:${L.sunk};--line:#EFE7DC;--ink:${L.ink};--ink2:#5A5247;--muted:#6B6355;--accent:${L.accent};--dpage:${DK.page};--dcard:${DK.card};--dink:${DK.ink}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 "DM Sans",system-ui,sans-serif}
main{max-width:1640px;margin:0 auto;padding:48px 40px 64px}
h1,h2,h3{font-family:"Space Grotesk",system-ui,sans-serif;letter-spacing:-.02em;margin:0}
h1{font-size:44px;line-height:1;letter-spacing:-.03em}
h2{font-size:26px;line-height:1.15}
h3{font-size:19px;margin-bottom:12px}
.over{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:0 0 6px}
.lede{font-size:17px;color:var(--ink2);max-width:880px;margin:14px 0 0}
.intro{display:flex;gap:40px;align-items:center;justify-content:space-between;margin-bottom:36px}
.now{display:flex;gap:16px;align-items:center;background:var(--card);border-radius:22px;padding:16px 22px;box-shadow:0 8px 22px rgba(120,80,50,.10)}
.now p{margin:0;font-size:13px;color:var(--muted);max-width:200px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.card{background:var(--card);border-radius:28px;padding:26px;box-shadow:0 10px 30px rgba(120,80,50,.12),inset 0 -4px 0 rgba(120,80,50,.05)}
.concept{color:var(--ink2);margin:8px 0 18px;min-height:44px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.panel{border-radius:22px;padding:14px;display:flex;gap:14px;align-items:center}
.panel.light{background:var(--page)}
.panel.dark{background:var(--dpage)}
.panel .big{border-radius:16px;width:100%;max-width:256px;height:auto}
.sizes{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:64px}
.sizes span{font-size:12px;font-weight:500;color:var(--muted);margin-bottom:10px}
.dark .sizes span{color:#B3A796}
.sizes img{border-radius:10px}.sizes .ic{border-radius:0}
.kit{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
figure{margin:0;background:var(--page);border-radius:18px;padding:12px;text-align:center}
figure img{display:block;margin:0 auto;border-radius:12px}
figure .appicon{border-radius:24px}
figcaption{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:8px}
section.strip{margin-top:28px;background:var(--card);border-radius:28px;padding:26px;box-shadow:0 8px 22px rgba(120,80,50,.10)}
.row{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end}
.row figure{background:none;padding:0}
.store img{border-radius:22.5%}
.tabbar{display:flex;gap:28px;padding:16px 22px;border-radius:22px;margin-top:10px}
.tabbar.l{background:var(--page)}.tabbar.d{background:var(--dpage)}
.tabbar div{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--muted)}
.tabbar.d div{color:#B3A796}
@media (max-width:1100px){.grid{grid-template-columns:1fr}.intro{flex-direction:column;align-items:flex-start}}
</style></head><body><main>
<div class="intro">
  <div><p class="over">Silly Travel Tool · mascot exploration · not in the app</p><h1>Eight ways to draw Goose</h1>
  <p class="lede">Each direction is a hand-written SVG in brand tokens only, shown at 256, 64 and 24 px on light and dark, in one colour, in the terracotta tag, as an app icon, and pulling one expression to prove its range. Ranking and what a switch would touch: README.md.</p></div>
  <div class="now"><img src="../logos/goose-mark.svg" width="72" height="72" alt="Current Goose"><img src="../logos/app-icon-tag.svg" width="72" height="72" style="border-radius:16px" alt="Current app icon"><p><b>Today's Goose</b> and app icon, for comparison.</p></div>
</div>
<div class="grid">${DIRECTIONS.map(card).join('')}
</div>
<section class="strip"><h3>In an app-store grid</h3>
  <div class="row store">
    <figure><img src="../logos/app-icon-tag.svg" width="120" height="120" alt=""><figcaption>Today</figcaption></figure>
    ${DIRECTIONS.map((d, i) => `<figure><img src="${f(d, 'app-icon')}" width="120" height="120" alt=""><figcaption>${i + 1} ${d.name}</figcaption></figure>`).join('\n    ')}
  </div>
  <div class="row store" style="margin-top:18px">
    <img src="../logos/app-icon-tag.svg" width="60" height="60" alt="">
    ${DIRECTIONS.map(d => `<img src="${f(d, 'app-icon')}" width="60" height="60" alt="">`).join('')}
    <span style="width:24px"></span>
    <img src="../logos/app-icon-tag.svg" width="29" height="29" alt="">
    ${DIRECTIONS.map(d => `<img src="${f(d, 'app-icon')}" width="29" height="29" alt="">`).join('')}
  </div>
</section>
<section class="strip"><h3>At icon size, beside the 24 px stroke icons (light and dark)</h3>
  <div class="tabbar l">${DIRECTIONS.map((d, i) => `<div><img src="${f(d, 'icon-24')}" width="24" height="24" alt="">${i + 1}</div>`).join('')}
    <div style="margin-left:24px;flex-direction:row;gap:12px">${DIRECTIONS.map(d => `<img src="${f(d, 'icon-24')}" width="16" height="16" alt="">`).join(' ')}16 px</div></div>
  <div class="tabbar d">${DIRECTIONS.map((d, i) => `<div><img src="${f(d, 'icon-24-dark')}" width="24" height="24" alt="">${i + 1}</div>`).join('')}
    <div style="margin-left:24px;flex-direction:row;gap:12px">${DIRECTIONS.map(d => `<img src="${f(d, 'icon-24-dark')}" width="16" height="16" alt="">`).join(' ')}16 px</div></div>
</section>
</main></body></html>
`
}

// ---- Write files ------------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const d of DIRECTIONS) {
    const dir = join(HERE, 'svg', d.slug)
    mkdirSync(dir, { recursive: true })
    const w = (f, s) => writeFileSync(join(dir, f), s)
    w('goose.svg', svg(d.draw(PALETTES.light, 'normal', `${d.slug}-l`), { bg: L.card }))
    w('goose-dark.svg', svg(d.draw(PALETTES.dark, 'normal', `${d.slug}-d`), { bg: DK.page }))
    w('goose-mono.svg', svg(d.draw(PALETTES.mono, 'normal', `${d.slug}-m`), { bg: L.card }))
    w('expression.svg', svg(d.draw(PALETTES.light, d.ex, `${d.slug}-e`), { bg: L.card }))
    w('tag.svg', tagMark(d))
    w('app-icon.svg', appTile(d))
    w('icon-24.svg', svg(d.icon(L.ink), { size: 24, view: '0 0 24 24' }))
    w('icon-24-dark.svg', svg(d.icon(DK.ink), { size: 24, view: '0 0 24 24' }))
  }
  writeFileSync(join(HERE, 'index.html'), contactSheet())
  console.log(`wrote ${DIRECTIONS.length} directions and index.html`)
}
