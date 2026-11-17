#!/usr/bin/env node
// The AI reading notice, trimmed to the store minimum (17 Nov 2026): pins the exact strings, that the consent version
// and routing are NOT bumped (the wording is shorter, the meaning and routing are unchanged), that "Privacy Policy" is a
// link, and that Allow needs an explicit tap. Reads source text; no build or network.
//   node scripts/test-ai-notice-copy.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AI_CONSENT, AI_CONSENT_POLICY_URL, AI_CONSENT_POLICY_LABEL } from '../src/lib/aiConsentCopy.js'
import { AI_CONSENT_VERSION, AI_CONSENT_ROUTING } from '../src/lib/aiConsentPolicy.js'
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

assert.equal(AI_CONSENT.title, 'Let Goose read your bookings with AI?')
assert.equal(AI_CONSENT.intro, 'Goose sends what you forward or import, and what you translate, to AI partners (DeepSeek and Google) to read it. Details are in our Privacy Policy.')
assert.deepEqual(AI_CONSENT.bullets, []); assert.equal(AI_CONSENT.outro, '')
assert.equal(AI_CONSENT.afterPolicy, 'You can change your choice any time in Settings.')
assert.equal(AI_CONSENT.notNow, 'You can still add bookings by hand.')
assert.ok(AI_CONSENT.intro.includes(AI_CONSENT_POLICY_LABEL) && AI_CONSENT_POLICY_URL === 'https://sillytraveltool.com/privacy/#ai')

// Not bumped: same wording version and routing as before, in the app, the functions and the SQL allow-list
assert.equal(AI_CONSENT_VERSION, 'v4-2026-10-29', 'AI_CONSENT_VERSION unchanged')
assert.equal(AI_CONSENT_ROUTING, 'deepseek-first+gemini-fallback; pdf/image gemini', 'routing unchanged')

const sheet = read('src/components/shared/AiConsentSheet.jsx')
assert.ok(/<a href=\{AI_CONSENT_POLICY_URL\}[^>]*>\{AI_CONSENT_POLICY_LABEL\}<\/a>/.test(sheet), 'Privacy Policy is a link')
assert.ok(/onClick=\{\(\) => answer\(true\)\}>Allow</.test(sheet) && /onClick=\{\(\) => answer\(false\)\}>Not now</.test(sheet), 'Allow and Not now are explicit buttons')
assert.ok(!/autoFocus|defaultChecked|onScroll|useEffect\([^)]*answer\(true\)/.test(sheet), 'nothing is pre-selected and nothing allows on scroll')
assert.ok(/Not now<\/Button>\s*<Text[^>]*>\{AI_CONSENT\.notNow\}<\/Text>/.test(sheet), '"You can still add bookings by hand." sits under Not now')
assert.ok(/<AiConsentDetails showNotNow=\{false\} \/>/.test(sheet))
assert.equal((sheet.match(/answer\(true\)/g) || []).length, 1, 'answer(true) is called from the Allow button only')

const settings = read('src/screens/profile/SettingsView.jsx')
assert.ok(settings.includes('<Switch label="AI reading" description="AI partners read what you forward, import or translate. Off: forwarded emails wait for your OK."'))
assert.ok(!settings.includes('AI reading of imports and translations'))
console.log('ai notice copy: strings pinned, version unchanged, link and explicit Allow')
