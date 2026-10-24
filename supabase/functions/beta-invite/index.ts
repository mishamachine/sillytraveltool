import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { inviteEmail } from '../_shared/betaEmails.js'

// Private beta invites from the owner cockpit (Growth → Beta waitlist). Owner only (admin_guard with the caller's session).
// Links come from app_settings.beta (ios_url = TestFlight public link, android_url = Play testing opt-in, web_url = sign-up).
// POST { action, ... }:
//   test    { platform? }            → sends the invite for each platform with a link (or just `platform`) to the owner's
//                                       own address, marked [Test]; nothing on the waitlist changes
//   send    { platform: 'all' | 'ios' | 'android' | 'web', limit? }
//                                    → { sent, failed, by_platform } ; at most `limit` (≤100) people per click
//   release {}                       → rows stuck in 'sending' over 15 minutes become failed (retryable)
// Never double-sends: admin_beta_claim moves each person to 'sending' before the email goes out, and only
// 'waiting' or 'failed' rows can be claimed; admin_beta_mark then records sent (with invited_at) or failed.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const FROM = Deno.env.get('MEMBER_EMAIL_FROM') || 'Silly Travel Tool <goose@bookings.sillytraveltool.com>'
const REPLY_TO = Deno.env.get('MEMBER_EMAIL_REPLY_TO') || 'hello@sillytraveltool.com'
const SITE = 'https://sillytraveltool.com/'
const PLATFORMS = ['ios', 'android', 'web'] as const
const LINK_KEY = { ios: 'ios_url', android: 'android_url', web: 'web_url' } as const

type Obj = Record<string, any>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: role, error: guardErr } = await asCaller.rpc('admin_guard', { p_min: 'owner' })
    if (guardErr || !role) return json({ error: guardErr?.message || 'not_admin' }, 403)
    const { data: { user } } = await asCaller.auth.getUser()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const b = await req.json().catch(() => ({}))

    if (b.action === 'release') {
      const { data, error } = await asCaller.rpc('admin_beta_release_stuck')
      if (error) return json({ error: error.message }, 400)
      return json({ released: data })
    }

    const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'beta').maybeSingle()
    const links: Obj = Object.fromEntries(PLATFORMS.map((p) => [p, String(setting?.value?.[LINK_KEY[p]] || '')]).filter(([, v]) => /^https:\/\//.test(v)))
    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ error: 'Resend key not configured' }, 500)
    const one = (token: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-unsubscribe?t=${token}`
    const message = (to: string, platform: string, token: string | null, test = false) => {
      const m = inviteEmail({ platform, link: links[platform], unsubscribeUrl: token ? `${SITE}unsubscribe/?t=${token}` : SITE, test })
      return {
        from: FROM, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
        headers: token ? { 'List-Unsubscribe': `<${one(token)}>, <mailto:${REPLY_TO}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
        tags: [{ name: 'template', value: `beta_invite_${platform}` }, { name: 'kind', value: 'marketing' }],
      }
    }

    if (b.action === 'test') {
      const which = b.platform ? [String(b.platform)] : Object.keys(links)
      const missing = which.filter((p) => !links[p])
      if (!which.length || missing.length) return json({ error: `Add the ${missing.join(', ') || 'beta'} link first` }, 400)
      if (!user?.email) return json({ error: 'No email on your account' }, 400)
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(which.map((p) => message(user.email!, p, null, true))),
      })
      if (!res.ok) return json({ error: `Resend: ${((await res.json().catch(() => ({}))) as Obj).message || res.status}` }, 502)
      await admin.from('admin_audit').insert({ admin_id: user.id, action: 'beta.invite_test', detail: { platforms: which, to: user.email } })
      return json({ sent: which.length, to: user.email, platforms: which })
    }

    if (b.action !== 'send') return json({ error: 'Unknown action' }, 400)
    const asked = b.platform === 'all' ? [...PLATFORMS] : PLATFORMS.includes(b.platform) ? [b.platform] : []
    if (!asked.length) return json({ error: 'Pick a platform' }, 400)
    const ready = asked.filter((p) => links[p])
    if (!ready.length) return json({ error: 'Add the beta link for that platform first' }, 400)
    let left = Math.max(1, Math.min(Number(b.limit) || 100, 100))
    let sent = 0, failed = 0
    const byPlatform: Obj = {}
    for (const p of ready) {
      if (left <= 0) break
      const { data: rows, error } = await asCaller.rpc('admin_beta_claim', { p_platform: p, p_limit: left })
      if (error) return json({ error: error.message, sent, failed }, 400)
      if (!rows?.length) continue
      left -= rows.length
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map((r: Obj) => message(r.email, p, r.email_token))),
      })
      const out: Obj = await res.json().catch(() => ({}))
      const err = res.ok ? null : String(out?.message || `Resend ${res.status}`).slice(0, 200)
      const { error: markErr } = await asCaller.rpc('admin_beta_mark', {
        p_rows: rows.map((r: Obj) => ({ id: r.id, ok: res.ok, link: links[p], error: err })),
      })
      if (markErr) await admin.from('function_errors').insert({ fn: 'beta-invite', kind: 'mark', message: markErr.message.slice(0, 300) })
      byPlatform[p] = { sent: res.ok ? rows.length : 0, failed: res.ok ? 0 : rows.length, error: err }
      res.ok ? (sent += rows.length) : (failed += rows.length)
      if (!res.ok) await admin.from('function_errors').insert({ fn: 'beta-invite', kind: 'resend', message: err })
    }
    await admin.from('admin_audit').insert({ admin_id: user?.id ?? null, action: 'beta.invite_send', detail: { platform: b.platform, sent, failed, by_platform: byPlatform, skipped_no_link: asked.filter((p) => !links[p]) } })
    return json({ sent, failed, by_platform: byPlatform, skipped_no_link: asked.filter((p) => !links[p]) })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
