import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useTripsStore, useUIStore, useCollabStore, useAuthStore } from '../../store'
import { parseLocalDate, daysBetween } from '../../lib/dates'
import { fetchWithTimeout } from '../../lib/http'
import { tripPhase, tripDay, nightsLabel, plural, sortByStart, bookingStart, bookingTime, hasClockTime, tripToday, tripDates, isUndated, compareTripStart } from '../../lib/trips'
import { tripCoords } from '../../lib/weather'
import { tripPlace, routeCities } from '../../lib/stops'
import {
  Screen, ScreenHeader, Section, Button, IconButton, Card, ListRow, Chip, Text, Overline, Stack, Icon,
  ProgressBar, EmptyState, Skeleton, Banner,
} from '../../ui'
import InboxHint, { useCopyInbox, InboxAddress } from './InboxHint'

// Fetch climate normals from Open-Meteo (free, no API key)
// The archive API has no monthly aggregates, so average the daily highs and lows of the trip's months
async function fetchClimateForecast(lat, lon, startDate, endDate, unit = 'celsius') {
  try {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)
    // Collect unique months covered by the trip (1-12)
    const months = new Set()
    const d = new Date(start)
    while (d <= end) { months.add(d.getMonth()); d.setMonth(d.getMonth() + 1) }
    months.add(end.getMonth())

    // The last two complete years (the archive lags by a few days)
    const lastYear = new Date().getFullYear() - 1
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${lastYear - 1}-01-01&end_date=${lastYear}-12-31&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${unit}&timezone=auto`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json()
    const times = data.daily?.time || []
    const highs = data.daily?.temperature_2m_max || []
    const lows  = data.daily?.temperature_2m_min || []

    const matchingHighs = [], matchingLows = []
    times.forEach((dateStr, i) => {
      const m = parseInt(dateStr.slice(5, 7), 10) - 1 // 0-indexed
      if (months.has(m)) {
        if (highs[i] != null) matchingHighs.push(highs[i])
        if (lows[i] != null) matchingLows.push(lows[i])
      }
    })
    if (!matchingHighs.length) return null
    const avgHigh = Math.round(matchingHighs.reduce((a, b) => a + b, 0) / matchingHighs.length)
    const avgLow  = Math.round(matchingLows.reduce((a, b) => a + b, 0) / matchingLows.length)
    return { avgLow, avgHigh }
  } catch { return null }
}

function travelersOf(trip) {
  const accepted = trip.trip_collaborators?.filter(c => c.status === 'accepted').length || 0
  return accepted ? accepted + 1 : 1
}

/** Dark hero for the trip in progress; opens the Today view. */
function OnTheRoadCard({ trip, onOpen }) {
  const { n, total } = tripDay(trip)
  const now = new Date()
  const tz = trip.destination_tz
  const soon = sortByStart(trip.bookings || [], tz).filter(b => bookingStart(b, tz) > now)
  const next = soon.find(hasClockTime) || soon[0]
  return (
    <Card variant="inverse" onClick={onOpen} aria-label={`${trip.title}, on the road, day ${n} of ${total}. Open today`}>
      <Stack row justify="between">
        <Stack row gap={2}>
          <span className="trips-live-dot" aria-hidden="true" />
          <Overline tone="accent-on-inverse">On the road · Day {n} of {total}</Overline>
        </Stack>
        <Icon name="arrow-right" size={20} className="tone-inverse-muted" />
      </Stack>
      <Stack gap={1}>
        <Text variant="h2" tone="inverse" as="h3">{tripPlace(trip).label || trip.destination_country || trip.destination_city}</Text>
        <Text variant="body" tone="inverse-muted">{trip.title} · {tripDates(trip)}</Text>
      </Stack>
      <ProgressBar value={n / total} inverse label={`Day ${n} of ${total}`} />
      {next && <Text variant="caption" tone="inverse-muted">Next: {next.title}{hasClockTime(next) ? ` at ${bookingTime(next, tz)}` : ''}</Text>}
    </Card>
  )
}

function DateTile({ iso, tone = 'info' }) {
  const d = parseLocalDate(iso)
  if (!d) {
    // Undated trip: a calendar icon instead of a date
    return <span className={`trips-date c-tile c-tile--lg c-tile--${tone}`} aria-hidden="true"><Icon name="calendar" size={24} /></span>
  }
  return (
    <span className={`trips-date c-tile c-tile--lg c-tile--${tone}`} aria-hidden="true">
      <span className="trips-date__month">{format(d, 'MMM')}</span>
      <span className="trips-date__day">{format(d, 'd')}</span>
    </span>
  )
}

function UpcomingCard({ trip, climate, onOpen, live = false }) {
  const undated = isUndated(trip)
  const days = undated ? null : daysBetween(tripToday(trip), trip.start_date)
  const count = trip.bookings?.length || 0
  const stops = routeCities(trip.trip_stops || []).filter(s => s.kind === 'stay').length
  const meta = [tripDates(trip), nightsLabel(trip), stops > 1 ? plural(stops, 'stop') : count ? plural(count, 'booking') : null,
    climate ? `${climate.avgLow}–${climate.avgHigh}°` : null].filter(Boolean).join(' · ')
  const people = travelersOf(trip)
  const day = live ? tripDay(trip) : null
  const chip = live ? (day.total > 1 ? `Day ${day.n} of ${day.total}` : 'Today')
    : trip.status === 'cancelled' ? 'Cancelled' : undated ? 'Planning' : days === 1 ? 'Tomorrow' : `In ${plural(days, 'day')}`
  return (
    <Card onClick={() => onOpen(trip)} className="trips-upcoming">
      <Stack row gap={3} align="center">
        <DateTile iso={trip.start_date} tone={live ? 'accent' : 'info'} />
        <Stack gap={1} grow>
          <Text variant="card-title" as="h3" truncate>{trip.title}</Text>
          <Text variant="caption" tone="muted">{meta}</Text>
          {(trip._isShared || people > 1) && (
            <Text variant="micro" tone="muted" className="trips-people">
              <Icon name="users" size={14} />{trip._isShared ? 'Shared with you' : plural(people, 'traveler')}
            </Text>
          )}
        </Stack>
        <Chip tone={live ? 'accent' : trip.status === 'cancelled' ? 'neutral' : 'info'}>{chip}</Chip>
      </Stack>
    </Card>
  )
}

function InviteRow({ invite, onRespond }) {
  const t = invite.trips
  return (
    <Card variant="raised">
      <ListRow as="div" icon="user-plus" tone="accent" title={t?.title || 'Trip invite'} meta={[t?.destination_city, t?.destination_country].filter(Boolean).join(' · ')} />
      <Stack row gap={2}>
        <Button className="grow" onClick={() => onRespond(invite.id, false)}>Decline</Button>
        <Button className="grow" variant="primary" onClick={() => onRespond(invite.id, true)}>Join trip</Button>
      </Stack>
    </Card>
  )
}

export default function TripList({ onOpenToday, onOpenRecap, onImport }) {
  const { trips, loading, setActiveTrip } = useTripsStore()
  const openTripForm = useUIStore(s => s.openTripForm)
  const { pendingInvites, respondToInvite } = useCollabStore()
  const { address, copied, copy } = useCopyInbox()
  const [climateMap, setClimateMap] = useState({})
  const tempUnit = useAuthStore(s => (s.profile?.temp_unit === 'F' ? 'fahrenheit' : 'celsius'))
  const climateKey = trip => `${trip.id}:${tempUnit}`

  // Climate normals for upcoming trips, once per trip and temperature unit
  useEffect(() => {
    const relevant = trips.filter(t => tripPhase(t) === 'upcoming' && t.destination_city && t.start_date && !(climateKey(t) in climateMap))
    if (!relevant.length) return
    Promise.all(relevant.map(async (trip) => {
      const c = await tripCoords(trip)
      return [climateKey(trip), c ? await fetchClimateForecast(c.lat, c.lon, trip.start_date, trip.end_date, tempUnit) : null]
    })).then(results => setClimateMap(prev => ({ ...prev, ...Object.fromEntries(results) })))
  }, [trips.length, tempUnit]) // re-run only when trip count or unit changes

  const byStart = [...trips].sort(compareTripStart)
  const active = byStart.filter(t => tripPhase(t) === 'active')
  const upcoming = byStart.filter(t => ['upcoming', 'cancelled'].includes(tripPhase(t)) && !(tripPhase(t) === 'cancelled' && t.end_date < tripToday(t)))
  const past = byStart.filter(t => tripPhase(t) === 'past').reverse()
  const empty = !loading && trips.length === 0

  return (
    <Screen gap={4} labelledBy="trips-title">
      <ScreenHeader
        title="Trips"
        titleId="trips-title"
        actions={!empty && (
          <>
            <IconButton icon="clipboard" label="Paste a booking confirmation" onClick={onImport} />
            <Button variant="primary" size="sm" icon="plus" onClick={() => openTripForm()}>New trip</Button>
          </>
        )}
      />

      {pendingInvites.length > 0 && (
        <Section title="Invites">
          {pendingInvites.map(invite => <InviteRow key={invite.id} invite={invite} onRespond={respondToInvite} />)}
        </Section>
      )}

      {loading && trips.length === 0 && (
        <Stack gap={3} aria-busy="true" aria-label="Loading trips">
          {[1, 2, 3].map(i => <Card key={i}><Skeleton lines={2} /></Card>)}
        </Stack>
      )}

      {empty && (
        <>
          <EmptyState goose="worried" title="Goose is getting restless"
            action={<Button variant="primary" size="lg" block icon="plus" onClick={() => openTripForm()}>Plan a trip</Button>}>
            No trips yet. Start one, or forward a booking and Goose will build it for you.
          </EmptyState>
          {address && (
            <Banner variant="card" icon="mail" title="Already booked something?">
              <Stack gap={2} align="start">
                <span>Forward it to your Goose inbox:</span>
                <span className="trips-address"><InboxAddress address={address} /></span>
                <Button size="sm" variant="secondary" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy address'}</Button>
              </Stack>
            </Banner>
          )}
          <Button variant="ghost" icon="clipboard" onClick={onImport}>Paste a confirmation instead</Button>
        </>
      )}

      {/* One trip in progress gets the hero; several (overlapping or imported day trips) share a compact list */}
      {active.length === 1 && <OnTheRoadCard trip={active[0]} onOpen={() => onOpenToday(active[0])} />}
      {active.length > 1 && (
        <Section title="On the road">
          {active.map(trip => <UpcomingCard key={trip.id} trip={trip} live onOpen={onOpenToday} />)}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map(trip => <UpcomingCard key={trip.id} trip={trip} climate={climateMap[climateKey(trip)]} onOpen={setActiveTrip} />)}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past">
          <Card variant="group">
            {past.map(trip => (
              <ListRow key={trip.id} onClick={() => onOpenRecap(trip)}
                leading={<span className="c-tile c-tile--md c-tile--neutral"><Icon name="flag" /></span>}
                title={trip.title}
                meta={[tripDates(trip, { year: true }), nightsLabel(trip)].filter(Boolean).join(' · ')}
                trailing={<span className="t-caption tone-accent w-600">Recap</span>} />
            ))}
          </Card>
        </Section>
      )}

      {!empty && <InboxHint />}
    </Screen>
  )
}
