import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { useTripsStore } from '../../store'
import { parseLocalDate, todayLocalISO } from '../../lib/dates'
import { bestTrip } from '../../../supabase/functions/_shared/tripMatch.js'
import { editableTrips, withCoords } from '../../lib/tripPick'
import { parseBookingEmail, parseBookingFile } from '../../lib/gemini'
import { hasFirstClass } from '../../lib/firstClass'
import { usePlanStore } from '../../store/planStore'
import { canBuy } from '../../lib/purchases'
import { geocode } from '../../lib/places'
import { warmGuide } from '../../store/guideStore'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import { track, errorReason } from '../../lib/analytics'
import { bookingKind, bookingMeta, tripDates, suggestTripName, bookingDates } from '../../lib/trips'
import { dateTimeIn, zoneName, isValidZone } from '../../lib/localTime'
import { Sheet, Field, Button, Banner, Card, ListRow, Text, Stack, Loading, EmptyState, Chip, category } from '../../ui'

// ── Client-side trip matcher ──────────────────────────────
// Same rule as email import (supabase/functions/_shared/tripMatch.js): the trip whose dates the itinerary overlaps
// (nearest first), or one within 3 days on its route, or an undated trip nearby. Never the city name alone.
// No match → null (→ "Create new trip").
async function matchTrip(trips, ultimateDestination, bookings) {
  const candidates = await withCoords(editableTrips(trips))
  if (!candidates.length) return null
  const dates = bookings.flatMap(bookingDates).sort()
  const points = []
  const add = g => { if (g?.lat != null) points.push({ lat: Number(g.lat), lng: Number(g.lng) }) }
  for (const b of bookings.slice(0, 8)) {
    if (b.place_lat != null && b.place_lng != null) add({ lat: b.place_lat, lng: b.place_lng })
    else if (b.arrival_airport) add(await geocode(`${b.arrival_airport}${b.type === 'flight' ? ' airport' : ''}`).catch(() => null))
  }
  if (ultimateDestination?.city) add(await geocode(ultimateDestination.city).catch(() => null))
  const withStops = candidates.map(t => ({ ...t, points: (t.trip_stops || []).map(s => ({ lat: s.lat, lng: s.lng })) }))
  const top = bestTrip(withStops, { start: dates[0] || null, end: dates[dates.length - 1] || null, points }, { today: todayLocalISO() })
  return top ? candidates.find(t => t.id === top.trip.id) : null
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
  const [newTripName, setNewTripName] = useState(null) // null = follow the suggested name until the traveller types
  const [newCity, setNewCity] = useState(null)       // typed destination (null = Goose's pick)
  const [newPlace, setNewPlace] = useState(null)     // picked from city search
  const [creatingTrip, setCreatingTrip] = useState(false)
  const [source, setSource] = useState(null) // { name, kind: 'pdf' | 'image' | 'sheet' | 'handwritten' } when reading a file
  const [readText, setReadText] = useState(null) // what the AI read from a photo, shown before saving
  const [locked, setLocked] = useState(null)
  const fileRef = useRef(null)
  const handRef = useRef(null)

  const fileKind = (f) => (/\.(csv|tsv|xlsx)$/i.test(f.name) || /csv|spreadsheetml/.test(f.type) ? 'sheet' : /pdf/.test(f.type) ? 'pdf' : 'image')
  const handleFile = async (file, { handwritten = false } = {}) => {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) { setError('That file is too big. Up to 6 MB, or paste the text instead.'); return }
    const kind = handwritten ? 'handwritten' : fileKind(file)
    setSource({ name: file.name, kind })
    track('import_file', { kind }, 'trips')
    await read(() => parseBookingFile(file, { transcribe: handwritten }))
  }
  const pickHandwritten = () => {
    if (!hasFirstClass()) {
      // An app build without store billing has no paywall to open, so say it here
      if (canBuy) usePlanStore.getState().openPaywall('handwritten_import'); else setError('Reading handwritten agendas is part of First Class.')
      track('first_class_locked', { feature: 'handwritten_import' }, 'trips'); return
    }
    handRef.current?.click()
  }

  const handleParse = async () => {
    if (!text.trim()) return
    setSource(null)
    await read(() => parseBookingEmail(text))
  }

  const read = async (fetchResult) => {
    setLoading(true); setError(null); setReadText(null); setLocked(null)
    try {
      const result = await fetchResult()
      // result shape: { bookings: [...], ultimate_destination: { city, airport_code }, read_text? }
      setReadText(typeof result.read_text === 'string' && result.read_text.trim() ? result.read_text : null)
      const bookings = Array.isArray(result.bookings) ? result.bookings : [result]
      const dest = result.ultimate_destination || null
      setParsedBookings(bookings)
      setUltimateDest(dest)
      setNewCity(null); setNewPlace(null)
      const match = fixedTrip || await matchTrip(trips, dest, bookings)
      setMatched(match)
      setSelectedTripId(match?.id || null)
      setStep('preview')
      track('import_parsed', { bookings: bookings.length, matched_trip: !!match }, 'trips')
    } catch (e) {
      track('ai_error', { feature: 'parse_booking' }, 'trips')
      track('import_failed', { stage: 'parse', reason: errorReason(e) }, 'trips')
      setError(e.message || 'Goose couldn\'t read that. Try again, or add it by hand.')
    }
    finally { setLoading(false) }
  }

  const handleSave = async (tripId) => {
    if (!parsedBookings.length || !tripId) return
    setSaving(true); setError(null)
    try {
      const saved = []
      for (const booking of parsedBookings) {
        saved.push(await createBooking(tripId, sanitizeBooking(booking), { fillDates: false, via: 'paste_import' }))
      }
      // An undated (planning) trip takes the whole itinerary's dates, not just the first leg's
      await useTripsStore.getState().fillDatesIfUndated(tripId, saved)
      setStep('success')
      track('import_saved', { bookings: saved.length }, 'trips')
      if (onBookingCreated) onBookingCreated()
    } catch (e) {
      track('import_failed', { stage: 'save', reason: errorReason(e) }, 'trips')
      setError(e.message || 'Could not save the booking.')
    }
    finally { setSaving(false) }
  }

  const fallbackCity = ultimateDest?.city ||
    parsedBookings[parsedBookings.length - 1]?.destination_city ||
    parsedBookings[parsedBookings.length - 1]?.arrival_airport

  const handleCreateTrip = async () => {
    if (!parsedBookings.length) return
    setCreatingTrip(true); setError(null)
    try {
      const typed = newCity?.trim()
      const city = newPlace?.city || typed || fallbackCity || parsedBookings[0]?.hotel_name || 'Unknown'
      const sameAsGoose = city === ultimateDest?.city

      // Derive date range from all booking legs
      const allDates = parsedBookings.flatMap(b => [
        b.departure_time, b.arrival_time, b.check_in_date, b.check_out_date, b.activity_date
      ]).filter(Boolean).map(d => parseLocalDate(d)).filter(d => !isNaN(d.getTime()))

      const earliest = allDates.length ? new Date(Math.min(...allDates)) : new Date()
      const latest   = allDates.length ? new Date(Math.max(...allDates)) : earliest

      // Best-effort country and coordinates from Google (server-side)
      const geo = newPlace?.lat != null ? newPlace
        : await geocode(sameAsGoose && ultimateDest?.country ? `${city}, ${ultimateDest.country}` : city)
      const country = geo?.country || (sameAsGoose ? ultimateDest?.country : '') || ''

      const newTrip = await createTrip({
        title: newTripName?.trim() || suggestTripName(city),
        destination_city: city,
        destination_country: country,
        destination_country_code: geo?.country_code || '',
        destination_lat: geo?.lat ?? null,
        destination_lng: geo?.lng ?? null,
        start_date: format(earliest, 'yyyy-MM-dd'),
        end_date: format(latest, 'yyyy-MM-dd'),
        status: 'planning',
        // A trip without a zone gets one the first time it's opened
        destination_tz: newPlace?.tz || (sameAsGoose ? ultimateDest?.tz : null) || null,
      }, { via: 'import' })
      warmGuide(city, country, geo?.country_code || '')
      await handleSave(newTrip.id)
    } catch (e) { setError(e.message || 'Could not create the trip.') }
    finally { setCreatingTrip(false) }
  }

  const n = parsedBookings.length
  return (
    <Sheet title={step === 'success' ? 'Filed' : 'Paste a confirmation'} subtitle={fixedTrip ? `Into ${fixedTrip.title}` : undefined} onClose={onClose}>
      {error && <Banner tone="danger" icon="alert-circle" title="That didn't work" role="alert">{error}</Banner>}

      {step === 'paste' && (loading ? (
        <Loading title={source ? `Goose is reading ${source.name}` : 'Goose is reading your confirmation'}>
          {source ? 'Every page and row: times, places and confirmation numbers. A long itinerary can take up to a minute.' : 'Times, places and confirmation numbers, usually under 15 seconds.'}
        </Loading>
      ) : (
        <>
          <Text variant="body" tone="secondary">
            Paste a flight, hotel, train, restaurant or ticket confirmation. Goose pulls out the details and files them into the right trip.
          </Text>
          <Field label="Confirmation text" as="textarea" rows={8} value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste the email or booking text here" />
          <Text variant="micro" tone="muted">Read by Goose (AI). Check the details before saving.</Text>
          <Button variant="primary" size="lg" block icon="sparkles" onClick={handleParse} disabled={!text.trim()}>Read it</Button>
          <Card variant="group" aria-label="Or import a file">
            <ListRow icon="file" title="Upload a file" meta="PDF itinerary, screenshot, photo, or a CSV / Excel sheet" chevron
              onClick={() => fileRef.current?.click()} />
            <ListRow icon="edit" title="Handwritten agenda" meta="A photo of your plan on paper" chevron
              trailing={<Chip tone="accent" icon={hasFirstClass() ? undefined : 'lock'}>First Class</Chip>} onClick={pickHandwritten} />
          </Card>
          {locked && <Banner tone="info" icon="lock" role="status" onDismiss={() => setLocked(null)}>{locked}</Banner>}
          <input ref={fileRef} type="file" hidden accept=".pdf,.csv,.tsv,.xlsx,image/*,application/pdf,text/csv"
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={handRef} type="file" hidden accept="image/*" capture="environment"
            onChange={e => { handleFile(e.target.files?.[0], { handwritten: true }); e.target.value = '' }} />
        </>
      ))}

      {step === 'preview' && n > 0 && (
        <>
          {readText && (
            <Card variant="raised" aria-label="What Goose read">
              <Text variant="overline" tone="accent" as="p">What Goose read{source?.name ? ` from ${source.name}` : ''}</Text>
              <Text variant="body" as="pre" className="import-read">{readText}</Text>
              <Text variant="micro" tone="muted">Check it against your page. Anything marked [?] wasn't legible: fix it after saving.</Text>
            </Card>
          )}
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
          {/* Only for a ticket of legs (YVR → LAX → NRT); a whole itinerary has no single destination */}
          {ultimateDest?.city && parsedBookings.every(b => b.type === 'flight' || b.type === 'transport') && (
            <Text variant="caption" tone="muted" align="center">
              Final destination: {ultimateDest.city}{ultimateDest.airport_code ? ` (${ultimateDest.airport_code})` : ''}
            </Text>
          )}

          {matched ? (
            <Card variant="raised">
              <Stack gap={1}>
                <Text variant="overline" tone="accent" as="p">{fixedTrip ? 'Adding to' : 'Matched to'}</Text>
                <Text variant="card-title">{matched.title}</Text>
                <Text variant="caption" tone="muted">{matched.destination_city} · {tripDates(matched, { year: true })}</Text>
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
          <Button variant="ghost" icon="arrow-left" onClick={() => setStep('paste')}>{source ? 'Try another file' : 'Paste again'}</Button>
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
                    title={t.title} meta={`${t.destination_city} · ${tripDates(t, { year: true })}`} />
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
          <CityAutocomplete label="Destination" value={newCity ?? fallbackCity ?? ''}
            onChange={(val) => { setNewCity(val); setNewPlace(null) }}
            onSelect={(p) => { setNewCity(p.city); setNewPlace(p) }} />
          <Field label="Trip name" value={newTripName ?? suggestTripName(newPlace?.city || newCity?.trim() || fallbackCity)}
            onChange={e => setNewTripName(e.target.value)} onFocus={e => e.target.select()} autoComplete="off" />
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
