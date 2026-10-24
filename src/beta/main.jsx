import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TagMark, Wordmark } from '../ui/Logo'
import Icon from '../ui/icons/Icon'
import { initGA, gaEvent, gaPageView } from '../lib/ga'
import { applyTheme, getSavedTheme } from '../lib/theme'
import './beta.css'

// sillytraveltool.com/beta: the beta waitlist, the one link in every social bio and post.
// Sign-ups go to the beta-signup Edge Function (the only way into beta_waitlist). No supabase-js here: two fetches keep
// the page light for phones arriving from Instagram and TikTok.
// "Get it now": the web app is live today; iPhone and Android show "Coming soon" until the owner adds a link and
// switches it on (Cockpit → Growth → Beta waitlist). Links come from beta_page_config.
// After launch the owner flips Cockpit → Growth → Beta waitlist → "Send /beta to…" and this page forwards visitors
// (UTM tags kept), so no social link has to change.

const API = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i
const PLATFORMS = [['ios', 'iPhone'], ['android', 'Android'], ['web', 'Web']]
const PLATFORM_NAME = { ios: 'iPhone', android: 'Android', web: 'the web' }
const FREQUENCIES = [['', 'Choose one (optional)'], ['rarely', 'Once a year or less'], ['few_year', 'A few times a year'],
  ['monthly', 'About once a month'], ['weekly', 'Most weeks']]
const FEATURES = [
  ['mail', 'Forward a booking email', 'Flight, hotel or train confirmation: it files itself into the right trip.'],
  ['calendar', 'Your itinerary, day by day', 'Every booking in order, in the local time of the place it happens.'],
  ['sun', 'Weather for every stop', 'The forecast for each place on your trip, at a glance.'],
]

const code = (v) => (v && /^[\w.-]{1,64}$/.test(v) ? v.toLowerCase() : '')
const query = new URLSearchParams(location.search)
const utm = { utm_source: code(query.get('utm_source')), utm_medium: code(query.get('utm_medium')), utm_campaign: code(query.get('utm_campaign')) }
const referrer = (() => {
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : ''
    return host && !host.endsWith('sillytraveltool.com') && host !== location.hostname ? host.slice(0, 128) : ''
  } catch { return '' }
})()

// Same first-touch record the app saves to member_attribution when this device later creates an account
try {
  if (!localStorage.getItem('stt_first_touch')) {
    localStorage.setItem('stt_first_touch', JSON.stringify({
      utm_source: utm.utm_source || null, utm_medium: utm.utm_medium || null, utm_campaign: utm.utm_campaign || null,
      referrer_domain: referrer || null, landing_path: '/beta/', first_seen: new Date().toISOString(),
    }))
  }
} catch { /* storage blocked */ }

// Same consent rule as the app (Settings → analytics, else the browser's Do Not Track / GPC)
const analyticsOn = (() => {
  try {
    const pref = localStorage.getItem('stt_analytics')
    if (pref) return pref === 'on'
  } catch { /* fall through */ }
  try { return !(navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) } catch { return true }
})()

function guessPlatform() {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return ''
}

// Keeps the visitor's UTM tags on outbound links, so sign-ups in the web app are attributed to the post they came from
function withUtm(href) {
  try {
    const to = new URL(href)
    for (const [k, v] of Object.entries(utm)) if (v && !to.searchParams.has(k)) to.searchParams.set(k, v)
    return to.toString()
  } catch { return href }
}

function GetRow({ icon, name, note, href, label, onClick }) {
  return (
    <div className="b-get__row">
      <span className="b-feature__icon"><Icon name={icon} size={24} /></span>
      <div className="b-get__text"><h3>{name}</h3><p>{note}</p></div>
      {href
        ? <a className="b-btn b-btn--sm" href={href} onClick={onClick}>{label}</a>
        : <span className="b-soon">Coming soon</span>}
    </div>
  )
}

function Beta() {
  const loadedAt = useRef(Date.now())
  const [email, setEmail] = useState('')
  const [platform, setPlatform] = useState(guessPlatform)
  const [frequency, setFrequency] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('form') // form | sending | done
  const [problem, setProblem] = useState('')
  const [shared, setShared] = useState('')
  const [links, setLinks] = useState({ web_url: 'https://sillytraveltool.com/' })

  useEffect(() => {
    // Launch switch: forward everyone (with their UTM tags) once the owner turns it on
    fetch(`${API}/rest/v1/rpc/beta_page_config`, { method: 'POST', headers: HEADERS, body: '{}' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return
        setLinks(cfg)
        if (!cfg.redirect_url) return
        location.replace(withUtm(cfg.redirect_url))
      })
      .catch(() => {})
    if (analyticsOn) { initGA(); gaPageView('beta') }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter an email address like name@example.com.'
    if (!platform) errs.platform = 'Pick where you’ll use it.'
    setErrors(errs)
    setProblem('')
    if (Object.keys(errs).length) return
    setState('sending')
    try {
      const res = await fetch(`${API}/functions/v1/beta-signup`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ email: email.trim(), platform, frequency, ...utm, referrer, website, elapsed_ms: Date.now() - loadedAt.current }),
      })
      const out = await res.json().catch(() => ({}))
      if (res.ok && out.ok) {
        setState('done')
        if (analyticsOn) gaEvent('beta_signup', { platform, source: utm.utm_source || 'none' })
        return
      }
      setState('form')
      if (out.error === 'bad_email') setErrors({ email: 'That email address doesn’t look right.' })
      else if (out.error === 'rate_limited') setProblem('Too many tries from this network. Wait an hour and try again.')
      else setProblem('Goose couldn’t save that just now. Try again in a moment.')
    } catch {
      setState('form')
      setProblem('No connection. Check your signal and try again.')
    }
  }

  const open = (p) => { if (analyticsOn) gaEvent('beta_download_click', { platform: p, source: utm.utm_source || 'none' }) }
  const webHref = links.web_url && withUtm(links.web_url)

  const share = async () => {
    const url = 'https://sillytraveltool.com/beta?utm_source=share&utm_medium=referral&utm_campaign=beta'
    try {
      if (navigator.share) { await navigator.share({ title: 'Silly Travel Tool beta', url }); return }
      await navigator.clipboard.writeText(url)
      setShared('Link copied')
    } catch { /* share sheet closed */ }
  }

  return (
    <div className="b-page">
      <header className="b-top">
        <a className="b-brand" href="/" aria-label="Silly Travel Tool home"><TagMark size={44} /><Wordmark size="sm" /></a>
      </header>

      <main className="b-main">
        <section className="b-hero">
          <p className="b-overline">Private beta · iPhone, Android and web</p>
          <h1 className="b-title">Get early access to Silly Travel Tool</h1>
          <p className="b-lede">Every trip in one calm place. The web app is live now, and the iPhone and Android apps are next. Join the list and
            Goose will email your private download link as soon as yours is ready.</p>
        </section>

        <section className="b-card" aria-live="polite">
          {state === 'done' ? (
            <div className="b-done">
              <span className="b-done__icon"><Icon name="check" size={28} /></span>
              <h2>You’re on the list</h2>
              <p>We sent a confirmation to <strong>{email.trim()}</strong>.{' '}
                {platform === 'web' ? 'The web app is live now, so you can start right away.' : `When the beta opens on ${PLATFORM_NAME[platform]}, your private link arrives there. Until then, the web app is live now.`}</p>
              <p className="b-note">Can’t see it? Check your spam or promotions folder.</p>
              {webHref && <a className="b-btn" href={webHref} onClick={() => open('web')}>Start now on the web</a>}
              <button type="button" className="b-btn b-btn--quiet" onClick={share}><Icon name="share" size={20} /> {shared || 'Share the beta with a friend'}</button>
            </div>
          ) : (
            <form className="b-form" onSubmit={submit} noValidate>
              <div className="b-field">
                <label htmlFor="b-email">Email</label>
                <input id="b-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false"
                  placeholder="you@example.com" value={email} maxLength={254} aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'b-email-err' : undefined}
                  onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })) }} />
                {errors.email && <span className="b-err" id="b-email-err">{errors.email}</span>}
              </div>

              <fieldset className="b-field">
                <legend>Where will you use it?</legend>
                <div className="b-seg" role="radiogroup" aria-label="Platform">
                  {PLATFORMS.map(([v, label]) => (
                    <label key={v} className={`b-seg__opt ${platform === v ? 'is-on' : ''}`}>
                      <input type="radio" name="platform" value={v} checked={platform === v}
                        onChange={() => { setPlatform(v); setErrors((x) => ({ ...x, platform: undefined })) }} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {errors.platform && <span className="b-err">{errors.platform}</span>}
              </fieldset>

              <div className="b-field">
                <label htmlFor="b-freq">How often do you travel?</label>
                <select id="b-freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {FREQUENCIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>

              {/* Honeypot: people never see or fill this; form-filling bots do */}
              <div className="b-hp" aria-hidden="true">
                <label htmlFor="b-website">Website</label>
                <input id="b-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              {problem && <p className="b-problem" role="alert">{problem}</p>}
              <button className="b-btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Adding you…' : 'Join the beta list'}</button>
              <p className="b-note">We’ll only email you about the beta: a confirmation now and your invite later. Every email has an unsubscribe
                link. <a href="/privacy/">Privacy policy</a></p>
            </form>
          )}
        </section>

        <section className="b-get" aria-labelledby="b-get-title">
          <h2 id="b-get-title">Get it now</h2>
          <div className="b-get__list">
            <GetRow icon="globe" name="Web" note="Live now in any browser, on your phone or computer." href={webHref}
              label="Open the web app" onClick={() => open('web')} />
            <GetRow icon="smartphone" name="iPhone" note={links.ios_url ? 'Beta through TestFlight, Apple’s beta app.' : 'Coming soon. Join the list and we’ll email you the link.'}
              href={links.ios_url} label="Join the iPhone beta" onClick={() => open('ios')} />
            <GetRow icon="smartphone" name="Android" note={links.android_url ? 'Beta through Google Play.' : 'Coming soon. Join the list and we’ll email you the link.'}
              href={links.android_url} label="Join the Android beta" onClick={() => open('android')} />
          </div>
        </section>

        <section className="b-features" aria-label="What you get">
          {FEATURES.map(([icon, title, text]) => (
            <div className="b-feature" key={title}>
              <span className="b-feature__icon"><Icon name={icon} size={24} /></span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </div>
          ))}
        </section>
      </main>

      <footer className="b-foot">
        <a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><span>© {new Date().getFullYear()} Silly Travel Tool</span>
      </footer>
    </div>
  )
}

applyTheme(getSavedTheme())
createRoot(document.getElementById('root')).render(<StrictMode><Beta /></StrictMode>)
