// Animated mini-mocks for the onboarding tour, one per card. Built from the Clay classes with sample data so they
// look like the real screens. Most play as a slow tap-through inside a phone frame: a finger dot glides to the
// element marked data-tap="…", taps it, the next screen slides in, and a numbered caption under the phone says
// what's happening. Each scene loops. Under prefers-reduced-motion everything holds on one telling frame.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, IconTile, GooseMark, TagMark, cx } from '../../ui'

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const TAP_MS = 1100 // a tap stage: glide, press, ripple (tied to the CSS timings, so it is not scaled)

// Playback speed of the tour: every timed stage (ms) is multiplied by this. One place to tune it.
const TOUR_SPEED = 0.8
// A caption stays up at least this long: the larger of a flat floor and a reading allowance per character.
const MIN_CAPTION_MS = 1400
const READ_MS_PER_CHAR = 60

const timingCache = new WeakMap()

/**
 * Stage durations for a script, and how long each caption stays on screen (its stage plus the stages after it,
 * until the next caption). Timed stages are scaled by TOUR_SPEED; where a caption would then be up for less than
 * the reading time, the shortfall is added to the last timed stage it covers (or its last stage if all are taps).
 */
function timings(script) {
  let t = timingCache.get(script)
  if (t) return t
  const dur = script.map(st => (st.ms == null ? TAP_MS : Math.round(st.ms * TOUR_SPEED)))
  const span = {}
  script.forEach((st, k) => {
    if (!st.cap) return
    let end = k + 1
    while (end < script.length && !script[end].cap) end++
    const need = Math.max(MIN_CAPTION_MS, st.cap.text.length * READ_MS_PER_CHAR)
    let total = 0
    for (let j = k; j < end; j++) total += dur[j]
    if (total < need) {
      let at = end - 1
      for (let j = end - 1; j >= k; j--) if (script[j].ms != null) { at = j; break }
      dur[at] += need - total
      total = need
    }
    span[k] = { start: k, end }
  })
  Object.keys(span).forEach(k => {
    let total = 0
    for (let j = span[k].start; j < span[k].end; j++) total += dur[j]
    span[k] = total
  })
  t = { dur, span }
  timingCache.set(script, t)
  return t
}

/**
 * Plays a script of stages ({ ms, tap?, cap? }), looping. Returns the stage index and the stage itself.
 * Held on `still` (default: the last stage) with reduced motion.
 */
function useScript(script, still = script.length - 1) {
  const [i, setI] = useState(() => (reducedMotion() ? still : 0))
  useEffect(() => {
    if (reducedMotion()) return
    const t = setTimeout(() => setI(v => (v + 1) % script.length), timings(script).dur[i])
    return () => clearTimeout(t)
  }, [i])
  return [i, script[i]]
}

/** The most recent caption at or before stage i, so tap stages keep the scene's caption unless they set one. */
function captionAt(script, i) {
  for (let k = i; k >= 0; k--) if (script[k].cap) return { ...script[k].cap, key: k, ms: timings(script).span[k] }
  return null
}

/** Counts 0 → target over `ms` (jumps straight there with reduced motion). */
function useCountUp(target, ms = 1200, delay = 300) {
  const [v, setV] = useState(reducedMotion() ? target : 0)
  useEffect(() => {
    if (reducedMotion()) return
    let raf, start
    const tick = (t) => {
      start ??= t
      const p = Math.min(1, (t - start) / ms)
      setV(Math.round(target * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick) }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [target, ms, delay])
  return v
}

// Delay helper for staggered entrances: the class name for an animation-delay of `ms` (.tour-delay-N in tour.css)
const d = (ms) => `tour-delay-${ms}`

function MockRow({ icon, tone, title, meta, trailing, delay = 0, className, tap }) {
  return (
    <div className={cx('c-row c-row--tile tour-in', className, d(delay))} data-tap={tap}>
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="c-row__body">
        <span className="c-row__title">{title}</span>
        {meta && <span className="c-row__meta">{meta}</span>}
      </span>
      {trailing}
    </div>
  )
}

/** Numbered line under the art saying what the animation is showing. */
function Caption({ cap }) {
  if (!cap) return null
  return (
    <p className="tour-caption" aria-hidden="true">
      <span className="tour-caption__n">{cap.n}</span>
      <span key={cap.key} className="tour-caption__text t-label">{cap.text}</span>
      {/* "Playing" cue: a pulsing dot and a thin bar that fills while this caption is up. Decorative. */}
      <span className="tour-caption__dot" />
      <span key={`bar${cap.key}`} className="tour-caption__bar" ref={el => el?.style.setProperty('--tour-step-ms', `${cap.ms}ms`)} />
    </p>
  )
}

/**
 * Phone frame. `tap` names the element (data-tap) the finger should press during this stage; the finger glides
 * there, the element shows pressed, and a ripple plays. Screens inside are keyed so they slide in on change.
 */
function Phone({ tap, stage, children, className }) {
  const ref = useRef(null)
  const fingerRef = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    const frame = ref.current
    frame?.querySelectorAll('.is-tapped').forEach(el => el.classList.remove('is-tapped'))
    if (!tap || !frame) { setPos(null); return }
    let timer
    const raf = requestAnimationFrame(() => {
      const el = frame.querySelector(`[data-tap="${tap}"]`)
      if (!el) { setPos(null); return }
      const f = frame.getBoundingClientRect(), r = el.getBoundingClientRect()
      setPos({ x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 })
      timer = setTimeout(() => el.classList.add('is-tapped'), 450)
    })
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [tap, stage])
  // The finger's position is measured, so it is set on the element rather than through a class
  useLayoutEffect(() => {
    const el = fingerRef.current
    if (el) { el.style.left = pos ? `${pos.x}px` : ''; el.style.top = pos ? `${pos.y}px` : '' }
  }, [pos])
  return (
    <div ref={ref} className={cx('tour-phone', className)}>
      {children}
      <span ref={fingerRef} className={cx('tour-tap', !pos && 'is-hidden')}>
        {pos && <span key={stage} className="tour-tap__ring" />}
      </span>
    </div>
  )
}

function Screen({ id, children, className }) {
  return <div key={id} className={cx('tour-screen', className)}>{children}</div>
}

function ScreenTitle({ overline, title, back, action }) {
  return (
    <div className="tour-screen__title">
      {back && <span className="tour-screen__back" data-tap="back"><Icon name="chevron-left" size={16} strokeWidth={2.2} /></span>}
      <span className="tour-screen__titles">
        {overline && <span className="t-overline tone-muted">{overline}</span>}
        <span className="tour-screen__h">{title}</span>
      </span>
      {action}
    </div>
  )
}

/** In-phone tab strip (Plan / Weather / Pack, guide sections, tools). */
function Tabs({ items, active, prefix }) {
  return (
    <div className="tour-tabs">
      {items.map(([id, label, icon]) => (
        <span key={id} data-tap={`${prefix}-${id}`} className={cx('tour-tabs__tab', id === active && 'is-active')}>
          {icon && <Icon name={icon} size={16} />}{label}
        </span>
      ))}
    </div>
  )
}

function Sheet({ children }) {
  return <div className="tour-sheet"><span className="tour-sheet__grip" />{children}</div>
}

function Toast({ icon = 'check', children }) {
  return <span className="tour-toast t-label tour-in"><Icon name={icon} size={16} strokeWidth={2.4} />{children}</span>
}

// ---------- Welcome ----------

export function WelcomeArt() {
  const orbit = [
    { icon: 'plane', tone: 'info', pos: 'tl' }, { icon: 'stay', tone: 'stay', pos: 'tr' },
    { icon: 'ticket', tone: 'success', pos: 'bl' }, { icon: 'train', tone: 'accent', pos: 'br' },
    { icon: 'restaurant', tone: 'accent', pos: 'ml' }, { icon: 'sos', tone: 'danger', pos: 'mr' },
  ]
  return (
    <div className="tour-stage tour-welcome" aria-hidden="true">
      <div className="tour-welcome__tag tour-swing"><TagMark size={150} /></div>
      {orbit.map((o, i) => (
        <span key={o.pos} className={cx('tour-welcome__chip tour-pop', `tour-welcome__chip--${o.pos}`, d(400 + i * 220))}>
          <IconTile icon={o.icon} tone={o.tone} size="md" />
        </span>
      ))}
    </div>
  )
}

// ---------- Trips: list → trip plan → booking ----------

const TRIP_TABS = [['plan', 'Plan'], ['weather', 'Weather'], ['pack', 'Pack']]

const TRIPS = [
  { ms: 2600, cap: { n: 1, text: 'Your trips, soonest first' } },
  { tap: 'spain', cap: { n: 2, text: 'Tap a trip to open it' } },
  { ms: 3400, cap: { n: 3, text: 'Every booking, day by day, in local time' } },
  { tap: 'flight', cap: { n: 4, text: 'Tap any booking' } },
  { ms: 3600, cap: { n: 5, text: 'Seat, confirmation, terminal: all in one place' } },
]

function TripPlan() {
  return (
    <>
      <ScreenTitle back overline="12–22 May · 4 stops" title="Spain" />
      <Tabs items={TRIP_TABS} active="plan" prefix="trip" />
      <span className="t-overline tone-muted tour-day">Tue 12 May · Lisbon → Madrid</span>
      <div className="c-card c-card--group tour-card-flat">
        <MockRow tap="flight" icon="plane" tone="info" title="Lisbon → Madrid" meta="09:40 → 11:55 · TP 1026" delay={150} />
        <MockRow icon="stay" tone="stay" title="Hotel Único Madrid" meta="Check in 15:00 · 2 nights" delay={300} />
      </div>
      <span className="t-overline tone-muted tour-day">Thu 14 May · Madrid → Granada</span>
      <div className="c-card c-card--group tour-card-flat">
        <MockRow icon="train" tone="accent" title="Madrid → Granada" meta="08:05 → 11:24 · AVE 03082" delay={450} />
        <MockRow icon="museum" tone="success" title="Alhambra, Nasrid Palaces" meta="16:30 · 2 tickets" delay={600} />
      </div>
    </>
  )
}

export function TripsArt() {
  const [s, st] = useScript(TRIPS)
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        {s < 2 ? (
          <Screen id="list">
            <ScreenTitle title="Trips" action={<span className="tour-pill"><Icon name="plus" size={14} strokeWidth={2.4} />New trip</span>} />
            <div data-tap="spain" className="c-card c-card--inverse tour-mini-hero">
              <span className="t-overline tone-accent-on-inverse">In 2 days</span>
              <span className="tour-mini-hero__title">Spain</span>
              <span className="t-micro tone-muted">Lisbon → Madrid → Granada → Sevilla · 12–22 May</span>
            </div>
            <div className="c-card c-card--group tour-card-flat">
              <MockRow icon="trips" tone="neutral" title="Lisbon weekend" meta="6–8 Jun · 3 bookings" />
              <MockRow icon="trips" tone="neutral" title="Tokyo" meta="No dates yet · 4 ideas" />
              <MockRow icon="trips" tone="neutral" title="Iceland road trip" meta="Sep · 2 travellers" />
            </div>
          </Screen>
        ) : (
          <Screen id="trip"><TripPlan /></Screen>
        )}
        {s === 4 && (
          <Sheet>
            <span className="t-overline tone-muted">Flight · TP 1026</span>
            <span className="tour-sheet__title">Lisbon 09:40 → Madrid 11:55</span>
            <span className="t-micro tone-muted">Each time is local to where it happens</span>
            <div className="tour-sheet__facts">
              <span><span className="t-micro tone-muted">Seat</span><b>14C</b></span>
              <span><span className="t-micro tone-muted">Confirmation</span><b>8XK2Q</b></span>
              <span><span className="t-micro tone-muted">Terminal</span><b>1</b></span>
            </div>
          </Sheet>
        )}
      </Phone>
      <Caption cap={captionAt(TRIPS, s)} />
    </div>
  )
}

// ---------- Today + Get there ----------

const TODAY = [
  { ms: 3000, cap: { n: 1, text: 'While you travel, Trips opens on Today' } },
  { tap: 'open', cap: { n: 2, text: 'Open what’s next' } },
  { ms: 2200, cap: { n: 3, text: 'Every booking has Get there' } },
  { tap: 'getthere' },
  { ms: 3800, cap: { n: 4, text: 'Walk, transit, drive or a ride app, with real times' } },
  { tap: 'transit' },
  { ms: 2800, cap: { n: 5, text: 'Your maps app opens with the route ready' } },
]

export function TodayArt() {
  const [s, st] = useScript(TODAY, 4)
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="today" className="tour-screen--still">
          <ScreenTitle overline="Day 3 of 10 · Thursday" title="Granada" />
          <div className="c-card c-card--inverse tour-mini-hero">
            <span className="t-overline tone-accent-on-inverse">Next up · in 1h 20m</span>
            <span className="tour-mini-hero__title tour-mini-hero__title--sm">Alhambra, Nasrid Palaces</span>
            <span className="t-micro tone-muted">16:30 Granada time · 2 tickets</span>
            <span className="tour-mini-hero__actions">
              <span data-tap="open" className="tour-pill tour-pill--light">Open booking</span>
              <span className="tour-pill tour-pill--ghost">Directions</span>
            </span>
          </div>
          <div className="tour-tiles">
            <span className="tour-tile"><Icon name="sun" size={20} className="tone-sun" /><b>26°</b><span className="t-micro tone-muted">Sunny now</span></span>
            <span className="tour-tile"><Icon name="megaphone" size={20} className="tone-accent" /><b>HONK</b><span className="t-micro tone-muted">Find me a spot</span></span>
          </div>
          <span className="t-overline tone-muted tour-day">Later today</span>
          <div className="c-card c-card--group tour-card-flat">
            <MockRow icon="restaurant" tone="accent" title="Dinner at Damasqueros" meta="21:00 · 2 people" />
          </div>
        </Screen>
        {s >= 2 && s <= 3 && (
          <Sheet>
            <span className="t-overline tone-muted">Tickets · 2 adults</span>
            <span className="tour-sheet__title">Alhambra, Nasrid Palaces</span>
            <span className="t-micro tone-muted">16:30 · Calle Real de la Alhambra</span>
            <span data-tap="getthere" className="tour-btn"><Icon name="navigation" size={16} />Get there</span>
          </Sheet>
        )}
        {s >= 4 && (
          <Sheet>
            <span className="t-overline tone-muted">Get there</span>
            <span className="tour-sheet__title">Alhambra, Nasrid Palaces</span>
            <div className="tour-modes">
              {[['walk', 'walk', 'Walk', '24 min'], ['transit', 'bus', 'Transit', '14 min'], ['drive', 'car', 'Drive', '9 min']].map(([id, icon, label, t]) => (
                <span key={id} data-tap={id} className="tour-mode"><Icon name={icon} size={20} /><b>{t}</b><span className="t-micro tone-muted">{label}</span></span>
              ))}
            </div>
            <span className="t-micro tone-muted">Or a ride: Uber · Bolt · Cabify</span>
          </Sheet>
        )}
        {s === 6 && <Toast icon="navigation">Opening Google Maps · bus C30</Toast>}
      </Phone>
      <Caption cap={captionAt(TODAY, s)} />
    </div>
  )
}

// ---------- Weather → Pack, packed for the forecast ----------

const WEATHER = [
  { ms: 3200, cap: { n: 1, text: 'The forecast for each stop, on your dates' } },
  { tap: 'trip-pack', cap: { n: 2, text: 'Open Pack' } },
  { ms: 4200, cap: { n: 3, text: 'Goose packs for that weather, your stops and plans' } },
  { tap: 'jacket', cap: { n: 4, text: 'Tick things off as you pack' } },
  { ms: 2600 },
]

const DAYS = [['Tue', 'Madrid', 'sun', 31], ['Wed', 'Madrid', 'rain', 19], ['Thu', 'Granada', 'cloud-sun', 26], ['Fri', 'Granada', 'sun', 29]]
const PACK = [
  ['jacket', 'Light rain jacket', 'Rain on Wed in Madrid', 'rain'],
  ['sun', 'Sunscreen and a hat', 'Highs of 31°', 'sun'],
  ['shoes', 'Comfy walking shoes', 'Alhambra and 3 walking days', 'walk'],
  ['plug', 'Plug adapter (type F)', 'Spain', 'globe'],
]

export function WeatherPackArt() {
  const [s, st] = useScript(WEATHER, 2)
  const pack = s >= 2
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="wp" className="tour-screen--still">
          <ScreenTitle back overline="12–22 May" title="Spain" />
          <Tabs items={TRIP_TABS} active={pack ? 'pack' : 'weather'} prefix="trip" />
          {!pack ? (<>
            <div className="tour-panel tour-forecast" key="w">
              {DAYS.map(([day, city, ic, t], k) => (
                <span key={day} className={cx('tour-forecast__day tour-in', ic === 'rain' && 'is-flag', d(k * 180))}>
                  <span className="t-label">{day}</span>
                  <span className="t-micro tone-muted">{city}</span>
                  <Icon name={ic} size={28} className={ic === 'rain' ? 'tone-info' : 'tone-sun'} />
                  <span className="tour-forecast__t tabular">{t}°</span>
                </span>
              ))}
            </div>
            <div className={cx('tour-summary tour-in', d(900))}>
              <span className="tour-summary__row t-caption"><Icon name="rain" size={18} className="tone-info" />Madrid: hot, with rain on Wednesday</span>
              <span className="tour-summary__row t-caption"><Icon name="sun" size={18} className="tone-sun" />Granada: warm and dry, cool nights</span>
              <span className="tour-summary__row t-caption"><Icon name="thermometer" size={18} className="tone-accent" />Highs 19–31°, lows 12–17°</span>
            </div>
          </>) : (
            <div className="tour-panel" key="p">
              <div className="tour-progress-row"><span className="t-label">Packing progress</span><span className="t-caption tone-muted tabular">{s === 4 ? 3 : 2} of 14</span></div>
              <div className="c-card c-card--group tour-card-flat">
                {PACK.map(([id, item, why, icon], k) => {
                  const done = id === 'jacket' && s === 4
                  return (
                    <div key={id} data-tap={id} className={cx('tour-pack tour-in', d(k * 260))}>
                      <Icon name={done ? 'checkbox-checked' : 'checkbox'} size={20} className={done ? 'tone-accent' : 'tone-muted'} />
                      <span className="tour-pack__body">
                        <span className={cx('t-label', done && 'tour-pack--done')}>{item}</span>
                        <span className="tour-why t-micro"><Icon name={icon} size={12} />{why}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Screen>
      </Phone>
      <Caption cap={captionAt(WEATHER, s)} />
    </div>
  )
}

// ---------- Goose inbox ----------

export function InboxArt() {
  return (
    <div className="tour-stage tour-stack tour-inbox" aria-hidden="true">
      <div className="tour-inbox__mail tour-drop">
        <Icon name="mail" size={22} />
        <span className="tour-inbox__mail-text">
          <span className="t-label">Your booking is confirmed</span>
          <span className="t-micro tone-muted">Hotel Alfonso XIII · 12–15 May</span>
        </span>
      </div>
      <div className="c-card c-card--group tour-card-flat tour-inbox__trip">
        <div className="tour-inbox__head">
          <span className="t-overline">Spain · May</span>
          <span className={cx('tour-inbox__goose tour-pop', d(1900))}><GooseMark expression="reading" size={30} tile tileSize="sm" /></span>
        </div>
        <MockRow icon="plane" tone="info" title="Lisbon → Madrid" meta="TP 1026 · 09:40" />
        <MockRow icon="train" tone="accent" title="Madrid → Granada" meta="AVE 03082 · 08:05" />
        <MockRow icon="stay" tone="stay" title="Hotel Alfonso XIII" meta="Sevilla · 3 nights · Conf. 8XK2Q"
          className="tour-inbox__new" delay={2100}
          trailing={<span className="tour-inbox__filed t-micro"><Icon name="check" size={14} strokeWidth={2.4} />Filed</span>} />
      </div>
    </div>
  )
}

// ---------- Travel together 1: invite by email ----------

const INVITE = [
  { ms: 2400, cap: { n: 1, text: 'Open the trip you’re planning' } },
  { tap: 'travelers', cap: { n: 2, text: 'Tap Travelers' } },
  { ms: 2800, cap: { n: 3, text: 'Type their email, choose Can edit' } },
  { tap: 'send', cap: { n: 4, text: 'Send the invite' } },
  { ms: 2800, cap: { n: 5, text: 'Goose emails them an invite' } },
  { ms: 3200, cap: { n: 6, text: 'They join, and everyone sees the same trip' } },
]

function Typed({ text, ms = 1600 }) {
  const [n, setN] = useState(reducedMotion() ? text.length : 0)
  useEffect(() => {
    if (reducedMotion()) return
    const t = setInterval(() => setN(v => (v >= text.length ? v : v + 1)), ms / text.length)
    return () => clearInterval(t)
  }, [text, ms])
  return <>{text.slice(0, n)}<span className="tour-caret" /></>
}

export function InviteArt() {
  const [s, st] = useScript(INVITE)
  const sheet = s >= 2
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="trip" className="tour-screen--still">
          <div className="tour-invite-head">
            <span data-tap="travelers" className="tour-pill tour-pill--card"><Icon name="users" size={14} />{s >= 5 ? 3 : 2} travelers</span>
          </div>
          <TripPlan />
        </Screen>
        {sheet && (
          <Sheet>
            <span className="tour-sheet__title">Travelers</span>
            {s < 4 ? (
              <>
                <span className="t-micro tone-muted">Invite by email</span>
                <span className="tour-field"><Icon name="mail" size={16} className="tone-muted" />{s === 2 ? <Typed text="leo@example.com" /> : 'leo@example.com'}</span>
                <span className="tour-seg2"><span className="is-on">Can edit</span><span>View only</span></span>
                <span data-tap="send" className="tour-btn">Send invite</span>
              </>
            ) : (
              <>
                {s === 4 && <span className="tour-sent t-caption"><Icon name="check" size={16} strokeWidth={2.4} />Invite sent. They'll see it when they sign in.</span>}
                <div className="tour-people">
                  {[['You', 'Owner', 'happy'], ['Ana', 'Joined · Can edit', 'happy'], ['Leo', s >= 5 ? 'Joined · Can edit' : 'Invited', s >= 5 ? 'excited' : 'sleepy']].map(([name, status, ex]) => (
                    <span key={name} className={cx('tour-person', name === 'Leo' && s >= 5 && 'tour-new')}>
                      <GooseMark expression={ex} size={26} tile tileSize="sm" />
                      <span className="t-label">{name}</span>
                      <span className={cx('t-micro', status.startsWith('Joined') ? 'tone-success' : 'tone-muted')}>{status}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Sheet>
        )}
      </Phone>
      <Caption cap={captionAt(INVITE, s)} />
    </div>
  )
}

// ---------- Travel together 2: everyone forwards, Goose logs it ----------

const TOGETHER = [
  { ms: 2600, cap: { n: 1, text: 'Ana forwards her flight email to Goose' } },
  { ms: 2800, cap: { n: 2, text: 'It lands in the shared trip, for everyone' } },
  { ms: 2600, cap: { n: 3, text: 'Leo forwards his train ticket' } },
  { ms: 2800, cap: { n: 4, text: 'Logged automatically, in real time' } },
  { ms: 3800, cap: { n: 5, text: 'Everyone knows who lands when, and where to meet' } },
]

function Mail({ from, side }) {
  return (
    <span className={`tour-flymail tour-flymail--${side}`}>
      <Icon name="mail" size={16} /><span className="t-micro">Fwd: {from}</span>
    </span>
  )
}

export function TogetherArt() {
  const [s] = useScript(TOGETHER)
  return (
    <div className="tour-stage tour-together" aria-hidden="true">
      <div className="tour-together__crew">
        <div className="tour-together__goose">
          <GooseMark expression={s <= 1 ? 'excited' : 'happy'} size={44} tile tileSize="sm" />
          <span className="t-label">Ana</span>
          {s === 0 && <Mail from="Iberia booking" side="left" />}
        </div>
        <div className="tour-together__inbox">
          <span className={cx('tour-together__goosebox', (s === 1 || s === 3) && 'is-busy')}>
            <GooseMark expression={s === 1 || s === 3 ? 'reading' : 'happy'} size={40} tile tileSize="sm" />
          </span>
          <span className="t-micro tone-muted">Goose inbox</span>
        </div>
        <div className="tour-together__goose">
          <GooseMark expression={s === 2 || s === 3 ? 'excited' : 'happy'} size={44} tile tileSize="sm" />
          <span className="t-label">Leo</span>
          {s === 2 && <Mail from="Renfe ticket" side="right" />}
        </div>
      </div>
      <div className="c-card c-card--group tour-card-flat tour-together__trip">
        <div className="tour-inbox__head">
          <span className="t-overline">Spain · 3 travellers</span>
          <span className="tour-live t-micro"><span className="tour-live__dot" />Live</span>
        </div>
        <MockRow icon="plane" tone="info" title="You land in Madrid 11:55" meta="TP 1026 · your booking" />
        {s >= 1 && <MockRow icon="plane" tone="info" title="Ana lands in Madrid 14:20" meta="IB 3171 · via Ana's email"
          className={s === 1 ? 'tour-new' : undefined} trailing={s === 1 && <span className="tour-just t-micro">just now</span>} />}
        {s >= 3 && <MockRow icon="train" tone="accent" title="Leo arrives in Madrid 16:05" meta="AVE 03140 · via Leo's email"
          className={s === 3 ? 'tour-new' : undefined} trailing={s === 3 && <span className="tour-just t-micro">just now</span>} />}
        {s >= 4 && <MockRow icon="pin" tone="success" title="Meet at Hotel Único, 16:30" meta="Added by Ana" className="tour-new" />}
      </div>
      <Caption cap={captionAt(TOGETHER, s)} />
    </div>
  )
}

// ---------- City guide 1: Know → Eat → add to trip ----------

const SECTIONS = [['know', 'Know', 'info'], ['eat', 'Eat', 'restaurant'], ['see', 'See', 'eye'], ['move', 'Transit', 'metro'], ['events', 'Events', 'event']]

const GUIDE1 = [
  { ms: 3400, cap: { n: 1, text: 'Know: the numbers and local quirks' } },
  { tap: 'sec-eat', cap: { n: 2, text: 'Tap Eat' } },
  { ms: 3000, cap: { n: 3, text: 'Cheap eats to a proper splurge' } },
  { tap: 'save', cap: { n: 4, text: 'Tap + to add it to your trip' } },
  { ms: 3000, cap: { n: 5, text: 'Saved as a trip idea: book it when you’re ready' } },
]

function KnowPanel() {
  return (
    <div className="tour-panel" key="know">
      <div className="tour-facts">
        {[['Population', '684k'], ['Language', 'Spanish'], ['Currency', 'Euro'], ['Summer high', '36°']].map(([k, v], i) => (
          <span key={k} className={cx('tour-fact tour-in', d(i * 120))}><span className="t-micro tone-muted">{k}</span><b>{v}</b></span>
        ))}
      </div>
      <div className={cx('tour-goose-note tour-in', d(600))}>
        <GooseMark expression="reading" size={26} tile tileSize="sm" />
        <span className="t-caption"><b>Goose on Sevilla:</b> lunch is at 2, dinner at 9:30, and shops nap from 2 to 5. Plan around it.</span>
      </div>
    </div>
  )
}

export function GuideArt() {
  const [s, st] = useScript(GUIDE1)
  const sec = s < 2 ? 'know' : 'eat'
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="guide" className="tour-screen--still">
          <ScreenTitle overline="City guide" title="Sevilla" />
          <Tabs items={SECTIONS} active={sec} prefix="sec" />
          {sec === 'know' ? <KnowPanel /> : (
            <div className="tour-panel" key="eat">
              <div className="tour-chips">
                {['Cheap', 'Mid-range', 'Splurge'].map((c, k) => <span key={c} className={cx('c-chip c-chip--neutral', k === 0 && 'tour-chip--on')}>{c}</span>)}
              </div>
              <div className="c-card c-card--group tour-card-flat">
                <MockRow icon="restaurant" tone="accent" title="Bodega Santa Cruz" meta="Tapas from €3 · stand at the bar" delay={150}
                  trailing={<span data-tap="save" className="tour-save"><Icon name={s === 4 ? 'check' : 'plus'} size={16} strokeWidth={2.4} /></span>} />
                <MockRow icon="restaurant" tone="accent" title="Eslava" meta="Mid-range · book ahead" delay={300}
                  trailing={<span className="tour-save"><Icon name="plus" size={16} strokeWidth={2.4} /></span>} />
                <MockRow icon="restaurant" tone="accent" title="Abantal" meta="Splurge · tasting menu" delay={450}
                  trailing={<span className="tour-save"><Icon name="plus" size={16} strokeWidth={2.4} /></span>} />
              </div>
            </div>
          )}
        </Screen>
        {s === 4 && <Toast>Saved to Spain ideas</Toast>}
      </Phone>
      <Caption cap={captionAt(GUIDE1, s)} />
    </div>
  )
}

// ---------- City guide 2: See → Transit → Events ----------

const GUIDE2 = [
  { ms: 3000, cap: { n: 1, text: 'See: museums, landmarks, areas, day trips' } },
  { tap: 'sec-move', cap: { n: 2, text: 'Tap Transit' } },
  { ms: 3400, cap: { n: 3, text: 'Getting around like a local, with the right apps' } },
  { tap: 'sec-events', cap: { n: 4, text: 'Tap Events' } },
  { ms: 3600, cap: { n: 5, text: 'Festivals and what’s on while you’re there' } },
]

export function GuideMoreArt() {
  const [s, st] = useScript(GUIDE2)
  const sec = s < 2 ? 'see' : s < 4 ? 'move' : 'events'
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="guide2" className="tour-screen--still">
          <ScreenTitle overline="City guide" title="Sevilla" />
          <Tabs items={SECTIONS} active={sec} prefix="sec" />
          {sec === 'see' && (
            <div className="tour-panel" key="see">
              <div className="tour-chips">
                {['Museums', 'Landmarks', 'Areas', 'Day trips'].map((c, k) => <span key={c} className={cx('c-chip c-chip--neutral', k === 1 && 'tour-chip--on')}>{c}</span>)}
              </div>
              <div className="c-card c-card--group tour-card-flat">
                <MockRow icon="museum" tone="success" title="Real Alcázar" meta="Book ahead · 2 hours" delay={100} />
                <MockRow icon="camera" tone="success" title="Plaza de España" meta="Free · best at sunset" delay={250} />
                <MockRow icon="map" tone="success" title="Barrio Santa Cruz" meta="Old quarter · get lost on purpose" delay={400} />
              </div>
            </div>
          )}
          {sec === 'move' && (
            <div className="tour-panel" key="move">
              <div className="c-card c-card--group tour-card-flat">
                <MockRow icon="metro" tone="accent" title="Metro, line 1" meta="€1.35 a ride · tap a bank card" delay={100} />
                <MockRow icon="tram" tone="accent" title="Tram (Metrocentro)" meta="Cathedral to San Bernardo" delay={250} />
                <MockRow icon="bike" tone="accent" title="Sevici bike share" meta="Flat and sunny: the local way" delay={400} />
                <MockRow icon="taxi" tone="accent" title="Taxis" meta="Use the official app · fixed airport fare" delay={550} />
              </div>
            </div>
          )}
          {sec === 'events' && (
            <div className="tour-panel" key="events">
              <div className="c-card tour-card-flat tour-event tour-in">
                <span className="t-overline tone-accent">Festival · 21–26 Apr</span>
                <span className="tour-event__title">Feria de Abril</span>
                <span className="t-caption tone-secondary">A week of casetas, flamenco dresses and horses. Book stays early.</span>
              </div>
              <div className="c-card c-card--group tour-card-flat">
                <MockRow icon="event" tone="success" title="Semana Santa" meta="Holy Week processions · 13–20 Apr" delay={250} />
                <MockRow icon="event" tone="success" title="Bienal de Flamenco" meta="Sep, even years" delay={400} />
              </div>
            </div>
          )}
        </Screen>
      </Phone>
      <Caption cap={captionAt(GUIDE2, s)} />
    </div>
  )
}

// ---------- HONK: a few minutes to kill → HONK → one good spot ----------

const HONK = [
  { ms: 3000, cap: { n: 1, text: '40 minutes free and nothing planned?' } },
  { ms: 1800, cap: { n: 2, text: 'Pick a mood' } },
  { ms: 1300, cap: { n: 3, text: 'Tap HONK' } },
  { ms: 2000 },
  { ms: 4400, cap: { n: 4, text: 'Goose picks one good spot near you' } },
]

export function HonkArt() {
  const [s] = useScript(HONK)
  return (
    <div className="tour-stage tour-honk" aria-hidden="true">
      <div className="tour-honk__top">
        <div className="tour-honk__goose">
          <GooseMark expression={s < 3 ? 'sleepy' : 'excited'} size={88} tile tileSize="lg" className={s < 2 ? 'tour-idle' : undefined} />
          {s >= 3 && <span key="honk" className="tour-bubble tour-bubble--honk tour-pop">HONK</span>}
        </div>
        <span className="tour-clock t-label"><Icon name="clock" size={16} />40 min until your train</span>
      </div>
      {s < 4 ? (
        <div className="c-card tour-card-flat tour-honk__card">
          <span className="t-label">What are you in the mood for?</span>
          <div className="tour-chips">
            {["I'm hungry", 'Show me something', 'Treat myself', 'Culture me', 'On a budget'].map((m, k) => (
              <span key={m} className={cx('c-chip c-chip--neutral', k === 0 && s >= 1 && 'tour-chip--on')}>{m}</span>
            ))}
          </div>
          <span className={cx('tour-honk__btn', s >= 2 && 'is-pressed')}>
            <Icon name="megaphone" size={18} />HONK
            {s === 2 && <span className="tour-tap tour-tap--static"><span className="tour-tap__ring" /></span>}
          </span>
        </div>
      ) : (
        <div className="c-card tour-card-flat tour-honk__card tour-in">
          <span className="t-overline tone-accent">Goose says go here · 4 min walk</span>
          <span className="tour-honk__pick">Bodega Castañeda</span>
          <span className="t-caption tone-secondary">Tapas bar, open now. Insider tip: order the croquetas and stand at the bar.</span>
          <span className="tour-honk__actions">
            <span className="tour-btn"><Icon name="navigation" size={16} />Get there</span>
            <span className="tour-honk__again t-label"><Icon name="refresh" size={16} />Another spot</span>
          </span>
        </div>
      )}
      <Caption cap={captionAt(HONK, s)} />
    </div>
  )
}

// ---------- Tools: Currency → Phrases → Tip & split → SOS ----------

const TOOL_TABS = [['currency', 'Currency', 'currency'], ['translate', 'Phrases', 'translate'], ['tip', 'Tip', 'percent'], ['sos', 'SOS', 'sos']]

const TOOLS = [
  { ms: 3000, cap: { n: 1, text: 'Currency: what it costs at home' } },
  { tap: 'tool-translate' },
  { ms: 3200, cap: { n: 2, text: 'Phrases, read out loud for you' } },
  { tap: 'tool-tip' },
  { ms: 3200, cap: { n: 3, text: 'Tip the local way, then split the bill' } },
  { tap: 'tool-sos' },
  { ms: 3400, cap: { n: 4, text: 'SOS: local emergency numbers and your embassy' } },
]

function CurrencyPanel() {
  const eur = useCountUp(48, 900, 300)
  return (
    <div className="tour-panel" key="currency">
      <div className="tour-convert">
        <span className="t-micro tone-muted">You pay</span>
        <span className="tour-convert__big tabular">€{eur}.00</span>
        <span className="tour-convert__swap"><Icon name="exchange" size={18} /></span>
        <span className="t-micro tone-muted">At home that's</span>
        <span className="tour-convert__big tour-convert__big--accent tabular">${(eur * 1.084).toFixed(2)}</span>
      </div>
      <div className="tour-chips">{['€5 = $5.42', '€20 = $21.68', '€100 = $108.40'].map(c => <span key={c} className="c-chip c-chip--neutral">{c}</span>)}</div>
    </div>
  )
}

export function ToolsArt() {
  const [s, st] = useScript(TOOLS, 2)
  const tool = s < 2 ? 'currency' : s < 4 ? 'translate' : s < 6 ? 'tip' : 'sos'
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <Screen id="tools" className="tour-screen--still">
          <ScreenTitle overline="Set for Spain" title="Tools" />
          <Tabs items={TOOL_TABS} active={tool} prefix="tool" />
          {tool === 'currency' && <CurrencyPanel />}
          {tool === 'translate' && (
            <div className="tour-panel" key="translate">
              <div className="tour-chips">{['Food & dining', 'Transport', 'Hotel'].map((c, k) => <span key={c} className={cx('c-chip c-chip--neutral', k === 0 && 'tour-chip--on')}>{c}</span>)}</div>
              <div className="c-card c-card--group tour-card-flat">
                {[['La cuenta, por favor', 'The bill, please'], ['Una mesa para dos', 'A table for two'], ['¿Qué me recomienda?', 'What do you recommend?']].map(([es, en], k) => (
                  <div key={es} className={cx('tour-phrase tour-in', d(k * 150))}>
                    <span className="tour-pack__body"><span className="t-label">{es}</span><span className="t-micro tone-muted">{en}</span></span>
                    <span className={cx('tour-speak', k === 0 && 'is-playing')}><Icon name="volume" size={16} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tool === 'tip' && (
            <div className="tour-panel" key="tip">
              <div className="tour-chips">{['5%', '10%', '15%', 'Round up'].map((c, k) => <span key={c} className={cx('c-chip c-chip--neutral', k === 1 && 'tour-chip--on')}>{c}</span>)}</div>
              <div className="tour-stepper"><span className="t-label">Split between</span><span className="tour-stepper__ctl"><span><Icon name="minus" size={14} /></span>3<span><Icon name="plus" size={14} /></span></span></div>
              <div className="tour-convert">
                <span className="t-micro tone-muted">Bill €48 · tip 10% · split 3 ways</span>
                <span className="tour-convert__big tabular">€17.60 <span className="t-caption tone-muted">each</span></span>
              </div>
              <span className="tour-goose-note tour-in"><Icon name="lightbulb" size={18} className="tone-accent" /><span className="t-caption">In Spain, round up or leave 5–10% for good service. At the bar, leave the coins.</span></span>
            </div>
          )}
          {tool === 'sos' && (
            <div className="tour-panel" key="sos">
              <div className="tour-sos">
                <span className="tour-sos__num tabular">112</span>
                <span className="t-caption tone-secondary">All emergencies, free from any phone</span>
                <div className="tour-sos__row"><span className="t-label">Police</span><span className="tabular">091</span></div>
                <div className="tour-sos__row"><span className="t-label">Ambulance</span><span className="tabular">061</span></div>
                <div className="tour-sos__row"><span className="t-label">Your embassy</span><span>Madrid</span></div>
              </div>
            </div>
          )}
        </Screen>
      </Phone>
      <Caption cap={captionAt(TOOLS, s)} />
    </div>
  )
}

// ---------- Profile: score → documents → loyalty ----------

const YOU = [
  { ms: 3000, cap: { n: 1, text: 'Goose score and badges grow with every trip' } },
  { tap: 'docs' },
  { ms: 3000, cap: { n: 2, text: 'Passports and travel documents in one place' } },
  { tap: 'back' },
  { ms: 600 },
  { tap: 'loyalty' },
  { ms: 3000, cap: { n: 3, text: 'Loyalty numbers, ready at check-in' } },
]

function ProfileHomeMock() {
  const score = useCountUp(1240, 1200, 200)
  return (
    <>
      <div className="c-card c-card--inverse tour-score">
        <span className="t-overline tone-muted">Goose score</span>
        <span className="tour-score__num tabular">{score.toLocaleString()}</span>
        <span className="tour-score__badges">
          {[['plane', 'info'], ['globe', 'success'], ['mountain', 'stay'], ['trophy', 'accent']].map(([ic, tone], k) => (
            <span key={ic} className={cx('tour-score__badge tour-pop', `c-tile--${tone}`, d(500 + k * 150))}><Icon name={ic} size={16} /></span>
          ))}
        </span>
      </div>
      <div className="c-card c-card--group tour-card-flat">
        <MockRow tap="docs" icon="passport" tone="info" title="Travel documents" trailing={<span className="t-caption tone-muted">3</span>} />
        <MockRow tap="loyalty" icon="card" tone="accent" title="Loyalty cards" trailing={<span className="t-caption tone-muted">2</span>} />
        <MockRow icon="help" tone="success" title="Guide and FAQ" />
      </div>
    </>
  )
}

export function YouArt() {
  const [s, st] = useScript(YOU, 2)
  const view = s >= 6 ? 'loyalty' : s >= 2 && s <= 3 ? 'docs' : 'home'
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        {view === 'home' && <Screen id="home"><ScreenTitle title="Profile" /><ProfileHomeMock /></Screen>}
        {view === 'docs' && (
          <Screen id="docs">
            <ScreenTitle back title="Travel documents" />
            <div className="c-card c-card--group tour-card-flat">
              <MockRow icon="passport" tone="info" title="Passport" meta="Expires Mar 2031" delay={100} />
              <MockRow icon="id-card" tone="success" title="Global Entry" meta="Expires Aug 2029" delay={250} />
              <MockRow icon="medical" tone="danger" title="Travel insurance" meta="Policy and 24h helpline" delay={400} />
            </div>
          </Screen>
        )}
        {view === 'loyalty' && (
          <Screen id="loyalty">
            <ScreenTitle back title="Loyalty cards" />
            <div className="c-card c-card--group tour-card-flat">
              <MockRow icon="plane" tone="info" title="Iberia Plus" meta="IB 4821 0937 · Silver" delay={100} />
              <MockRow icon="stay" tone="stay" title="Marriott Bonvoy" meta="9921 4410 382" delay={250} />
            </div>
          </Screen>
        )}
      </Phone>
      <Caption cap={captionAt(YOU, s)} />
    </div>
  )
}

export function LocationArt() {
  return (
    <div className="tour-stage tour-location" aria-hidden="true">
      <div className="onb-art tour-pop">
        <GooseMark expression="happy" size={110} tile tileSize="lg" />
        <span className="onb-art__pin tour-bob"><Icon name="pin" size={26} /></span>
      </div>
    </div>
  )
}
