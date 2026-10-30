// The onboarding tour: a short, swipeable walk through each part of the app, the location pre-prompt, then the
// free plan and First Class. Shown once after the first sign-in; replayed from Profile and Help (no location step).
import { useEffect, useRef, useState } from 'react'
import { getCurrentPosition } from '../../lib/geo'
import { track } from '../../lib/analytics'
import { STORE } from '../../lib/purchases'
import { reportIssueHref, trackReport } from '../../lib/reportIssue'
import { usePlanStore, isFirstClass } from '../../store/planStore'
import { useCopyInbox } from '../trips/InboxHint'
import { Screen, Button, IconButton, Card, IconTile, Text, Stack, Icon, Overline, LinkButton, Chip } from '../../ui'
import { markOnboarded } from './onboardingState'
import { WelcomeArt, TripsArt, TodayArt, WeatherPackArt, InboxArt, InviteArt, TogetherArt, GuideArt, GuideMoreArt, HonkArt, ToolsArt, YouArt, LocationArt, ArtStage } from './TourArt'
import './auth.css'
import './tour.css'

const STEPS = [
  {
    id: 'welcome', Art: WelcomeArt, next: 'Show me around',
    title: 'Your whole trip, in one calm place',
    body: 'Flights, stays, plans and the little things, kept tidy by Goose. Here’s a two-minute look around.',
  },
  {
    id: 'trips', Art: TripsArt, overline: 'Trips',
    title: 'What’s next, at a glance',
    body: 'Every trip opens on what’s coming up. Tap in for the plan, day by day, and every booking in local time.',
  },
  {
    id: 'today', Art: TodayArt, overline: 'On the day',
    title: 'Today, and how to get there',
    body: 'While you travel, Trips opens on Today. Tap Get there on any booking for walking, transit, driving or a ride app, with real travel times.',
  },
  {
    id: 'pack', Art: WeatherPackArt, overline: 'Weather · Pack',
    title: 'Packed for the forecast',
    body: 'See the weather for each stop. Goose writes a packing list for this trip: the nights, every stop, what you’ve booked, and the forecast once it’s in.',
  },
  {
    id: 'inbox', Art: InboxArt, overline: 'Goose inbox',
    title: 'Forward it. Goose files it.',
    body: 'Send any booking email to your private address. Goose pulls out the times, places and confirmation numbers and files them in the right trip.',
  },
  {
    id: 'invite', Art: InviteArt, overline: 'Travel together · 1 of 2',
    title: 'Invite your crew by email',
    body: 'Open a trip, tap Travelers and type their email. Goose sends the invite, and once they join you all plan from the same trip. Choose who can edit.',
  },
  {
    id: 'together', Art: TogetherArt, overline: 'Travel together · 2 of 2',
    title: 'Everyone forwards. Goose logs it.',
    body: 'Each traveller forwards their own booking emails to Goose, and they land in the shared trip automatically, in real time. Who lands when, who’s on which train, where you meet: all in one place.',
  },
  {
    id: 'guide', Art: GuideArt, overline: 'City guides · 1 of 2',
    title: 'Know a city before you land',
    body: 'Every city in five sections. Know has the numbers and local quirks, Eat runs from cheap to splurge. Tap + on any place to add it to your trip.',
  },
  {
    id: 'guide-more', Art: GuideMoreArt, overline: 'City guides · 2 of 2',
    title: 'Sights, transit and festivals',
    body: 'See covers museums, landmarks, areas and day trips. Transit shows how locals get around and which apps to use. Events lists festivals and what’s on.',
  },
  {
    id: 'honk', Art: HonkArt, overline: 'New · HONK',
    title: 'What is HONK?',
    body: 'It’s for when you have a few minutes to kill and nothing planned. Pick a mood, tap HONK, and Goose finds one good spot within walking distance.',
  },
  {
    id: 'tools', Art: ToolsArt, overline: 'Tools',
    title: 'Help for the awkward bits',
    body: 'Currency, phrases, tipping and SOS, all set for the country you’re in.',
  },
  {
    id: 'you', Art: YouArt, overline: 'Profile',
    title: 'Your travel wallet',
    body: 'Goose score and badges, passports and documents, loyalty cards, and the Guide and FAQ whenever you need a hand.',
  },
  { id: 'location', Art: LocationArt, firstRunOnly: true },
  { id: 'plans' },
]

const LOCATION_PERKS = [
  { icon: 'sos', tone: 'danger', title: 'SOS for the country you’re in', meta: 'Not the one on your passport' },
  { icon: 'megaphone', tone: 'accent', title: 'HONK spots near you', meta: 'Food, coffee and sights within walking distance' },
  { icon: 'currency', tone: 'success', title: 'Local currency and phrases', meta: 'Tools switch when you cross a border' },
]

const FIRST_CLASS = [
  'Unlimited trips and reservations',
  'Forward every confirmation to Goose',
  'Every past trip and recap, kept',
  'Handwritten agendas, read by Goose',
]

function ProgressBar({ index, total }) {
  return (
    <div className="tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`tour-progress__seg${i < index ? ' is-done' : ''}${i === index ? ' is-current' : ''}`} />
      ))}
    </div>
  )
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const count = (n, one, many) => `${NUMBER_WORDS[n] ?? n} ${n === 1 ? one : many}`

/** First Class first, then the free plan as a "try it first" card. Limits only show while they are switched on. */
function PlansCard() {
  const { plan, settings } = usePlanStore()
  const fl = settings.free_limits || {}
  const founders = settings.founders_offer?.active !== false
  const limitsOn = fl.enabled === true
  const tripsLimited = limitsOn && fl.trips_on !== false
  const limits = [
    tripsLimited && count(fl.upcoming_trips, 'upcoming trip', 'upcoming trips'),
    limitsOn && fl.reservations_on !== false && `${count(fl.reservations_per_trip, 'reservation', 'reservations')} ${tripsLimited ? 'each' : 'per trip'}`,
    limitsOn && fl.imports_on !== false && count(fl.email_imports, 'forwarded email', 'forwarded emails'),
  ].filter(Boolean)
  const limitsLine = limits.join(', ').replace(/^./, c => c.toUpperCase())

  if (isFirstClass(plan)) return (
    <Card variant="inverse" className="tour-fc">
      <Overline tone="accent-on-inverse">First Class</Overline>
      <Text variant="title" tone="inverse" as="h2">You’re flying First Class</Text>
      <Text variant="body" tone="inverse-muted" as="p">Everything is unlocked. Thank you for backing STT this early.</Text>
    </Card>
  )

  return (
    <>
      <Card variant="inverse" className="tour-fc">
        <Stack gap={1}>
          <Overline tone="accent-on-inverse">First Class</Overline>
          <Text variant="card-title" tone="inverse" as="h2">For every trip on your list</Text>
        </Stack>
        <ul className="tour-plan-list">
          {FIRST_CLASS.map(t => (
            <li key={t} className="tour-plan-item">
              <Icon name="sparkles" size={18} />
              <Text variant="body" tone="inverse" as="span">{t}</Text>
            </li>
          ))}
        </ul>
        {founders && (
          <div className="tour-flock">
            <span className="tour-flock__badge t-overline">Founders Flock</span>
            <Text variant="card-title" tone="inverse" as="p">
              {STORE === 'stripe' ? <>$29.99 once. First Class for <span className="tour-flock__life">LIFETIME</span>.</> : <>One payment. First Class for <span className="tour-flock__life">LIFETIME</span>.</>}
            </Text>
            <Text variant="caption" tone="inverse-muted" as="p">
              That’s about what two years of Yearly cost, then every trip after is on us, for good. Only while the Flock is open.
            </Text>
          </div>
        )}
        <Text variant="caption" tone="inverse-muted" as="p" className="tour-fc__price">
          {STORE === 'stripe' ? (founders ? 'Or $14.99 a year. ' : '$14.99 a year. ') : founders ? 'Or pay yearly. ' : ''}It also keeps a small team (and one Goose) flying.
        </Text>
      </Card>
      <Card className="tour-plan-free">
        <Stack row justify="between" align="center">
          <Text variant="card-title" as="h2">Try it first</Text>
          <Chip tone="success" icon="check">Yours now</Chip>
        </Stack>
        <Text variant="body" tone="secondary" as="p">
          {limits.length > 0
            ? `${limitsLine}. The core tools work the same.`
            : 'Trips, plans, weather, packing lists, city guides and HONK, all yours to start with.'}
        </Text>
      </Card>
    </>
  )
}

/**
 * onDone({ firstClass }) closes the tour; firstClass: true means "open the paywall next".
 * replay: opened from Profile or Help (skips the location step, doesn't touch the one-time flag).
 */
export default function Onboarding({ onDone, replay = false }) {
  const steps = STEPS.filter(s => !(replay && s.firstRunOnly))
  const [index, setIndex] = useState(0)
  const [back, setBack] = useState(false)
  const [asking, setAsking] = useState(false)
  const { address, copied, copy } = useCopyInbox()
  const { plan } = usePlanStore()
  const touch = useRef(null)
  const step = steps[index]
  const last = index === steps.length - 1

  useEffect(() => { track('onboarding_step', { step: step.id, replay }) }, [step.id])
  useEffect(() => { document.querySelector('main.onb')?.scrollTo?.(0, 0) }, [index])

  const finish = (firstClass = false) => {
    if (!replay) markOnboarded()
    track('onboarding_done', { at: step.id, choice: firstClass ? 'first_class' : 'free', replay })
    onDone({ firstClass })
  }
  const go = (to) => {
    if (to < 0 || to >= steps.length) return
    setBack(to < index)
    setIndex(to)
  }
  const next = () => (last ? finish() : go(index + 1))
  // Skip jumps to the next step that still matters: the location ask (first run), then the plans card
  const skip = () => {
    track('onboarding_skip', { at: step.id, replay })
    const to = steps.findIndex((s, i) => i > index && (s.id === 'location' || s.id === 'plans'))
    go(to === -1 ? steps.length - 1 : to)
  }

  const allowLocation = async () => {
    setAsking(true)
    // Triggers the OS prompt once; the answer is remembered by the browser / OS.
    try { await getCurrentPosition() } catch { /* declined or unavailable: fine */ }
    setAsking(false)
    go(index + 1)
  }

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touch.current == null) return
    const dx = e.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(dx) < 60 || step.id === 'location') return
    if (dx < 0 && !last) go(index + 1)
    if (dx > 0) go(index - 1)
  }
  // Arrow keys step through the cards (desktop web)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'ArrowRight' && !last && step.id !== 'location') go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const Art = step.Art
  const paid = isFirstClass(plan)

  return (
    <Screen variant="full" className="c-screen--onboarding onb" gap={4} labelledBy="onb-title"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="onb-bar">
        {index > 0
          ? <IconButton icon="chevron-left" label="Back" onClick={() => go(index - 1)} />
          : <span className="onb-bar__side" />}
        <ProgressBar index={index} total={steps.length} />
        {last
          ? <span className="onb-bar__side" />
          : <Button variant="ghost" size="sm" className="onb-bar__side" onClick={replay ? () => finish() : skip}>{replay ? 'Close' : 'Skip'}</Button>}
      </div>

      <div key={step.id} className={`tour-card${back ? ' is-back' : ''}`} aria-live="polite">
        {Art && <ArtStage Art={Art} />}

        {step.id === 'location' ? (
          <>
            <div className="tour-copy">
              <Text variant="h1" id="onb-title">Let Goose know where you are?</Text>
              <Text variant="body-lg" tone="secondary">Only while you’re using the app. Here’s what it unlocks:</Text>
            </div>
            <ul className="onb-perks">
              {LOCATION_PERKS.map(p => (
                <li key={p.title} className="onb-perk">
                  <IconTile icon={p.icon} tone={p.tone} />
                  <span className="c-row__body">
                    <span className="c-row__title">{p.title}</span>
                    <span className="c-row__meta">{p.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : step.id === 'plans' ? (
          <>
            <div className="tour-copy">
              <Overline>Your plan</Overline>
              <Text variant="h1" id="onb-title">{paid ? 'That’s the tour' : 'Pick how you travel.'}</Text>
              {!paid && <Text variant="body-lg" tone="secondary">Every trip you plan, kept in one calm place.</Text>}
            </div>
            <PlansCard />
          </>
        ) : (
          <>
            <div className="tour-copy">
              {step.id === 'welcome'
                ? <Chip tone="accent" className="tour-pill-welcome" icon="flag">Welcome aboard</Chip>
                : <Overline>{step.overline}</Overline>}
              <Text variant="h1" id="onb-title">{step.title}</Text>
              <Text variant="body-lg" tone="secondary">{step.body}</Text>
            </div>
            {step.id === 'welcome' && (
              <div className="tour-note">
                <Icon name="users" size={20} className="tone-accent" />
                <Text variant="caption" tone="secondary">You’re one of our first travellers, so thank you for flying with us. If anything looks off, tap <strong>Report an issue</strong> in Profile or Help.</Text>
              </div>
            )}
            {step.id === 'inbox' && (
              <Card variant="inverse">
                <Overline tone="accent-on-inverse">Your private address</Overline>
                <Text variant="card-title" tone="inverse" as="p" className="onb-address">
                  {address ? <>{address.split('@')[0]}<wbr />@{address.split('@')[1]}</> : 'Setting up your address…'}
                </Text>
                <Button variant="secondary" block icon={copied ? 'check' : 'copy'} onClick={copy} disabled={!address}>
                  {copied ? 'Copied' : 'Copy address'}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>

      <div className="onb-actions">
        {step.id === 'location' ? (
          <>
            <Button variant="dark" size="lg" block icon="pin" loading={asking} onClick={allowLocation}>{asking ? 'Waiting for your answer' : 'Allow location'}</Button>
            <Button variant="ghost" block onClick={() => go(index + 1)}>Not now</Button>
          </>
        ) : step.id === 'plans' ? (
          paid
            ? <Button variant="dark" size="lg" block onClick={() => finish()}>Done</Button>
            : <>
              <Button variant="primary" size="lg" block icon="sparkles" onClick={() => finish(true)}>Get First Class</Button>
              <Button variant="ghost" block className="tour-free" onClick={() => finish()}>Start with the free plan</Button>
              <LinkButton className="tour-report" href={reportIssueHref('tour')} onClick={() => trackReport('tour')}>Found a bug? Report an issue</LinkButton>
            </>
        ) : (
          <Button variant="dark" size="lg" block iconRight="arrow-right" onClick={next}>{step.next || 'Next'}</Button>
        )}
      </div>
    </Screen>
  )
}
