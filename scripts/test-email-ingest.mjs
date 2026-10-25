#!/usr/bin/env node
// Booking-email ingestion tests against supabase/tests/fixtures/booking-emails.json.
//
//   parse mode — calls parse-booking-email as a signed-in user and checks the
//   extracted fields against each fixture's `expect`:
//     STT_TEST_JWT=<access token> node scripts/test-email-ingest.mjs parse [fixture-id …]
//
//   webhook mode — signs each fixture exactly like Resend/Svix and posts it to
//   receive-booking-email, exercising signature check → token lookup → Gemini →
//   trip matching → insert. Creates real bookings for the address owner, so use
//   a test account or a test project. The fixtures come from airline addresses, so
//   that account needs user_profiles.inbox_accept_any = true (Settings → Accept
//   from any sender), else every one is dropped by the sender check:
//     RESEND_WEBHOOK_SECRET=whsec_… STT_BOOKING_ADDRESS=<token>@bookings.sillytraveltool.com \
//       node scripts/test-email-ingest.mjs webhook [fixture-id …]
//
// STT_SUPABASE_URL overrides the project URL (default: VITE_SUPABASE_URL from .env.local).

import { readFileSync, existsSync } from 'node:fs'
import { createHmac, randomUUID } from 'node:crypto'

const root = new URL('..', import.meta.url).pathname
const fixtures = JSON.parse(readFileSync(`${root}supabase/tests/fixtures/booking-emails.json`, 'utf8')).emails

function envFromDotenv(key) {
  const file = `${root}.env.local`
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim()
}

const SUPABASE_URL = process.env.STT_SUPABASE_URL || envFromDotenv('VITE_SUPABASE_URL')
const ANON_KEY = process.env.STT_ANON_KEY || envFromDotenv('VITE_SUPABASE_ANON_KEY')
const [mode, ...only] = process.argv.slice(2)
const selected = only.length ? fixtures.filter(f => only.includes(f.id)) : fixtures

const norm = v => String(v ?? '').toLowerCase().replace(/[\s.\-–—]/g, '')

// Loose comparison: strings match if one contains the other once spacing and
// punctuation are ignored ("UA 901" ≈ "UA901", "London St Pancras" ⊂ "London St Pancras International").
function matches(expected, actual) {
  if (actual == null) return false
  if (typeof expected === 'number') return Math.abs(Number(actual) - expected) < 0.01
  const e = norm(expected), a = norm(actual)
  return a.includes(e) || e.includes(a)
}

function check(expect, bookings) {
  const first = bookings[0] || {}
  const last = bookings[bookings.length - 1] || {}
  const failures = []
  for (const [key, want] of Object.entries(expect)) {
    let got
    if (key === 'legs') got = bookings.length
    else if (key === 'departure_date') got = (first.departure_time || first.activity_date || first.check_in_date || '').slice(0, 10)
    else if (key === 'arrival_airport' && expect.legs) got = last.arrival_airport
    else if (key === 'activity_time') got = (first.activity_time || '').slice(0, 5)
    else got = first[key]
    const ok = key === 'legs' ? got === want : matches(want, got)
    if (!ok) failures.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }
  return failures
}

async function runParse() {
  const jwt = process.env.STT_TEST_JWT
  if (!jwt) throw new Error('STT_TEST_JWT is required (access token of a signed-in test user)')
  let passed = 0
  for (const f of selected) {
    const emailText = `Subject: ${f.subject}\nFrom: ${f.from}\n\n${f.text}`
    const started = Date.now()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-booking-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: ANON_KEY },
      body: JSON.stringify({ emailText }),
    })
    const body = await res.json().catch(() => ({}))
    const ms = Date.now() - started
    if (!res.ok) { console.log(`FAIL ${f.id} (${ms}ms) HTTP ${res.status}: ${body.error || ''}`); continue }
    const failures = check(f.expect, body.bookings || [])
    if (failures.length) console.log(`FAIL ${f.id} (${ms}ms)\n       ${failures.join('\n       ')}`)
    else { passed++; console.log(`PASS ${f.id} (${ms}ms)`) }
  }
  console.log(`\n${passed}/${selected.length} fixtures parsed as expected`)
  process.exitCode = passed === selected.length ? 0 : 1
}

// Svix signature: base64(HMAC-SHA256(secretBytes, `${id}.${timestamp}.${body}`))
function svixHeaders(secret, body) {
  const id = `msg_${randomUUID()}`
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${sig}` }
}

async function runWebhook() {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const to = process.env.STT_BOOKING_ADDRESS
  if (!secret || !to) throw new Error('RESEND_WEBHOOK_SECRET and STT_BOOKING_ADDRESS are required')
  let passed = 0
  for (const f of selected) {
    const body = JSON.stringify({
      type: 'email.received',
      data: { email_id: `test-${f.id}`, to: [{ email: to }], from: f.from, subject: f.subject, text: f.text },
    })
    const res = await fetch(`${SUPABASE_URL}/functions/v1/receive-booking-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...svixHeaders(secret, body) },
      body,
    })
    const out = await res.json().catch(() => ({}))
    const typeOk = !f.expect.type || out.booking_type === f.expect.type
    if (res.ok && out.success && typeOk) {
      passed++
      console.log(`PASS ${f.id} → ${out.booking_type} "${out.booking_title}" → trip ${out.trip_title || 'unassigned'}`)
    } else {
      console.log(`FAIL ${f.id} HTTP ${res.status} ${out.error || ''} ${typeOk ? '' : `(type ${out.booking_type}, expected ${f.expect.type})`}`)
    }
  }
  console.log(`\n${passed}/${selected.length} emails ingested`)
  process.exitCode = passed === selected.length ? 0 : 1
}

// This is a live test against the Supabase project, so it is not part of the CI gate (check.yml runs `npm test`,
// which includes this file): without credentials it explains itself and exits 0 instead of failing the run.
const credentials = mode === 'parse' ? process.env.STT_TEST_JWT
  : mode === 'webhook' ? process.env.RESEND_WEBHOOK_SECRET && process.env.STT_BOOKING_ADDRESS
  : null
if (!credentials || !SUPABASE_URL) {
  console.log('SKIP test-email-ingest: live test against Supabase (needs the network and credentials).')
  console.log('  parse:   STT_TEST_JWT=<access token of a signed-in test user> node scripts/test-email-ingest.mjs parse [fixture-id …]')
  console.log('  webhook: RESEND_WEBHOOK_SECRET=whsec_… STT_BOOKING_ADDRESS=<token>@bookings.sillytraveltool.com node scripts/test-email-ingest.mjs webhook [fixture-id …]')
  if (!SUPABASE_URL) console.log('  Also set STT_SUPABASE_URL, or VITE_SUPABASE_URL in .env.local.')
  console.log(`  Fixtures (${fixtures.length}): ${fixtures.map(f => f.id).join(', ')}`)
  process.exit(0)
}
if (mode === 'parse') await runParse()
else await runWebhook()
