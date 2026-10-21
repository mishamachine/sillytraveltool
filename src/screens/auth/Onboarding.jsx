// One-time onboarding after the first sign-in: Goose inbox, then the location pre-prompt.
// Replaces the old permanent inbox banner on Trips.
import { useState } from 'react'
import { getCurrentPosition } from '../../lib/geo'
import { useCopyInbox } from '../trips/InboxHint'
import { Screen, Button, IconButton, Card, IconTile, Text, Stack, Icon, Overline, GooseMark } from '../../ui'
import { markOnboarded } from './onboardingState'
import './auth.css'


function StepDots({ current }) {
  return (
    <div className="onb-dots" role="img" aria-label={`Step ${current} of 3`}>
      {[1, 2, 3].map(i => <span key={i} className={`onb-dot${i <= current ? ' is-done' : ''}${i === current ? ' is-current' : ''}`} />)}
    </div>
  )
}

const INBOX_STEPS = [
  'Forward a flight, hotel, train or ticket email',
  'Goose pulls out times, places and confirmation numbers',
  'It shows up in your trip, usually within a minute',
]

const LOCATION_PERKS = [
  { icon: 'sos', tone: 'danger', title: "SOS for the country you're in", meta: 'Not the one on your passport' },
  { icon: 'megaphone', tone: 'accent', title: 'HONK spots near you', meta: 'Food, coffee and sights within walking distance' },
  { icon: 'currency', tone: 'success', title: 'Local currency and phrases', meta: 'Tools switch when you cross a border' },
]

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState('inbox') // 'inbox' | 'location'
  const [asking, setAsking] = useState(false)
  const { address, copied, copy } = useCopyInbox()

  const finish = () => { markOnboarded(); onDone() }

  const allowLocation = async () => {
    setAsking(true)
    // Triggers the OS prompt once; the answer is remembered by the browser / OS.
    try { await getCurrentPosition() } catch { /* declined or unavailable: fine */ }
    setAsking(false)
    finish()
  }

  if (step === 'inbox') return (
    <Screen variant="full" className="c-screen--onboarding onb" gap={5} labelledBy="onb-inbox-title">
      <div className="onb-bar">
        <span className="onb-bar__side" />
        <StepDots current={2} />
        <Button variant="ghost" size="sm" className="onb-bar__side" onClick={() => setStep('location')}>Skip</Button>
      </div>
      <Stack gap={2}>
        <Text variant="h1" id="onb-inbox-title">Meet your Goose inbox</Text>
        <Text variant="body-lg" tone="secondary">Forward any booking confirmation here. Goose reads it and files it into the right trip.</Text>
      </Stack>
      <Card variant="inverse">
        <Overline tone="accent-on-inverse">Your private address</Overline>
        <Text variant="card-title" tone="inverse" as="p" className="onb-address">
          {address ? <>{address.split('@')[0]}<wbr />@{address.split('@')[1]}</> : 'Setting up your address…'}
        </Text>
        <Button variant="secondary" block icon={copied ? 'check' : 'copy'} onClick={copy} disabled={!address}>
          {copied ? 'Copied' : 'Copy address'}
        </Button>
      </Card>
      <ol className="onb-steps">
        {INBOX_STEPS.map((t, i) => (
          <li key={t} className="onb-step">
            <span className="onb-step__n" aria-hidden="true">{i + 1}</span>
            <Text variant="body" as="span">{t}</Text>
          </li>
        ))}
      </ol>
      <div className="onb-note">
        <Icon name="lock" size={20} className="tone-muted" />
        <Text variant="caption" tone="muted">Keep it private. Anything sent to this address lands in your trips. You can reset it in Settings.</Text>
      </div>
      <div className="onb-actions">
        <Button variant="dark" size="lg" block onClick={() => setStep('location')}>Got it</Button>
      </div>
    </Screen>
  )

  return (
    <Screen variant="full" className="c-screen--onboarding onb" gap={5} labelledBy="onb-loc-title">
      <div className="onb-bar">
        <IconButton icon="chevron-left" label="Back" onClick={() => setStep('inbox')} />
        <StepDots current={3} />
        <span className="onb-bar__side" />
      </div>
      <div className="onb-art">
        <GooseMark expression="happy" size={96} tile tileSize="lg" />
        <span className="onb-art__pin"><Icon name="pin" size={26} /></span>
      </div>
      <Stack gap={2}>
        <Text variant="h1" id="onb-loc-title">Let Goose know where you are?</Text>
        <Text variant="body-lg" tone="secondary">Only while you're using the app. Here's what it unlocks:</Text>
      </Stack>
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
      <div className="onb-actions">
        <Button variant="dark" size="lg" block icon="pin" loading={asking} onClick={allowLocation}>{asking ? 'Waiting for your answer' : 'Allow location'}</Button>
        <Button variant="ghost" block onClick={finish}>Not now</Button>
      </div>
    </Screen>
  )
}
