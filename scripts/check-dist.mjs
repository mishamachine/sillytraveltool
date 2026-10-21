#!/usr/bin/env node
// Fails the build if demo-mode fixtures (src/dev) ended up in dist/.
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../dist/assets/', import.meta.url)
const leaks = readdirSync(dir).filter(f => f.endsWith('.js') && /sam@demo\.sillytraveltool|buildFixtures/.test(readFileSync(new URL(f, dir), 'utf8')))
if (leaks.length) {
  console.error(`Demo fixtures found in ${leaks.join(', ')}`)
  process.exit(1)
}
console.log('dist check passed: no demo fixtures in the bundle')
