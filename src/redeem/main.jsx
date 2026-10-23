import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from '../lib/supabase'
import { applyTheme, getSavedTheme } from '../lib/theme'
import '../admin/admin.css'

// sillytraveltool.com/redeem: members enter a First Class code here (docs/ADMIN_PLAN.md 4b). Website only:
// Apple and Google don't allow unlocking paid features with our own codes inside their apps, so the apps link here.
// The database (redeem_code) checks everything and records every attempt.

function Redeem() {
  const [session, setSession] = useState(undefined)
  const [plan, setPlan] = useState(null)
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') || '')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadPlan = () => supabase.rpc('my_entitlement').then(({ data }) => setPlan(data))
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) loadPlan() })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (s) loadPlan() })
    return () => data.subscription.unsubscribe()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('redeem_code', { p_code: code })
    setBusy(false)
    setResult(error ? { ok: false, message: 'Goose couldn’t check that code. Try again in a moment.' } : data)
    if (data?.ok) loadPlan()
  }
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href, queryParams: { prompt: 'select_account' } } })

  return (
    <div className="a-gate">
      <div className="a-gate__card">
        <div className="a-gate__brand"><img src="/favicon.svg" alt="" width="36" height="36" /><div><strong>Redeem a code</strong><span>Silly Travel Tool</span></div></div>
        {session === undefined ? <p className="a-gate__text">Checking your sign-in…</p> : !session ? (
          <>
            <p className="a-gate__text">Sign in with the account you use in the app. First Class then works on every device you sign in to.</p>
            <button className="a-btn a-btn--primary a-btn--block" onClick={google}>Continue with Google</button>
            <a className="a-btn a-btn--block" href="/">Sign in another way</a>
            <p className="a-hint">After signing in on the main site, come back to this page.</p>
          </>
        ) : (
          <>
            <p className="a-gate__text">Signed in as {session.user.email}.{plan?.plan === 'first_class' && <> You have First Class{plan.until ? ` until ${new Date(plan.until).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : ' for life'}.</>}</p>
            <button className="a-link" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Not you? Use another account</button>
            <form className="a-gate__form" onSubmit={submit}>
              <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null) }} placeholder="GOOSE30" autoCapitalize="characters"
                autoComplete="off" spellCheck="false" maxLength={40} aria-label="Code" />
              <button className="a-btn a-btn--primary a-btn--block" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Redeem'}</button>
            </form>
            {result && <div className={result.ok ? 'a-callout a-callout--ok' : 'a-error'} role="status">{result.message}</div>}
            {result?.ok && <a className="a-btn a-btn--block" href="/">Open Silly Travel Tool</a>}
          </>
        )}
      </div>
    </div>
  )
}

applyTheme(getSavedTheme())
createRoot(document.getElementById('root')).render(<StrictMode><Redeem /></StrictMode>)
