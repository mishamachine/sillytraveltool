#!/usr/bin/env node
// Regenerates every web/PWA icon in public/ and the Capacitor source images in assets/
// from the luggage-tag logos in docs/brand/logos/. Then run:
//   npx capacitor-assets generate --android   (launcher icons + splash into android/)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logo = name => readFileSync(resolve(root, 'docs/brand/logos', name), 'utf8')
const inner = svg => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

const ACCENT = '#B24A17'
const PAGE = '#F4EEE6'
const PAGE_DARK = '#1C1814'

// favicon-tag.svg is 120×160 (3:4); centre it in a square for favicons.
const faviconSquare = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none"><g transform="translate(20 0)">${inner(logo('favicon-tag.svg'))}</g></svg>`
const appIcon = logo('app-icon-tag.svg') // full-bleed terracotta square with the cream tag
const tagMark = logo('tag-mark.svg') // 120×160, terracotta tag with the Goose window

// The tag scaled to fit `frac` of a square canvas, optionally on a solid background.
function tagOnSquare({ size, frac, bg, mark = tagMark }) {
  const h = size * frac
  const w = h * 0.75
  const x = (size - w) / 2
  const y = (size - h) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 120 160" fill="none">${inner(mark)}</svg></svg>`
}

// Cream tag (app-icon style) without the background, for the adaptive-icon foreground.
const creamTag = inner(appIcon).replace(/^<rect[^>]*\/>/, '').replace(/^<svg x="27" y="12" width="66" height="96" viewBox="0 0 120 160">/, '').replace(/<\/svg>$/, '')
const creamTagSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" fill="none">${creamTag}</svg>`

async function png(svg, size, out) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(resolve(root, out))
  console.log('wrote', out)
}

// ICO with embedded PNGs (supported by every current browser).
async function ico(svg, sizes, out) {
  const images = await Promise.all(sizes.map(s => sharp(Buffer.from(svg), { density: 384 }).resize(s, s).png().toBuffer()))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const dir = images.map((img, i) => {
    const e = Buffer.alloc(16)
    const s = sizes[i]
    e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12)
    offset += img.length
    return e
  })
  writeFileSync(resolve(root, out), Buffer.concat([header, ...dir, ...images]))
  console.log('wrote', out)
}

mkdirSync(resolve(root, 'assets'), { recursive: true })

// ---- web / PWA ----
writeFileSync(resolve(root, 'public/favicon.svg'), faviconSquare)
console.log('wrote public/favicon.svg')
await ico(faviconSquare, [16, 32, 48], 'public/favicon.ico')
await png(faviconSquare, 32, 'public/favicon-32x32.png')
await png(faviconSquare, 64, 'public/favicon.png')
await png(appIcon, 180, 'public/apple-touch-icon.png')
await png(appIcon, 192, 'public/pwa-192x192.png')
await png(appIcon, 512, 'public/pwa-512x512.png')
// Maskable: keep the tag inside the 80% safe circle
await png(tagOnSquare({ size: 512, frac: 0.62, bg: ACCENT, mark: creamTagSvg }), 512, 'public/pwa-maskable-512x512.png')

// ---- Capacitor (@capacitor/assets) sources ----
await png(appIcon, 1024, 'assets/icon-only.png')
await png(tagOnSquare({ size: 1024, frac: 0.64, mark: creamTagSvg }), 1024, 'assets/icon-foreground.png')
await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${ACCENT}"/></svg>`, 1024, 'assets/icon-background.png')
await png(tagOnSquare({ size: 2732, frac: 0.2, bg: PAGE }), 2732, 'assets/splash.png')
await png(tagOnSquare({ size: 2732, frac: 0.2, bg: PAGE_DARK }), 2732, 'assets/splash-dark.png')

// ---- Android adaptive icon foreground (108dp per density; @capacitor/assets emits 48dp layers) ----
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
for (const [d, px] of Object.entries(DENSITIES)) {
  await png(tagOnSquare({ size: 432, frac: 0.5, mark: creamTagSvg }), px, `android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`)
}
