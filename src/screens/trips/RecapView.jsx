import { useEffect, useState } from 'react'
import { useTripsStore, useUIStore, useAuthStore } from '../../store'
import { formatRange, nightsOf, plural } from '../../lib/trips'
import { tripCoords, fetchTripHistory } from '../../lib/weather'
import { BADGE_TIER_TONE } from '../../lib/tokens'
import { badgesEarnedOn } from '../../lib/shareCard'
import ShareCardSheet from './ShareCardSheet'
import { Screen, ScreenHeader, Section, Card, ListRow, Button, IconTile, Text, Stack, Icon } from '../../ui'

function Stat({ value, label }) {
  return (
    <Card variant="tile" className="recap-stat">
      <Text variant="stat" as="p">{value}</Text>
      <Text variant="caption" tone="muted" as="p">{label}</Text>
    </Card>
  )
}

/** Past trip: a look back, not an edit screen. */
export default function RecapView({ trip, onBack }) {
  const setActiveTrip = useTripsStore(s => s.setActiveTrip)
  const openTripForm = useUIStore(s => s.openTripForm)
  const badges = useAuthStore(s => s.badges)
  const tempUnit = useAuthStore(s => (s.profile?.temp_unit === 'F' ? 'fahrenheit' : 'celsius'))
  const [history, setHistory] = useState(undefined) // undefined = loading, null = none
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    let alive = true
    tripCoords(trip)
      .then(c => c && fetchTripHistory(c.lat, c.lon, trip.start_date, trip.end_date, tempUnit))
      .then(h => { if (alive) setHistory(h) })
    return () => { alive = false }
  }, [trip.id, tempUnit])

  const bookings = trip.bookings || []
  const flights = bookings.filter(b => b.type === 'flight').length
  const plans = trip.trip_activities || []
  const people = (trip.trip_collaborators?.filter(c => c.status === 'accepted').length || 0)
  const earned = badgesEarnedOn(trip, badges)

  const goAgain = () => openTripForm({
    title: trip.title, destination_city: trip.destination_city,
    destination_country: trip.destination_country, destination_country_code: trip.destination_country_code,
  })

  return (
    <Screen gap={4} labelledBy="recap-title">
      <ScreenHeader onBack={onBack} backLabel="Back to trips" titleId="recap-title"
        overline={trip.status === 'cancelled' ? 'Cancelled' : 'Completed'}
        title={trip.title}
        meta={[formatRange(trip.start_date, trip.end_date, { year: true }), trip.destination_country, people ? `with ${plural(people, 'traveler')}` : null].filter(Boolean).join(' · ')} />

      <div className="grid-3">
        <Stat value={nightsOf(trip)} label={nightsOf(trip) === 1 ? 'night' : 'nights'} />
        <Stat value={flights} label={flights === 1 ? 'flight' : 'flights'} />
        <Stat value={bookings.length} label={bookings.length === 1 ? 'booking' : 'bookings'} />
      </div>

      <div className="grid-2">
        <Card variant="raised" className="recap-tile">
          <Text variant="micro" tone="muted" as="p">Weather was</Text>
          <Stack row gap={2}>
            <Icon name={history?.rainyDays > 2 ? 'rain' : 'cloud-sun'} size={24} className="tone-info" />
            <Text variant="title" as="p">{history ? `${history.avg}° avg` : '–'}</Text>
          </Stack>
          <Text variant="micro" tone="muted" as="p">{history ? (history.rainyDays ? plural(history.rainyDays, 'rainy day') : 'No rain to speak of') : history === undefined ? 'Looking it up' : 'No weather record'}</Text>
        </Card>
        {plans.length ? (
          <Card className="recap-tile">
            <Text variant="micro" tone="muted" as="p">Plans ticked off</Text>
            <Text variant="title" as="p">{plans.filter(p => p.is_completed).length} of {plans.length}</Text>
            <Text variant="micro" tone="muted" as="p">From your trip plan</Text>
          </Card>
        ) : (
          <Card className="recap-tile">
            <Text variant="micro" tone="muted" as="p">Tables booked</Text>
            <Text variant="title" as="p">{bookings.filter(b => b.type === 'restaurant').length}</Text>
            <Text variant="micro" tone="muted" as="p">Restaurant reservations</Text>
          </Card>
        )}
      </div>

      {earned.length > 0 && (
        <Section title="Badges earned">
          <div className="recap-badges">
            {earned.map(b => (
              <Card key={b.id} variant="tile" className="recap-badge">
                <IconTile icon={b.icon} tone={BADGE_TIER_TONE[b.tier] || 'accent'} size="md" />
                <Text variant="caption" weight={600} align="center" as="p">{b.name}</Text>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Card variant="group">
        <ListRow icon="list" tone="neutral" title={`All ${plural(bookings.length, 'booking')}`} meta="Times, places and confirmation numbers" chevron onClick={() => setActiveTrip(trip)} />
      </Card>

      <Stack gap={2}>
        <Button variant="primary" size="lg" block icon="share" onClick={() => setSharing(true)}>Share trip</Button>
        <Button variant="ghost" block icon="refresh" onClick={goAgain}>Go back again</Button>
      </Stack>
      {sharing && <ShareCardSheet trip={trip} onClose={() => setSharing(false)} />}
    </Screen>
  )
}
