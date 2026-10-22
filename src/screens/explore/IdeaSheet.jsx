import { useState } from 'react'
import { lookupZone } from '../../lib/zoneLookup'
import { format } from 'date-fns'
import { useTripsStore, useIdeasStore } from '../../store'
import { parseLocalDate } from '../../lib/dates'
import { formatRange } from '../../lib/trips'
import { Sheet, Card, ListRow, Field, Button, Banner, Text, Stack } from '../../ui'
import BookingFormSheet from '../trips/detail/BookingFormSheet'
import { warmGuide } from '../../store/guideStore'

/**
 * Shortlist a guide / HONK place on the trip to its city, or act on one already shortlisted.
 * mode: 'start' (no trip for this city yet: start one and save the idea) | 'idea' (confirm a visit or remove) | 'booked'
 */
export default function IdeaSheet({ item, kind, destination, trip, status, onClose, onSaved }) {
  const { createTrip, createBooking } = useTripsStore()
  const { addIdea, removeIdea, markBooked } = useIdeasStore()
  const [dates, setDates] = useState({ start: '', end: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null) // { local_tz } once the place's zone is known
  const mode = !trip ? 'start' : status?.state === 'booked' ? 'booked' : 'idea'

  const run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e?.message || 'Something went wrong. Check your connection.') } finally { setBusy(false) }
  }

  const startTrip = () => run(async () => {
    // The trip's zone drives its day counts and every booking time: look it up before creating it
    const destination_tz = await lookupZone({ query: `${destination.city}, ${destination.country}` })
    const t = await createTrip({
      destination_tz,
      title: destination.city,
      destination_city: destination.city,
      destination_country: destination.country,
      destination_country_code: destination.country_code,
      start_date: dates.start,
      end_date: dates.end || dates.start,
    })
    await addIdea(t.id, item, kind)
    warmGuide(destination.city, destination.country, destination.country_code)
    onSaved?.(`Saved to your new ${destination.city} trip`)
    onClose()
  })

  // "Confirm a visit": the booking form, filled in with the place; the booking then replaces the idea
  // Times on the visit are local to the place: start the form in its zone (by coordinates), else the trip's
  const confirm = async () => {
    const tz = item.lat != null ? await lookupZone({ lat: item.lat, lng: item.lng }) : null
    setConfirming({ local_tz: tz || trip.destination_tz || undefined })
  }

  if (confirming && trip) {
    const type = kind === 'restaurant' ? 'restaurant' : 'activity'
    return (
      <BookingFormSheet tripId={trip.id} trip={trip} type={type}
        initial={{
          title: kind === 'restaurant' ? `Dinner at ${item.name}` : item.name,
          venue_name: item.name, venue_address: item.address || '',
          place_id: item.place_id || null, place_lat: item.lat ?? null, place_lng: item.lng ?? null,
          ...(confirming.local_tz ? { local_tz: confirming.local_tz } : {}),
        }}
        onClose={onClose}
        onCreate={async (tripId, data) => {
          const booking = await createBooking(tripId, data)
          await markBooked(trip.id, booking, status?.idea?.id)
          onSaved?.(`Visit to ${item.name} added to your trip`)
        }} />
    )
  }

  return (
    <Sheet title={mode === 'start' ? `Start a trip to ${destination.city}` : item.name}
      subtitle={mode === 'start' ? `Save ${item.name} to it` : `${trip.title} · ${formatRange(trip.start_date, trip.end_date)}`} onClose={onClose}>
      {error && <Banner tone="danger" icon="alert-circle" title="Couldn't save it" role="alert">{error}</Banner>}

      {mode === 'start' && (
        <Stack gap={4}>
          <Text variant="body" tone="secondary">No trip to {destination.city} yet. Add dates and Goose starts one with this place on its shortlist.</Text>
          <div className="grid-2">
            <Field label="Depart" type="date" value={dates.start} onChange={e => setDates(d => ({ ...d, start: e.target.value }))} />
            <Field label="Return" type="date" value={dates.end} min={dates.start} onChange={e => setDates(d => ({ ...d, end: e.target.value }))} />
          </div>
          <Button variant="primary" size="lg" block icon="plus" loading={busy} disabled={!dates.start} onClick={startTrip}>
            {busy ? 'Starting trip' : 'Start trip and save'}
          </Button>
        </Stack>
      )}

      {mode === 'idea' && (
        <Card variant="group">
          <ListRow icon="calendar" tone="accent" title="Confirm a visit" meta="Add the date, time and confirmation number" chevron
            onClick={confirm} />
          <ListRow icon="trash" tone="neutral" title="Remove from trip ideas" danger
            onClick={() => run(async () => { await removeIdea(trip.id, status.idea.id); onClose() })} />
        </Card>
      )}

      {mode === 'booked' && (
        <Card>
          <ListRow as="div" icon="check" tone="success" title="Booked"
            meta={[status.booking.activity_date && format(parseLocalDate(status.booking.activity_date), 'EEE, MMM d'),
              status.booking.activity_time?.slice(0, 5)].filter(Boolean).join(' · ') || 'On your trip plan'} />
        </Card>
      )}
    </Sheet>
  )
}
