import { useState } from 'react'
import { format } from 'date-fns'
import { useTripsStore } from '../../store'
import { parseLocalDate } from '../../lib/dates'
import { parseBookingEmail } from '../../lib/gemini'
import { geocode } from '../../lib/places'
import { track } from '../../lib/analytics'
import { formatRange, bookingKind, bookingMeta } from '../../lib/trips'
import { dateTimeIn, zoneName, isValidZone } from '../../lib/localTime'
import { Sheet, Field, Button, Banner, Card, ListRow, Text, Stack, Loading, EmptyState, category } from '../../ui'

// ── Client-side trip matcher ──────────────────────────────
// Requires BOTH city match AND date range overlap. No match → null (→ "Create New Trip").
function matchTrip(trips, ultimateDestination, bookings) {
  if (!trips?.length) return null

  const allBookings = Array.isArray(bookings) ? bookings : [bookings]
  const departureDates = allBookings
    .map(b => b.departure_time || b.check_in_date || b.activity_date)
    .filter(Boolean)
    .map(d => parseLocalDate(d))
    .filter(d => !isNaN(d.getTime()))
  const arrivalDates = allBookings
    .map(b => b.arrival_time || b.check_out_date)
    .filter(Boolean)
    .map(d => parseLocalDate(d))
    .filter(d => !isNaN(d.getTime()))

  const bookingStart = departureDates.length ? new Date(Math.min(...departureDates)) : null
  const bookingEnd   = arrivalDates.length   ? new Date(Math.max(...arrivalDates))   : bookingStart
  const destCity = (ultimateDestination?.city || '').toLowerCase().trim()

  for (const trip of trips.filter(t => t.status !== 'cancelled')) {
    const tripCity = (trip.destination_city || '').toLowerCase().trim()
    const cityWords = tripCity.split(/\s+/).filter(w => w.length >= 3)
    const cityMatch = destCity && tripCity && (
      destCity.includes(tripCity) || tripCity.includes(destCity) ||
      cityWords.some(w => destCity.includes(w))
    )
    if (!cityMatch) continue

    if (bookingStart) {
      const tripStart = parseLocalDate(trip.start_date)
      const tripEnd   = parseLocalDate(trip.end_date)
      tripStart.setDate(tripStart.getDate() - 7)
      tripEnd.setDate(tripEnd.getDate() + 7)
      if (!(bookingStart <= tripEnd && (bookingEnd || bookingStart) >= tripStart)) continue
    }

    return trip
  }

  return null // Never auto-select; no confident match
}

// "Wed, Apr 1 · 13:05 · Pacific Time": as printed on the confirmation, in the place's own zone
function previewWhen(b) {
  if (b.departure_time && /T/.test(b.departure_time)) {
    return `${dateTimeIn(b.departure_time, b.departure_tz)}${isValidZone(b.departure_tz) ? ` · ${zoneName(b.departure_tz)}` : ''}`
  }
  const d = b.check_in_date || b.activity_date || (b.departure_time || '').slice(0, 10)
  if (!d) return ''
  return `${format(parseLocalDate(d), 'EEE, MMM d')}${b.activity_time ? ` · ${b.activity_time.slice(0, 5)}` : ''}`
}

const sanitizeBooking = (raw) => {
  // Whitelist: only columns that exist in the bookings table
  const BOOKING_COLS = new Set([
    'type','title','confirmation_number','booking_url','price','currency','notes',
    'flight_number','airline','departure_airport','arrival_airport',
    'departure_time','arrival_time','flight_class',
    'hotel_name','hotel_address','check_in_date','check_out_date','room_type',
    'activity_date','activity_time','venue_name','venue_address','is_shared',
    'passenger_name','seat_number','ticket_quantity','party_size','transport_mode',
    // Local time: the server attaches each place's zone and returns real instants
    'departure_tz','arrival_tz','local_tz','place_id','place_lat','place_lng',
  ])
  const clean = {}
  Object.entries(raw).forEach(([k, v]) => {
    if (!BOOKING_COLS.has(k)) return // drop unknown keys (destination_city, title leg label, etc)
    if (v === '' || v === undefined || v === null) clean[k] = null
    else if ((k === 'departure_time' || k === 'arrival_time') && typeof v === 'string') {
      const d = new Date(v); clean[k] = isNaN(d.getTime()) ? null : d.toISOString()
    } else if (k === 'price') { const p = parseFloat(v); clean[k] = isNaN(p) ? null : p }
    else clean[k] = v
  })
  return { ...clean, source: 'email_import' }
}

/**
 * Paste a confirmation → Goose parses it → match to a trip or create one.
 * `trip` given (from a trip's add sheet): saves straight into that trip.
 */
export default function ImportSheet({ onClose, trips = [], trip: fixedTrip = null, onBookingCreated }) {
  const { createBooking, createTrip } = useTripsStore()

  const [step, setStep] = useState('paste') // paste | preview | pick | create | success
  const [text, setText] = useState('')
  const [parsedBookings, setParsedBookings] = useState([])
  const [ultimateDest, setUltimateDest] = useState(null)   // { city, airport_code }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [matched, setMatched] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [newTripName, setNewTripName] = useState('')
  const [creatingTrip, setCreatingTrip] = useState(false)

  const handleParse = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null)
    try {
      const result = await parseBookingEmail(text)
      // result shape: { bookings: [...], ultimate_destination: { city, airport_code } }
      const bookings = Array.isArray(result.bookings) ? result.bookings : [result]
      const dest = result.ultimate_destination || null
      setParsedBookings(bookings)
      setUltimateDest(dest)
      const match = fixedTrip || matchTrip(trips, dest, bookings)
      setMatched(match)
      setSelectedTripId(match?.id || null)
      setStep('preview')
    } catch (e) {
      track('ai_error', { feature: 'parse_booking' }, 'trips')
      setError(e.message || 'Goose couldn\'t read that. Try again, or add it by hand.')
    }
    finally { setLoading(false) }
  }

  const handleSave = async (tripId) => {
    if (!parsedBookings.length || !tripId) return
    setSaving(true); setError(null)
    try {
      for (const booking of parsedBookings) {
        await createBooking(tripId, sanitizeBooking(booking))
      }
      setStep('success')
      if (onBookingCreated) onBookingCreated()
    } catch (e) { setError(e.message || 'Could not save the booking.') }
    finally { setSaving(false) }
  }

  const fallbackCity = ultimateDest?.city ||
    parsedBookings[parsedBookings.length - 1]?.destination_city ||
    parsedBookings[parsedBookings.length - 1]?.arrival_airport

  const handleCreateTrip = async () => {
    if (!parsedBookings.length) return
    setCreatingTrip(true); setError(null)
    try {
      const city = fallbackCity || parsedBookings[0]?.hotel_name || 'Unknown'

      // Derive date range from all booking legs
      const allDates = parsedBookings.flatMap(b => [
        b.departure_time, b.arrival_time, b.check_in_date, b.check_out_date, b.activity_date
      ]).filter(Boolean).map(d => parseLocalDate(d)).filter(d => !isNaN(d.getTime()))

      const earliest = allDates.length ? new Date(Math.min(...allDates)) : new Date()
      const latest   = allDates.length ? new Date(Math.max(...allDates)) : earliest

      // Best-effort country and coordinates from Google (server-side)
      const geo = await geocode(ultimateDest?.country ? `${city}, ${ultimateDest.country}` : city)

      const newTrip = await createTrip({
        title: newTripName || `Trip to ${city}`,
        destination_city: city,
        destination_country: geo?.country || ultimateDest?.country || '',
        destination_country_code: geo?.country_code || '',
        destination_lat: geo?.lat ?? null,
        destination_lng: geo?.lng ?? null,
        start_date: format(earliest, 'yyyy-MM-dd'),
        end_date: format(latest, 'yyyy-MM-dd'),
        status: 'planning',
        destination_tz: ultimateDest?.tz || null,
      })
      await handleSave(newTrip.id)
    } catch (e) { setError(e.message || 'Could not create the trip.') }
    finally { setCreatingTrip(false) }
  }

  const n = parsedBookings.length
  return (
    <Sheet title={step === 'success' ? 'Filed' : 'Paste a confirmation'} subtitle={fixedTrip ? `Into ${fixedTrip.title}` : undefined} onClose={onClose}>
      {error && <Banner tone="danger" icon="alert-circle" title="That didn't work" role="alert">{error}</Banner>}

      {step === 'paste' && (loading ? (
        <Loading title="Goose is reading your confirmation">Times, places and confirmation numbers, usually under 15 seconds.</Loading>
      ) : (
        <>
          <Text variant="body" tone="secondary">
            Paste a flight, hotel, train, restaurant or ticket confirmation. Goose pulls out the details and files them into the right trip.
          </Text>
          <Field label="Confirmation text" as="textarea" rows={8} value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste the email or booking text here" />
          <Text variant="micro" tone="muted">Read by Goose (AI). Check the details before saving.</Text>
          <Button variant="primary" size="lg" block icon="sparkles" onClick={handleParse} disabled={!text.trim()}>Read it</Button>
        </>
      ))}

      {step === 'preview' && n > 0 && (
        <>
          <Card variant="group">
            {parsedBookings.map((b, i) => {
              const cat = category(bookingKind(b))
              return (
                <ListRow key={i} icon={cat.icon} tone={cat.tone}
                  title={b.title || cat.label}
                  meta={[previewWhen(b), bookingMeta(b)].filter(Boolean).join(' · ')}
                  trailing={n > 1 ? `${i + 1}/${n}` : undefined} />
              )
            })}
          </Card>
          {ultimateDest?.city && (
            <Text variant="caption" tone="muted" align="center">
              Final destination: {ultimateDest.city}{ultimateDest.airport_code ? ` (${ultimateDest.airport_code})` : ''}
            </Text>
          )}

          {matched ? (
            <Card variant="raised">
              <Stack gap={1}>
                <Text variant="overline" tone="accent" as="p">{fixedTrip ? 'Adding to' : 'Matched to'}</Text>
                <Text variant="card-title">{matched.title}</Text>
                <Text variant="caption" tone="muted">{matched.destination_city} · {formatRange(matched.start_date, matched.end_date, { year: true })}</Text>
              </Stack>
              <Stack row gap={2}>
                {!fixedTrip && <Button className="grow" onClick={() => setStep('pick')}>Change trip</Button>}
                <Button className="grow" variant="primary" loading={saving} onClick={() => handleSave(matched.id)}>
                  {saving ? 'Saving' : n > 1 ? `Save all ${n}` : 'Add to trip'}
                </Button>
              </Stack>
            </Card>
          ) : (
            <Card variant="raised">
              <Text variant="card-title">No trip matches. Where should it go?</Text>
              <Stack row gap={2}>
                <Button className="grow" onClick={() => setStep('pick')}>Pick a trip</Button>
                <Button className="grow" variant="primary" icon="plus" onClick={() => setStep('create')}>New trip</Button>
              </Stack>
            </Card>
          )}
          <Button variant="ghost" icon="arrow-left" onClick={() => setStep('paste')}>Paste again</Button>
        </>
      )}

      {step === 'pick' && (
        <>
          {trips.length === 0
            ? <Text tone="secondary">No trips yet. Create one instead.</Text>
            : (
              <Card variant="group" role="radiogroup" aria-label="Trips">
                {trips.map(t => (
                  <ListRow key={t.id} role="radio" aria-checked={selectedTripId === t.id} onClick={() => setSelectedTripId(t.id)}
                    icon={selectedTripId === t.id ? 'check' : 'trips'} tone={selectedTripId === t.id ? 'accent' : 'neutral'}
                    title={t.title} meta={`${t.destination_city} · ${formatRange(t.start_date, t.end_date, { year: true })}`} />
                ))}
              </Card>
            )}
          <Stack row gap={2}>
            <Button className="grow" onClick={() => setStep('preview')}>Back</Button>
            <Button className="grow" variant="primary" loading={saving} disabled={!selectedTripId} onClick={() => handleSave(selectedTripId)}>
              {saving ? 'Saving' : 'Add to trip'}
            </Button>
          </Stack>
          <Button variant="ghost" icon="plus" onClick={() => setStep('create')}>Create a new trip instead</Button>
        </>
      )}

      {step === 'create' && (
        <>
          <Text tone="secondary">Goose builds the trip from the booking dates. You can edit it after.</Text>
          <Field label="Trip name (optional)" value={newTripName} onChange={e => setNewTripName(e.target.value)}
            placeholder={`Trip to ${fallbackCity || 'destination'}`} />
          <Stack row gap={2}>
            <Button className="grow" onClick={() => setStep('preview')}>Back</Button>
            <Button className="grow" variant="primary" loading={creatingTrip} onClick={handleCreateTrip}>
              {creatingTrip ? 'Creating' : 'Create and add'}
            </Button>
          </Stack>
        </>
      )}

      {step === 'success' && (
        <EmptyState goose="excited" title={n > 1 ? `${n} bookings added` : 'Booking added'}
          action={<Button variant="primary" size="lg" block onClick={onClose}>Done</Button>}>
          Goose filed it into your trip.
        </EmptyState>
      )}
    </Sheet>
  )
}
