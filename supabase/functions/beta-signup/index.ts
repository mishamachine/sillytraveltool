import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { confirmEmail } from '../_shared/betaEmails.js'

// Public sign-up for the beta waitlist (sillytraveltool.com/beta). The only way in to beta_waitlist.
// POST { email, platform, frequency?, utm_source?, utm_medium?, utm_campaign?, referrer?, website, elapsed_ms }
//   → { ok: true } (new, already on the list, or a bot we quietly drop) | 400 { error } | 429 { error: 'rate_limited' }
// Bots: `website` is a hidden honeypot field; a form sent under 2 seconds after load is a script. Both get a fake ok.
// Rate limit and dedupe live in beta_signup (5 tries per IP an hour, 300 sign-ups an hour overall, one row per email).
// New sign-ups get one "You're on the list" email; repeats get none.
const ORIGINS = ['https://sillytraveltool.com', 'https://www.sillytraveltool.com', 'http://localhost:5173', 'http://localhost:4173']
const FROM = Deno.env.get('MEMBER_EMAIL_FROM') || 'Silly Travel Tool <goose@bookings.sillytraveltool.com>'
const REPLY_TO = Deno.env.get('MEMBER_EMAIL_REPLY_TO') || 'hello@sillytraveltool.com'
const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i
const PLATFORMS = ['ios', 'android', 'web']
const FREQUENCIES = ['', 'rarely', 'few_year', 'monthly', 'weekly']

const db = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
})
const clean = (v: unknown, n = 100) => typeof v === 'string' ? v.trim().slice(0, n) : ''

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || ''
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const b = await req.json().catch(() => ({}))
    if (clean(b.website) || !(Number(b.elapsed_ms) >= 2000)) return json({ ok: true })
    const email = clean(b.email, 254).toLowerCase()
    const platform = clean(b.platform)
    const frequency = clean(b.frequency)
    if (!EMAIL_RE.test(email)) return json({ error: 'bad_email' }, 400)
    if (!PLATFORMS.includes(platform)) return json({ error: 'bad_platform' }, 400)
    if (!FREQUENCIES.includes(frequency)) return json({ error: 'bad_frequency' }, 400)

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown'
    const res = await db('rpc/beta_signup', {
      method: 'POST',
      body: JSON.stringify({
        p_email: email, p_platform: platform, p_frequency: frequency,
        p_utm_source: clean(b.utm_source).toLowerCase(), p_utm_medium: clean(b.utm_medium).toLowerCase(),
        p_utm_campaign: clean(b.utm_campaign).toLowerCase(), p_referrer: clean(b.referrer, 300),
        p_ip_hash: await sha256(`beta:${ip}:${SERVICE.slice(-16)}`),
      }),
    })
    if (!res.ok) throw new Error(`beta_signup ${res.status} ${(await res.text()).slice(0, 200)}`)
    const out = await res.json()
    if (out.status === 'rate_limited') return json({ error: 'rate_limited' }, 429)

    if (out.status === 'new') {
      const KEY = Deno.env.get('RESEND_API_KEY')
      const m = confirmEmail({ platform, unsubscribeUrl: `https://sillytraveltool.com/unsubscribe/?t=${out.token}` })
      const one = `${URL_}/functions/v1/email-unsubscribe?t=${out.token}`
      const sent = KEY ? await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: [email], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text,
          headers: { 'List-Unsubscribe': `<${one}>, <mailto:${REPLY_TO}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          tags: [{ name: 'template', value: 'beta_confirm' }, { name: 'kind', value: 'marketing' }],
        }),
      }) : null
      if (sent?.ok) {
        await db(`beta_waitlist?id=eq.${out.id}`, { method: 'PATCH', body: JSON.stringify({ confirmation_sent_at: new Date().toISOString() }) })
      } else {
        // The sign-up still counts; the cockpit shows who never got the confirmation
        await db('function_errors', { method: 'POST', body: JSON.stringify({ fn: 'beta-signup', kind: 'resend', message: sent ? `${sent.status} ${(await sent.text()).slice(0, 200)}` : 'RESEND_API_KEY missing' }) })
      }
    }
    return json({ ok: true })
  } catch (e) {
    await db('function_errors', { method: 'POST', body: JSON.stringify({ fn: 'beta-signup', kind: 'error', message: String((e as Error).message || e).slice(0, 300) }) }).catch(() => {})
    return json({ error: 'server' }, 500)
  }
})
