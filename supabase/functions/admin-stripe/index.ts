import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Stripe for the owner cockpit (docs/ADMIN_PLAN.md, Money). Admin only: the caller's own session must pass
// admin_guard (admins row + Google sign-in). Needs the secret STRIPE_SECRET_KEY (a restricted key is enough:
// read customers, subscriptions, charges, invoices, checkout sessions, coupons, promotion codes; write coupons and
// promotion codes). POST { action, ... }:
//   status                       → { configured, livemode, sync }
//   sync { force? }              → copies Stripe objects into stripe_* tables (at most every 2 minutes unless force)
//   code_push { id }             → creates the Stripe coupon + promotion code for a discount code in promo_codes
//   code_active { id, active }   → turns a code's Stripe promotion code on or off (pause / resume / end)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const LIVE = /^(sk|rk)_live_/.test(KEY)
const PRODUCT = Deno.env.get('STRIPE_PRODUCT_ID') || 'stt_first_class'
const SYNC_EVERY_MS = 120_000
const MAX_PAGES = 10

type Obj = Record<string, any>

function form(params: Obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') form(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

async function stripe(method: string, path: string, params: Obj = {}) {
  const body = method === 'GET' ? null : form(params)
  const qs = method === 'GET' ? `?${form(params)}` : ''
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`)
  return data
}

async function listAll(path: string, params: Obj = {}) {
  const out: Obj[] = []
  let starting_after: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await stripe('GET', path, { limit: 100, ...params, ...(starting_after ? { starting_after } : {}) })
    out.push(...r.data)
    if (!r.has_more) break
    starting_after = r.data[r.data.length - 1].id
  }
  return out
}

const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null)
const idOf = (v: any) => (typeof v === 'string' ? v : v?.id ?? null)
// Promotion code id from a discounts array (strings or expanded objects), or the older single `discount`
const promoFrom = (o: Obj) => {
  for (const d of o.discounts || []) { const p = idOf(d?.promotion_code); if (p) return p }
  return idOf(o.discount?.promotion_code)
}

async function sync(admin: any) {
  // Members by email, for customers without metadata.user_id
  const emails = new Map<string, string>()
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data?.users || []) if (u.email) emails.set(u.email.toLowerCase(), u.id)
    if (!data?.users || data.users.length < 1000) break
  }
  const [customers, subs, charges, sessions, invoices, promos] = await Promise.all([
    listAll('customers'),
    listAll('subscriptions', { status: 'all' }),
    listAll('charges'),
    listAll('checkout/sessions'),
    listAll('invoices'),
    listAll('promotion_codes'),
  ])
  const userOf = new Map<string, string | null>()
  const customerRows = customers.map((c) => {
    const uid = c.metadata?.user_id || c.metadata?.supabase_user_id || (c.email && emails.get(c.email.toLowerCase())) || null
    userOf.set(c.id, uid)
    return { id: c.id, livemode: c.livemode, email: c.email, user_id: uid, name: c.name, country: c.address?.country ?? null,
      created: ts(c.created), delinquent: !!c.delinquent, metadata: c.metadata || {}, synced_at: new Date().toISOString() }
  })
  const uid = (o: Obj) => o.metadata?.user_id || o.client_reference_id || userOf.get(idOf(o.customer)) || null
  // Checkout sessions carry the plan in metadata; charges inherit it through the payment intent
  const planByIntent = new Map<string, string>()
  for (const s of sessions) if (s.payment_intent && s.metadata?.plan) planByIntent.set(idOf(s.payment_intent), s.metadata.plan)

  const rows = {
    stripe_customers: customerRows,
    stripe_subscriptions: subs.map((s) => {
      const item = s.items?.data?.[0]
      return { id: s.id, livemode: s.livemode, customer: idOf(s.customer), user_id: uid(s), status: s.status,
        price_id: item?.price?.id ?? null, lookup_key: item?.price?.lookup_key ?? null, amount: item?.price?.unit_amount ?? null,
        currency: item?.price?.currency ?? s.currency ?? null, interval: item?.price?.recurring?.interval ?? null,
        current_period_end: ts(s.current_period_end ?? item?.current_period_end), cancel_at_period_end: !!s.cancel_at_period_end,
        canceled_at: ts(s.canceled_at), ended_at: ts(s.ended_at), promotion_code: promoFrom(s), created: ts(s.created),
        metadata: s.metadata || {}, synced_at: new Date().toISOString() }
    }),
    stripe_charges: charges.map((c) => ({
      id: c.id, livemode: c.livemode, customer: idOf(c.customer), user_id: uid(c), amount: c.amount, amount_refunded: c.amount_refunded,
      currency: c.currency, status: c.status, paid: !!c.paid, refunded: !!c.refunded, disputed: !!c.disputed, failure_code: c.failure_code,
      plan: c.metadata?.plan || planByIntent.get(idOf(c.payment_intent)) || (c.invoice ? 'subscription' : 'one_time'),
      invoice: idOf(c.invoice), payment_intent: idOf(c.payment_intent), created: ts(c.created), metadata: c.metadata || {}, synced_at: new Date().toISOString(),
    })),
    stripe_checkouts: sessions.map((s) => ({
      id: s.id, livemode: s.livemode, customer: idOf(s.customer), user_id: uid(s), mode: s.mode, status: s.status,
      payment_status: s.payment_status, amount_total: s.amount_total, amount_discount: s.total_details?.amount_discount ?? 0,
      currency: s.currency, promotion_code: promoFrom(s), plan: s.metadata?.plan ?? null, created: ts(s.created), metadata: s.metadata || {}, synced_at: new Date().toISOString(),
    })),
    stripe_invoices: invoices.map((i) => ({
      id: i.id, livemode: i.livemode, customer: idOf(i.customer), subscription: idOf(i.subscription ?? i.parent?.subscription_details?.subscription),
      user_id: uid(i), status: i.status, amount_paid: i.amount_paid,
      amount_discount: (i.total_discount_amounts || []).reduce((n: number, d: Obj) => n + (d.amount || 0), 0),
      currency: i.currency, promotion_code: promoFrom(i), billing_reason: i.billing_reason, created: ts(i.created), synced_at: new Date().toISOString(),
    })),
    stripe_promotion_codes: promos.map((p) => {
      const coupon = p.coupon ?? p.promotion?.coupon ?? {}
      return { id: p.id, livemode: p.livemode, code: p.code, coupon_id: idOf(coupon), active: !!p.active, times_redeemed: p.times_redeemed,
        max_redemptions: p.max_redemptions, expires_at: ts(p.expires_at), percent_off: coupon.percent_off ?? null, amount_off: coupon.amount_off ?? null,
        currency: coupon.currency ?? null, duration: coupon.duration ?? null, first_time_only: !!p.restrictions?.first_time_transaction,
        created: ts(p.created), synced_at: new Date().toISOString() }
    }),
  }
  const counts: Record<string, number> = {}
  for (const [table, list] of Object.entries(rows)) {
    counts[table.replace('stripe_', '')] = list.length
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await admin.from(table).upsert(list.slice(i, i + 500))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }
  // Codes made in the cockpit find their Stripe twin by code text
  for (const p of rows.stripe_promotion_codes) {
    await admin.from('promo_codes').update({ stripe_promo_id: p.id, stripe_coupon_id: p.coupon_id })
      .eq('code', String(p.code).toUpperCase()).is('stripe_promo_id', null)
  }
  return counts
}

async function pushCode(admin: any, id: string) {
  const { data: c } = await admin.from('promo_codes').select('*').eq('id', id).single()
  if (!c) throw new Error('Code not found')
  if (c.kind !== 'discount') throw new Error('Only discount codes go to Stripe')
  if (c.stripe_promo_id) return { promo: c.stripe_promo_id, already: true }
  try {
    const coupon = await stripe('POST', 'coupons', {
      name: c.code,
      ...(c.discount_percent ? { percent_off: c.discount_percent } : { amount_off: Math.round(Number(c.discount_amount) * 100), currency: (c.discount_currency || 'USD').toLowerCase() }),
      duration: c.discount_duration === 'forever' ? 'forever' : 'once',
      applies_to: { products: [PRODUCT] },
      ...(c.max_uses ? { max_redemptions: c.max_uses } : {}),
      ...(c.ends_at ? { redeem_by: Math.floor(new Date(c.ends_at).getTime() / 1000) } : {}),
      metadata: { stt_code_id: c.id, campaign: c.campaign || '' },
    })
    let customer: string | undefined
    if (c.audience === 'member' && c.audience_member) {
      const { data: cu } = await admin.from('stripe_customers').select('id').eq('user_id', c.audience_member).limit(1).maybeSingle()
      customer = cu?.id
    }
    const base = {
      code: c.code,
      ...(c.max_uses ? { max_redemptions: c.max_uses } : {}),
      ...(c.ends_at ? { expires_at: Math.floor(new Date(c.ends_at).getTime() / 1000) } : {}),
      ...(c.audience === 'new_members' ? { restrictions: { first_time_transaction: true } } : {}),
      ...(customer ? { customer } : {}),
      active: c.status === 'active',
      metadata: { stt_code_id: c.id },
    }
    // Older API versions take `coupon`; newer ones take `promotion[coupon]`
    let promo
    try { promo = await stripe('POST', 'promotion_codes', { ...base, coupon: coupon.id }) }
    catch { promo = await stripe('POST', 'promotion_codes', { ...base, promotion: { type: 'coupon', coupon: coupon.id } }) }
    await admin.from('promo_codes').update({ stripe_coupon_id: coupon.id, stripe_promo_id: promo.id, stripe_error: null }).eq('id', id)
    return { coupon: coupon.id, promo: promo.id, member_limited: !!customer }
  } catch (e) {
    await admin.from('promo_codes').update({ stripe_error: String((e as Error).message).slice(0, 300) }).eq('id', id)
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const b = await req.json().catch(() => ({}))
    const need = b.action === 'status' || b.action === 'sync' ? 'analyst' : 'owner'
    const { data: role, error: guardErr } = await asCaller.rpc('admin_guard', { p_min: need })
    if (guardErr || !role) return json({ error: guardErr?.message || 'not_admin' }, 403)
    const { data: { user } } = await asCaller.auth.getUser()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const audit = (action: string, detail: Obj) => admin.from('admin_audit').insert({ admin_id: user?.id ?? null, action, detail })

    const { data: state } = await admin.from('stripe_sync').select('*').eq('id', 1).maybeSingle()
    if (b.action === 'status') return json({ configured: !!KEY, livemode: LIVE, sync: state })
    if (!KEY) return json({ error: 'Stripe isn’t connected yet: add STRIPE_SECRET_KEY to the Supabase Edge Function secrets.', code: 'not_configured' }, 400)

    switch (b.action) {
      case 'sync': {
        if (!b.force && state?.last_sync && Date.now() - new Date(state.last_sync).getTime() < SYNC_EVERY_MS) return json({ skipped: true, sync: state })
        try {
          const counts = await sync(admin)
          const row = { id: 1, livemode: LIVE, last_sync: new Date().toISOString(), ok: true, error: null, counts }
          await admin.from('stripe_sync').upsert(row)
          return json({ sync: row })
        } catch (e) {
          const row = { id: 1, livemode: LIVE, last_sync: new Date().toISOString(), ok: false, error: String((e as Error).message).slice(0, 300), counts: state?.counts ?? null }
          await admin.from('stripe_sync').upsert(row)
          await admin.from('function_errors').insert({ fn: 'admin-stripe', kind: 'sync', message: row.error })
          return json({ error: row.error, sync: row }, 502)
        }
      }
      case 'code_push': {
        const out = await pushCode(admin, String(b.id))
        await audit('code.stripe_push', { code: b.id, ...out })
        return json(out)
      }
      case 'code_active': {
        const { data: c } = await admin.from('promo_codes').select('stripe_promo_id').eq('id', String(b.id)).single()
        if (!c?.stripe_promo_id) return json({ skipped: true })
        await stripe('POST', `promotion_codes/${c.stripe_promo_id}`, { active: !!b.active })
        await audit('code.stripe_active', { code: b.id, active: !!b.active })
        return json({ ok: true })
      }
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
