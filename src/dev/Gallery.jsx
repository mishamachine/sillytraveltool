// Dev-only component gallery (http://localhost:5173/?gallery). Not in production builds.
import { useState } from 'react'
import '../styles/global.css'
import './gallery.css'
import { applyTheme } from '../lib/theme'
import {
  Icon, ICON_NAMES, Text, Overline, Stack, Button, IconButton, LinkButton, Card, ListRow, IconTile, CATEGORY,
  SegmentedControl, BottomNav, Sheet, Dialog, Field, Chip, Banner, EmptyState, ErrorState, Loading, ProgressBar,
  Skeleton, Switch, Toast, Screen, ScreenHeader, Section, GooseMark, GOOSE_EXPRESSIONS, Logo, TagMark,
} from '../ui'

const NAV = [
  { id: 'trips', label: 'Trips', icon: 'trips' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'tools', label: 'Tools', icon: 'tools' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
]

export default function Gallery() {
  const [theme, setTheme] = useState('system')
  const [seg, setSeg] = useState('plan')
  const [tip, setTip] = useState('15')
  const [nav, setNav] = useState('trips')
  const [sheet, setSheet] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [toast, setToast] = useState(false)
  const [on, setOn] = useState(true)
  const [chip, setChip] = useState('food')

  const pickTheme = (t) => { setTheme(t); applyTheme(t) }

  return (
    <>
      <Screen gap={6} className="gallery">
        <ScreenHeader title="Clay components" overline="Dev gallery" meta="Every src/ui component, both themes." />
        <SegmentedControl label="Theme" role="radiogroup" value={theme} onChange={pickTheme}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />

        <Section title="Logo">
          <Card variant="raised"><Logo size="lg" /><Logo size="md" /><Stack row gap={4}><TagMark size={64} /><TagMark size={32} /></Stack></Card>
        </Section>

        <Section title="Goose">
          <div className="gallery-grid gallery-grid--goose">
            {GOOSE_EXPRESSIONS.map(e => (
              <Stack key={e} gap={2} align="center"><GooseMark expression={e} size={60} tile tileSize="md" /><Text variant="micro" tone="muted">{e}</Text></Stack>
            ))}
          </div>
        </Section>

        <Section title={`Icons (${ICON_NAMES.length})`}>
          <Card>
            <div className="gallery-grid">
              {ICON_NAMES.map(n => (
                <div key={n} className="gallery-icon"><Icon name={n} /><span className="t-micro tone-muted">{n}</span></div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="Type">
          <Card>
            {['display', 'h1', 'h2', 'title', 'card-title', 'stat', 'body-lg', 'body', 'label', 'caption', 'overline', 'micro'].map(v => (
              <Text key={v} variant={v} as="p">{v} · Madrid · Granada</Text>
            ))}
            <Text tone="secondary">ink-secondary</Text><Text tone="muted">ink-muted</Text><Text tone="accent">accent</Text>
            <Text tone="danger">danger</Text><Text tone="success">success</Text><Text tone="info">info</Text>
          </Card>
        </Section>

        <Section title="Buttons">
          <Stack gap={2}>
            <Button variant="primary" size="lg" block icon="plus">New trip</Button>
            <Stack row gap={2}><Button variant="primary">Show tickets</Button><Button>Directions</Button></Stack>
            <Stack row gap={2}><Button variant="dark">Continue</Button><Button variant="ghost">Not now</Button><Button variant="outline">Outline</Button></Stack>
            <Button variant="danger" block>Delete account permanently</Button>
            <Button variant="danger" block disabled>Disabled danger</Button>
            <Stack row gap={2}>
              <IconButton icon="chevron-left" label="Back" /><IconButton icon="more" label="More" />
              <IconButton icon="plus" label="Add" variant="accent" size="lg" /><IconButton icon="close" label="Close" variant="ghost" />
              <LinkButton icon="copy">Copy</LinkButton>
            </Stack>
          </Stack>
        </Section>

        <Section title="Cards">
          <Card variant="raised">
            <Stack row justify="between"><Overline tone="accent">Next up · in 1h 20m</Overline><Text variant="micro" tone="muted">10:30</Text></Stack>
            <Stack row gap={3}><IconTile icon="ticket" tone="success" size="md" /><Stack gap={1}><Text variant="title">Alhambra · Nasrid Palaces</Text><Text variant="caption" tone="muted">2 tickets · Conf. ALH-90412</Text></Stack></Stack>
            <Stack row gap={2}><Button variant="primary" className="grow">Show tickets</Button><Button className="grow">Directions</Button></Stack>
          </Card>
          <Card variant="inverse" onClick={() => {}}>
            <Overline tone="accent-on-inverse">On the road · day 4 of 10</Overline>
            <Text variant="h2" tone="inverse">Spain</Text>
            <Text variant="body" tone="inverse-muted">Madrid · Granada · Sevilla</Text>
            <ProgressBar value={0.4} inverse label="Trip progress" />
          </Card>
          <Card variant="group">
            {Object.entries(CATEGORY).filter(([k]) => ['flight', 'hotel', 'train', 'activity', 'car', 'restaurant', 'museum', 'note'].includes(k)).map(([k, v]) => (
              <ListRow key={k} icon={v.icon} tone={v.tone} title={v.label} meta="Meta line · caption" trailing="13:05" />
            ))}
            <ListRow title="Settings row" meta="With a chevron" chevron onClick={() => {}} />
            <ListRow title="Delete account" danger chevron onClick={() => {}} />
          </Card>
        </Section>

        <Section title="Segmented control">
          <SegmentedControl label="Trip sections" value={seg} onChange={setSeg} options={[{ value: 'plan', label: 'Plan' }, { value: 'weather', label: 'Weather' }, { value: 'pack', label: 'Pack' }]} />
          <SegmentedControl label="Tip" role="radiogroup" value={tip} onChange={setTip} options={['10', '15', '18', '20'].map(v => ({ value: v, label: `${v}%` }))} />
        </Section>

        <Section title="Chips and banners">
          <div className="c-chip-row">
            {['food', 'sights', 'nightlife', 'cheap'].map(c => <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>{c}</Chip>)}
          </div>
          <Stack row gap={2} wrap><Chip tone="info">24 days</Chip><Chip tone="success" icon="check">Completed</Chip><Chip tone="accent">Live</Chip><Chip tone="danger">Expired</Chip><Chip>Neutral</Chip></Stack>
          <Banner icon="lightbulb" title="Tip">Order tapas at the bar, not the table.</Banner>
          <Banner variant="hint" icon="mail" action={<LinkButton>Copy</LinkButton>}>Forward confirmations to your Goose inbox</Banner>
          <Banner tone="danger" icon="alert-circle" title="Couldn't save">Check your connection and try again.</Banner>
        </Section>

        <Section title="Fields">
          <Field label="Search a city" hideLabel icon="search" type="search" placeholder="Search a city" />
          <Field label="Email" type="email" placeholder="you@example.com" hint="We never share it." />
          <Field label="Type DELETE to confirm" error="That doesn't match." defaultValue="delet" />
          <Field label="Currency" as="select" defaultValue="EUR"><option>EUR</option><option>USD</option></Field>
          <Field label="Notes" as="textarea" placeholder="Anything Goose should know" />
          <Card variant="group"><Switch label="Dark mode" description="Follows your phone unless set" checked={on} onChange={setOn} /><Switch label="Trip reminders" checked={false} onChange={() => {}} /></Card>
        </Section>

        <Section title="States">
          <Loading title="Goose is reading up on Sevilla" onStop={() => {}}>Sections appear as they're ready, usually under 10 seconds.</Loading>
          <Loading inline title="Packing list on its way" value={0.6} />
          <ErrorState onRetry={() => {}} secondary={<Button>Saved version</Button>} onReport={() => {}}>The guide took too long to write. Your trips and bookings are fine.</ErrorState>
          <Card><Skeleton /></Card>
          <EmptyState title="No trips yet" action={<Button variant="primary" size="lg" block icon="plus">Plan a trip</Button>} secondary={<Button variant="ghost" block>Forward a booking instead</Button>}>
            Add one by hand or forward a booking email and Goose builds it for you.
          </EmptyState>
        </Section>

        <Section title="Overlays">
          <Stack row gap={2} wrap>
            <Button onClick={() => setSheet(true)}>Open sheet</Button>
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Button onClick={() => { setToast(true); setTimeout(() => setToast(false), 2500) }}>Show toast</Button>
          </Stack>
        </Section>
      </Screen>

      <BottomNav items={NAV} active={nav} onSelect={setNav} />

      {sheet && (
        <Sheet title="Add to this trip" onClose={() => setSheet(false)}>
          <div className="grid-3">
            {['flight', 'hotel', 'train', 'activity', 'car', 'note'].map(k => (
              <Card key={k} variant="tile" onClick={() => {}} className="gallery-tile">
                <IconTile icon={CATEGORY[k].icon} tone={CATEGORY[k].tone} /><Text variant="label">{CATEGORY[k].label}</Text>
              </Card>
            ))}
          </div>
          <Field label="Title" placeholder="SEA → MAD" />
        </Sheet>
      )}
      <Dialog open={dialog} onClose={() => setDialog(false)} title="Delete this trip?"
        actions={<><Button onClick={() => setDialog(false)}>Cancel</Button><Button variant="danger" onClick={() => setDialog(false)}>Delete</Button></>}>
        Bookings and notes go with it.
      </Dialog>
      {toast && <Toast title="Copied">Goose inbox address is on your clipboard</Toast>}
    </>
  )
}
