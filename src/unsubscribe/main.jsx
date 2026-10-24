import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from '../lib/supabase'
import { applyTheme, getSavedTheme } from '../lib/theme'
import '../admin/admin.css'

// sillytraveltool.com/unsubscribe/?t=<token>: the link at the bottom of every marketing email.
// One click turns marketing emails off (email_unsubscribe, by token only); account emails still arrive.
// Beta waitlist emails carry the same link: those people get no more beta emails, including the invite.

function Unsubscribe() {
  const token = new URLSearchParams(location.search).get('t') || ''
  const [state, setState] = useState('working')
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setState('bad'); return }
    supabase.rpc('email_unsubscribe', { p_token: token }).then(({ data, error }) => setState(error ? 'error' : data?.beta ? 'beta' : data?.ok ? 'done' : 'bad'))
  }, [token])
  return (
    <div className="a-gate">
      <div className="a-gate__card">
        <div className="a-gate__brand"><img src="/favicon.svg" alt="" width="36" height="36" /><div><strong>Email settings</strong><span>Silly Travel Tool</span></div></div>
        {state === 'working' && <p className="a-gate__text">One moment…</p>}
        {state === 'done' && <>
          <p className="a-gate__text"><strong>You're unsubscribed.</strong> No more travel tips or offers by email. You'll still get emails about your
            account, like trip invites and security notices.</p>
          <p className="a-hint">Changed your mind? Turn on Settings → Travel tips by email in the app.</p>
        </>}
        {state === 'beta' && <>
          <p className="a-gate__text"><strong>You're unsubscribed.</strong> We won't email you about the beta again, and that includes
            the invite.</p>
          <p className="a-hint">Changed your mind? Join again at sillytraveltool.com/beta.</p>
        </>}
        {state === 'bad' && <p className="a-gate__text">This unsubscribe link isn't valid. Turn emails off in the app under Settings → Travel tips by email, or reply to any email and we'll do it.</p>}
        {state === 'error' && <p className="a-gate__text">Goose couldn't save that just now. Try the link again in a moment, or reply to the email and we'll do it.</p>}
        <a className="a-btn a-btn--block" href="/">Open Silly Travel Tool</a>
      </div>
    </div>
  )
}

applyTheme(getSavedTheme())
createRoot(document.getElementById('root')).render(<StrictMode><Unsubscribe /></StrictMode>)
