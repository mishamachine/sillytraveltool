import { useEffect, useRef, useState } from 'react'
import { sanitizeBookingForm } from './planKinds'
import { deviceZone, isValidZone, zoneName, allZones } from '../../../lib/localTime'
import { lookupPlaceZone, lookupZone } from '../../../lib/zoneLookup'
import PlaceAutocomplete from '../../../components/shared/PlaceAutocomplete'
import { Sheet, Field, Button, Banner, Chip, Stack, Text, LinkButton } from '../../../ui'

const TRANSPORT_MODES = ['train', 'bus', 'ferry', 'coach', 'car']

const TITLES = {
  flight: 'Add a flight', hotel: 'Add a stay', restaurant: 'Add a reservation', activity: 'Add a ticket',
  transport: 'Add transport', other: 'Add a booking',
}
const PLACEHOLDER = {
  flight: 'SEA → MAD', hotel: 'Hotel Urban, Madrid', restaurant: 'Dinner at Casa Lucio',
  transport: 'Madrid → Granada', activity: 'Alhambra · Nasrid Palaces', other: 'Flamenco show',
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

/** "Local time at SEA · Pacific Time  Change" under a time field; Change opens a zone picker. */
function ZoneLine({ id, zone, where, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <Stack gap={2}>
      <p className="t-micro tone-muted detail-zone" id={id}>
        Local time{where ? ` at ${where}` : ''} · {isValidZone(zone) ? zoneName(zone) : 'checking time zone'}{' '}
        <LinkButton onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Done' : 'Change'}</LinkButton>
      </p>
      {open && (
        <Field label="Time zone" as="select" value={zone || ''} onChange={e => onChange(e.target.value)}>
          {allZones().map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </Field>
      )}
    </Stack>
  )
}

/** Look up a place's zone after the user stops typing (airport code, station, venue address). */
function useZoneFor(text, { airport = false, city = '', enabled = true }, apply) {
  const applyRef = useRef(apply)
  applyRef.current = apply
  useEffect(() => {
    if (!enabled || !text || text.trim().length < 3) return
    let alive = true
    const t = setTimeout(() => {
      lookupPlaceZone(text, { airport, city }).then(tz => { if (alive && tz) applyRef.current(tz) })
    }, 600)
    return () => { alive = false; clearTimeout(t) }
  }, [text, airport, city, enabled])
}


/** Manual booking form for one type. `initial` may carry transport_mode. */
export default function BookingFormSheet({ tripId, trip, type, initial = {}, onClose, onCreate }) {
  const tripTz = isValidZone(trip?.destination_tz) ? trip.destination_tz : null
  // Times are entered as the local time at the place. Defaults until a lookup answers:
  // departure where you are now, arrival and venues at the destination.
  const [form, setForm] = useState(() => ({
    departure_tz: deviceZone(), arrival_tz: tripTz || deviceZone(), local_tz: tripTz || deviceZone(), ...initial,
  }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const bind = (k) => ({ value: form[k] || '', onChange: e => set(k, e.target.value) })
  const travel = type === 'flight' || type === 'transport'
  useZoneFor(form.departure_airport, { airport: type === 'flight', enabled: travel }, tz => set('departure_tz', tz))
  useZoneFor(form.arrival_airport, { airport: type === 'flight', enabled: travel }, tz => set('arrival_tz', tz))
  useZoneFor(form.venue_address || form.hotel_address, { city: trip?.destination_city || '', enabled: !travel }, tz => set('local_tz', tz))
  // Picking a Google place fills the name, address, coordinates and the venue's time zone
  const near = trip?.destination_lat && trip?.destination_lng ? { lat: Number(trip.destination_lat), lng: Number(trip.destination_lng) } : undefined
  const pickPlace = (nameKey, addressKey) => (p) => {
    setForm(f => ({ ...f, [nameKey]: p.name, [addressKey]: p.address, place_id: p.place_id, place_lat: p.lat, place_lng: p.lng, title: f.title || p.name }))
    if (p.lat != null && p.lng != null) lookupZone({ lat: p.lat, lng: p.lng }).then(tz => { if (tz) set('local_tz', tz) })
  }
  const placeField = (nameKey, addressKey, label, placeholder) => (
    <PlaceAutocomplete label={label} value={form[nameKey]} near={near} placeholder={placeholder}
      onChange={v => setForm(f => ({ ...f, [nameKey]: v, place_id: null, place_lat: null, place_lng: null }))}
      onPick={pickPlace(nameKey, addressKey)} />
  )
  const venueZoneLine = <ZoneLine id="zone-venue" zone={form.local_tz} where={form.venue_name || form.hotel_name || trip?.destination_city} onChange={tz => set('local_tz', tz)} />

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.title) return setError('Give it a title so you can find it later.')
    setLoading(true)
    setError(null)
    try {
      // Keep only the zones this booking uses: travel has departure/arrival, the rest a venue zone
      const { departure_tz, arrival_tz, local_tz, ...rest } = form
      const zones = travel ? { departure_tz, arrival_tz: form.arrival_time ? arrival_tz : null } : { local_tz }
      await onCreate(tripId, sanitizeBookingForm({ ...rest, ...zones }, type))
      onClose()
    }
    catch (err) { setError(err.message || 'Could not save the booking. Check your connection.') }
    finally { setLoading(false) }
  }

  return (
    <Sheet title={TITLES[type] || TITLES.other} onClose={onClose}>
      <form className="detail-form" onSubmit={handleSave} noValidate>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}

        {type === 'transport' && (
          <Stack gap={2}>
            <Text variant="label" as="p" id="mode-label">Mode</Text>
            <div className="c-chip-row" role="group" aria-labelledby="mode-label">
              {TRANSPORT_MODES.map(m => (
                <Chip key={m} selected={form.transport_mode === m} onClick={() => set('transport_mode', m)}>{cap(m)}</Chip>
              ))}
            </div>
          </Stack>
        )}

        <Field label="Title" required {...bind('title')} placeholder={PLACEHOLDER[type] || PLACEHOLDER.other} />

        {type === 'flight' && <>
          <div className="grid-2">
            <Field label="Airline" {...bind('airline')} placeholder="Iberia" />
            <Field label="Flight number" {...bind('flight_number')} placeholder="IB 6852" />
          </div>
          <div className="grid-2">
            <Field label="From" {...bind('departure_airport')} placeholder="SEA" />
            <Field label="To" {...bind('arrival_airport')} placeholder="MAD" />
          </div>
          <Field label="Departs" type="datetime-local" {...bind('departure_time')} aria-describedby="zone-dep" />
          <ZoneLine id="zone-dep" zone={form.departure_tz} where={form.departure_airport} onChange={tz => set('departure_tz', tz)} />
          <Field label="Arrives" type="datetime-local" {...bind('arrival_time')} aria-describedby="zone-arr" />
          <ZoneLine id="zone-arr" zone={form.arrival_tz} where={form.arrival_airport} onChange={tz => set('arrival_tz', tz)} />
        </>}

        {type === 'hotel' && <>
          {placeField('hotel_name', 'hotel_address', 'Hotel', 'Search hotels')}
          <Field label="Address" {...bind('hotel_address')} placeholder="Street, city" />
          <div className="grid-2">
            <Field label="Check-in" type="date" {...bind('check_in_date')} />
            <Field label="Check-out" type="date" {...bind('check_out_date')} min={form.check_in_date} />
          </div>
          {venueZoneLine}
        </>}

        {type === 'restaurant' && <>
          {placeField('venue_name', 'venue_address', 'Restaurant', 'Search restaurants')}
          <Field label="Address" {...bind('venue_address')} placeholder="Street, city" />
          <div className="grid-2">
            <Field label="Date" type="date" {...bind('activity_date')} />
            <Field label="Time" type="time" {...bind('activity_time')} />
          </div>
          {venueZoneLine}
          <Field label="Guests" type="number" inputMode="numeric" min="1" max="50" {...bind('party_size')} placeholder="2" />
        </>}

        {type === 'transport' && <>
          <div className="grid-2">
            <Field label="Operator" {...bind('airline')} placeholder="Renfe" />
            <Field label="Service number" {...bind('flight_number')} placeholder="AVE 3192" />
          </div>
          <div className="grid-2">
            <Field label="From" {...bind('departure_airport')} placeholder="Madrid Atocha" />
            <Field label="To" {...bind('arrival_airport')} placeholder="Granada" />
          </div>
          <Field label="Departs" type="datetime-local" {...bind('departure_time')} aria-describedby="zone-dep" />
          <ZoneLine id="zone-dep" zone={form.departure_tz} where={form.departure_airport} onChange={tz => set('departure_tz', tz)} />
          <Field label="Arrives" type="datetime-local" {...bind('arrival_time')} aria-describedby="zone-arr" />
          <ZoneLine id="zone-arr" zone={form.arrival_tz} where={form.arrival_airport} onChange={tz => set('arrival_tz', tz)} />
        </>}

        {(type === 'activity' || type === 'other') && <>
          {placeField('venue_name', 'venue_address', 'Place', 'Search a museum, tour, venue')}
          <div className="grid-2">
            <Field label="Date" type="date" {...bind('activity_date')} />
            <Field label="Time" type="time" {...bind('activity_time')} />
          </div>
          {venueZoneLine}
        </>}

        <Field label="Confirmation number" {...bind('confirmation_number')} placeholder="ABC123" autoCapitalize="characters" />
        <div className="detail-price">
          <Field label="Currency" {...bind('currency')} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="EUR" maxLength={3} />
          <Field label="Price" type="number" inputMode="decimal" {...bind('price')} placeholder="0.00" />
        </div>
        <Field label="Notes" as="textarea" rows={2} {...bind('notes')} placeholder="Anything to remember" />

        <Button type="submit" variant="primary" size="lg" block loading={loading}>{loading ? 'Saving' : 'Save booking'}</Button>
      </form>
    </Sheet>
  )
}
