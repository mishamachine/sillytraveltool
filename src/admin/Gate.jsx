import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { api, isDemo } from './api'
import { Loading, ErrorNote } from './ui'

// Google sign-in → cockpit. The database decides (admin_guard: an admins row and a Google session);
// this only picks the screen. An email-link or password session is asked to continue with Google.

export default function Gate({ children }) {
  const [who, setWho] = useState(null)
  const [session, setSession] = useState(undefined)

  const refresh = async () => {
    if (isDemo) { setSession({ user: { email: 'owner@example.com' } }); setWho({ is_admin: true, role: 'owner', google: true }); return }
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (!data.session) { setWho(null); return }
    try { setWho(await api.whoami()) } catch (e) { setWho({ error: e }) }
  }

  useEffect(() => {
    refresh()
    if (isDemo) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') refresh()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Frame><Loading label="Checking your sign-in…" /></Frame>
  if (!session) return <Frame><SignIn /></Frame>
  if (!who) return <Frame><Loading label="Checking your access…" /></Frame>
  if (who.error) return <Frame><ErrorNote error={who.error} onRetry={refresh} /></Frame>
  if (!who.is_admin) return <Frame><NotAdmin email={session.user?.email} /></Frame>
  if (!who.google) return <Frame><SignIn again email={session.user?.email} /></Frame>
  return children({ role: who.role, email: session.user?.email, signOut: () => supabase.auth.signOut() })
}

function Frame({ children }) {
  return (
    <div className="a-gate">
      <div className="a-gate__card">
        <div className="a-gate__brand"><img src="/favicon.svg" alt="" width="36" height="36" /><div><strong>STT cockpit</strong><span>Owner access only</span></div></div>
        {children}
      </div>
    </div>
  )
}

function SignIn({ again, email }) {
  const [error, setError] = useState(null)
  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/admin/`, queryParams: { prompt: 'select_account' } } })
    if (error) setError(error)
  }
  return (
    <>
      <p className="a-gate__text">
        {again ? `You're signed in as ${email} without Google. The cockpit needs a Google sign-in.` : 'Sign in with the Google account linked to your STT account.'}
      </p>
      <button className="a-btn a-btn--primary a-btn--block" onClick={google}>Continue with Google</button>
      {again && <button className="a-link" onClick={() => supabase.auth.signOut()}>Sign out</button>}
      <ErrorNote error={error} />
    </>
  )
}

function NotAdmin({ email }) {
  return (
    <>
      <p className="a-gate__text">{email} isn't an admin account.</p>
      <button className="a-btn a-btn--block" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </>
  )
}
