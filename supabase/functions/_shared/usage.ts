// Who and what a request is for, so paid API usage can be counted per member and feature (Money → Costs).
// Each request runs in its own AsyncLocalStorage scope: concurrent requests in one isolate never share a member.
// withRequestScope wraps a Deno.serve handler; setRequestUser is called once the caller is known (checkAiQuota
// does it too). Outside a scope (a handler that isn't wrapped) the last value set is used.

import { AsyncLocalStorage } from 'node:async_hooks'

type Scope = { user: string | null, feature: string | null }
const scope = new AsyncLocalStorage<Scope>()
let unscoped: Scope = { user: null, feature: null }

export function withRequestScope<R>(handler: (req: Request) => R) {
  return (req: Request): R => {
    // /functions/v1/places or /places → "places"
    const feature = new URL(req.url).pathname.split('/').filter(Boolean).pop() || null
    return scope.run({ user: null, feature }, () => handler(req))
  }
}

export function setRequestUser(id: string | null) {
  const s = scope.getStore()
  if (s) s.user = id
  else unscoped = { ...unscoped, user: id }
}

export const requestUser = () => (scope.getStore() ?? unscoped).user
export const requestFeature = () => (scope.getStore() ?? unscoped).feature

/** A service-role RPC call (Edge Functions only). */
export const serviceRpc = (name: string, body: unknown, signal?: AbortSignal) => fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
  method: 'POST',
  signal,
  headers: {
    'Content-Type': 'application/json',
    apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
  },
  body: JSON.stringify(body),
})

// Background work the runtime should finish before the isolate goes away
function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
}

/** Record one AI call with its tokens (priced in log_ai_call with the owner's rates). Never throws, never blocks. */
export function logAiCall(c: { provider: 'deepseek' | 'gemini', model: string | null, input: number, cached?: number, output: number, ok?: boolean }) {
  const p = serviceRpc('log_ai_call', {
    p_user: requestUser(), p_feature: requestFeature(), p_provider: c.provider, p_model: c.model,
    p_input: Math.round(c.input || 0), p_cached: Math.round(c.cached || 0), p_output: Math.round(c.output || 0), p_ok: c.ok ?? true,
  }).then(async (res) => { if (!res.ok) console.error('log_ai_call failed:', res.status, (await res.text()).slice(0, 200)) })
    .catch((e) => console.error('log_ai_call error:', (e as Error).message))
  background(p)
}
