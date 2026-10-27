// Cost caps fail CLOSED (shared by checkAiQuota in gemini.ts and allowGoogle in google.ts).
// When the quota RPC errors or times out, the last answer it gave for that member is used for up to 60 s (per isolate);
// with no recent answer the call is refused and a `quota_check_failed` row goes to function_errors, so a slow database
// can no longer switch off the daily caps and the kill switches exactly under load.

import { requestFeature } from './usage.ts'

const TTL_MS = 60_000
const answers = new Map<string, { ok: boolean, at: number }>()
const lastLogged = new Map<string, number>()

/** Remember the quota RPC's answer for this member (kind = 'ai' | 'guide' | 'google'). */
export function rememberQuota(kind: string, user: string | null, ok: boolean) {
  const now = Date.now()
  if (answers.size > 2000) for (const [k, v] of answers) if (now - v.at > TTL_MS) answers.delete(k)
  answers.set(`${kind}:${user ?? 'system'}`, { ok, at: now })
}

/**
 * The quota RPC failed: answer from the last successful result (under a minute old), else refuse.
 * Returns what the caller should do (true = go ahead).
 */
export function quotaUnavailable(kind: string, user: string | null, why: string): boolean {
  const hit = answers.get(`${kind}:${user ?? 'system'}`)
  if (hit && Date.now() - hit.at <= TTL_MS) {
    console.warn(`${kind} quota check failed (${why}): using the answer from ${Math.round((Date.now() - hit.at) / 1000)}s ago (${hit.ok ? 'allowed' : 'refused'})`)
    return hit.ok
  }
  console.error(`${kind} quota check failed (${why}): refusing`)
  logQuotaFailure(kind, user, why)
  return false
}

// At most one row per kind every 10 s per isolate, so an outage does not also flood the table it is written to
function logQuotaFailure(kind: string, user: string | null, why: string) {
  const now = Date.now()
  if (now - (lastLogged.get(kind) ?? 0) < 10_000) return
  lastLogged.set(kind, now)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2000)
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/function_errors`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'Content-Type': 'application/json',
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ fn: (requestFeature() || kind).slice(0, 64), kind: 'quota_check_failed', message: `${kind}: ${why}`.slice(0, 300), user_id: user }),
  }).catch(() => {}).finally(() => clearTimeout(timer))
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
}
