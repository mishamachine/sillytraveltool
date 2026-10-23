import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from '../lib/supabase'
import { applyTheme, getSavedTheme } from '../lib/theme'
import { track } from '../lib/analytics'
import '../admin/admin.css'

// sillytraveltool.com/upgrade: buy First Class on the web through Stripe Checkout, or manage it in the Stripe
// customer portal (docs/PAYWALL_PLAN.md). Website only: inside the apps, Apple and Google require their own billing.
// The billing Edge Function makes the Stripe pages; stripe-webhook unlocks First Class once Stripe confirms payment.

const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

function Upgrade() {
  const [session, setSession] = useState(undefined)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [paid] = useState(() => !!new URLSearchParams(location.search).get('paid'))
  const [waiting, setWaiting] = useState(paid)

  const loadPlan = () => supabase.rpc('my_entitlement').then(({ data }) => { setPlan(data); return data })
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) loadPlan() })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (s) loadPlan() })
    return () => data.subscription.unsubscribe()
  }, [])

  // Back from Checkout: Stripe's webhook usually lands within seconds; keep checking for up to 30 s
  useEffect(() => {
    if (!paid || !session) return
    let tries = 0
    const t = setInterval(async () => {
      const p = await loadPlan()
      const done = p?.plan === 'first_class'
      if (done) track('purchase_completed', { plan: p.web?.lifetime ? 'lifetime' : 'yearly', store: 'stripe' })
      if (done || ++tries >= 15) { clearInterval(t); setWaiting(false) }
    }, 2000)
    return () => clearInterval(t)
  }, [paid, session])

  const go = async (action, extra = {}) => {
    setBusy(extra.plan || action)
    setError(null)
    if (action === 'checkout') track('purchase_started', { plan: extra.plan, store: 'stripe' })
    const { data, error: err } = await supabase.functions.invoke('billing', { body: { action, ...extra } })
    if (data?.url) { location.href = data.url; return }
    setBusy(null)
    let message = data?.error
    if (!message && err?.context?.json) message = (await err.context.json().catch(() => null))?.error
    setError(message || 'Goose couldn’t reach payments. Try again in a moment.')
  }
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })

  useEffect(() => { if (plan && plan.plan !== 'first_class' && !paid) track('paywall_view', { trigger: 'web' }) }, [plan?.plan])

  const web = plan?.web
  const firstClass = plan?.plan === 'first_class'

  return (
    <div className="a-gate">
      <div className="a-gate__card">
        <div className="a-gate__brand"><img src="/favicon.svg" alt="" width="36" height="36" /><div><strong>First Class</strong><span>Silly Travel Tool</span></div></div>
        {session === undefined ? <p className="a-gate__text">Checking your sign-in…</p> : !session ? (
          <>
            <p className="a-gate__text">Sign in with the account you use in the app. First Class then works on every device you sign in to.</p>
            <button className="a-btn a-btn--primary a-btn--block" onClick={google}>Continue with Google</button>
            <a className="a-btn a-btn--block" href="/">Sign in another way</a>
            <p className="a-hint">After signing in on the main site, come back to this page.</p>
          </>
        ) : !plan ? <p className="a-gate__text">Checking your plan…</p> : (
          <>
            <p className="a-gate__text">Signed in as {session.user.email}.</p>
            {waiting && !firstClass && <div className="a-callout" role="status">Payment received. Goose is unlocking First Class…</div>}
            {paid && !waiting && !firstClass && <div className="a-callout a-callout--warn" role="status">Your payment went through, but First Class isn’t showing yet. Refresh in a minute; if it still isn’t there, email hello@sillytraveltool.com.</div>}
            {firstClass ? (
              <>
                <div className="a-callout a-callout--ok" role="status">
                  You have First Class{web?.lifetime || !plan.until ? ' for life' : web?.subscription?.canceling ? ` until ${fmt(plan.until)}` : `, renewing ${fmt(plan.until)}`}.
                  {web?.subscription?.status === 'past_due' && ' Your last payment didn’t go through; update your card to keep it.'}
                </div>
                {web?.customer && <button className="a-btn a-btn--block" disabled={!!busy} onClick={() => go('portal')}>{busy === 'portal' ? 'Opening…' : 'Manage billing'}</button>}
                <a className="a-btn a-btn--primary a-btn--block" href="/">Open Silly Travel Tool</a>
              </>
            ) : (
              <>
                <p className="a-gate__text">Unlimited trips, reservations and email import, and every past trip kept. We keep STT as affordable as we can so more people travel, well informed and organised. Your subscription keeps the lights on (and the dog fed).</p>
                <button className="a-btn a-btn--primary a-btn--block" disabled={!!busy} onClick={() => go('checkout', { plan: 'yearly' })}>{busy === 'yearly' ? 'Opening checkout…' : 'First Class yearly · $14.99 / year'}</button>
                <button className="a-btn a-btn--block" disabled={!!busy} onClick={() => go('checkout', { plan: 'lifetime' })}>{busy === 'lifetime' ? 'Opening checkout…' : 'Founders offer · $29.99 once, for life'}</button>
                <p className="a-hint">Secure payment by Stripe. Have a discount code? Enter it on the payment page. Cancel any time; you keep First Class to the end of the year you paid for.</p>
                {web?.customer && <button className="a-btn a-btn--ghost a-btn--block" disabled={!!busy} onClick={() => go('portal')}>Billing history</button>}
              </>
            )}
            {error && <div className="a-error" role="alert">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}

applyTheme(getSavedTheme())
createRoot(document.getElementById('root')).render(<StrictMode><Upgrade /></StrictMode>)
