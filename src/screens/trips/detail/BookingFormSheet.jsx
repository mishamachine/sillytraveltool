import { useState } from 'react'
import { sanitizeBookingForm } from './planKinds'
import { Sheet, Field, Button, Banner, Chip, Stack, Text } from '../../../ui'

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


/** Manual booking form for one type. `initial` may carry transport_mode. */
export default function BookingFormSheet({ tripId, type, initial = {}, onClose, onCreate }) {
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const bind = (k) => ({ value: form[k] || '', onChange: e => set(k, e.target.value) })

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.title) return setError('Give it a title so you can find it later.')
    setLoading(true)
    setError(null)
    try {
      await onCreate(tripId, sanitizeBookingForm(form, type))
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
          <Field label="Departs" type="datetime-local" {...bind('departure_time')} />
          <Field label="Arrives" type="datetime-local" {...bind('arrival_time')} />
        </>}

        {type === 'hotel' && <>
          <Field label="Address" {...bind('hotel_address')} placeholder="Street, city" />
          <div className="grid-2">
            <Field label="Check-in" type="date" {...bind('check_in_date')} />
            <Field label="Check-out" type="date" {...bind('check_out_date')} min={form.check_in_date} />
          </div>
        </>}

        {type === 'restaurant' && <>
          <Field label="Restaurant" {...bind('venue_name')} placeholder="Casa Lucio" />
          <Field label="Address" {...bind('venue_address')} placeholder="Street, city" />
          <div className="grid-2">
            <Field label="Date" type="date" {...bind('activity_date')} />
            <Field label="Time" type="time" {...bind('activity_time')} />
          </div>
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
          <Field label="Departs" type="datetime-local" {...bind('departure_time')} />
          <Field label="Arrives" type="datetime-local" {...bind('arrival_time')} />
        </>}

        {(type === 'activity' || type === 'other') && <>
          <div className="grid-2">
            <Field label="Date" type="date" {...bind('activity_date')} />
            <Field label="Time" type="time" {...bind('activity_time')} />
          </div>
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
