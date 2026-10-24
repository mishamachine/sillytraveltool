import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { parseLocalDate } from '../../../lib/dates'
import { bookingKind, plural, bookingZone, arrivalZone } from '../../../lib/trips'
import { dateTimeIn, zoneName } from '../../../lib/localTime'
import { Sheet, Card, Button, IconTile, Text, Stack, category } from '../../../ui'
import ConfirmDialog from '../../../components/shared/ConfirmDialog'
import GetThereSheet from '../../../components/shared/GetThereSheet'
import { ACTIVITY_CATEGORIES } from './planKinds'
import { hasFirstClass } from '../../../lib/firstClass'
import { usePlanStore } from '../../../store/planStore'
import { safeUrl } from '../../../lib/safeUrl'
import { placeDetails, findPlace } from '../../../lib/places'
import { StaticMap, GoogleRating, OpenNow, GoogleAttribution } from '../../../components/shared/PlaceMedia'

const day = d => format(parseLocalDate(d), 'EEE, MMM d')
// Booking times are shown in the place's own zone, named, so they never shift with the phone
const clock = (iso, tz) => `${dateTimeIn(iso, tz)} · ${zoneName(tz)}`
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

function bookingDetails(b, tripTz) {
  const venueZone = bookingZone(b, tripTz)
  const serviceLabel = b.type === 'transport' ? (b.transport_mode ? cap(b.transport_mode) : 'Service') : 'Flight'
  return [
    ['Passenger', b.passenger_name],
    [serviceLabel, b.flight_number ? `${b.airline || ''} ${b.flight_number}`.trim() : (b.type === 'transport' ? b.airline || b.provider : null)],
    ['Seat', b.seat_number],
    ['From', b.departure_airport],
    ['To', b.arrival_airport],
    ['Departs', b.departure_time && clock(b.departure_time, bookingZone(b))],
    ['Arrives', b.arrival_time && clock(b.arrival_time, arrivalZone(b))],
    ['Hotel', b.hotel_name],
    ['Address', b.hotel_address],
    ['Check-in', b.check_in_date && day(b.check_in_date)],
    ['Check-out', b.check_out_date && day(b.check_out_date)],
    ['Room', b.room_type],
    ['Tickets', b.ticket_quantity && String(b.ticket_quantity)],
    ['Party', b.party_size && plural(b.party_size, 'guest')],
    [b.type === 'restaurant' ? 'Restaurant' : 'Venue', b.venue_name],
    ['Address', b.venue_address],
    ['When', b.activity_date && `${day(b.activity_date)}${b.activity_time ? ` · ${b.activity_time.slice(0, 5)} · ${zoneName(venueZone)}` : ''}`],
    ['Confirmation', b.confirmation_number],
    ['Price', b.price && `${b.currency || ''} ${b.price}`.trim()],
    ['Notes', b.notes],
  ]
}

function activityDetails(a, tripTz) {
  return [
    ['When', a.date && `${day(a.date)}${a.time ? ` · ${a.time.slice(0, 5)}${tripTz ? ` · ${zoneName(tripTz)}` : ''}` : ''}`],
    ['Place', a.location_name || a.location_address],
    ['Notes', a.notes],
  ]
}

// Google's weekday lines run Monday → Sunday
const todayHours = (hours) => (Array.isArray(hours) && hours.length === 7 ? hours[(new Date().getDay() + 6) % 7] : null)

/** The booking's place from Google: by saved place_id, else a best match on name + address. */
function useLivePlace(item, isActivity) {
  const [place, setPlace] = useState(null)
  const name = isActivity ? item.location_name : (item.hotel_name || item.venue_name)
  const address = isActivity ? item.location_address : (item.hotel_address || item.venue_address)
  const travel = !isActivity && (item.type === 'flight' || item.type === 'transport')
  useEffect(() => {
    if (travel || (!item.place_id && !name && !address)) return
    let live = true
    const get = item.place_id ? placeDetails(item.place_id)
      : findPlace([name, address].filter(Boolean).join(', ')).then(p => (p ? placeDetails(p.place_id) : null))
    get.then(p => { if (live) setPlace(p) })
    return () => { live = false }
  }, [item.place_id, name, address, travel])
  return place
}

/** Booking or plan details, with directions, copy and delete. */
export default function BookingDetailSheet({ item, tripTz, countryCode, isActivity, canDelete, onDelete, onEdit, onToggle, onConfirmVisit, onClose }) {
  const [confirm, setConfirm] = useState(false)
  const [getThere, setGetThere] = useState(false)
  const [copied, setCopied] = useState(false)
  const cat = isActivity ? (ACTIVITY_CATEGORIES[item.category] || ACTIVITY_CATEGORIES.note) : category(bookingKind(item))
  const place = item.venue_address || item.hotel_address || item.location_address || item.location_name || item.venue_name || item.hotel_name
  const live = useLivePlace(item, isActivity)
  const rows = (isActivity ? activityDetails(item, tripTz) : bookingDetails(item, tripTz)).filter(([, v]) => v)

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(item.confirmation_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  // A forwarded email past the free plan's 5 is saved but locked until First Class (docs/STRIPE_BILLING.md, plan B)
  if (item.locked && !hasFirstClass()) {
    return (
      <Sheet title={item.title} subtitle="Locked" onClose={onClose}>
        <Card>
          <Stack row gap={3}>
            <IconTile icon="lock" tone="accent" size="md" />
            <Text variant="body" tone="secondary" className="grow">Goose saved this booking from your email. The free plan includes {usePlanStore.getState().settings.free_limits.email_imports} forwarded emails; First Class opens this one and every one after it.</Text>
          </Stack>
        </Card>
        <Button variant="primary" block onClick={() => { onClose(); usePlanStore.getState().openPaywall('limit_emails') }}>See First Class</Button>
      </Sheet>
    )
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

        {live && (
          <Card>
            {live.lat != null && <StaticMap markers={[{ lat: live.lat, lng: live.lng }]} zoom={15} alt={`Map of ${live.name}`} />}
            <Stack row gap={2} wrap>
              <GoogleRating rating={live.rating} count={live.rating_count} />
              <OpenNow open={live.open_now} />
            </Stack>
            {todayHours(live.hours) && <Text variant="caption" tone="muted">{todayHours(live.hours)}</Text>}
            <Stack row gap={2} wrap>
              {live.phone && <a className="c-btn c-btn--secondary c-btn--sm" href={`tel:${live.phone.replace(/[^+\d]/g, '')}`}>Call</a>}
              {safeUrl(live.website) && <a className="c-btn c-btn--secondary c-btn--sm" href={safeUrl(live.website)} target="_blank" rel="noreferrer">Website</a>}
            </Stack>
            <GoogleAttribution />
          </Card>
        )}

        <Stack gap={2}>
          {safeUrl(item.booking_url) && <a className="c-btn c-btn--primary c-btn--md c-btn--block" href={safeUrl(item.booking_url)} target="_blank" rel="noreferrer">Open booking</a>}
          {onConfirmVisit && <Button variant="primary" block icon="calendar" onClick={onConfirmVisit}>Confirm a visit</Button>}
          {place && <Button block icon="navigation" onClick={() => setGetThere(true)}>Get there</Button>}
          {item.confirmation_number && <Button block icon={copied ? 'check' : 'copy'} onClick={copyRef}>{copied ? 'Copied' : 'Copy confirmation number'}</Button>}
          {onEdit && <Button block icon="edit" onClick={onEdit}>Edit booking</Button>}
          {isActivity && onToggle && !item.is_idea && (
            <Button block icon={item.is_completed ? 'refresh' : 'check'} onClick={() => { onToggle(!item.is_completed); onClose() }}>
              {item.is_completed ? 'Mark as not done' : 'Mark as done'}
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" block icon="trash" className="detail-delete" onClick={() => setConfirm(true)}>
              {item.is_idea ? 'Remove from trip ideas' : isActivity ? 'Remove from plan' : 'Delete booking'}
            </Button>
          )}
        </Stack>
      </Sheet>
      {getThere && (
        <GetThereSheet countryCode={live?.country_code || countryCode} onClose={() => setGetThere(false)} place={{
          name: live?.name || item.venue_name || item.hotel_name || item.location_name || item.title,
          address: live?.address || place, place_id: live?.place_id || item.place_id || null,
          lat: live?.lat ?? item.place_lat ?? item.location_lat ?? null, lng: live?.lng ?? item.place_lng ?? item.location_lng ?? null,
        }} />
      )}
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
