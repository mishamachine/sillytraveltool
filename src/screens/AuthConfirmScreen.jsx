// /auth/confirm (web only): the branded landing page for the links in our auth emails.
// Nothing is verified on load. The Continue tap calls verifyOtp, so email link scanners can't spend the token.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { CONFIRM_TYPES, REASON_COPY, parseConfirmParams, stripConfirmParams, confirmLink } from '../lib/authConfirm'
import { Screen, Button, Banner, Text, Stack, GooseMark } from '../ui'
import './auth/auth.css'

// Read the link once, then remove the one-time params from the address bar. Kept at module level, not in a ref:
// React StrictMode renders twice in dev, and the second pass would find the params already gone.
let link = null
function readLink() {
  if (link) return link
  link = parseConfirmParams(window.location.search)
  try { stripConfirmParams(window) } catch { /* history can be locked in odd webviews */ }
  return link
}

export default function AuthConfirmScreen({ onDone }) {
  const parsed = readLink()
  const info = CONFIRM_TYPES[parsed.type]
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(parsed.error || null)
  const [changed, setChanged] = useState(false)
  // A link can belong to a different account than the one signed in here. Say so before Continue swaps them.
  const { user, loading } = useAuthStore()

  const onContinue = async () => {
    setBusy(true)
    const res = await confirmLink(supabase, parsed)
    if (!res.ok) { setReason(res.reason); setBusy(false); return }
    // The reset link signs the member in; keep the "set new password" step up, as the old redirect flow did
    if (res.type === 'recovery') useAuthStore.getState().setPasswordRecovery(true)
    // An email change can wait for a second confirmation from the other address, so say that before moving on
    if (res.type === 'email_change') { setChanged(true); setBusy(false); return }
    onDone()
  }

  const askAgain = () => {
    useAuthStore.getState().setAuthStartMode(info?.start || 'login')
    onDone()
  }

  if (changed) {
    return (
      <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-confirm-title">
        <div className="auth-hero">
          <GooseMark expression="excited" size={96} tile tileSize="lg" />
          <Stack gap={2} align="center">
            <Text variant="h1" id="auth-confirm-title" align="center">Email change confirmed</Text>
            <Text variant="body-lg" tone="secondary" align="center">If the new address does not show up in your account yet, check your other inbox too. We may have sent a second link there to confirm.</Text>
          </Stack>
        </div>
        <div className="auth-actions">
          <Button variant="primary" size="lg" block onClick={onDone}>Open Silly Travel Tool</Button>
        </div>
      </Screen>
    )
  }

  if (reason) {
    const copy = REASON_COPY[reason]
    const retryable = reason === 'network'
    return (
      <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-confirm-title">
        <div className="auth-hero">
          <GooseMark expression="reading" size={96} tile tileSize="lg" />
          <Stack gap={2} align="center">
            <Text variant="h1" id="auth-confirm-title" align="center">{copy.title}</Text>
            <Text variant="body-lg" tone="secondary" align="center">{copy.body}</Text>
          </Stack>
        </div>
        <div className="auth-actions" role="alert">
          {retryable
            ? <Button variant="primary" size="lg" block onClick={() => setReason(null)}>Try again</Button>
            : <Button variant="primary" size="lg" block onClick={askAgain}>{info?.again || 'Back to log in'}</Button>}
          {!(info?.start === 'login') && !retryable && <Button variant="ghost" block onClick={() => { useAuthStore.getState().setAuthStartMode(null); onDone() }}>Back to log in</Button>}
        </div>
      </Screen>
    )
  }

  return (
    <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-confirm-title">
      <div className="auth-hero">
        <GooseMark expression="happy" size={96} tile tileSize="lg" />
        <Stack gap={2} align="center">
          <Text variant="h1" id="auth-confirm-title" align="center">{info.title}</Text>
          <Text variant="body-lg" tone="secondary" align="center">{info.blurb}</Text>
        </Stack>
      </div>
      <div className="auth-actions">
        {user && (
          <Banner tone="info" icon="info" title={`You're signed in as ${user.email || 'another account'}`}>
            Continuing may switch to the account this link is for. If that is not what you want, stay signed in.
          </Banner>
        )}
        <Button variant="primary" size="lg" block loading={busy || loading} onClick={onContinue}>{busy ? 'One moment' : 'Continue'}</Button>
        {user && <Button variant="ghost" block disabled={busy} onClick={onDone}>Stay signed in</Button>}
        <Text variant="caption" tone="muted" align="center">You are on sillytraveltool.com. If you did not ask for this email, you can close this page.</Text>
      </div>
    </Screen>
  )
}
