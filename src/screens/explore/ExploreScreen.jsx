import { useEffect, useState } from 'react'
import { useUIStore, useGuideStore, useTripsStore, useIdeasStore, tripForCity } from '../../store'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import {
  Screen, ScreenHeader, Section, Card, Chip, Text, Stack, Icon, IconTile, ListRow, Button,
  Loading, ErrorState, EmptyState, Skeleton, GooseMark, Toast,
} from '../../ui'
import { useCityGuide, TAB_SECTIONS } from './useCityGuide'
import { GUIDE_SECTIONS, KnowSection, EatSection, SeeSection, MoveSection, EventsSection } from './GuideSections'
import HonkView, { MOODS } from './HonkView'
import IdeaSheet from './IdeaSheet'
import { saveIdea } from './saveIdea'
import GetThereSheet from '../../components/shared/GetThereSheet'
import AiDisclosure from './AiDisclosure'
import './explore.css'

const SUB_LABEL = {
  overview: 'Overview', eat_cheap: 'Cheap eats', eat_mid: 'Mid-range', eat_splurge: 'Splurge',
  see_temples: 'Landmarks', see_neighbourhoods: 'Areas', see_museums: 'Museums', see_parks: 'Parks', see_daytrips: 'Day trips',
  move: 'Getting around', events: 'Events',
}

// One-line teaser for an overview tile, from whatever is already loaded
import { useBackHandler } from '../../lib/backStack'
function teaser(id, data, sections) {
  if (id === 'know') return data?.city_stats?.goose_facts?.[0]?.fact || data?.history_text?.split('. ')[0]
  if (id === 'eat') return (data?.eat_cheap?.[0] || data?.eat_mid?.[0])?.name && `Start with ${(data.eat_cheap?.[0] || data.eat_mid[0]).name}`
  if (id === 'see') return data?.see_museums?.[0]?.name
  if (id === 'move') return data?.move_content?.options?.[0]?.type
  if (id === 'events') return sections.events && (data?.events?.[0]?.name || 'Nothing big on')
  return null
}

/** HONK teaser on the Explore overview: mood chips open HONK with that mood. */
function HonkCard({ onMood }) {
  return (
    <Card variant="inverse" aria-labelledby="honk-card-title">
      <Stack row gap={3}>
        <GooseMark expression="happy" size={44} tile tileSize="sm" />
        <Stack gap={1} grow>
          <Text variant="title" tone="inverse" as="h2" id="honk-card-title">HONK</Text>
          <Text variant="caption" tone="inverse-muted">What are you in the mood for, near you?</Text>
        </Stack>
      </Stack>
      <div className="explore-moods">
        {MOODS.slice(0, 3).map(m => (
          <Chip key={m.id} icon={m.icon} onClick={() => onMood(m.id)} className="explore-mood">{m.label}</Chip>
        ))}
        <Chip icon="more" onClick={() => onMood(null)} className="explore-mood">More moods</Chip>
      </div>
    </Card>
  )
}

const reportGuide = (city) => { window.location.href = `mailto:hello@sillytraveltool.com?subject=${encodeURIComponent(`Guide error - ${city}`)}` }

const SECTION_VIEW = { know: KnowSection, eat: EatSection, see: SeeSection, move: MoveSection, events: EventsSection }

export default function ExploreScreen() {
  const mode = useUIStore(s => s.exploreMode)
  const setMode = useUIStore(s => s.setExploreMode)
  const [honkMood, setHonkMood] = useState(null)
  const closeHonk = () => { setHonkMood(null); setMode('guide') }
  useBackHandler(mode === 'honk', closeHonk)

  // HONK renders on its own, so opening it from Today doesn't also load a city guide
  if (mode === 'honk') return <HonkView initialMood={honkMood} onBack={closeHonk} />
  return <GuideHome setHonkMood={setHonkMood} setMode={setMode} />
}

function GuideHome({ setHonkMood, setMode }) {
  const [open, setOpen] = useState(false)
  const [ideaFor, setIdeaFor] = useState(null) // { item, kind, status }
  const [getThere, setGetThere] = useState(null)
  const [toast, setToast] = useState(null)
  const g = useCityGuide(open)
  const { destination } = g
  const loadingSections = useGuideStore(s => s.loadingSections)
  useBackHandler(open, () => setOpen(false))

  // Trip ideas: the guide belongs to the trip for this city (if there is one) and shows what's shortlisted or booked
  const trips = useTripsStore(s => s.trips)
  const cityTrip = tripForCity(trips, destination?.city)
  const { load: loadIdeas, statusFor } = useIdeasStore()
  const openTripForm = useUIStore(s => s.openTripForm)
  useIdeasStore(s => s.byTrip[cityTrip?.id]) // re-render when this trip's ideas change
  useEffect(() => { if (cityTrip?.id) loadIdeas(cityTrip.id) }, [cityTrip?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const statusOf = item => (cityTrip ? statusFor(cityTrip.id, item) : null)
  const say = (msg, trip) => { setToast({ msg, trip }); setTimeout(() => setToast(null), trip ? 5000 : 2600) }

  const openSection = (id) => { g.setGuideTab(id); setOpen(true) }
  // One tap saves to the city's trip (starting an undated one if needed); saved or booked places open the idea sheet
  const handleAddToTrip = async (item, kind) => {
    const status = statusOf(item)
    if (status) { setIdeaFor({ item, kind, status }); return }
    try {
      const { trip, created } = await saveIdea(destination, item, kind)
      say(created ? `Saved to your new ${destination.city} trip` : `Saved to ${trip.title} ideas`, created ? trip : null)
    } catch { say('Couldn\'t save it. Check your connection.') }
  }
  const overviewLoading = !!loadingSections.overview
  const overviewFailed = !overviewLoading && !!g.guideError && !g.sections.overview

  const tripCities = g.upcomingTrips.filter((t, i, arr) => arr.findIndex(x => x.destination_city === t.destination_city) === i)
  const loadingCopy = g.lastSectionFromCache ? 'Sections appear as they\'re ready.' : 'Sections appear as they\'re ready, usually under 10 seconds.'

  // ── Section detail ───────────────────────────────
  if (open && destination && !g.excluded) {
    const meta = GUIDE_SECTIONS.find(s => s.id === g.activeGuideTab) || GUIDE_SECTIONS[0]
    const View = SECTION_VIEW[meta.id]
    const failed = !g.isSectionLoading && g.guideError && !g.isSectionLoaded
    return (
      <Screen gap={4} labelledBy="guide-section-title">
        <ScreenHeader onBack={() => setOpen(false)} backLabel="Back to Explore" overline={`${destination.city} guide`} title={meta.label} titleId="guide-section-title" />
        <div className="c-chip-row explore-chips" role="tablist" aria-label="Guide sections">
          {GUIDE_SECTIONS.map(s => (
            <Chip key={s.id} role="tab" aria-selected={s.id === meta.id} aria-pressed={undefined} icon={s.icon}
              selected={s.id === meta.id} onClick={(e) => { e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); g.setGuideTab(s.id) }}>{s.label}</Chip>
          ))}
        </div>

        {g.isSectionLoading && !g.isSectionLoaded && (
          <>
            <Loading title={`Goose is reading up on ${destination.city}`}>{loadingCopy}</Loading>
            <div className="grid-2" aria-hidden="true">{[1, 2].map(i => <Card key={i}><Skeleton lines={2} /></Card>)}</div>
          </>
        )}

        {failed && (
          <>
            <ErrorState onRetry={g.retry} onReport={() => reportGuide(destination.city)}>
              The guide took too long to write. Your trips and bookings are fine.
            </ErrorState>
            {g.neededSections.length > 1 && (
              <Card variant="group" aria-label="Section status">
                {g.neededSections.map(s => {
                  const ready = !!g.sections[s]
                  const busy = !!g.loadingSections[s]
                  return (
                    <ListRow key={s} icon={ready ? 'check' : 'alert-circle'} tone={ready ? 'success' : 'danger'} title={SUB_LABEL[s]}
                      trailing={ready ? 'Ready' : <Button size="sm" variant="secondary" loading={busy} onClick={() => g.retrySection(s)}>{busy ? 'Trying' : 'Retry'}</Button>} />
                  )
                })}
              </Card>
            )}
          </>
        )}

        {g.isSectionLoaded && (
          <>
            <View data={g.guideData} destination={destination} onAddToTrip={handleAddToTrip} onGetThere={setGetThere} statusOf={statusOf}
              onLoadMore={g.loadMore} loadingMore={g.loadingMore} />
            <AiDisclosure city={destination.city} />
          </>
        )}

        {ideaFor && cityTrip && <IdeaSheet {...ideaFor} trip={cityTrip} onSaved={say} onClose={() => setIdeaFor(null)} />}
        {getThere && <GetThereSheet place={getThere} countryCode={destination.country_code} onClose={() => setGetThere(null)} />}
        {toast && (
          <Toast icon="check" title={toast.msg}
            action={toast.trip && <Button size="sm" variant="secondary" onClick={() => { openTripForm(toast.trip); setToast(null) }}>Add dates</Button>} />
        )}
      </Screen>
    )
  }

  // ── Overview ─────────────────────────────────────
  return (
    <Screen gap={4} labelledBy="explore-title">
      <ScreenHeader title="Explore" titleId="explore-title">
        <CityAutocomplete label="Search a city" hideLabel icon="search" placeholder={destination ? `${destination.city}, ${destination.country}` : 'Search a city'}
          onSelect={g.selectCity} />
        {tripCities.length > 0 && (
          <div className="c-chip-row explore-chips" role="group" aria-label="Your trips">
            {tripCities.map(t => (
              <Chip key={t.id} icon="trips" selected={destination?.city === t.destination_city} onClick={() => g.selectTrip(t)}>{t.destination_city}</Chip>
            ))}
          </div>
        )}
      </ScreenHeader>

      <HonkCard onMood={(id) => { setHonkMood(id); setMode('honk') }} />

      {!destination && (
        <EmptyState goose="worried" title="Where to?">Search any city above. Your next trip's city loads here on its own.</EmptyState>
      )}

      {g.excluded && (
        <EmptyState goose="worried" title="Guide unavailable">Goose doesn't write guides for this destination right now.</EmptyState>
      )}

      {destination && !g.excluded && (
        <Section title={`${destination.city} guide`} action={<Text variant="micro" tone="muted">{destination.country}</Text>}>
          {overviewLoading && <Loading title={`Goose is reading up on ${destination.city}`}>{loadingCopy}</Loading>}
          {overviewFailed && (
            <ErrorState onRetry={g.retry} onReport={() => reportGuide(destination.city)}>The guide took too long to write. Your trips and bookings are fine.</ErrorState>
          )}
          {!overviewFailed && (
            <div className="grid-2">
              {GUIDE_SECTIONS.map(s => {
                const busy = TAB_SECTIONS[s.id].some(k => loadingSections[k])
                const line = teaser(s.id, g.guideData, g.sections)
                return (
                  <Card key={s.id} variant="tile" onClick={() => openSection(s.id)} className="explore-tile">
                    <IconTile icon={s.icon} tone="accent" />
                    <Text variant="body" weight={600} as="span">{s.label}</Text>
                    <Text variant="micro" tone="muted" as="span" className="explore-tile__line">{busy ? 'Goose is writing this' : line || s.blurb}</Text>
                  </Card>
                )
              })}
              <Card variant="tile" className="explore-tile explore-tile--hint" as="div">
                <Icon name="sparkles" size={24} className="tone-accent" />
                <Text variant="micro" tone="muted" as="span">Goose writes every section in the background as soon as you pick a city, then saves it for everyone.</Text>
              </Card>
            </div>
          )}
          {Object.keys(g.sections).length > 0 && <AiDisclosure city={destination.city} />}
        </Section>
      )}
    </Screen>
  )
}
