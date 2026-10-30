// Usage activity helpers (pure, no React): flag labels, counts for the Abuse watch summary, default order.
// The flags themselves are decided in the database (admin_usage_activity); this only names and counts them.

export const USAGE_FLAGS = [
  ['over_ai_limit', 'Over AI limit'],
  ['inbox_cap', 'Inbox cap hit'],
  ['free_import_blocked', 'Import blocked'],
  ['far_above_median', 'Far above median'],
]
export const FLAG_LABEL = Object.fromEntries(USAGE_FLAGS)
export const RECENT_KIND_LABEL = { inbox_cap_hit: 'Inbox cap hit', free_import_blocked: 'Free import blocked' }

export function summarise(members = []) {
  const out = { flagged: 0, ...Object.fromEntries(USAGE_FLAGS.map(([k]) => [k, 0])) }
  for (const m of members) {
    const f = m.flags || []
    if (f.length) out.flagged++
    for (const k of f) if (k in out) out[k]++
  }
  return out
}

// Default order: most AI calls first, then email, so the order is stable
export const byAiCalls = (members = []) =>
  [...members].sort((a, b) => (b.ai_calls || 0) - (a.ai_calls || 0) || String(a.email).localeCompare(String(b.email)))
