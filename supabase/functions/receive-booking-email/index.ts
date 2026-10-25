import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================
// receive-booking-email
// Resend inbound email webhook — receives forwarded booking
// confirmations, parses them via Gemini, matches to a trip,
// inserts booking. Authenticated by the Resend (Svix) webhook
// signature (RESEND_WEBHOOK_SECRET), then mapped to a user by the
// token embedded in the recipient address. No other fallback.
//
// Inbound address scheme:
//   {12-hex token}@bookings.sillytraveltool.com (server-made; older 8-hex tokens work until rotated)
// Only mail from the member's account email, their allowed senders, or anyone if they opted in, is read
// (ingest.ts senderAllowed).
// ============================================================

import { CORS, ok, err, ingestEmail } from './ingest.ts'
import { withGoogleScope } from '../_shared/google.ts'

// Files worth reading: PDFs, images over 20 KB (not logos or signatures), CSV / Excel sheets; two at most, 6 MB each.
const READABLE = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|text\/(csv|plain|tab-separated-values)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/

async function fetchAttachments(emailId: string | undefined, listed: unknown) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!emailId || !key || (Array.isArray(listed) && listed.length === 0)) return []
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) { console.warn(`attachments list ${res.status}`); return [] }
    const items = ((await res.json())?.data || []) as any[]
    const wanted = items.filter(a => {
      const mime = String(a.content_type || '').split(';')[0].trim().toLowerCase()
      const size = Number(a.size || 0)
      if (!READABLE.test(mime) && !/\.(csv|xlsx)$/i.test(a.filename || '')) return false
      if (size > 6 * 1024 * 1024) return false
      return !(mime.startsWith('image/') && size && size < 20000)
    }).slice(0, 2)
    const out = []
    for (const a of wanted) {
      const file = await fetch(a.download_url)
      if (!file.ok) continue
      out.push({ name: String(a.filename || 'attachment'), mime: String(a.content_type || '').split(';')[0].trim().toLowerCase(), bytes: new Uint8Array(await file.arrayBuffer()) })
    }
    if (out.length) console.log(`📎 ${out.length} attachment(s): ${out.map(a => a.mime).join(', ')}`)
    return out
  } catch (e) {
    console.warn('attachments fetch failed', (e as Error).message)
    return []
  }
}

// Extract plain text from HTML (basic — strips tags)
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Extract the booking_email_token from To: address
// Matches: token@bookings.sillytraveltool.com, 12 hex (current) or 8 hex (older addresses). The token must start
// the address, so the last 8 characters of a 12-hex token are never read as a token on their own.
function extractToken(toHeader: string): string | null {
  const match = toHeader.match(/(?:^|[^a-f0-9])([a-f0-9]{12}|[a-f0-9]{8})@bookings\.sillytraveltool\.com/i)
  return match ? match[1].toLowerCase() : null
}

// Verify a Svix-signed webhook (Resend uses Svix). Signed content is
// "{svix-id}.{svix-timestamp}.{raw body}", HMAC-SHA256 with the base64
// secret after the "whsec_" prefix; header holds "v1,<sig>" entries.
async function verifySvix(secret: string, headers: Headers, rawBody: string): Promise<boolean> {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !timestamp || !sigHeader) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return sigHeader.split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const GEMINI_API_KEY     = Deno.env.get('GEMINI_API_KEY')
  const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const WEBHOOK_SECRET       = Deno.env.get('RESEND_WEBHOOK_SECRET')

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err('Missing environment secrets', 500)
  }
  // Fail closed: without the signing secret we cannot tell Resend from anyone else.
  if (!WEBHOOK_SECRET) {
    console.error('RESEND_WEBHOOK_SECRET is not set — rejecting inbound email')
    return err('Webhook not configured', 503)
  }

  try {
    // ── 1. Verify signature, then parse Resend email.received payload ──
    // JSON shape: { type: "email.received", data: { email_id, to: [{email}] | string, from, subject, text?, html? } }
    const rawText = await req.text()
    if (!(await verifySvix(WEBHOOK_SECRET, req.headers, rawText))) {
      console.warn('receive-booking-email: invalid or missing webhook signature')
      return err('Invalid signature', 401)
    }

    let rawBody: any = {}
    try { rawBody = JSON.parse(rawText) } catch { return err('Invalid JSON payload') }
    const payload = rawBody?.data ?? rawBody

    let toAddress = ''
    const toRaw = payload.to ?? payload.To ?? ''
    if (Array.isArray(toRaw)) {
      toAddress = toRaw.map((t: any) => (typeof t === 'string' ? t : t?.email || '')).join(', ')
    } else {
      toAddress = String(toRaw)
    }

    const fromAddress = String(payload.from ?? payload.From ?? '')
    const subject     = String(payload.subject ?? payload.Subject ?? '')
    let bodyText      = payload.text ?? payload.plain ?? ''
    const html        = payload.html ?? ''
    if (!bodyText && html) bodyText = htmlToText(html)

    if (!toAddress) return err('No recipient address in webhook payload')
    // ── Body fetch via Resend receiving API (body not in webhook payload) ──
    if (!bodyText) {
      const emailId = (rawBody?.data ?? rawBody)?.email_id
      if (!emailId) return err('No email body and no email_id to fetch from')
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
      if (!RESEND_API_KEY) return err('Missing RESEND_API_KEY secret', 500)
      console.log(`📥 Fetching email body for email_id: ${emailId}`)
      const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` }
      })
      if (!fetchRes.ok) {
        const fetchErr = await fetchRes.text()
        console.error('Resend receiving API error:', fetchErr)
        return err('Failed to fetch email body from Resend', 502)
      }
      const fetchedEmail = await fetchRes.json()
      bodyText = fetchedEmail.text ?? ''
      const fetchedHtml = fetchedEmail.html ?? ''
      if (!bodyText && fetchedHtml) bodyText = htmlToText(fetchedHtml)
      console.log(`📥 Fetched email body — length: ${bodyText.length}`)
    }


    console.log(`📬 receive-booking-email: to="${toAddress}" subject="${subject}" bodyLen=${bodyText.length}`)

    // ── 2. Extract user token from To: address ────────────────
    const token = extractToken(toAddress)
    console.log(`🔑 Token extracted: "${token}" from toAddress: "${toAddress}"`)

    // ── 3. Look up user by token (the only accepted path) ─────
    if (!token) return err('No booking token in recipient address', 404)

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      // '*' so the sender settings (inbox_allowed_senders, inbox_accept_any) come along once the migration is in;
      // before it, only the account email is accepted
      .select('*')
      .eq('booking_email_token', token)
      .single()
    if (profileErr || !profile) {
      console.error('Token lookup failed:', token, profileErr?.message)
      return err('Unknown booking address — token not found', 404)
    }

    // Attachments (itinerary PDFs, screenshots, spreadsheets): the webhook only lists them; fetch the files
    // Each delivery once: Resend retries a webhook it thinks timed out, with the same Svix message id
    const deliveryId = req.headers.get('svix-id') || (rawBody?.data ?? rawBody)?.email_id
    if (deliveryId) {
      const { error: seenErr } = await supabase.from('ingest_seen').insert({ delivery_id: String(deliveryId).slice(0, 200) })
      if (seenErr?.code === '23505') {
        console.log(`↩️ Delivery ${deliveryId} already handled`)
        return ok({ success: true, duplicate_delivery: true })
      }
    }

    // Answer Resend at once and file in the background: filing waits its turn behind the traveller's other emails,
    // and a slow answer makes Resend send the email again
    const work = (async () => {
      const loadAttachments = () => fetchAttachments((rawBody?.data ?? rawBody)?.email_id, payload.attachments)
      const res = await ingestEmail(supabase, profile, { subject, fromAddress, bodyText, GEMINI_API_KEY, loadAttachments })
      console.log(`📨 Filed: ${res.status} ${(await res.text()).slice(0, 300)}`)
    })().catch(e => console.error('receive-booking-email background error:', e))
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(work)
    else await work
    return ok({ success: true, accepted: true })
  } catch (e: any) {
    console.error('receive-booking-email error:', e)
    return err(e.message || 'Unexpected error', 500)
  }
}))
