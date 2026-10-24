// Welcome + sign in / sign up / magic link / password reset (Clay)
import { useState, useEffect } from 'react'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'
import { authRedirect, isNative } from '../lib/authRedirect'
import { useAuthStore } from '../store/authStore'
import { useBackHandler } from '../lib/backStack'
import {
  Screen, Button, IconButton, Field, Banner, SegmentedControl, Text, Stack, GooseMark, Logo, LinkButton,
} from '../ui'
import './auth/auth.css'

function GoogleMark() {
  // Google's brand mark keeps its own colours (brand guidelines), so it is not a token icon.
  return (
    <svg className="auth-google" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" fill="#FBBC05" />
      <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" fill="#EA4335" />
    </svg>
  )
}

function AppleMark() {
  // Apple's logo (Sign in with Apple guidelines): solid, takes the button's text colour.
  return (
    <svg className="auth-google" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8a4.7 4.7 0 0 0-4 2.4c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7 0 0-2.4-1-2.4-4zM14 5.4c.7-.8 1.1-1.9 1-3a4.3 4.3 0 0 0-2.8 1.4c-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />
    </svg>
  )
}

// Show "Continue with Apple" once the Apple provider is switched on in Supabase (Auth → Providers → Apple).
async function appleEnabled() {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
    return !!(await res.json())?.external?.apple
  } catch { return false }
}

const TITLES = { login: 'Welcome back', signup: 'Create your account', magic: 'Email me a sign-in link', forgot: 'Reset your password' }

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [apple, setApple] = useState(false)
  useEffect(() => { appleEnabled().then(setApple) }, [])
  const [step, setStep] = useState('welcome') // 'welcome' | 'email'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  // true when the user arrives via a password-reset link (set in authStore)
  const resetMode = useAuthStore(s => s.passwordRecovery)
  const setPasswordRecovery = useAuthStore(s => s.setPasswordRecovery)
  const authError = useAuthStore(s => s.authError)
  const setAuthError = useAuthStore(s => s.setAuthError)

  // Sign-in failures from a deep link (expired magic link, etc.)
  useEffect(() => {
    if (!authError) return
    setError(authError)
    setAuthError(null)
  }, [authError])

  const switchMode = (m) => { setMode(m); setError(null) }

  // Android back steps out the way the on-screen back buttons do, instead of leaving the app
  useBackHandler(step === 'email' || sent, () => {
    if (sent) setSent(false)
    else if (mode === 'forgot' || mode === 'magic') setMode('login')
    else { setStep('welcome'); setMode('login') }
    setError(null)
  })

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect() } })
        if (error) throw error
        setSent(true)
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } })
        if (error) throw error
        setSent(true)
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Native PKCE links carry no recovery event, so flag it in the URL
          redirectTo: isNative ? authRedirect({ type: 'recovery' }) : authRedirect(),
        })
        if (error) throw error
        setSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordRecovery(false)
      setMode('login')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleOAuth = async (provider) => {
    setLoading(true)
    setError(null)
    // Native: Google blocks sign-in inside WebViews, so open it in a Custom Tab;
    // it returns via the app scheme and src/native/deepLinks.js finishes sign-in.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // select_account: Google always shows its account chooser instead of reusing the last account
      options: { redirectTo: authRedirect(), skipBrowserRedirect: isNative, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
    })
    if (error) setError(error.message)
    else if (isNative && data?.url) await Browser.open({ url: data.url })
    setLoading(false)
  }

  const errorBanner = error && (
    <Banner tone="danger" icon="alert-circle" title="That didn't work" role="alert">{error}</Banner>
  )

  // Password reset screen — shown when user arrives via recovery email link
  if (resetMode) return (
    <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-reset-title">
      <div className="auth-hero">
        <GooseMark expression="happy" size={96} tile tileSize="lg" />
        <Stack gap={2} align="center">
          <Text variant="h1" id="auth-reset-title" align="center">Set a new password</Text>
          <Text variant="body-lg" tone="secondary" align="center">At least 8 characters. You'll stay signed in.</Text>
        </Stack>
      </div>
      <form className="auth-actions" onSubmit={handleResetPassword}>
        {errorBanner}
        <Field label="New password" type="password" hint="At least 8 characters" placeholder="Choose a password" value={newPassword}
          onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? 'Updating' : 'Update password'}</Button>
        <Button variant="ghost" block disabled={loading} onClick={() => setPasswordRecovery(false)}>Not now</Button>
      </form>
    </Screen>
  )

  if (sent) return (
    <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-sent-title">
      <div className="auth-hero">
        <GooseMark expression="excited" size={96} tile tileSize="lg" />
        <Stack gap={2} align="center">
          <Text variant="h1" id="auth-sent-title" align="center">Check your email</Text>
          <Text variant="body-lg" tone="secondary" align="center">
            {mode === 'magic' ? `We sent a sign-in link to ${email}.`
              : mode === 'forgot' ? `We sent a password reset link to ${email}.`
                : `We sent a confirmation link to ${email}. Tap it to activate your account.`}
          </Text>
        </Stack>
      </div>
      <div className="auth-actions">
        <Button variant="secondary" size="lg" block icon="arrow-left" onClick={() => { setSent(false); setError(null) }}>Back</Button>
      </div>
    </Screen>
  )

  if (step === 'welcome') return (
    <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-title">
      <div className="auth-hero">
        <Stack gap={5} align="center">
          <h1 id="auth-title" className="auth-logo"><Logo size="lg" /></h1>
          <Text variant="body-lg" tone="secondary" align="center" className="auth-tagline">
            Every booking, every city, one goose. Serious about your trip, not about itself.
          </Text>
        </Stack>
      </div>
      <div className="auth-actions">
        {errorBanner}
        {apple && (
          <Button variant="dark" size="lg" block onClick={() => handleOAuth('apple')} disabled={loading}>
            <AppleMark />Continue with Apple
          </Button>
        )}
        <Button variant="secondary" size="lg" block onClick={() => handleOAuth('google')} disabled={loading}>
          <GoogleMark />Continue with Google
        </Button>
        <Button variant="outline" size="lg" block icon="mail" onClick={() => { setStep('email'); setError(null) }}>Continue with email</Button>
        <Text variant="caption" tone="muted" align="center">
          By continuing you agree to our <LinkButton href="https://sillytraveltool.com/terms/" target="_blank" rel="noreferrer">Terms</LinkButton> and <LinkButton href="https://sillytraveltool.com/privacy/" target="_blank" rel="noreferrer">Privacy Policy</LinkButton>. Goose uses AI to read bookings and write guides.
        </Text>
      </div>
    </Screen>
  )

  // Email: log in / sign up / magic link / forgot password
  const submitLabel = loading ? 'One moment'
    : mode === 'magic' ? 'Send sign-in link' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'
  return (
    <Screen variant="full" className="c-screen--onboarding auth" labelledBy="auth-email-title">
      <div className="auth-bar">
        <IconButton icon="chevron-left" label="Back" onClick={() => { setStep('welcome'); setMode('login'); setError(null) }} />
      </div>
      <Stack gap={2}>
        <Text variant="h1" id="auth-email-title">{TITLES[mode]}</Text>
        {mode === 'magic' && <Text variant="body-lg" tone="secondary">No password needed. Tap the link in the email and you're in.</Text>}
        {mode === 'forgot' && <Text variant="body-lg" tone="secondary">We'll email you a link to set a new one.</Text>}
      </Stack>
      {(mode === 'login' || mode === 'signup') && (
        <SegmentedControl label="Account" value={mode} onChange={switchMode}
          options={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }]} />
      )}
      <form className="auth-form" onSubmit={handleEmailAuth}>
        {errorBanner}
        <Field label="Email" type="email" inputMode="email" placeholder="you@example.com" value={email}
          onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        {(mode === 'login' || mode === 'signup') && (
          <Field label="Password" type="password" hint={mode === 'signup' ? 'At least 8 characters' : undefined} placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
            value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        <div className="auth-form__links">
          {mode === 'login' && <LinkButton onClick={() => switchMode('forgot')}>Forgot password?</LinkButton>}
          {mode === 'login' && <LinkButton icon="mail" onClick={() => switchMode('magic')}>Email me a link instead</LinkButton>}
          {(mode === 'forgot' || mode === 'magic') && <LinkButton icon="arrow-left" onClick={() => switchMode('login')}>Back to log in</LinkButton>}
        </div>
        <div className="auth-form__submit">
          <Button type="submit" variant="primary" size="lg" block loading={loading}>{submitLabel}</Button>
        </div>
      </form>
    </Screen>
  )
}
