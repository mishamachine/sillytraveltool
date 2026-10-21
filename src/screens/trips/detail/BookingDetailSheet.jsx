import { useState } from 'react'
import { format } from 'date-fns'
import { parseLocalDate } from '../../../lib/dates'
import { bookingKind, mapsUrl, plural } from '../../../lib/trips'
import { Sheet, Card, Button, IconTile, Text, Stack, category } from '../../../ui'
import ConfirmDialog from '../../../components/shared/ConfirmDialog'
import { ACTIVITY_CATEGORIES } from './planKinds'
import { safeUrl } from '../../../lib/safeUrl'

const day = d => format(parseLocalDate(d), 'EEE, MMM d')
const clock = iso => format(new Date(iso), 'EEE, MMM d · HH:mm')
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

function Detail({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="detail-kv">
      <dt className="t-caption tone-muted">{label}</dt>
      <dd className="t-body">{value}</dd>
    </div>
  )
}

function bookingDetails(b) {
  const serviceLabel = b.type === 'transport' ? (b.transport_mode ? cap(b.transport_mode) : 'Service') : 'Flight'
  return [
    ['Passenger', b.passenger_name],
    [serviceLabel, b.flight_number ? `${b.airline || ''} ${b.flight_number}`.trim() : (b.type === 'transport' ? b.airline || b.provider : null)],
    ['Seat', b.seat_number],
    ['From', b.departure_airport],
    ['To', b.arrival_airport],
    ['Departs', b.departure_time && clock(b.departure_time)],
    ['Arrives', b.arrival_time && clock(b.arrival_time)],
    ['Hotel', b.hotel_name],
    ['Address', b.hotel_address],
    ['Check-in', b.check_in_date && day(b.check_in_date)],
    ['Check-out', b.check_out_date && day(b.check_out_date)],
    ['Room', b.room_type],
    ['Tickets', b.ticket_quantity && String(b.ticket_quantity)],
    ['Party', b.party_size && plural(b.party_size, 'guest')],
    [b.type === 'restaurant' ? 'Restaurant' : 'Venue', b.venue_name],
    ['Address', b.venue_address],
    ['When', b.activity_date && `${day(b.activity_date)}${b.activity_time ? ` · ${b.activity_time.slice(0, 5)}` : ''}`],
    ['Confirmation', b.confirmation_number],
    ['Price', b.price && `${b.currency || ''} ${b.price}`.trim()],
    ['Notes', b.notes],
  ]
}

function activityDetails(a) {
  return [
    ['When', a.date && `${day(a.date)}${a.time ? ` · ${a.time.slice(0, 5)}` : ''}`],
    ['Place', a.location_name || a.location_address],
    ['Notes', a.notes],
  ]
}

/** Booking or plan details, with directions, copy and delete. */
export default function BookingDetailSheet({ item, isActivity, canDelete, onDelete, onToggle, onClose }) {
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const cat = isActivity ? (ACTIVITY_CATEGORIES[item.category] || ACTIVITY_CATEGORIES.note) : category(bookingKind(item))
  const place = item.venue_address || item.hotel_address || item.location_address || item.location_name || item.venue_name || item.hotel_name
  const rows = (isActivity ? activityDetails(item) : bookingDetails(item)).filter(([, v]) => v)

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(item.confirmation_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <>
      <Sheet title={item.title} subtitle={isActivity ? cat.label : category(bookingKind(item)).label} onClose={onClose}>
        <Card>
          <Stack row gap={3}>
            <IconTile icon={cat.icon} tone={cat.tone} size="md" />
            <Text variant="caption" tone="muted" className="grow">
              {item.source === 'email_import' ? 'Added from a forwarded email' : isActivity && item.source === 'goosey' ? 'Saved from HONK' : isActivity && item.source === 'guide' ? 'Saved from the guide' : 'Added by hand'}
            </Text>
          </Stack>
          {rows.length > 0 && <dl className="detail-kvs">{rows.map(([k, v], i) => <Detail key={`${k}-${i}`} label={k} value={v} />)}</dl>}
        </Card>

        <Stack gap={2}>
          {safeUrl(item.booking_url) && <a className="c-btn c-btn--primary c-btn--md c-btn--block" href={safeUrl(item.booking_url)} target="_blank" rel="noreferrer">Open booking</a>}
          {place && <a className="c-btn c-btn--secondary c-btn--md c-btn--block" href={mapsUrl(place)} target="_blank" rel="noreferrer">Directions</a>}
          {item.confirmation_number && <Button block icon={copied ? 'check' : 'copy'} onClick={copyRef}>{copied ? 'Copied' : 'Copy confirmation number'}</Button>}
          {isActivity && onToggle && (
            <Button block icon={item.is_completed ? 'refresh' : 'check'} onClick={() => { onToggle(!item.is_completed); onClose() }}>
              {item.is_completed ? 'Mark as not done' : 'Mark as done'}
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" block icon="trash" className="detail-delete" onClick={() => setConfirm(true)}>
              {isActivity ? 'Remove from plan' : 'Delete booking'}
            </Button>
          )}
        </Stack>
      </Sheet>
      {confirm && (
        <ConfirmDialog
          message={isActivity ? `Remove "${item.title}"?` : `Delete "${item.title}"?`}
          detail={isActivity ? undefined : 'Travelers on this trip lose it too.'}
          confirmLabel={isActivity ? 'Remove' : 'Delete'}
          onConfirm={async () => { await onDelete(); setConfirm(false); onClose() }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}
