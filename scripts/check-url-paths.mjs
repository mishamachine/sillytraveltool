#!/usr/bin/env node
// Apache-free check, run after `npm run build`: every URL path the app, the Edge Functions and the public pages
// link to must resolve to a file or folder in dist/, or be covered by a rewrite in public/.htaccess.
// public/.htaccess has no catch-all, so an unlisted path is a real 404.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')
const htaccess = readFileSync(join(root, 'public/.htaccess'), 'utf8')
const rewrites = [...htaccess.matchAll(/^RewriteRule \^([^\s]+)\$ \/index\.html/gm)].map(m => new RegExp('^' + m[1] + '$'))

const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!['node_modules', 'dist', '.git', 'ios', 'android'].includes(f)) walk(p) } else if (/\.(jsx?|ts|html)$/.test(f)) files.push(p) } }
for (const d of ['src', 'supabase/functions', 'public', 'beta', 'upgrade', 'redeem', 'unsubscribe']) walk(join(root, d))

const paths = new Set()
for (const f of files) {
  const t = readFileSync(f, 'utf8')
  for (const m of t.matchAll(/(?:sillytraveltool\.com|\$\{(?:appUrl|APP_URL|location\.origin|origin|SITE_URL)\})(\/[A-Za-z0-9_\-./]*)/g)) paths.add(m[1].replace(/\.+$/, '') || '/')
  for (const m of t.matchAll(/href="(\/[A-Za-z0-9_\-./]*)"/g)) paths.add(m[1].replace(/\.+$/, '') || '/')
}
let bad = 0
for (const p of [...paths].sort()) {
  const rel = p.replace(/^\//, '')
  const ok = rel === '' || existsSync(join(dist, rel)) || existsSync(join(dist, rel, 'index.html')) || rewrites.some(r => r.test(rel))
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${p}`)
  if (!ok) bad++
}
console.log(`${paths.size} paths checked, ${bad} unresolved`)
process.exit(bad ? 1 : 0)
