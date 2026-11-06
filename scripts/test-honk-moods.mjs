// HONK moods: the app's six labels and every pre-0.20.2 label map to a Google query. Run: node scripts/test-honk-moods.mjs
import assert from 'node:assert/strict'
import { MOODS, MOOD_QUERY, moodQuery } from '../supabase/functions/_shared/honkMoods.js'

assert.equal(MOODS.length, 6, 'six moods')
assert.equal(new Set(MOODS.map(m => m.id)).size, 6, 'mood ids are unique')
assert.equal(new Set(MOODS.map(m => m.label)).size, 6, 'mood labels are unique')
for (const m of MOODS) {
  assert.ok(m.hint && m.icon && m.tone, `${m.id}: hint, icon and tone`)
  assert.equal(moodQuery(m.label), m.query, `${m.label}: its own query`)
}
// App builds up to 0.20.1 send these labels; they must keep their queries
const OLD = ["I'm hungry", 'Show me something', "I'm bored", 'Treat myself', 'On a budget', 'Culture me', 'Night out', 'Be a local']
for (const label of OLD) assert.ok(MOOD_QUERY[label] && MOOD_QUERY[label] !== label, `${label}: still mapped`)
assert.equal(moodQuery('Something new'), 'Something new', 'unknown labels are searched as written')
// Wording: no emoji in labels or hints
assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(MOODS)), 'no emoji')
console.log('honk moods: ok')
