#!/usr/bin/env node
// The cost caps fail CLOSED (audit C1): checkAiQuota (_shared/gemini.ts) and allowGoogle (_shared/google.ts) refuse when
// the quota RPC errors or takes longer than 2 s, unless that member's last answer is under 60 s old; a refusal logs a
// quota_check_failed row. The migration's SQL is not run here (no database): see supabase/migrations/20261025150000.
//   node scripts/test-quota-fail-closed.mjs
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'stt-quota-'))
await build({
  stdin: { contents: "export * from './_shared/gemini.ts'; export * from './_shared/google.ts'; export { withRequestScope } from './_shared/usage.ts'", resolveDir: `${root}supabase/functions`, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/quota.mjs`, logLevel: 'error',
})

globalThis.Deno = { env: { get: k => ({ SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] } }
// What the fake database does with the next quota RPC: 'true' | 'false' | 'error' | 'hang'
let mode = 'true'
const logged = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.includes('/rest/v1/function_errors')) { logged.push(JSON.parse(init.body)); return new Response('', { status: 201 }) }
  if (!u.includes('consume_ai_quota') && !u.includes('consume_api_call')) return new Response('{}', { status: 404 })
  if (mode === 'error') return new Response('{"message":"upstream"}', { status: 500 })
  if (mode === 'hang') return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  return new Response(mode, { status: 200 })
}
let now = 1_800_000_000_000
Date.now = () => now
const origWarn = console.warn, origErr = console.error
console.warn = console.error = () => {}

const { checkAiQuota, allowGoogle, withRequestScope, setGoogleUser } = await import(`${dir}/quota.mjs`)
const settle = () => new Promise(r => setTimeout(r, 5))
// allowGoogle reads the member from the request scope: run each call inside one
const google = (u) => withRequestScope(async () => { setGoogleUser(u); return allowGoogle('text_search') })(new Request('http://x/functions/v1/places'))
const kinds = { 'AI (checkAiQuota)': (u) => checkAiQuota(u, 'ai'), 'guide (checkAiQuota)': (u) => checkAiQuota(u, 'guide'), 'Google (allowGoogle)': google }

for (const [name, check] of Object.entries(kinds)) {
  const u = `user-${name}`
  logged.length = 0

  // Healthy: the answer is passed through
  mode = 'true'; assert.equal(await check(u), true, `${name}: allowed`)
  mode = 'false'; assert.equal(await check(u), false, `${name}: over the cap`)

  // The RPC errors: the last answer (false here) holds for 60 s, and nothing is logged (it is not a new refusal)
  mode = 'error'; now += 30_000
  assert.equal(await check(u), false, `${name}: error with a cached refusal stays refused`)
  mode = 'true'; assert.equal(await check(u), true); mode = 'error'; now += 30_000
  assert.equal(await check(u), true, `${name}: error with a cached allowance (30 s old) goes ahead`)
  await settle(); assert.equal(logged.length, 0, `${name}: nothing logged while the cache answers`)

  // …but not for longer than 60 s
  now += 31_000
  assert.equal(await check(u), false, `${name}: error with a 61 s old answer refuses`)
  await settle(); assert.equal(logged.length, 1, `${name}: refusal logged`)
  assert.equal(logged[0].kind, 'quota_check_failed'); assert.equal(logged[0].user_id, u); assert.match(logged[0].message, /500/)

  // A member we have never seen: refused, logged (the log is throttled to one row per kind per 10 s)
  now += 11_000
  assert.equal(await check('stranger'), false, `${name}: unknown member refused`)
  await settle(); assert.equal(logged.length, 2)
  assert.equal(await check('stranger-2'), false); await settle()
  assert.equal(logged.length, 2, `${name}: log throttled`)

  // One member's cached answer never covers another
  mode = 'true'; assert.equal(await check('member-a'), true); mode = 'error'
  assert.equal(await check('member-b'), false, `${name}: member-b has no cached answer`)

  // A timeout (2 s) counts as an error
  now += 120_000
  mode = 'hang'
  const t0 = performance.now()
  assert.equal(await check('slow-member'), false, `${name}: timeout refuses`)
  const took = performance.now() - t0
  assert.ok(took >= 1900 && took < 3500, `${name}: timed out after ~2 s, took ${Math.round(took)} ms`)
  mode = 'true'; assert.equal(await check('slow-member'), true); mode = 'error'
  assert.equal(await check('slow-member'), true, `${name}: error with a fresh cached allowance goes ahead`)
  origWarn(`ok  ${name}: passes through; error/timeout uses the <60 s cache, else refuses and logs quota_check_failed`)
}
console.warn = origWarn; console.error = origErr
console.log('\nall quota fail-closed checks passed')
