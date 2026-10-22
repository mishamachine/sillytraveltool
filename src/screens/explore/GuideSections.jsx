import { useState, useId, useRef } from 'react'
import {
  Card, Text, Stack, Icon, IconTile, IconButton, Button, LinkButton, Chip, SegmentedControl, EmptyState, ListRow, Overline, Banner, cx,
} from '../../ui'
import { mapsUrl } from '../../lib/trips'
import { safeUrl } from '../../lib/safeUrl'
import { PlacePhoto, GoogleRating, GoogleAttribution, InkWait } from '../../components/shared/PlaceMedia'

// Guide section metadata (overview tiles, detail chips)
export const GUIDE_SECTIONS = [
  { id: 'know',   label: 'Know',   icon: 'info',       blurb: 'History, numbers and local quirks' },
  { id: 'eat',    label: 'Eat',    icon: 'restaurant', blurb: 'Cheap eats to a proper splurge' },
  { id: 'see',    label: 'See',    icon: 'eye',        blurb: 'Museums, areas, parks, day trips' },
  { id: 'move',   label: 'Transit', icon: 'metro',      blurb: 'Metro, taxis and apps like a local' },
  { id: 'events', label: 'Events', icon: 'event',      blurb: 'Festivals and what is on' },
]

// Google's weekday lines run Monday → Sunday ("Monday: 9:00 AM – 5:00 PM")
function todayHours(hours) {
  if (!Array.isArray(hours) || hours.length !== 7) return null
  return hours[(new Date().getDay() + 6) % 7] || null
}

function ScoreChip({ score }) {
  if (!score) return null
  const s = parseFloat(score)
  if (isNaN(s)) return null
  return <Chip icon="star" aria-label={`Goose rating ${s.toFixed(1)} out of 10`}>{s.toFixed(1)}</Chip>
}

/** Restaurant or attraction: collapsed summary, expands to description, tip and links. */
function PlaceCard({ item, kind, onAddToTrip }) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const sub = kind === 'restaurant' ? item.cuisine : item.type
  // Words that arrive while the card is on screen "ink in"; ones already there just show
  const waited = useRef(false)
  if (item.pending) waited.current = true
  const ink = waited.current && !item.pending ? 'ink-in' : undefined
  return (
    <Card variant={item.is_goose_pick ? 'raised' : 'plain'} className="explore-place">
      <div className="explore-place__head">
        <button type="button" className="explore-place__toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>
          {item.photo && <PlacePhoto name={item.photo} w={200} className="place-photo--thumb" />}
          <Stack gap={1} grow>
            {item.is_goose_pick && <Overline tone="accent">Goose pick</Overline>}
            <Text variant="card-title" as="span">{item.name}</Text>
            {sub && <Text variant="caption" tone="muted" as="span">{sub}</Text>}
            {item.pending && !expanded && <InkWait label="The Goose is writing" />}
            {item.goose_quip && !expanded && <Text variant="caption" tone="accent" as="span" className={cx('explore-quip', ink)}>“{item.goose_quip}”</Text>}
          </Stack>
          {item.rating != null ? <GoogleRating rating={item.rating} />
            : kind === 'restaurant' ? <ScoreChip score={item.goose_score || item.rating_estimate} /> : <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} className="tone-muted" />}
        </button>
        <IconButton icon="plus" variant="sunken" label={`Add ${item.name} to a trip`} onClick={() => onAddToTrip(item, kind)} />
      </div>
      {expanded && (
        <Stack gap={3} id={bodyId}>
          {item.photo && <PlacePhoto name={item.photo} alt={item.name} />}
          {item.pending ? <InkWait lines={3} label="The Goose is writing" />
            : item.description && <Text variant="body" tone="secondary" className={ink}>{item.description}</Text>}
          {(item.rating != null || item.goose_score) && (
            <Stack row gap={2} wrap>
              <GoogleRating rating={item.rating} count={item.rating_count} />
              {item.rating != null && <span className={ink}><ScoreChip score={item.goose_score} /></span>}
            </Stack>
          )}
          {item.goose_quip && <Text variant="body" tone="accent" className={cx('explore-quip', ink)}>“{item.goose_quip}”</Text>}
          {item.address && (
            <Stack row gap={2} align="start">
              <Icon name="pin" size={18} className="tone-muted" />
              <Text variant="caption" tone="muted">{item.address}</Text>
            </Stack>
          )}
          {todayHours(item.hours) && (
            <Stack row gap={2} align="start">
              <Icon name="clock" size={18} className="tone-muted" />
              <Text variant="caption" tone="muted">{todayHours(item.hours)}</Text>
            </Stack>
          )}
          <Stack row gap={2} wrap>
            <Button variant="primary" size="sm" icon="plus" onClick={() => onAddToTrip(item, kind)}>Add to trip</Button>
            {(safeUrl(item.maps_url) || item.google_maps_query) && (
              <LinkButton href={safeUrl(item.maps_url) || mapsUrl(item.google_maps_query)} target="_blank" rel="noreferrer" icon="map">Maps</LinkButton>
            )}
            {safeUrl(item.official_url) && <LinkButton href={safeUrl(item.official_url)} target="_blank" rel="noreferrer" icon="external">Official site</LinkButton>}
            {safeUrl(item.wikipedia_url) && <LinkButton href={safeUrl(item.wikipedia_url)} target="_blank" rel="noreferrer" icon="book">Wikipedia</LinkButton>}
          </Stack>
        </Stack>
      )}
    </Card>
  )
}

function LoadMore({ sectionKey, loadingMore, onLoadMore, label }) {
  const busy = loadingMore === sectionKey
  return (
    <Button variant="outline" block icon={busy ? undefined : 'plus'} loading={busy} onClick={() => onLoadMore(sectionKey)}>
      {busy ? 'Goose is finding more' : `Show 10 more ${label}`}
    </Button>
  )
}

// ─────────────────────────────────────────────
// KNOW
// ─────────────────────────────────────────────
export function KnowSection({ data, destination }) {
  const [expanded, setExpanded] = useState(false)
  if (!data?.history_text) return <EmptyState goose="worried" title="Nothing here yet">Goose couldn't find an overview for this city.</EmptyState>

  const stats = data.city_stats || {}
  const comparisons = stats.comparisons || []
  const gooseFacts = stats.goose_facts || []
  const quick = [
    ['users', 'Population', stats.population],
    ['chat', 'Language', stats.language],
    ['currency', 'Currency', stats.currency],
    ['clock', 'Timezone', stats.timezone],
    ['sun', 'Summer average', stats.avg_temp_summer],
    ['snow', 'Winter average', stats.avg_temp_winter],
    ['calendar', 'Founded', stats.founded],
    ['map', 'Area', stats.area_km2 ? `${Number(stats.area_km2).toLocaleString()} km²` : null],
  ].filter(([, , v]) => v)

  return (
    <Stack gap={4}>
      <Card variant="raised">
        <Stack row gap={3}>
          <IconTile icon="book" tone="accent" size="md" />
          <Stack gap={0} grow>
            <Text variant="title" as="h3">{destination.city}</Text>
            <Text variant="caption" tone="muted">{destination.country}</Text>
          </Stack>
        </Stack>
        <Text variant="body" tone="secondary" className={expanded ? undefined : 'explore-clamp'}>{data.history_text}</Text>
        <LinkButton icon={expanded ? 'chevron-up' : 'chevron-down'} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Read more'}
        </LinkButton>
        <Stack row gap={4} wrap>
          {safeUrl(data.wikipedia_url) && <LinkButton href={safeUrl(data.wikipedia_url)} target="_blank" rel="noreferrer" icon="book">Wikipedia</LinkButton>}
          {safeUrl(data.britannica_url) && <LinkButton href={safeUrl(data.britannica_url)} target="_blank" rel="noreferrer" icon="globe">Britannica</LinkButton>}
        </Stack>
      </Card>

      {quick.length > 0 && (
        <div className="grid-2">
          {quick.map(([icon, label, value]) => (
            <Card key={label} variant="tile">
              <Icon name={icon} size={22} className="tone-accent" />
              <Text variant="micro" tone="muted" as="p">{label}</Text>
              <Text variant="body" weight={600} as="p">{value}</Text>
            </Card>
          ))}
        </div>
      )}

      {comparisons.length > 0 && (
        <Card>
          <Stack row gap={2}><Icon name="chart" size={20} className="tone-accent" /><Overline tone="accent">By the numbers</Overline></Stack>
          <ul className="explore-list">
            {comparisons.map((c, i) => <li key={i} className="t-body">{c}</li>)}
          </ul>
        </Card>
      )}

      {gooseFacts.length > 0 && (
        <Stack gap={3}>
          <Overline as="h3">Goose on {destination.city}</Overline>
          {gooseFacts.map((f, i) => (
            <Card key={i}>
              <Text variant="body" weight={600}>{f.fact}</Text>
              {f.goose_take && <Text variant="caption" tone="accent" className="explore-quip">Goose's take: “{f.goose_take}”</Text>}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

// ─────────────────────────────────────────────
// EAT
// ─────────────────────────────────────────────
const TIERS = [
  { value: 'cheap', label: 'Cheap', key: 'eat_cheap' },
  { value: 'mid', label: 'Mid-range', key: 'eat_mid' },
  { value: 'splurge', label: 'Splurge', key: 'eat_splurge' },
]

export function EatSection({ data, onAddToTrip, onLoadMore, loadingMore }) {
  const [tier, setTier] = useState('cheap')
  const sectionKey = TIERS.find(t => t.value === tier).key
  const restaurants = data?.[sectionKey] || []
  return (
    <Stack gap={3}>
      <SegmentedControl role="radiogroup" label="Price" value={tier} onChange={setTier} options={TIERS} />
      {restaurants.length === 0 && <EmptyState goose="worried" title="No restaurants yet">Try another price range.</EmptyState>}
      {restaurants.map((r, i) => <PlaceCard key={`${r.name}-${i}`} item={r} kind="restaurant" onAddToTrip={onAddToTrip} />)}
      {restaurants.length > 0 && <LoadMore sectionKey={sectionKey} loadingMore={loadingMore} onLoadMore={onLoadMore} label="places" />}
      {restaurants.some(r => r.place_id) && <GoogleAttribution />}
    </Stack>
  )
}

// ─────────────────────────────────────────────
// SEE
// ─────────────────────────────────────────────
const SEE_CATEGORIES = [
  { value: 'museums', label: 'Museums', key: 'see_museums' },
  { value: 'temples', label: 'Landmarks', key: 'see_temples' },
  { value: 'neighbourhoods', label: 'Areas', key: 'see_neighbourhoods' },
  { value: 'parks', label: 'Parks', key: 'see_parks' },
  { value: 'daytrips', label: 'Day trips', key: 'see_daytrips' },
]

export function SeeSection({ data, onAddToTrip, onLoadMore, loadingMore }) {
  const [cat, setCat] = useState('museums')
  const sectionKey = SEE_CATEGORIES.find(c => c.value === cat).key
  const items = data?.[sectionKey] || []
  return (
    <Stack gap={3}>
      <div className="c-chip-row explore-filter" role="radiogroup" aria-label="Kind of place">
        {SEE_CATEGORIES.map(c => (
          <Chip key={c.value} role="radio" aria-checked={cat === c.value} aria-pressed={undefined} selected={cat === c.value} onClick={() => setCat(c.value)}>{c.label}</Chip>
        ))}
      </div>
      {items.length === 0 && <EmptyState goose="worried" title="Nothing here yet">Try another kind of place.</EmptyState>}
      {items.map((item, i) => <PlaceCard key={`${item.name}-${i}`} item={item} kind="attraction" onAddToTrip={onAddToTrip} />)}
      {items.length > 0 && <LoadMore sectionKey={sectionKey} loadingMore={loadingMore} onLoadMore={onLoadMore} label="places" />}
      {items.some(r => r.place_id) && <GoogleAttribution />}
    </Stack>
  )
}

// ─────────────────────────────────────────────
// MOVE — with official links
// ─────────────────────────────────────────────
function transportIcon(type = '') {
  const t = type.toLowerCase()
  if (t.includes('metro') || t.includes('subway') || t.includes('underground') || t.includes('tube')) return 'metro'
  if (t.includes('bus')) return 'bus'
  if (t.includes('taxi') || t.includes('cab')) return 'taxi'
  if (t.includes('ride') || t.includes('grab') || t.includes('uber') || t.includes('bolt')) return 'smartphone'
  if (t.includes('train') || t.includes('rail')) return 'train'
  if (t.includes('tram') || t.includes('streetcar')) return 'tram'
  if (t.includes('ferry') || t.includes('boat')) return 'ferry'
  if (t.includes('bike') || t.includes('cycl')) return 'bike'
  if (t.includes('walk') || t.includes('foot')) return 'walk'
  if (t.includes('car') || t.includes('driv')) return 'car'
  return 'map'
}

export function MoveSection({ data }) {
  const move = data?.move_content || {}
  const options = move.options || []
  return (
    <Stack gap={3}>
      {move.overview && <Card><Text variant="body" tone="secondary">{move.overview}</Text></Card>}
      {options.length === 0 && <EmptyState goose="worried" title="No transport notes yet">Goose couldn't find getting-around tips for this city.</EmptyState>}
      {options.map((opt, i) => (
        <Card key={i}>
          <ListRow as="div" icon={transportIcon(opt.type)} tone="accent" title={opt.type} meta={opt.app_name ? `App: ${opt.app_name}` : undefined}
            trailing={safeUrl(opt.official_url) ? <LinkButton href={safeUrl(opt.official_url)} target="_blank" rel="noreferrer" icon="external" aria-label={`${opt.type} official site`}>Official</LinkButton> : undefined} />
          {opt.description && <Text variant="body" tone="secondary">{opt.description}</Text>}
          {opt.tip && <Banner icon="lightbulb">{opt.tip}</Banner>}
        </Card>
      ))}
    </Stack>
  )
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function eventTone(type = '') {
  const t = type.toLowerCase()
  if (t.includes('festival')) return 'stay'
  if (t.includes('music')) return 'success'
  if (t.includes('sport')) return 'info'
  return 'accent'
}

export function EventsSection({ data }) {
  const events = data?.events || []
  if (events.length === 0) return <EmptyState goose="sleepy" title="Quiet city">Nothing big on. Goose suggests making your own fun.</EmptyState>
  return (
    <Card variant="group">
      {events.map((evt, i) => (
        <ListRow key={i} icon="event" tone={eventTone(evt.type)} title={evt.name || evt.title}
          meta={[evt.type, evt.description].filter(Boolean).join(' · ')}
          trailing={evt.month ? <Chip tone={eventTone(evt.type)}>{evt.month}</Chip> : undefined} />
      ))}
    </Card>
  )
}
