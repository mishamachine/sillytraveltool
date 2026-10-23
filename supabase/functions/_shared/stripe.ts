// Stripe helpers for the web billing functions (billing, stripe-webhook). Plain fetch, no SDK.
// Rows written here use the same shape as the cockpit's sync (admin-stripe), so entitlement() and the Money tab
// read one set of stripe_* tables whichever side wrote them.

type Obj = Record<string, any>

/** Stripe form encoding: nested objects and arrays become a[b][0]=… */
export function form(params: Obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') form(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

/** A caller for one secret key. `idempotencyKey` makes a POST safe to retry. */
export function makeStripe(key: string) {
  return async function stripe(method: string, path: string, params: Obj = {}, idempotencyKey?: string) {
    const body = method === 'GET' ? null : form(params)
    const qs = method === 'GET' ? `?${form(params)}` : ''
    const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`)
    return data
  }
}

/** Checks the Stripe-Signature header (t=…,v1=…) against the endpoint's signing secret, 5 minutes' tolerance. */
export async function verifyStripeSignature(secret: string, header: string | null, rawBody: string, nowSec = Date.now() / 1000) {
  if (!secret || !header) return false
  const parts = header.split(',').map((p) => p.split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || !Number.isFinite(Number(t)) || Math.abs(nowSec - Number(t)) > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)))
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  return sigs.some((sig) => {
    if (sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

export const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null)
export const idOf = (v: any) => (typeof v === 'string' ? v : v?.id ?? null)
const promoFrom = (o: Obj) => {
  for (const d of o.discounts || []) { const p = idOf(d?.promotion_code); if (p) return p }
  return idOf(o.discount?.promotion_code)
}

// Row mappers (same columns as admin-stripe's sync). `uid` is the Supabase user already worked out by the caller.
export function customerRow(c: Obj, uid: string | null) {
  return { id: c.id, livemode: c.livemode, email: c.email, user_id: uid, name: c.name, country: c.address?.country ?? null,
    created: ts(c.created), delinquent: !!c.delinquent, synced_at: new Date().toISOString() }
}

export function subscriptionRow(s: Obj, uid: string | null) {
  const item = s.items?.data?.[0]
  return { id: s.id, livemode: s.livemode, customer: idOf(s.customer), user_id: uid, status: s.status,
    price_id: item?.price?.id ?? null, lookup_key: item?.price?.lookup_key ?? null, amount: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? s.currency ?? null, interval: item?.price?.recurring?.interval ?? null,
    current_period_end: ts(s.current_period_end ?? item?.current_period_end), cancel_at_period_end: !!s.cancel_at_period_end,
    canceled_at: ts(s.canceled_at), ended_at: ts(s.ended_at), promotion_code: promoFrom(s), created: ts(s.created),
    synced_at: new Date().toISOString() }
}

export function chargeRow(c: Obj, uid: string | null, plan: string | null) {
  return { id: c.id, livemode: c.livemode, customer: idOf(c.customer), user_id: uid, amount: c.amount, amount_refunded: c.amount_refunded,
    currency: c.currency, status: c.status, paid: !!c.paid, refunded: !!c.refunded, disputed: !!c.disputed, failure_code: c.failure_code,
    plan: c.metadata?.plan || plan || (c.invoice ? 'subscription' : 'one_time'),
    invoice: idOf(c.invoice), payment_intent: idOf(c.payment_intent), created: ts(c.created), synced_at: new Date().toISOString() }
}

export function checkoutRow(s: Obj, uid: string | null) {
  return { id: s.id, livemode: s.livemode, customer: idOf(s.customer), user_id: uid, mode: s.mode, status: s.status,
    payment_status: s.payment_status, amount_total: s.amount_total, amount_discount: s.total_details?.amount_discount ?? 0,
    currency: s.currency, promotion_code: promoFrom(s), plan: s.metadata?.plan ?? null, created: ts(s.created),
    synced_at: new Date().toISOString() }
}

export function invoiceRow(i: Obj, uid: string | null) {
  return { id: i.id, livemode: i.livemode, customer: idOf(i.customer), subscription: invoiceSubscription(i),
    user_id: uid, status: i.status, amount_paid: i.amount_paid,
    amount_discount: (i.total_discount_amounts || []).reduce((n: number, d: Obj) => n + (d.amount || 0), 0),
    currency: i.currency, promotion_code: promoFrom(i), billing_reason: i.billing_reason, created: ts(i.created),
    synced_at: new Date().toISOString() }
}

/** The subscription an invoice belongs to (older API versions: invoice.subscription; newer: invoice.parent). */
export const invoiceSubscription = (i: Obj) => idOf(i.subscription ?? i.parent?.subscription_details?.subscription)
