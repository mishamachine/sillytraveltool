import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Cost alert email to the owner (docs/PAYWALL_PLAN.md section 10). Two callers:
//   pg_cron, hourly: header x-cron-token = the Vault secret cost_alert_token → emails only when today's estimated
//     AI + Google spend passed cost_alert.daily_usd (once a day) or a member crossed an abuse level (once per member/day/kind)
//   the owner, from the cockpit: { test: true } with their session → always sends, marked as a test
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const FROM = Deno.env.get('MEMBER_EMAIL_FROM') || 'Silly Travel Tool <goose@bookings.sillytraveltool.com>'
const COCKPIT = 'https://sillytraveltool.com/admin/'
const KIND = { ai: 'AI calls', guide: 'guide sections', google: 'Google Maps calls' } as Record<string, string>

const usd = (n: number) => `$${Number(n || 0).toFixed(2)}`
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const b = await req.json().catch(() => ({}))

    let test = false
    const token = req.headers.get('x-cron-token')
    if (token) {
      const { data: ok } = await admin.rpc('cost_alert_token_ok', { p_token: token })
      if (ok !== true) return json({ error: 'Unauthorized' }, 401)
    } else {
      const auth = req.headers.get('Authorization')
      if (!auth) return json({ error: 'Unauthorized' }, 401)
      const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
      const { data: role, error } = await asCaller.rpc('admin_guard', { p_min: 'owner' })
      if (error || !role) return json({ error: error?.message || 'not_admin' }, 403)
      test = b.test === true
      if (!test) return json({ error: 'Only test sends from the cockpit' }, 400)
    }

    const { data: run, error: runErr } = await admin.rpc('cost_alert_run', { p_test: test })
    if (runErr) return json({ error: runErr.message }, 500)
    if (!run?.send) return json({ sent: false, today: run?.today, threshold: run?.threshold })
    const to: string[] = run.to || []
    if (!to.length) return json({ error: 'No owner email' }, 500)
    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ error: 'RESEND_API_KEY missing' }, 500)

    const bd = run.breakdown || {}
    const flags: { user_id: string, kind: string, calls: number, email: string | null }[] = run.flags || []
    const subject = `${test ? '[Test] ' : ''}${run.over || test ? `STT spend today ${usd(run.today)}` : 'STT usage flag'}${flags.length ? ` · ${flags.length} member${flags.length === 1 ? '' : 's'} flagged` : ''}`
    const lines = [
      test ? 'This is a test of the cost alert. Real alerts look the same.' : '',
      `Estimated AI + Google spend today (UTC): ${usd(run.today)}${run.threshold ? ` (alert level ${usd(run.threshold)})` : ''}.`,
      `AI ${usd(bd.ai)} (${bd.ai_calls} calls) · Guides ${usd(bd.guide)} (${bd.guide_calls} sections) · Google ${usd(bd.google)} (${bd.google_calls} calls)`,
      ...(flags.length ? ['', 'Members far above a normal day:', ...flags.map(f => `- ${f.email || f.user_id}: ${f.calls} ${KIND[f.kind] || f.kind} today → ${COCKPIT}#tab=members&member=${f.user_id}`)] : []),
      '',
      `Costs and the kill switches: ${COCKPIT}#tab=money`,
      'Estimates from the cost rates in Money → Controls; your Google and DeepSeek bills are the real numbers.',
    ].filter((l, i) => l || i > 0)
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#2b2420">${lines.map(l => l ? `<p style="margin:0 0 8px">${esc(l).replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : '').join('')}</div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, text: lines.join('\n'), html }),
    })
    const sent = await res.json().catch(() => ({}))
    if (!res.ok) return json({ error: sent?.message || `Resend ${res.status}` }, 502)
    await admin.rpc('cost_alert_sent', { p_over: !!run.over, p_flags: flags, p_test: test })
    return json({ sent: true, id: sent.id, to: to.length, today: run.today, flags: flags.length, test })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
