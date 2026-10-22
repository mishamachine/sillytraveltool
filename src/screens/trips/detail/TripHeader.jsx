import { useEffect, useState } from 'react'
import { useTripsStore, useUIStore } from '../../../store'
import { timeIn } from '../../../lib/localTime'
import { useTripZone } from '../useTripZone'
import { PlacePhoto } from '../../../components/shared/PlaceMedia'
import { tripPhase, tripDay, nightsOf, plural, tripDates, isUndated } from '../../../lib/trips'
import { daysBetween, todayAtTrip } from '../../../lib/dates'
import { ScreenHeader, IconButton, Button, Sheet, Card, ListRow, Text, Stack, Chip } from '../../../ui'
import TravelersSheet from './TravelersSheet'

// LIVE CLOCK — local time at the destination (trip.destination_tz)
function useLocalTime(timezone) {
  const [time, setTime] = useState('')
  useEffect(() => {
    if (!timezone) return
    const tick = () => setTime(timeIn(Date.now(), timezone))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [timezone])
  return timezone ? time : null
}

function travelersLabel(trip) {
  const others = (trip.trip_collaborators || []).filter(c => c.role !== 'owner')
  const accepted = others.filter(c => c.status === 'accepted').length
  if (accepted) return String(accepted + 1)
  if (others.some(c => c.status === 'pending')) return 'Invited'
  return 'Share'
}

export default function TripHeader({ trip, readOnly }) {
  const setActiveTrip = useTripsStore(s => s.setActiveTrip)
  const openTripForm = useUIStore(s => s.openTripForm)
  const [showTravelers, setShowTravelers] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const localTime = useLocalTime(useTripZone(trip))

  const phase = tripPhase(trip)
  const { n, total } = tripDay(trip)
  const undated = isUndated(trip)
  const away = undated ? null : daysBetween(todayAtTrip(trip), trip.start_date)
  const status = phase === 'active' ? `Day ${n} of ${total}`
    : phase === 'cancelled' ? 'Cancelled'
    : undated ? 'Planning'
    : phase === 'upcoming' ? (away === 1 ? 'Tomorrow' : `In ${plural(away, 'day')}`)
    : 'Completed'
  const nights = nightsOf(trip)
  const meta = [tripDates(trip), nights != null ? plural(nights, 'night') : null, trip.destination_country].filter(Boolean).join(' · ')

  return (
    <>
      <div className="detail-bar">
        <IconButton icon="chevron-left" label="Back to trips" onClick={() => setActiveTrip(null)} />
        <Stack row gap={2}>
          <Button size="sm" variant="secondary" icon="users" onClick={() => setShowTravelers(true)}
            aria-label={`Travelers: ${travelersLabel(trip)}`}>{travelersLabel(trip)}</Button>
          <IconButton icon="more" label="Trip options" onClick={() => setShowMenu(true)} />
        </Stack>
      </div>
      <ScreenHeader titleId="detail-title" title={trip.title} meta={meta}>
        <Stack row gap={2} wrap className="detail-status">
          <Chip tone={phase === 'active' ? 'accent' : phase === 'upcoming' ? 'info' : phase === 'past' ? 'success' : 'neutral'}
            icon={phase === 'past' ? 'check' : undefined}>{status}</Chip>
          {localTime && <Text variant="micro" tone="muted" as="span">{localTime} in {trip.destination_city}</Text>}
          {undated && !readOnly && !trip._isShared && (
            <Chip icon="calendar" onClick={() => openTripForm(trip)}>Add dates</Chip>
          )}
        </Stack>
      </ScreenHeader>
      {trip.cover_photo && <PlacePhoto name={trip.cover_photo} w={900} className="detail-cover" />}

      {showMenu && (
        <Sheet title="Trip options" onClose={() => setShowMenu(false)}>
          <Card variant="group">
            {!trip._isShared && (
              <ListRow icon="edit" tone="neutral" title="Edit trip" meta={readOnly ? 'Dates, name and notes' : 'Dates, name, notes or delete'} chevron
                onClick={() => { setShowMenu(false); openTripForm(trip) }} />
            )}
            <ListRow icon="user-plus" tone="accent" title="Invite travelers" meta="They get an email from Goose" chevron
              onClick={() => { setShowMenu(false); setShowTravelers(true) }} />
            <ListRow icon="arrow-left" tone="neutral" title="Back to trips" chevron onClick={() => { setShowMenu(false); setActiveTrip(null) }} />
          </Card>
        </Sheet>
      )}
      {showTravelers && <TravelersSheet trip={trip} onClose={() => setShowTravelers(false)} />}
    </>
  )
}
