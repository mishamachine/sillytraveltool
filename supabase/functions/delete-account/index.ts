import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { makeStripe } from '../_shared/stripe.ts'

// In-app account deletion (Profile → Settings → Delete account). Signed-in members only, for their own account.
// POST { confirm: 'DELETE' } → { deleted: true }
// 1. Cancels any live Stripe subscription now, so a deleted member is never charged again. If Stripe refuses
//    (key without subscription write), an admin task asks the owner to cancel it by hand; deletion still goes ahead.
// 2. public.delete_account(user) erases the member (service role only; see migration 20261024030000).
// App Store / Google Play subscriptions can't be cancelled by us: the app tells the member to cancel in their store.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const KEY = (Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
const stripe = makeStripe(KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await anon.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const b = await req.json().catch(() => ({}))
    if (b.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: subs } = await admin.from('stripe_subscriptions').select('id')
      .eq('user_id', user.id).in('status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])
    for (const s of subs || []) {
      try {
        if (!KEY) throw new Error('no Stripe key')
        await stripe('DELETE', `subscriptions/${s.id}`)
      } catch (e) {
        await admin.from('admin_tasks').upsert({
          key: `cancel-sub-${s.id}`, status: 'open',
          title: 'Cancel a deleted member’s Stripe subscription',
          detail: `Subscription ${s.id} could not be cancelled automatically (${String((e as Error)?.message || e).slice(0, 120)}). Cancel it in Stripe so they aren't charged again.`,
        })
      }
    }

    const { error } = await admin.rpc('delete_account', { p_user: user.id })
    if (error) return json({ error: error.message }, 400)
    return json({ deleted: true })
  } catch (e) {
    console.error('delete-account', e)
    return json({ error: 'Something went wrong. Nothing was deleted; try again or email hello@sillytraveltool.com.' }, 500)
  }
})
