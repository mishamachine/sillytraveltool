import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { makeStripe, customerRow } from '../_shared/stripe.ts'

// Web billing for First Class (docs/PAYWALL_PLAN.md; web goes straight to Stripe, no RevenueCat). Signed-in members only.
// POST { action, ... }:
//   checkout { plan: 'yearly' | 'lifetime' } → { url } of a Stripe-hosted Checkout page
//   portal                                  → { url } of the Stripe customer portal (cancel, card, invoices)
// Access is granted by stripe-webhook writing stripe_subscriptions / stripe_charges, which entitlement() reads.
// Secrets: STRIPE_SECRET_KEY (restricted key: write customers, checkout sessions, portal sessions; read prices,
// promotion codes, subscriptions), APP_URL.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const KEY = (Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
const LIVE = /^(sk|rk)_live_/.test(KEY)
const stripe = makeStripe(KEY)
const SITE = (Deno.env.get('APP_URL') || 'https://sillytraveltool.com').replace(/\/$/, '')
// Local dev servers may return there instead of the live site (test keys only)
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/
const PRICES: Record<string, string> = { yearly: 'stt_first_class_yearly', lifetime: 'stt_first_class_lifetime_founding' }

// A metadata-safe short code (Stripe allows 500 chars; the cockpit wants ≤ 40, letters, digits and _ . : + -)
function shortCode(v: unknown) {
  if (v == null) return undefined
  return String(v).trim().replace(/[^\w.:+-]/g, '_').slice(0, 40) || undefined
}

async function priceId(lookupKey: string) {
  const r = await stripe('GET', 'prices', { lookup_keys: [lookupKey], active: true, limit: 1 })
  if (!r.data?.[0]) throw new Error(`No active Stripe price ${lookupKey}`)
  return r.data[0].id
}

// One Stripe customer per member and mode, tagged metadata.user_id so every later object maps back to them
async function customerFor(admin: any, user: { id: string; email?: string }) {
  const { data: row } = await admin.from('stripe_customers').select('id').eq('user_id', user.id).eq('livemode', LIVE)
    .order('created', { ascending: false }).limit(1).maybeSingle()
  if (row) return row.id
  const c = await stripe('POST', 'customers', { email: user.email, metadata: { user_id: user.id } }, `stt-customer-${user.id}-${LIVE ? 'live' : 'test'}`)
  await admin.from('stripe_customers').upsert(customerRow(c, user.id))
  return c.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (!KEY) return json({ error: 'Billing is not set up yet.' }, 503)
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await anon.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const b = await req.json().catch(() => ({}))
    const origin = req.headers.get('Origin') || ''
    const site = !LIVE && DEV_ORIGIN.test(origin) ? origin : SITE
    const back = `${site}/upgrade/`

    if (b.action === 'checkout') {
      const plan = b.plan
      if (!PRICES[plan]) return json({ error: 'Unknown plan' }, 400)
      // The founders lifetime offer ends when the owner turns it off (app_settings founders_offer, via public_settings)
      if (plan === 'lifetime') {
        const { data: settings } = await admin.rpc('public_settings')
        if (settings?.founders_offer?.active === false) return json({ error: 'The founders offer has ended.', code: 'offer_ended' }, 410)
      }
      // Already paying on the web: send them to manage it instead of charging twice
      const { data: owned } = await admin.rpc('stripe_first_class', { p_user: user.id })
      if (owned) return json({ error: 'You already have First Class.', code: 'already' }, 409)

      // Discount codes from the cockpit live in Stripe as promotion codes with the same text. A code passed in is
      // pre-applied; otherwise the Checkout page offers a code box (Stripe allows one or the other).
      const codeText = shortCode(b.code)?.toUpperCase()
      const promo = codeText ? (await stripe('GET', 'promotion_codes', { code: codeText, active: true, limit: 1 })).data?.[0] : null
      const { data: utm } = await admin.from('member_attribution').select('utm_source, utm_medium, utm_campaign').eq('user_id', user.id).maybeSingle()

      // Metadata spec from the owner cockpit (admin-stripe sync): short codes only, nothing personal
      const meta = {
        user_id: user.id,
        plan,
        price_key: PRICES[plan],
        platform: 'web',
        app_version: shortCode(b.app_version),
        trigger: shortCode(b.trigger),
        code: promo ? codeText : undefined,
        utm_source: shortCode(utm?.utm_source),
        utm_medium: shortCode(utm?.utm_medium),
        utm_campaign: shortCode(utm?.utm_campaign),
        experiment: shortCode(b.experiment),
        variant: shortCode(b.variant),
      }
      const session = await stripe('POST', 'checkout/sessions', {
        mode: plan === 'lifetime' ? 'payment' : 'subscription',
        customer: await customerFor(admin, user),
        client_reference_id: user.id,
        line_items: [{ price: await priceId(PRICES[plan]), quantity: 1 }],
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: back,
        ...(promo ? { discounts: [{ promotion_code: promo.id }] } : { allow_promotion_codes: true }),
        // Owner: no Cash App, Klarna or bank payments (sandbox and live alike).
        excluded_payment_method_types: ['cashapp', 'klarna', 'pay_by_bank'],
        metadata: meta,
        ...(plan === 'lifetime'
          ? { payment_intent_data: { metadata: meta }, invoice_creation: { enabled: true } }
          : { subscription_data: { metadata: meta, billing_mode: { type: 'flexible' } } }),
      })
      return json({ url: session.url })
    }

    if (b.action === 'portal') {
      const { data: row } = await admin.from('stripe_customers').select('id').eq('user_id', user.id).eq('livemode', LIVE)
        .order('created', { ascending: false }).limit(1).maybeSingle()
      if (!row) return json({ error: 'No web purchases on this account.', code: 'no_customer' }, 404)
      const portal = await stripe('POST', 'billing_portal/sessions', { customer: row.id, return_url: back })
      return json({ url: portal.url })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('billing:', (e as Error).message)
    return json({ error: 'Payments are having a moment. Try again shortly.' }, 500)
  }
})
