import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Table, Bars, Badge, Loading, ErrorNote, useLoad, ExportButton, fmtDate, ago } from '../ui'

// Stripe feed: admin-stripe copies Stripe into stripe_* tables (at most every 2 minutes), admin_stripe sums it up.
export const money = (cents, currency = 'usd') => cents == null ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

export default function StripePanel({ filters, go }) {
  const status = useLoad(() => api.stripeStatus(), [])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const data = useLoad(() => api.stripe(filters), [filters])

  const sync = async (force) => {
    setSyncing(true); setSyncError(null)
    try { await api.stripeSync(force); data.reload() } catch (e) { setSyncError(e) } finally { setSyncing(false) }
  }
  // Pull fresh Stripe data on open and on every cockpit refresh (the server skips it if it ran in the last 2 minutes)
  useEffect(() => { if (status.data?.configured) sync(false) }, [status.data?.configured, filters.tick]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status.error) return <Card title="Stripe" icon="wallet" className="a-span-12"><ErrorNote error={status.error} onRetry={status.reload} /></Card>
  if (!status.data) return <Card title="Stripe" icon="wallet" className="a-span-12"><Loading /></Card>
  if (!status.data.configured) return <Setup />

  const d = data.data
  const s = d?.sync
  const conv = d?.checkout_started ? Math.round((d.checkout_completed / d.checkout_started) * 100) : null
  return (
    <>
      <Card title="Stripe" icon="wallet" className="a-span-12"
        subtitle={s?.last_sync ? `synced ${ago(s.last_sync)}` : 'not synced yet'}
        actions={<>
          <Badge tone={status.data.livemode ? 'ok' : 'warn'}>{status.data.livemode ? 'Live' : 'Sandbox (test mode)'}</Badge>
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => sync(true)} disabled={syncing}><Icon name="refresh" size={16} /> {syncing ? 'Syncing…' : 'Sync now'}</button>
        </>}>
        <ErrorNote error={syncError || (s && !s.ok ? new Error(s.error) : null)} />
        {!d ? <Loading /> : (
          <>
            <div className="a-stats">
              <Stat label="Yearly revenue run rate" value={money(d.arr)} hint={`${d.active_subscriptions} active yearly`} />
              <Stat label="Founders lifetime sold" value={d.lifetime_sold} hint={`${d.lifetime_sold_period} in this period`} />
              <Stat label="Gross revenue" value={money(d.gross)} hint={filters.label} />
              <Stat label="Refunded" value={money(d.refunded)} invert />
              <Stat label="Discounts given" value={money(d.discounts)} />
              <Stat label="Checkout conversion" value={conv == null ? '—' : `${conv}%`} hint={`${d.checkout_completed} of ${d.checkout_started}`} />
              <Stat label="New subscriptions" value={d.new_subscriptions} />
              <Stat label="Cancellations" value={d.cancellations} hint={`${d.canceling} set to cancel`} invert />
              <Stat label="Failed payments" value={d.failed} hint={`${d.past_due} past due`} invert />
              <Stat label="Customers" value={d.customers} hint={`${d.matched_customers} matched to members`} />
            </div>
            {!!d.daily.length && <div className="a-mini-charts"><span className="a-muted">Revenue a day</span><Bars data={d.daily.map(x => ({ day: x.day, value: x.gross || 0 }))} label="Revenue per day" /></div>}
          </>
        )}
      </Card>
      {d && (
        <>
          <Card title="Payments" icon="receipt" className="a-span-6" actions={<ExportButton name="stripe-payments" rows={d.payments} />}>
            <Table rows={d.payments} onRow={p => p.user_id && go({ tab: 'members', member: p.user_id })} empty="No payments yet." cols={[
              { key: 'created', label: 'When', render: p => fmtDate(p.created, true), sortValue: p => p.created },
              { key: 'email', label: 'Member', render: p => p.email || '—' },
              { key: 'plan', label: 'For', render: p => ({ lifetime: 'Lifetime', yearly: 'Yearly', monthly: 'Monthly', renewal: 'Renewal', subscription: 'Subscription', one_time: 'One-time' }[p.plan] || p.plan) },
              { key: 'amount', label: 'Amount', num: true, render: p => money(p.amount, p.currency) },
              { key: 'status', label: 'Status', render: p => p.refunded ? <Badge>Refunded</Badge> : p.status === 'succeeded' ? <Badge tone="ok">Paid</Badge> : <Badge tone="danger">{p.failure || p.status}</Badge> },
            ]} />
          </Card>
          <Card title="Subscriptions" icon="calendar" className="a-span-6" actions={<ExportButton name="stripe-subscriptions" rows={d.subscriptions} />}>
            <Table rows={d.subscriptions} onRow={x => x.user_id && go({ tab: 'members', member: x.user_id })} empty="No subscriptions yet." cols={[
              { key: 'email', label: 'Member', render: x => x.email || '—' },
              { key: 'status', label: 'Status', render: x => <Badge tone={x.status === 'active' ? (x.canceling ? 'warn' : 'ok') : x.status === 'past_due' ? 'danger' : 'neutral'}>{x.canceling ? 'Cancels at period end' : x.status.replace('_', ' ')}</Badge> },
              { key: 'amount', label: 'Price', num: true, render: x => `${money(x.amount, x.currency)}/${x.interval === 'year' ? 'yr' : x.interval || '—'}` },
              { key: 'renews', label: 'Renews', render: x => fmtDate(x.renews), sortValue: x => x.renews },
              { key: 'promotion_code', label: 'Code', render: x => x.promotion_code ? <Badge tone="accent">code</Badge> : '—' },
            ]} />
          </Card>
        </>
      )}
    </>
  )
}

function Setup() {
  return (
    <Card title="Connect Stripe" icon="wallet" className="a-span-12">
      <p>Stripe is set up (sandbox: First Class yearly $14.99 and founders lifetime $29.99), but the cockpit can't read it until its key is stored on the server. That's a 2-minute step only you can do:</p>
      <ol className="a-rules">
        <li>In Stripe (sandbox), open Developers → API keys → Create restricted key. Name it "STT cockpit".</li>
        <li>Give it <strong>Read</strong> on Customers, Subscriptions, Charges, Invoices, Checkout Sessions, Products and Prices, and <strong>Write</strong> on Coupons and Promotion codes. Create it and copy it.</li>
        <li>In Supabase, open Project Settings → Edge Functions → Secrets → Add secret. Name: <code>STRIPE_SECRET_KEY</code>, value: the key.</li>
        <li>Reload this page. The feed syncs on its own from then on.</li>
      </ol>
      <p className="a-hint">When you go live, swap in a live-mode restricted key the same way; the badge here turns from Sandbox to Live.</p>
    </Card>
  )
}
