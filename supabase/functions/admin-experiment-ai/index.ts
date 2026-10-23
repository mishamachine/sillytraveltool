import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch } from '../_shared/gemini.ts'
import { plan } from '../_shared/experimentMath.js'

// The experiment design partner in the cockpit. Owner only (admin_guard with the caller's session).
// POST { draft, messages: [{ role: 'owner' | 'goose', text }] } → { reply, draft, done }
// Goose asks one or two questions at a time and fills the design as it goes. Traffic, sample size and duration
// come from our data and experimentMath.js; the AI is told them and must not invent its own.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SURFACES = ['paywall', 'website', 'onboarding', 'email', 'trip_planning', 'explore', 'pricing', 'other']
const FIELDS = ['name', 'hypothesis', 'surface', 'audience', 'primary_metric', 'guardrail', 'variants', 'baseline_rate', 'min_effect',
  'traffic_share', 'ice_impact', 'ice_confidence', 'ice_ease']

const PRODUCT = `Silly Travel Tool (STT): a travel organiser app (web, Android, iOS soon). Members create trips, forward booking emails
to a personal inbox that turns them into bookings, read AI city guides, use HONK (find a good spot nearby), translate,
packing lists. Paid plan "First Class": $14.99/year or a founders lifetime deal at $29.99 (Stripe on web). Free plan
limits: 2 upcoming dated trips, 5 reservations per trip, 5 email imports, past trips locked. Very early: few members,
so traffic is small. One-person company.`

function prompt(draft: Record<string, any>, messages: { role: string; text: string }[], traffic: Record<string, any>, running: any[], numbers: any) {
  return `You are Goose, a sharp, friendly growth product manager helping the owner of a small app design ONE A/B experiment.
${PRODUCT}

How to help:
- Ask at most two short questions per turn, then fill in what you can. Plain words, no jargon, no emoji.
- Push for: one clear hypothesis ("If we X for Y, then Z will rise because W"), ONE primary metric, ONE guardrail metric,
  a specific audience, 2 versions (3 only if traffic allows), and a big, noticeable change (traffic is small, so subtle
  tweaks can't be detected).
- Use ONLY the traffic and sample-size numbers given below. Never invent traffic. If a test would take longer than
  6 weeks, say so and suggest a bigger change, a higher-traffic surface, or fewer versions.
- Warn if it clashes with a running test (same surface or same primary metric).
- When the design is complete, say so and suggest ICE scores (impact, confidence, ease, 1-10).
- surface must be one of: ${SURFACES.join(', ')}. baseline_rate is a fraction (0.05 = 5%). min_effect is the relative lift
  to detect (0.3 = +30%). variants: [{ "key": "control", "name": "...", "weight": 50, "description": "..." }, ...].

Daily people reaching each surface (last 28 days, owner and test accounts excluded): ${JSON.stringify(traffic)}
Running or paused tests: ${JSON.stringify(running)}
Current design: ${JSON.stringify(draft)}
Numbers for the current design (computed, trust these): ${JSON.stringify(numbers)}

Conversation so far:
${messages.map((m) => `${m.role === 'goose' ? 'Goose' : 'Owner'}: ${m.text}`).join('\n') || '(none yet: greet briefly and ask what they want to improve)'}

Reply with JSON only: { "reply": "your next message to the owner", "draft": { only the fields you are setting or changing,
from: ${FIELDS.join(', ')} }, "done": true|false }`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: role, error: guardErr } = await asCaller.rpc('admin_guard', { p_min: 'owner' })
    if (guardErr || !role) return json({ error: guardErr?.message || 'not_admin' }, 403)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const b = await req.json().catch(() => ({}))
    const draft = typeof b.draft === 'object' && b.draft ? b.draft : {}
    const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
      .map((m: any) => ({ role: m.role === 'goose' ? 'goose' : 'owner', text: String(m.text || '').slice(0, 2000) }))
    const [{ data: traffic }, { data: running }] = await Promise.all([
      admin.rpc('experiment_traffic'),
      admin.from('experiments').select('name, surface, audience, primary_metric, status').in('status', ['running', 'paused']),
    ])
    const arms = Array.isArray(draft.variants) ? draft.variants.length : 2
    const numbers = plan({ baseline: Number(draft.baseline_rate), mde: Number(draft.min_effect), arms, daily: Number(traffic?.[draft.surface] || 0), share: Number(draft.traffic_share || 1) })

    const res = await geminiFetch(Deno.env.get('GEMINI_API_KEY') || '', {
      contents: [{ role: 'user', parts: [{ text: prompt(draft, messages, traffic || {}, running || [], numbers) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 1500 },
    }, { timeoutMs: 40000 })
    if (!res.ok) return json({ error: 'Goose couldn’t think that through just now. Try again.' }, 502)
    const raw = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    let out: any = {}
    try { out = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()) } catch { out = { reply: raw.slice(0, 1500) } }
    // Keep only known fields with sane values
    const clean: Record<string, any> = {}
    for (const [k, v] of Object.entries(out.draft || {})) {
      if (!FIELDS.includes(k) || v == null) continue
      if (k === 'surface' && !SURFACES.includes(String(v))) continue
      if (['baseline_rate', 'min_effect', 'traffic_share'].includes(k)) { const n = Number(v); if (!(n > 0) || (k !== 'min_effect' && n > 1)) continue; clean[k] = n; continue }
      if (k.startsWith('ice_')) { const n = Math.round(Number(v)); if (n >= 1 && n <= 10) clean[k] = n; continue }
      if (k === 'variants') { if (Array.isArray(v) && v.length >= 2 && v.length <= 4) clean[k] = v.slice(0, 4).map((x: any, i: number) => ({ key: String(x.key || (i ? `v${i}` : 'control')).slice(0, 20), name: String(x.name || '').slice(0, 80), weight: Number(x.weight) || Math.round(100 / v.length), description: String(x.description || '').slice(0, 300) })); continue }
      clean[k] = String(v).slice(0, k === 'hypothesis' ? 2000 : 200)
    }
    return json({ reply: String(out.reply || '').slice(0, 2000), draft: clean, done: !!out.done })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
