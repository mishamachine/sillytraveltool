#!/usr/bin/env node
// Clay guardrails: no emoji, no raw colours, no inline styles in the app source.
// `npm run check:clay` exits 1 and lists every violation.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')

// Files allowed to hold raw colour values: generated tokens and the token helper.
const COLOUR_OK = new Set(['src/styles/tokens.css', 'src/lib/tokens.js'])
// Dev-only files are exempt from the inline-style rule.
const isDev = p => p.startsWith('src/dev/')

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}]/u
// Google's sign-in mark must keep its own brand colours (Google identity guidelines).
const GOOGLE_MARK = /#(4285F4|34A853|FBBC05|EA4335)\b/gi
const HEX = /#[0-9a-fA-F]{3,8}\b/
const RGB = /\brgba?\(/
const INLINE_STYLE = /\sstyle=\{\{/

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const problems = []
for (const file of walk(SRC)) {
  if (!/\.(jsx?|css)$/.test(file)) continue
  const rel = relative(root, file)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    // Route notation ("SEA → MAD") is content, not an icon substitute
    const text = line.replace(/\w \u2192 \w/gu, '')
    if (EMOJI.test(isDev(rel) ? text.replace(/[\u2190-\u21FF]/g, '') : text)) problems.push(`${where}  emoji/arrow glyph: ${line.trim().slice(0, 90)}`)
    if (!COLOUR_OK.has(rel) && (HEX.test(line.replace(GOOGLE_MARK, '')) || RGB.test(line)) && !/&#|#[0-9a-f]{3,8}-|href=|id=|url\(#/i.test(line)) {
      problems.push(`${where}  raw colour: ${line.trim().slice(0, 90)}`)
    }
    if (!isDev(rel) && INLINE_STYLE.test(line)) problems.push(`${where}  inline style: ${line.trim().slice(0, 90)}`)
  })
}

if (problems.length) {
  console.log(problems.join('\n'))
  console.log(`\n${problems.length} Clay violation(s)`)
  process.exitCode = 1
} else {
  console.log('Clay check passed: no emoji, raw colours or inline styles in src/')
}
