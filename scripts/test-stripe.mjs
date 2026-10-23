// Checks the Stripe helpers used by billing + stripe-webhook: webhook signature checks and form encoding.
// Run: node scripts/test-stripe.mjs
import { createHmac } from 'node:crypto'
import { verifyStripeSignature, form, subscriptionRow, invoiceSubscription } from '../supabase/functions/_shared/stripe.ts'

let failed = 0
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++ }

const secret = 'whsec_test_secret'
const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' })
const now = 1_800_000_000
const sign = (t, b = body, s = secret) => createHmac('sha256', s).update(`${t}.${b}`).digest('hex')

check('valid signature', await verifyStripeSignature(secret, `t=${now},v1=${sign(now)}`, body, now))
check('second v1 (secret rolling) accepted', await verifyStripeSignature(secret, `t=${now},v1=${'0'.repeat(64)},v1=${sign(now)}`, body, now))
check('tampered body refused', !(await verifyStripeSignature(secret, `t=${now},v1=${sign(now)}`, body.replace('paid', 'void'), now)))
check('wrong secret refused', !(await verifyStripeSignature(secret, `t=${now},v1=${sign(now, body, 'whsec_other')}`, body, now)))
check('older than 5 minutes refused', !(await verifyStripeSignature(secret, `t=${now - 301},v1=${sign(now - 301)}`, body, now)))
check('missing header refused', !(await verifyStripeSignature(secret, null, body, now)))
check('missing secret refused', !(await verifyStripeSignature('', `t=${now},v1=${sign(now)}`, body, now)))
check('v0 only refused', !(await verifyStripeSignature(secret, `t=${now},v0=${sign(now)}`, body, now)))

const f = form({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { user_id: 'u1' }, skip: null,
  subscription_data: { billing_mode: { type: 'flexible' } }, lookup_keys: ['a'] }).toString()
check('form nests arrays and objects', decodeURIComponent(f) ===
  'mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[user_id]=u1&subscription_data[billing_mode][type]=flexible&lookup_keys[0]=a')

// Newer API versions moved the period end onto the item and the invoice's subscription under parent
const sub = subscriptionRow({ id: 'sub_1', livemode: false, customer: 'cus_1', status: 'active', created: now,
  items: { data: [{ current_period_end: now + 86400, price: { id: 'price_1', lookup_key: 'stt_first_class_yearly', unit_amount: 1499, currency: 'usd', recurring: { interval: 'year' } } }] } }, 'u1')
check('subscription period end from item', sub.current_period_end === new Date((now + 86400) * 1000).toISOString())
check('subscription lookup key + user', sub.lookup_key === 'stt_first_class_yearly' && sub.user_id === 'u1')
check('invoice subscription (new shape)', invoiceSubscription({ parent: { subscription_details: { subscription: 'sub_1' } } }) === 'sub_1')
check('invoice subscription (old shape)', invoiceSubscription({ subscription: 'sub_2' }) === 'sub_2')

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
