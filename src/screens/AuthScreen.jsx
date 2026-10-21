// STT AuthScreen v4 — maximum splash energy
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function SplashGoose({ size = 120, animate = false }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" fill="none"
      style={animate ? { animation: 'splashFloat 3.5s ease-in-out infinite', filter: 'drop-shadow(0 8px 32px rgba(196,86,30,0.35))' } : {}}
    >
      <ellipse cx="2" cy="58" rx="16" ry="22" fill="#F5F0E8" stroke="#2A2520" strokeWidth="3.5" transform="rotate(-48 2 58)"/>
      <ellipse cx="98" cy="58" rx="16" ry="22" fill="#F5F0E8" stroke="#2A2520" strokeWidth="3.5" transform="rotate(48 98 58)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F5F0E8" stroke="#2A2520" strokeWidth="3.5" strokeLinejoin="round"/>
      <ellipse cx="42" cy="58" rx="8" ry="5" fill="#C4561E" opacity=".12"/>
      <circle cx="50" cy="33" r="29" fill="#F5F0E8" stroke="#2A2520" strokeWidth="3.5"/>
      <ellipse cx="28" cy="40" rx="7" ry="5" fill="#C4561E" opacity=".15"/>
      <circle cx="38" cy="28" r="9" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="36.5" cy="26.5" r="5.5" fill="#2A2520"/>
      <circle cx="34.5" cy="24.5" r="2" fill="#fff"/>
      <circle cx="40" cy="24" r="1" fill="#fff" opacity=".6"/>
      <path d="M30 47 Q44 57 56 47" stroke="#2A2520" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M57 29 Q74 24 79 31 Q74 38 57 36Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M57 36 Q72 36 77 42 Q70 48 57 41Z" fill="#D4910A" stroke="#2A2520" strokeWidth="2.5" strokeLinejoin="round"/>
      <ellipse cx="50" cy="6" rx="28" ry="7" fill="#2A2520"/>
      <rect x="26" y="0" width="48" height="10" rx="4" fill="#2A2520"/>
      <path d="M26 8 Q50 15 74 8" stroke="#C4561E" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <circle cx="85" cy="20" r="3" fill="#E8A820"/>
      <circle cx="90" cy="35" r="2" fill="#E8A820" opacity=".7"/>
      <circle cx="78" cy="10" r="1.5" fill="#E8A820" opacity=".5"/>
      <circle cx="14" cy="22" r="2.5" fill="#E8A820" opacity=".6"/>
    </svg>
  )
}

const DESTINATIONS = [
  'Tokyo','Paris','Bali','New York','Rome','Barcelona','Dubai','Kyoto',
  'Lisbon','Amsterdam','Seoul','Marrakech','Sydney','Cape Town',
  'Buenos Aires','Prague','Havana','Santorini','Maldives','Queenstown',
  'Istanbul','Vienna','Bangkok','Reykjavik','Nairobi',
]

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [resetMode, setResetMode] = useState(false) // true when user arrives via recovery link

  useEffect(() => { setTimeout(() => setMounted(true), 60) }, [])

  // Detect PASSWORD_RECOVERY event — user clicked the reset link in their email
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setResetMode(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        setSent(true)
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        setSent(true)
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
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
      setResetMode(false)
      setMode('login')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setError(error.message)
    setLoading(false)
  }

  // Password reset screen — shown when user arrives via recovery email link
  if (resetMode) return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1A1208 0%, #2D1F0A 50%, #3A1A08 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', gap: '24px',
    }}>
      <div style={{ animation: 'splashFloat 3s ease-in-out infinite', filter: 'drop-shadow(0 8px 32px rgba(196,86,30,0.4))' }}>
        <SplashGoose size={90} />
      </div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', color: '#F5F0E8', fontWeight: 700, margin: 0 }}>
        Set a new password
      </h2>
      {error && (
        <div style={{ background: 'rgba(255,80,50,0.15)', border: '1px solid rgba(255,80,50,0.4)', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#FF9980', maxWidth: 320, width: '100%', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        <input
          type="password"
          className="form-input"
          placeholder="New password (min 8 characters)"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required minLength={8}
          autoComplete="new-password"
          style={{ background: 'rgba(245,240,232,0.08)', border: '1.5px solid rgba(245,240,232,0.15)', color: '#F5F0E8', borderRadius: 12, padding: '13px 16px', fontSize: 15, outline: 'none' }}
        />
        <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ fontSize: 15, padding: '13px' }}>
          {loading ? 'Updating...' : 'Update password →'}
        </button>
      </form>
      <style>{`@keyframes splashFloat { 0%,100%{transform:translateY(0) rotate(-1deg);}50%{transform:translateY(-14px) rotate(1deg);}}`}</style>
    </div>
  )

  if (sent) return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1A1208 0%, #2D1F0A 50%, #3A1A08 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center', gap: '24px',
    }}>
      <div style={{ animation: 'splashFloat 3s ease-in-out infinite', filter: 'drop-shadow(0 8px 32px rgba(196,86,30,0.4))' }}>
        <SplashGoose size={110} />
      </div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '26px', color: '#F5F0E8', fontWeight: 700 }}>
        Check your email!
      </h2>
      <p style={{ color: 'rgba(245,240,232,.65)', maxWidth: '280px', lineHeight: 1.7, fontSize: 15 }}>
        {mode === 'magic' ? `Magic link sent to ${email}.` : mode === 'forgot' ? `Password reset link sent to ${email}. Check your inbox.` : `Confirmation sent to ${email}. Click the link to activate your account.`}
      </p>
      <button className="btn btn-ghost" onClick={() => { setSent(false); setError(null) }}
        style={{ color: 'rgba(245,240,232,.8)', borderColor: 'rgba(245,240,232,.2)' }}>
        ← Back
      </button>
      <style>{`@keyframes splashFloat { 0%,100%{transform:translateY(0) rotate(-1deg);}50%{transform:translateY(-14px) rotate(1deg);}}`}</style>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0F0B06 0%, #1E1409 35%, #2D1A0A 65%, #3D1C0A 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflowX: 'hidden', overflowY: 'auto',
    }}>

      {/* Floating destination word cloud */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {DESTINATIONS.map((city, i) => (
          <div key={city} style={{
            position: 'absolute',
            fontFamily: 'var(--font-heading)',
            fontSize: `${9 + (i % 5) * 2.5}px`,
            fontWeight: 700,
            color: `rgba(196,86,30,${0.05 + (i % 4) * 0.035})`,
            left: `${(i * 41 + 7) % 92}%`,
            top: `${(i * 31 + 5) % 88}%`,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            transform: `rotate(${(i % 5 - 2) * 6}deg)`,
            opacity: mounted ? 1 : 0,
            transition: `opacity 1.2s ease ${i * 0.04}s`,
          }}>{city}</div>
        ))}
      </div>

      {/* Multi-layer glow — centre + upper radial */}
      <div style={{
        position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(196,86,30,0.22) 0%, rgba(196,86,30,0.06) 45%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(232,168,32,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 24px 20px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}>

        {/* Goose */}
        <SplashGoose size={110} animate />

        {/* Brand */}
        <div style={{ textAlign: 'center', marginTop: 28, marginBottom: 6 }}>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: '38px', fontWeight: 700,
            color: '#F5F0E8', letterSpacing: '-0.03em', lineHeight: 1.05,
          }}>
            Silly Travel Tool
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 600,
            color: '#C4561E', marginTop: 10, letterSpacing: '0.04em',
          }}>
            Trust The Goose. It knows a spot.
          </div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: '13px',
            color: 'rgba(245,240,232,0.45)', marginTop: 6, letterSpacing: '0.01em',
          }}>
            Your cheeky but genuinely useful travel companion
          </div>
        </div>

        {/* Feature cards — 2×3 grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          marginTop: 24, width: '100%', maxWidth: 320,
        }}>
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 12.1 19.79 19.79 0 0 1 1.62 3.47 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.45a16 16 0 0 0 6 6l1.27-.85a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z"/>
                  <path d="M18 2l2 2-2 2M16 4h4"/>
                  <path d="M5 9l2-2 4 4"/>
                  <path d="M3 3l18 18" style={{display:'none'}}/>
                  <path d="M17.5 6.5 20 9l-5 1 1-5z"/>
                  <line x1="3" y1="3" x2="21" y2="21" style={{display:'none'}}/>
                </svg>
              ),
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4561E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <line x1="3.27" y1="6.96" x2="12" y2="12.01"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                  <line x1="20.73" y1="6.96" x2="12" y2="12.01"/>
                </svg>
              ),
              label: 'Flights',
              sub: 'Track bookings',
              accent: '#C4561E',
              delay: 0,
            },
            {
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7B61C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              ),
              label: 'Hotels',
              sub: 'Stay organised',
              accent: '#7B61C4',
              delay: 0.05,
            },
            {
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8A820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              ),
              label: 'AI Guides',
              sub: 'Know every city',
              accent: '#E8A820',
              delay: 0.1,
            },
            {
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
                </svg>
              ),
              label: 'Weather',
              sub: 'Pack right',
              accent: '#1A73E8',
              delay: 0.15,
            },
            {
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4561E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              ),
              label: 'HONK',
              sub: 'Discover nearby',
              accent: '#C4561E',
              isGoose: true,
              delay: 0.2,
            },
            {
              iconClean: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D8B55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              ),
              label: 'Currency',
              sub: 'Live rates',
              accent: '#2D8B55',
              delay: 0.25,
            },
          ].map(({ iconClean, label, sub, accent, isGoose, delay }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.055)',
              border: `1px solid rgba(255,255,255,0.09)`,
              borderRadius: 14,
              padding: '12px 13px',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.5s ease ${0.3 + delay}s, transform 0.5s ease ${0.3 + delay}s`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: accent + '1A',
                border: `1px solid ${accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {iconClean}
              </div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 700,
                  fontSize: 13, color: '#F5F0E8',
                  lineHeight: 1.2,
                }}>
                  {isGoose ? '🪿 ' : ''}{label}
                </div>
                <div style={{
                  fontSize: 11, color: 'rgba(245,240,232,0.45)',
                  fontFamily: 'var(--font-body)', marginTop: 1,
                  lineHeight: 1.2,
                }}>
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Auth card — slides up */}
      <div style={{
        background: '#FAF7F2',
        borderRadius: '28px 28px 0 0',
        padding: '28px 24px max(52px, env(safe-area-inset-bottom, 52px))',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.5)',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(32px)',
        transition: 'opacity 0.8s ease 0.15s, transform 0.8s ease 0.15s',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 24px' }} />

        {/* Mode tabs */}
        <div style={{ display: 'flex', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', padding: 4, marginBottom: 20, gap: 4 }}>
          {[['login','Log In'], ['signup','Sign Up']].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); setError(null) }} style={{
              flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: mode === id ? 'var(--surface)' : 'transparent',
              color: mode === id ? 'var(--primary)' : 'var(--text-sec)',
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '14px',
              boxShadow: mode === id ? 'var(--shadow-sm)' : 'none',
              transition: 'all var(--transition)', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>

        {error && (
          <div style={{
            background: '#FFF0EE', border: '1.5px solid var(--error)',
            borderRadius: 'var(--radius-md)', padding: '10px 14px',
            marginBottom: 16, fontSize: 13, color: 'var(--error)',
          }}>{error}</div>
        )}

        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {mode !== 'magic' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Password</label>
              <input type="password" className="form-input"
                placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: 4, fontSize: 15, padding: '13px' }}>
            {loading ? 'One sec...' : mode === 'magic' ? '✉️ Send magic link' : mode === 'signup' ? 'Create account →' : mode === 'forgot' ? 'Send reset link →' : 'Log in →'}
          </button>
          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('forgot'); setError(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tert)', textAlign: 'center', padding: '4px 0' }}>
              Forgot password?
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" onClick={() => { setMode('login'); setError(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tert)', textAlign: 'center', padding: '4px 0' }}>
              ← Back to log in
            </button>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'var(--text-tert)', fontSize: 13 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/> or <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        </div>

        {mode !== 'forgot' && (
          <button className="btn btn-ghost btn-full" onClick={handleGoogle} disabled={loading} style={{ gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        )}

        {mode === 'login' && (
          <button className="btn btn-ghost btn-full"
            onClick={() => { setMode('magic'); setError(null) }}
            style={{ marginTop: 10, color: 'var(--text-sec)' }}>
            ✉️ Email me a magic link
          </button>
        )}
      </div>

      <style>{`
        @keyframes splashFloat {
          0%, 100% { transform: translateY(0) rotate(-1.5deg); }
          50% { transform: translateY(-16px) rotate(1.5deg); }
        }
      `}</style>
    </div>
  )
}
