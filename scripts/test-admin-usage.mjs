// Usage activity helpers (src/admin/usage.js): counting and default order for the admin Abuse watch.
import assert from 'node:assert/strict'
import { summarise, byAiCalls, USAGE_FLAGS, FLAG_LABEL } from '../src/admin/usage.js'

const m = (email, ai_calls, flags = []) => ({ email, ai_calls, flags })
const rows = [m('b@x.com', 5), m('a@x.com', 5), m('c@x.com', 191, ['over_ai_limit', 'far_above_median']), m('d@x.com', 0, ['inbox_cap']),
  m('e@x.com', 2, ['free_import_blocked', 'inbox_cap', 'unknown_future_flag'])]

assert.deepEqual(summarise(rows), { flagged: 3, over_ai_limit: 1, inbox_cap: 2, free_import_blocked: 1, far_above_median: 1 })
assert.deepEqual(summarise([]), { flagged: 0, over_ai_limit: 0, inbox_cap: 0, free_import_blocked: 0, far_above_median: 0 })
assert.deepEqual(summarise(undefined).flagged, 0)
assert.deepEqual(byAiCalls(rows).map(r => r.email), ['c@x.com', 'a@x.com', 'b@x.com', 'e@x.com', 'd@x.com'])
assert.equal(rows[0].email, 'b@x.com', 'sorting does not mutate the input')
assert.equal(USAGE_FLAGS.length, 4)
assert.equal(FLAG_LABEL.inbox_cap, 'Inbox cap hit')
console.log('admin usage helpers: ok')

import { canSeeUsage, RECENT_KIND_LABEL } from '../src/admin/usage.js'
assert.ok(canSeeUsage('owner') && canSeeUsage('support'))
assert.ok(!canSeeUsage('analyst') && !canSeeUsage(undefined))
assert.match(RECENT_KIND_LABEL.inbox_quota_refused, /not a cap hit/)
console.log('admin usage roles and labels: ok')
