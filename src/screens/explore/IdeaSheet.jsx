import { useState } from 'react'
import { format } from 'date-fns'
import { useTripsStore, useIdeasStore } from '../../store'
import { parseLocalDate } from '../../lib/dates'
import { tripDates } from '../../lib/trips'
import { lookupZone } from '../../lib/zoneLookup'
import { Sheet, Card, ListRow, Banner } from '../../ui'
import BookingFormSheet from '../trips/detail/BookingFormSheet'

/**
 * A place already on the trip for its city: shortlisted (confirm a visit, or remove) or booked.
 * Saving a new place is one tap and never opens this sheet (see saveIdea).
 */
export default function IdeaSheet({ item, kind, trip, status, onClose, onSaved }) {
  const createBooking = useTripsStore(s => s.createBooking)
  const { removeIdea, markBooked } = useIdeasStore()
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null) // { local_tz } once the place's zone is known

  // Times on the visit are local to the place: start the form in its zone (by coordinates), else the trip's
  const confirm = async () => {
    const tz = item.lat != null ? await lookupZone({ lat: item.lat, lng: item.lng }) : null
    setConfirming({ local_tz: tz || trip.destination_tz || undefined })
  }

  if (confirming) {
    return (
      <BookingFormSheet tripId={trip.id} trip={trip} type={kind === 'restaurant' ? 'restaurant' : 'activity'}
        initial={{
          title: kind === 'restaurant' ? `Dinner at ${item.name}` : item.name,
          venue_name: item.name, venue_address: item.address || '',
          place_id: item.place_id || null, place_lat: item.lat ?? null, place_lng: item.lng ?? null,
          ...(confirming.local_tz ? { local_tz: confirming.local_tz } : {}),
        }}
        onClose={onClose}
        onCreate={async (tripId, data) => {
          const booking = await createBooking(tripId, data, { via: 'idea' })
          await markBooked(trip.id, booking, status?.idea?.id)
          onSaved?.(`Visit to ${item.name} added to your trip`)
        }} />
    )
  }

  const b = status?.booking
  return (
    <Sheet title={item.name} subtitle={`${trip.title} · ${tripDates(trip)}`} onClose={onClose}>
      {error && <Banner tone="danger" icon="alert-circle" title="Couldn't change it" role="alert">{error}</Banner>}
      {status?.state === 'booked' ? (
        <Card>
          <ListRow as="div" icon="check" tone="success" title="Booked"
            meta={[b.activity_date && format(parseLocalDate(b.activity_date), 'EEE, MMM d'), b.activity_time?.slice(0, 5)].filter(Boolean).join(' · ') || 'On your trip plan'} />
        </Card>
      ) : (
        <Card variant="group">
          <ListRow icon="calendar" tone="accent" title="Confirm a visit" meta="Add the date and time" chevron onClick={confirm} />
          <ListRow icon="trash" tone="neutral" title="Remove from trip ideas" danger
            onClick={async () => {
              try { await removeIdea(trip.id, status.idea.id); onClose() } catch (e) { setError(e?.message || 'Check your connection.') }
            }} />
        </Card>
      )}
    </Sheet>
  )
}
