import { useState, useEffect } from 'react'
import { useTripsStore } from '../../store'
import { Sheet, Card, ListRow, Banner, Text, Stack } from '../../ui'
import TripPickerSheet from './TripPickerSheet'
import { formatRange, tripDates, plural } from '../../lib/trips'
import { rankTrips } from '../../../supabase/functions/_shared/tripMatch.js'
import { editableTrips, withCoords } from '../../lib/tripPick'
import { reverseGeocode, geocode } from '../../lib/places'
import { lookupZone } from '../../lib/zoneLookup'

/** Where a booking is: its place, else the airport or station it arrives at, else its address. */
async function bookingPlace(b) {
  if (b.place_lat != null && b.place_lng != null) {
    const r = await reverseGeocode(b.place_lat, b.place_lng).catch(() => null)
    return { lat: Number(b.place_lat), lng: Number(b.place_lng), city: r?.city || null, country: r?.country || '', country_code: r?.country_code || null }
  }
  const q = b.arrival_airport ? `${b.arrival_airport}${b.type === 'flight' ? ' airport' : ''}` : b.hotel_address || b.venue_address
  const g = q ? await geocode(q).catch(() => null) : null
  return g ? { lat: g.lat, lng: g.lng, city: g.city || null, country: g.country || '', country_code: g.country_code || null } : null
}

/**
 * A booking that falls well outside its trip's dates: extend the trip, move the booking to the trip it fits
 * (or a new one), or keep the dates. Opened by tripsStore.fillDatesIfUndated (datePrompt); mounted once in App.
 */
export default function OutsideDatesSheet() {
  const prompt = useTripsStore(s => s.datePrompt)
  const { trips, updateTrip, moveBookings, createTrip, clearDatePrompt, fetchTrips } = useTripsStore()
  const [picking, setPicking] = useState(null) // { ranked, place }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const trip = prompt && trips.find(t => t.id === prompt.tripId)
  useEffect(() => { if (prompt && !trip) clearDatePrompt() }, [prompt, trip]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!prompt || !trip) return null

  const close = () => { setPicking(null); setError(null); setBusy(false); clearDatePrompt() }
  const n = prompt.bookings.length
  const what = n === 1 ? (prompt.bookings[0].title || 'This booking') : `${n} bookings`
  const when = formatRange(prompt.span.start, prompt.span.end)

  const extend = async () => {
    setBusy(true); setError(null)
    try { await updateTrip(trip.id, prompt.widen); close() }
    catch (e) { setError(e.message || 'Check your connection.'); setBusy(false) }
  }
  const openPicker = async () => {
    setBusy(true)
    const place = await bookingPlace(prompt.bookings[0])
    const others = (await withCoords(editableTrips(trips).filter(t => t.id !== trip.id)))
      .map(t => ({ ...t, points: (t.trip_stops || []).map(s => ({ lat: s.lat, lng: s.lng })) }))
    const ranked = rankTrips(others, { start: prompt.span.start, end: prompt.span.end, points: place ? [place] : [] })
    setPicking({ ranked, place }); setBusy(false)
  }
  const moveTo = async (to) => { await moveBookings(prompt.bookings, to.id); fetchTrips() }
  const startTrip = async (title) => {
    const p = picking.place
    const destination_city = p?.city || trip.destination_city
    const created = await createTrip({
      title,
      destination_city,
      destination_country: p?.city ? p.country : trip.destination_country,
      destination_country_code: p?.city ? p.country_code : trip.destination_country_code,
      destination_lat: p?.lat ?? null, destination_lng: p?.lng ?? null,
      destination_tz: p ? await lookupZone({ lat: p.lat, lng: p.lng }) : trip.destination_tz,
      start_date: prompt.span.start, end_date: prompt.span.end,
    }, { via: 'outside_dates' })
    await moveTo(created)
  }

  if (picking) {
    return (
      <TripPickerSheet title="Move to" subtitle={`${what} · ${when}`} ranked={picking.ranked} city={picking.place?.city}
        newHint={`Dated ${when}, from this ${n === 1 ? 'booking' : 'import'}.`}
        submitLabel="Create trip and move" onPick={moveTo} onCreate={startTrip} onClose={close} />
    )
  }

  return (
    <Sheet title="Outside your trip dates" subtitle={`${trip.title} · ${tripDates(trip)}`} onClose={close}>
      <Stack gap={4}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Text>{what} {n === 1 ? 'is' : 'are'} on {when}, outside this trip.</Text>
        <Card variant="group">
          <ListRow icon="calendar" title={`Extend trip to ${formatRange(prompt.widen.start_date, prompt.widen.end_date)}`}
            meta={`Adds ${plural(Math.max(1, nightsAdded(trip, prompt.widen)), 'day')}`} onClick={busy ? undefined : extend} />
          <ListRow icon="trips" tone="neutral" title="Move to another trip" meta="Or start a new one" chevron onClick={busy ? undefined : openPicker} />
          <ListRow icon="close" tone="neutral" title="Keep trip dates" meta="The booking stays, the dates don't change" onClick={close} />
        </Card>
      </Stack>
    </Sheet>
  )
}

function nightsAdded(trip, widen) {
  const d = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
  return d(widen.start_date, trip.start_date) + d(trip.end_date, widen.end_date)
}
