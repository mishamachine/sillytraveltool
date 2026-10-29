#!/usr/bin/env node
// AI consent rules that need no database: the re-ask rule, and the three copies of the wording version and routing
// text (app, Edge Functions, SQL allow-list) agreeing. What this does NOT cover: the SQL itself (RLS, the
// append-only trigger, the guard trigger, the RPC) needs a Postgres; expected behaviour is in the migration comments.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { AI_CONSENT_VERSION, AI_CONSENT_ROUTING, consentCurrent } from '../src/lib/aiConsentPolicy.js'

const root = new URL('..', import.meta.url).pathname
const read = p => readFileSync(root + p, 'utf8')
const sql = read('supabase/migrations/20261029100000_ai_consent_hardening.sql')
const fn = read('supabase/functions/_shared/consent.ts')

// Re-ask rule: only a yes to the current wording and routing counts
const yes = { ai_consent_at: '2026-10-29T10:00:00Z', ai_consent_version: AI_CONSENT_VERSION, ai_consent_routing: AI_CONSENT_ROUTING }
assert.equal(consentCurrent(yes), true)
assert.equal(consentCurrent({ ...yes, ai_consent_version: 'v2-2026-10-29' }), false, 'a yes under v2 asks again')
assert.equal(consentCurrent({ ...yes, ai_consent_version: 'v1' }), false, 'old wording asks again')
assert.equal(consentCurrent({ ...yes, ai_consent_routing: 'gemini-only' }), false, 'changed routing asks again')
assert.equal(consentCurrent({ ...yes, ai_consent_routing: null }), false)
assert.equal(consentCurrent({ ...yes, ai_consent_at: null }), false, 'withdrawn / declined')
assert.equal(consentCurrent(null), false)

// The same version and routing in the Edge Functions and the SQL (the server's allow-list and constant)
assert.ok(fn.includes(`AI_CONSENT_VERSION = '${AI_CONSENT_VERSION}'`), '_shared/consent.ts version')
assert.ok(fn.includes(`AI_CONSENT_ROUTING = '${AI_CONSENT_ROUTING}'`), '_shared/consent.ts routing')
assert.ok(sql.includes(`v_versions constant text[] := array['${AI_CONSENT_VERSION}'`), 'SQL version allow-list starts with the current version')
assert.ok(sql.includes("'v2-2026-10-29']"), 'SQL still accepts the previous version from older apps')
assert.ok(sql.includes(`v_routing constant text := '${AI_CONSENT_ROUTING}'`), 'SQL routing constant')

// The record is append-only and server-written: no client write path in the migration
assert.ok(/revoke all on public\.ai_consent_events from anon, authenticated;\s*grant select on public\.ai_consent_events to authenticated;/.test(sql))
assert.ok(!/create policy [^;]* on public\.ai_consent_events for (insert|update|delete|all)/.test(sql))
assert.ok(/before update or delete on public\.ai_consent_events/.test(sql))
assert.ok(/before truncate on public\.ai_consent_events/.test(sql) && /revoke truncate on public\.ai_consent_events from service_role/.test(sql))
assert.ok(sql.includes(`ai_consent_version = '${AI_CONSENT_VERSION}' and ai_consent_routing = '${AI_CONSENT_ROUTING}'`), 'claim_held_emails checks version and routing')
console.log('ai consent: re-ask rule, version/routing agree across app, functions and SQL, append-only grants')
