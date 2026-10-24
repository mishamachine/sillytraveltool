import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// App Store / Google Play → Supabase, through RevenueCat (docs/STRIPE_BILLING.md, plan A). RevenueCat sends the
// Authorization header set in its dashboard (REVENUECAT_WEBHOOK_SECRET). Rather than trusting the event, each call
// re-reads the member from the RevenueCat API (REVENUECAT_API_KEY, secret v1 key) and upserts their
// store_entitlements row, which entitlement() reads. Retries and out-of-order events are harmless: every write is the
// member's current state. app_user_id is the Supabase user id (the apps configure RevenueCat with it).
type Obj = Record<string, any>

const SECRET = (Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '').trim()
const API_KEY = (Deno.env.get('REVENUECAT_API_KEY') || '').trim()
const ENTITLEMENT = 'silly_travel_tool_pro'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function sameSecret(header: string | null) {
  const got = (header || '').replace(/^Bearer\s+/i, '').trim()
  if (!SECRET || got.length !== SECRET.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ SECRET.charCodeAt(i)
  return diff === 0
}

/** The member's First Class entitlement as RevenueCat sees it now, as a store_entitlements row. */
export function entitlementRow(userId: string, subscriber: Obj, eventId: string | null) {
  const ent = subscriber?.entitlements?.[ENTITLEMENT]
  const now = new Date().toISOString()
  if (!ent) {
    // No entitlement (expired, refunded or never bought): keep the row as history, ended now
    return { user_id: userId, store: 'unknown', product_id: null, expires_at: now, grace_expires_at: null, will_renew: false,
      refunded: false, last_event_id: eventId, updated_at: now, _none: true }
  }
  const product = ent.product_identifier
  const sub = subscriber.subscriptions?.[product]
  const once = subscriber.non_subscriptions?.[product]?.slice?.(-1)?.[0]
  return {
    user_id: userId,
    store: (sub || once)?.store || 'unknown',
    product_id: product || null,
    expires_at: ent.expires_date || null,
    grace_expires_at: ent.grace_period_expires_date || null,
    will_renew: !!sub && !sub.unsubscribe_detected_at && !sub.refunded_at,
    refunded: !!(sub?.refunded_at || once?.refunded_at),
    last_event_id: eventId,
    updated_at: now,
  }
}

async function sync(admin: any, userId: string, eventId: string | null) {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`)
  const { subscriber } = await res.json()
  const { _none, ...row } = entitlementRow(userId, subscriber, eventId) as Obj
  // No entitlement: end their row if they have one (nothing to write otherwise)
  const { error } = _none
    ? await admin.from('store_entitlements').update({ expires_at: row.expires_at, grace_expires_at: null, will_renew: false,
        last_event_id: row.last_event_id, updated_at: row.updated_at }).eq('user_id', userId)
    : await admin.from('store_entitlements').upsert(row)
  if (error) throw new Error(`store_entitlements: ${error.message}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!sameSecret(req.headers.get('Authorization'))) return json({ error: 'Unauthorized' }, 401)
  if (!API_KEY) return json({ error: 'Not set up' }, 503)
  try {
    const { event } = await req.json()
    if (!event || event.type === 'TEST') return json({ ok: true })
    // Everyone the event touches (a TRANSFER moves a purchase between accounts)
    const ids = new Set<string>([event.app_user_id, event.original_app_user_id, ...(event.aliases || []),
      ...(event.transferred_from || []), ...(event.transferred_to || [])].filter((id) => UUID.test(id || '')))
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    for (const id of ids) {
      // Only members who exist (RevenueCat can hold ids from deleted accounts)
      const { data } = await admin.auth.admin.getUserById(id)
      if (data?.user) await sync(admin, id, event.id || null)
    }
    return json({ ok: true, members: ids.size })
  } catch (e) {
    console.error('store-webhook:', (e as Error).message)
    return json({ error: 'Failed, RevenueCat will retry' }, 500)
  }
})
