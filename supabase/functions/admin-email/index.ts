import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { render } from '../_shared/emailTemplate.js'

// Member emails from the owner cockpit, sent with Resend. Admin only (admin_guard with the caller's session).
// Service emails (account notices, welcome): support role, members only. Marketing (recaps, win-backs, offers,
// relaunch): owner only, opted-in members only; former members only with consent, or when the owner confirms they
// may write to them (consent_override); never to anyone who unsubscribed. Every attempt is logged in email_sends.
// POST { action, ... }:
//   preview  { template_key?, template?, user_id?, former_id?, message? } → { subject, html, text, kind }
//   check    { template_key, user_ids?, former_ids?, former_all?, consent_override? } → { eligible, skipped: [{ email, reason }] }
//   send     { template_key, template?, user_ids?, former_ids?, former_all?, message?, campaign?, consent_override? }
//            → { sent, failed, skipped }
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const FROM = Deno.env.get('MEMBER_EMAIL_FROM') || 'Silly Travel Tool <goose@bookings.sillytraveltool.com>'
const REPLY_TO = Deno.env.get('MEMBER_EMAIL_REPLY_TO') || 'hello@sillytraveltool.com'
const SITE = 'https://sillytraveltool.com/'
const MAX_RECIPIENTS = 200

type Obj = Record<string, any>
type Recipient = { user_id?: string; former_id?: number; email: string; vars: Obj; token: string; optedIn: boolean; status: string; unsub: boolean; consent?: string }

const firstName = (name?: string | null, email?: string) =>
  (name && name.trim().split(/\s+/)[0]) || (email ? email.split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] : '') || 'there'

async function memberRecipients(admin: any, ids: string[]): Promise<Recipient[]> {
  if (!ids.length) return []
  const [{ data: profiles }, users, { data: trips }] = await Promise.all([
    admin.from('user_profiles').select('id, display_name, marketing_emails, email_token').in('id', ids),
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id).then((r: any) => r.data?.user).catch(() => null))),
    admin.from('trips').select('id, owner_id, destination_city, destination_country_code, start_date, end_date, status').in('owner_id', ids),
  ])
  const { data: bookings } = trips?.length
    ? await admin.from('bookings').select('trip_id').in('trip_id', trips.map((t: Obj) => t.id))
    : { data: [] }
  const today = new Date().toISOString().slice(0, 10)
  const statuses = await Promise.all(ids.map((id) => admin.rpc('member_status', { p_user: id }).then((r: any) => r.data || 'active')))
  return ids.map((id, i) => {
    const u = users[i]
    if (!u?.email) return null
    const p = (profiles || []).find((x: Obj) => x.id === id) || {}
    const mine = (trips || []).filter((t: Obj) => t.owner_id === id && t.status !== 'cancelled')
    const past = mine.filter((t: Obj) => t.end_date && t.end_date < today).sort((a: Obj, b: Obj) => b.end_date.localeCompare(a.end_date))[0]
    const next = mine.filter((t: Obj) => t.start_date && t.start_date >= today).sort((a: Obj, b: Obj) => a.start_date.localeCompare(b.start_date))[0]
    const days = (t: Obj) => t ? Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86400000) + 1 : ''
    return {
      user_id: id, email: u.email, token: p.email_token, optedIn: !!p.marketing_emails, status: statuses[i], unsub: false,
      vars: {
        first_name: firstName(p.display_name || u.user_metadata?.full_name, u.email),
        last_trip_city: past?.destination_city || 'your trip', last_trip_days: days(past),
        last_trip_bookings: past ? (bookings || []).filter((b: Obj) => b.trip_id === past.id).length : '',
        next_trip_city: next?.destination_city || '', next_trip_date: next?.start_date || '',
        trips_count: mine.length, countries: new Set(mine.map((t: Obj) => t.destination_country_code).filter(Boolean)).size,
        app_url: SITE,
      },
    }
  }).filter(Boolean) as Recipient[]
}

async function formerRecipients(admin: any, ids: number[] | 'all'): Promise<Recipient[]> {
  let q = admin.from('former_members').select('id, email, name, email_token, marketing_consent, unsubscribed_at')
  if (ids !== 'all') q = q.in('id', ids)
  const { data } = await q
  return (data || []).map((f: Obj) => ({
    former_id: f.id, email: f.email, token: f.email_token, optedIn: f.marketing_consent === 'yes', status: 'former',
    unsub: f.marketing_consent === 'no' || !!f.unsubscribed_at, consent: f.marketing_consent,
    vars: { first_name: firstName(f.name, f.email), app_url: SITE, last_trip_city: 'your trip', trips_count: '' },
  }))
}

// Why a recipient can't get this email (null = can)
function blocked(r: Recipient, kind: string, override: boolean) {
  if (kind === 'service') {
    if (r.former_id) return 'Former members have no account: service emails don\'t apply'
    return null
  }
  if (r.unsub) return 'Unsubscribed'
  if (r.status === 'banned' || r.status === 'suspended') return 'Account suspended or closed'
  if (r.former_id) return r.optedIn || override ? null : 'No marketing consent on record'
  return r.optedIn ? null : 'Hasn\'t opted in to emails'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: role, error: guardErr } = await asCaller.rpc('admin_guard', { p_min: 'support' })
    if (guardErr || !role) return json({ error: guardErr?.message || 'not_admin' }, 403)
    const { data: { user } } = await asCaller.auth.getUser()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const b = await req.json().catch(() => ({}))

    // Template: stored one, optionally edited for this send
    const { data: stored } = b.template_key ? await admin.from('email_templates').select('*').eq('key', String(b.template_key)).maybeSingle() : { data: null }
    const tpl = { ...(stored || {}), ...(b.template || {}) }
    if (!tpl.subject || !tpl.body) return json({ error: 'Pick a template or write a subject and message' }, 400)
    const kind = stored?.kind || (b.template?.kind === 'service' ? 'service' : 'marketing')
    if (kind === 'marketing' && role !== 'owner') return json({ error: 'Only the owner can send marketing emails' }, 403)
    const message = typeof b.message === 'string' ? b.message.slice(0, 4000) : ''

    const userIds = Array.isArray(b.user_ids) ? b.user_ids.map(String).slice(0, MAX_RECIPIENTS) : b.user_id ? [String(b.user_id)] : []
    const formerIds = b.former_all ? 'all' as const : Array.isArray(b.former_ids) ? b.former_ids.map(Number) : b.former_id ? [Number(b.former_id)] : []
    const recipients = [...await memberRecipients(admin, userIds), ...(formerIds === 'all' || formerIds.length ? await formerRecipients(admin, formerIds) : [])]
    const override = !!b.consent_override && role === 'owner'
    const unsubscribeUrl = (r: Recipient) => `${SITE}unsubscribe/?t=${r.token}`

    if (b.action === 'preview') {
      const r = recipients[0] || { vars: { first_name: 'Ana', last_trip_city: 'Lisbon', last_trip_days: 7, last_trip_bookings: 6, trips_count: 3, app_url: SITE }, token: 'preview' } as Recipient
      return json({ kind, ...render(tpl, { ...r.vars, message }, { kind, unsubscribeUrl: unsubscribeUrl(r) }) })
    }

    const checked = recipients.map((r) => ({ r, why: blocked(r, kind, override) }))
    if (b.action === 'check') {
      return json({ kind, eligible: checked.filter((x) => !x.why).length, skipped: checked.filter((x) => x.why).map((x) => ({ email: x.r.email, reason: x.why })) })
    }
    if (b.action !== 'send') return json({ error: 'Unknown action' }, 400)

    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ error: 'Resend key not configured' }, 500)
    if (recipients.length > MAX_RECIPIENTS) return json({ error: `At most ${MAX_RECIPIENTS} recipients per send` }, 400)
    const campaign = typeof b.campaign === 'string' ? b.campaign.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64) || null : null
    const log: Obj[] = []
    const ok = checked.filter((x) => !x.why)
    for (const x of checked.filter((x) => x.why)) {
      log.push({ user_id: x.r.user_id ?? null, former_member_id: x.r.former_id ?? null, email: x.r.email, template_key: b.template_key ?? null,
        kind, subject: null, status: 'skipped', reason: x.why, campaign, sent_by: user?.id ?? null })
    }
    let sent = 0, failed = 0
    for (let i = 0; i < ok.length; i += 100) {
      const chunk = ok.slice(i, i + 100)
      const emails = chunk.map(({ r }) => {
        const m = render(tpl, { ...r.vars, message }, { kind, unsubscribeUrl: unsubscribeUrl(r) })
        const one = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-unsubscribe?t=${r.token}`
        return {
          from: FROM, to: [r.email], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
          headers: kind === 'marketing' ? { 'List-Unsubscribe': `<${one}>, <mailto:${REPLY_TO}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
          tags: [{ name: 'template', value: String(b.template_key || 'custom').replace(/[^a-zA-Z0-9_-]/g, '_') }, { name: 'kind', value: kind }],
          _subject: m.subject,
        }
      })
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emails.map(({ _subject, ...e }) => e)),
      })
      const out = await res.json().catch(() => ({}))
      chunk.forEach(({ r }, j) => {
        const good = res.ok
        good ? sent++ : failed++
        log.push({ user_id: r.user_id ?? null, former_member_id: r.former_id ?? null, email: r.email, template_key: b.template_key ?? null,
          kind, subject: emails[j]._subject, status: good ? 'sent' : 'failed', reason: good ? (override && r.former_id && !r.optedIn ? 'owner confirmed permission' : null) : String(out?.message || res.status).slice(0, 200),
          resend_id: good ? out?.data?.[j]?.id ?? null : null, campaign, sent_by: user?.id ?? null })
      })
    }
    if (log.length) await admin.from('email_sends').insert(log)
    await admin.from('admin_audit').insert({ admin_id: user?.id ?? null, action: 'email.send', target_user: userIds.length === 1 ? userIds[0] : null,
      detail: { template: b.template_key ?? 'custom', kind, sent, failed, skipped: log.filter((l) => l.status === 'skipped').length, campaign, override } })
    if (failed) await admin.from('function_errors').insert({ fn: 'admin-email', kind: 'resend', message: `${failed} failed` })
    return json({ sent, failed, skipped: log.filter((l) => l.status === 'skipped').length })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
