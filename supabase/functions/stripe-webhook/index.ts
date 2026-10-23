import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { makeStripe, verifyStripeSignature, idOf, customerRow, subscriptionRow, chargeRow, checkoutRow, invoiceRow, invoiceSubscription } from '../_shared/stripe.ts'

// Stripe → Supabase for web billing. Verifies the Stripe-Signature header (STRIPE_WEBHOOK_SECRET), then re-fetches
// each object from the API rather than trusting the payload (events can arrive late or out of order) and upserts it
// into the stripe_* tables. entitlement() reads those, so a paid checkout unlocks First Class and a cancelled or
// refunded one locks it again. Retries are harmless: every write is an upsert of Stripe's current state.
type Obj = Record<string, any>

const KEY = (Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
const SECRET = (Deno.env.get('STRIPE_WEBHOOK_SECRET') || '').trim()
const stripe = makeStripe(KEY)

// A user id from Stripe metadata only counts if that account still exists: a removed member's id would break the
// stripe_* foreign keys and make Stripe retry the event for days (the cockpit sync has the same check)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function existing(admin: any, uid: unknown): Promise<string | null> {
  if (typeof uid !== 'string' || !UUID.test(uid)) return null
  const { data, error } = await admin.auth.admin.getUserById(uid)
  return !error && data?.user ? uid : null
}

async function userFor(admin: any, o: Obj): Promise<string | null> {
  const direct = await existing(admin, o.metadata?.user_id) || await existing(admin, o.client_reference_id)
  if (direct) return direct
  const customer = idOf(o.customer)
  if (!customer) return null
  const { data } = await admin.from('stripe_customers').select('user_id').eq('id', customer).maybeSingle()
  if (data?.user_id) return data.user_id
  const c = await stripe('GET', `customers/${customer}`)
  return c.deleted ? null : existing(admin, c.metadata?.user_id)
}

async function put(admin: any, table: string, row: Obj) {
  const { error } = await admin.from(table).upsert(row)
  if (error) throw new Error(`${table}: ${error.message}`)
}

async function syncSubscription(admin: any, id: string) {
  const s = await stripe('GET', `subscriptions/${id}`)
  await put(admin, 'stripe_subscriptions', subscriptionRow(s, await userFor(admin, s)))
}

// Lifetime purchases are charges with plan 'lifetime'; the plan rides on the payment intent's metadata
async function syncCharge(admin: any, id: string) {
  const c = await stripe('GET', `charges/${id}`, { expand: ['payment_intent'] })
  const pi = typeof c.payment_intent === 'object' ? c.payment_intent : null
  const uid = await existing(admin, c.metadata?.user_id) || await existing(admin, pi?.metadata?.user_id) || await userFor(admin, c)
  await put(admin, 'stripe_charges', { ...chargeRow(c, uid, pi?.metadata?.plan || null), payment_intent: idOf(c.payment_intent),
    metadata: { ...(pi?.metadata || {}), ...(c.metadata || {}) } })
}

async function handle(admin: any, event: Obj) {
  const o = event.data.object
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const s = await stripe('GET', `checkout/sessions/${o.id}`, { expand: ['payment_intent'] })
      await put(admin, 'stripe_checkouts', checkoutRow(s, await userFor(admin, s)))
      if (s.subscription) await syncSubscription(admin, idOf(s.subscription))
      const charge = s.payment_intent?.latest_charge
      if (charge) await syncCharge(admin, idOf(charge))
      return
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return syncSubscription(admin, o.id)
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const i = await stripe('GET', `invoices/${o.id}`)
      await put(admin, 'stripe_invoices', invoiceRow(i, await userFor(admin, i)))
      const sub = invoiceSubscription(i)
      if (sub) await syncSubscription(admin, sub)
      return
    }
    case 'charge.succeeded':
    case 'charge.failed':
    case 'charge.refunded':
      return syncCharge(admin, o.id)
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
      return syncCharge(admin, idOf(o.charge))
    case 'customer.created':
    case 'customer.updated': {
      const c = await stripe('GET', `customers/${o.id}`)
      if (!c.deleted) await put(admin, 'stripe_customers', customerRow(c, await existing(admin, c.metadata?.user_id)))
      return
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const raw = await req.text()
  if (!(await verifyStripeSignature(SECRET, req.headers.get('Stripe-Signature'), raw))) {
    return new Response('Bad signature', { status: 400 })
  }
  const event = JSON.parse(raw)
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // Which Stripe mode the site is in, so test rows don't grant First Class once live keys are in
    await admin.from('stripe_sync').upsert({ id: 1, livemode: !!event.livemode })
    await handle(admin, event)
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    // A 500 makes Stripe retry with backoff for up to 3 days
    console.error(`stripe-webhook ${event.type} ${event.id}:`, (e as Error).message)
    return new Response('Retry later', { status: 500 })
  }
})
