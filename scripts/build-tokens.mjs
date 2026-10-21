#!/usr/bin/env node
// Generates src/styles/tokens.css (light + dark CSS variables and type classes) from
// docs/brand/brand-tokens.json and docs/brand/dark-tokens.json.
//   node scripts/build-tokens.mjs            write tokens.css
//   node scripts/build-tokens.mjs --report   print the contrast table (markdown) for DARK_MODE.md
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const brand = JSON.parse(readFileSync(resolve(root, 'docs/brand/brand-tokens.json'), 'utf8'))
const dark = JSON.parse(readFileSync(resolve(root, 'docs/brand/dark-tokens.json'), 'utf8'))

const light = Object.fromEntries(brand.color.tokens.map(t => [t.name, t.value]))
const lightAll = { ...light, ...dark.extensions.light }
const darkAll = { ...dark.color, ...dark.extensions.dark }

for (const name of Object.keys(light)) {
  if (!(name in dark.color)) throw new Error(`dark-tokens.json is missing colour "${name}"`)
}

// ---- contrast ------------------------------------------------------------
function rgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// [foreground, background, minimum ratio, what it is]
const PAIRS = [
  ['ink', 'surface-page', 4.5, 'Body text on the page'],
  ['ink', 'surface-card', 4.5, 'Body text on cards'],
  ['ink', 'surface-sunken', 4.5, 'Selected segment label / text on sunken track'],
  ['ink-secondary', 'surface-page', 4.5, 'Supporting copy on the page'],
  ['ink-secondary', 'surface-card', 4.5, 'Supporting copy on cards'],
  ['ink-secondary', 'surface-sunken', 4.5, 'Unselected segment label'],
  ['ink-secondary', 'line', 3, 'Car / note icon on its tile'],
  ['ink-muted', 'surface-page', 4.5, 'Meta text, overlines on the page'],
  ['ink-muted', 'surface-card', 4.5, 'Meta text on cards'],
  ['accent', 'surface-page', 4.5, 'Links, overlines, active tab on the page'],
  ['accent', 'surface-card', 4.5, 'Links and active nav on cards'],
  ['accent', 'accent-soft', 4.5, 'Accent icon / text on its soft tile'],
  ['on-accent', 'accent-fill', 4.5, 'Primary button label'],
  ['ink-inverse', 'surface-inverse', 4.5, 'Text on inverse hero cards'],
  ['ink-inverse-muted', 'surface-inverse', 4.5, 'Secondary text on inverse hero'],
  ['accent-on-inverse', 'surface-inverse', 4.5, 'Terracotta text on inverse hero'],
  ['danger', 'surface-card', 4.5, 'Emergency numbers, destructive links'],
  ['danger', 'danger-soft', 4.5, 'Danger icon on its tile'],
  ['on-danger', 'danger-fill', 4.5, 'Danger button label'],
  ['success', 'surface-card', 4.5, 'Completed chips, checks'],
  ['success', 'success-soft', 4.5, 'Success chip text on its fill'],
  ['info', 'surface-card', 4.5, 'Info text on cards'],
  ['info', 'info-soft', 4.5, 'Flight icon / date chip on its tile'],
  ['stay', 'stay-soft', 4.5, 'Stay icon on its tile'],
  ['weather-sun', 'surface-card', 3, 'Sun icon (icon only, 3:1; light value is the signed-off brand token)'],
  ['goose-outline', 'goose-tile', 3, 'Goose outline on its light tile'],
]

function report() {
  const rows = ['| Pair | Use | Min | Light | Dark | Dark values |', '|---|---|---|---|---|---|']
  let failures = 0
  for (const [fg, bg, min, use] of PAIRS) {
    const l = contrast(lightAll[fg], lightAll[bg])
    const d = contrast(darkAll[fg], darkAll[bg])
    const mark = r => `${r.toFixed(2)}:1${r < min ? ' **FAIL**' : ''}`
    if (d < min) failures++
    rows.push(`| \`${fg}\` on \`${bg}\` | ${use} | ${min}:1 | ${mark(l)} | ${mark(d)} | ${darkAll[fg]} on ${darkAll[bg]} |`)
  }
  console.log(rows.join('\n'))
  if (failures) { console.error(`\n${failures} dark pair(s) below minimum`); process.exitCode = 1 }
}

// ---- CSS -----------------------------------------------------------------
const px = v => v
const vars = (obj, indent = '  ') => Object.entries(obj).map(([k, v]) => `${indent}--${k}: ${v};`).join('\n')

function build() {
  const spacing = Object.fromEntries(brand.spacing.tokens.map(t => [t.name, px(t.value)]))
  const radius = Object.fromEntries(brand.radius.tokens.map(t => [t.name, t.value]))
  const shadowLight = Object.fromEntries(brand.shadow.tokens.map(t => [t.name, t.value]))
  const size = Object.fromEntries(brand.size.tokens.map(t => [t.name, t.value]))
  const fonts = { 'font-display': brand.type.families.display, 'font-body': brand.type.families.body }

  const typeVars = {}
  const typeClasses = []
  for (const group of brand.type.groups) {
    for (const s of group.styles) {
      typeVars[`type-${s.name}-size`] = s.fontSize
      typeClasses.push(
        `.t-${s.name} {\n  font-family: var(--font-${group.family});\n  font-size: ${s.fontSize};\n  line-height: ${s.lineHeight};\n  font-weight: ${s.fontWeight};\n  letter-spacing: ${s.letterSpacing || 'normal'};${s.name === 'overline' ? '\n  text-transform: uppercase;' : ''}\n}`
      )
    }
  }

  const css = `/* GENERATED by scripts/build-tokens.mjs from docs/brand/brand-tokens.json + dark-tokens.json.
   Do not edit by hand: run \`npm run tokens\`. */

:root {
  color-scheme: light;
${vars(lightAll)}
${vars(shadowLight)}
${vars(spacing)}
${vars(radius)}
${vars(size)}
${vars(fonts)}
${vars(typeVars)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${vars(darkAll, '    ')}
${vars(dark.shadow, '    ')}
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
${vars(darkAll)}
${vars(dark.shadow)}
}

${typeClasses.join('\n\n')}
`
  writeFileSync(resolve(root, 'src/styles/tokens.css'), css)
  console.log('wrote src/styles/tokens.css')
}

if (process.argv.includes('--report')) report()
else build()
