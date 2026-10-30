import { useEffect, useState } from 'react'
import { format, addDays } from 'date-fns'
import { useTripsStore, useAuthStore } from '../../store'
import { parseLocalDate, tripZoneToday } from '../../lib/dates'
import { tripPlace, computeLegs, routeCities } from '../../lib/stops'
import { weekdayIn } from '../../lib/localTime'
import {
  tripDay, tripToday, sortByStart, bookingStart, bookingDay, bookingTime, bookingZone, zoneHint, bookingKind, bookingMeta,
  hasClockTime, relativeIn, mapsUrl, nightsOf, plural,
} from '../../lib/trips'
import BookingDetailSheet from './detail/BookingDetailSheet'
import { useTripZone } from './useTripZone'
import { tripCoords, fetchTodayWeather, weatherInfo, weatherHint } from '../../lib/weather'
import {
  Screen, ScreenHeader, Section, Card, Chip, Button, LinkButton, IconTile, ListRow, Text, Overline, Stack, Icon, GooseMark, category,
} from '../../ui'
import { safeUrl } from '../../lib/safeUrl'
import { groupSharedLegs, travellerName } from '../../lib/sharedLegs'

function placeOf(b) {
  return b.venue_address || b.hotel_address || b.venue_name || b.hotel_name || b.location_address || b.location_name ||
    (b.departure_airport ? (b.type === 'flight' ? `${b.departure_airport} airport` : b.departure_airport) : null)
}

/** "with Maria and Tom" / "with Maria, Tom and 2 more": the others on a shared flight or train, by first name. */
function withLine(others) {
  const names = [...new Set(others.map(b => travellerName(b).split(' ')[0]))]
  if (!names.length) return null
  if (names.length === 1) return `with ${names[0]}`
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`
  return `with ${names[0]}, ${names[1]} and ${names.length - 2} more`
}

const SHOW_LABEL = { flight: 'Show boarding info', activity: 'Show tickets', restaurant: 'Show reservation', hotel: 'Show booking', transport: 'Show tickets' }

function NextUp({ item, tz, companions, onShow }) {
  const start = bookingStart(item, tz)
  const hint = zoneHint(bookingZone(item, tz))
  const cat = category(bookingKind(item))
  const place = placeOf(item)
  return (
    <Card variant="raised" aria-labelledby="next-up-title">
      <Stack row justify="between">
        <Overline tone="accent">Next up · {relativeIn(start)}</Overline>
        {hasClockTime(item) && <Text variant="micro" tone="muted">{bookingTime(item, tz)}{hint ? ` ${hint}` : ''}</Text>}
      </Stack>
      <Stack row gap={3}>
        <IconTile icon={cat.icon} tone={cat.tone} size="md" />
        <Stack gap={1} grow>
          <Text variant="title" id="next-up-title">{item.title}</Text>
          {bookingMeta(item) && <Text variant="caption" tone="muted">{bookingMeta(item)}</Text>}
          {companions && <Text variant="caption" tone="muted" truncate>{companions}</Text>}
        </Stack>
      </Stack>
      <Stack row gap={2} wrap>
        {safeUrl(item.booking_url)
          ? <a className="c-btn c-btn--primary c-btn--md today-action" href={safeUrl(item.booking_url)} target="_blank" rel="noreferrer">Open booking</a>
          : <Button variant="primary" className="today-action" onClick={onShow}>{item._activity ? 'Show plan' : SHOW_LABEL[item.type] || 'Show booking'}</Button>}
        {place && <a className="c-btn c-btn--secondary c-btn--md today-action" href={mapsUrl(place)} target="_blank" rel="noreferrer">Directions</a>}
      </Stack>
    </Card>
  )
}

/** The end of Today: the whole trip at a glance, and the way on to the Plan tab. One tap anywhere on the card. */
function PlanCard({ trip, stops, here, confirmed, onOpen }) {
  // From today's stop onwards: where you are, and the next two
  const at = Math.max(0, stops.findIndex(s => s.city === here.city || s.city === here.to?.city))
  const route = stops.slice(at, at + 3)
  const more = stops.length - at - route.length
  const nights = nightsOf(trip)
  const summary = [
    nights ? plural(nights, 'night') : null,
    stops.length > 1 ? plural(stops.length, 'stop') : null,
    confirmed ? `${confirmed} confirmed` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Card variant="plain" onClick={onOpen} className="today-plan" aria-label={`${trip.title}, open the full plan`}>
      <Stack gap={1}>
        <Overline tone="accent">The whole trip</Overline>
        <Text variant="title" as="p">{trip.title}</Text>
        {summary && <Text variant="caption" tone="muted" as="p">{summary}</Text>}
      </Stack>
      {route.length > 1 && (
        <div className="today-route" aria-hidden="true">
          {route.map((s, i) => (
            <span key={`${s.city}-${i}`} className="today-route__stop">
              <Chip tone={i === 0 ? 'accent' : 'neutral'}>{s.city}</Chip>
              {(i < route.length - 1 || more > 0) && <Icon name="chevron-right" size={16} className="tone-muted" />}
            </span>
          ))}
          {more > 0 && <Chip tone="neutral">+{more}</Chip>}
        </div>
      )}
      <span className="c-btn c-btn--primary c-btn--md c-btn--block" aria-hidden="true">
        <span className="c-btn__label">Open the full plan</span>
        <Icon name="chevron-right" size={18} strokeWidth={2} />
      </span>
    </Card>
  )
}

export default function TodayView({ trip, onShowAll }) {
  const { bookings, activities, fetchTripDetail, setActiveTrip, activeTrip } = useTripsStore()
  const tempUnit = useAuthStore(s => (s.profile?.temp_unit === 'F' ? 'fahrenheit' : 'celsius'))
  const me = useAuthStore(s => s.user?.id)
  const [weather, setWeather] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [detail, setDetail] = useState(null)
  const [legs, setLegs] = useState([])

  // The store holds one trip's bookings: only load ours when no other trip is open on top
  const overlayOpen = !!activeTrip
  useEffect(() => { if (!overlayOpen) fetchTripDetail(trip.id) }, [trip.id, overlayOpen])
  // Where you are today: today's stop, or "Madrid → Granada" on a travel day (legs make the moment exact)
  const tripBookings = bookings.filter(b => b.trip_id === trip.id)
  useEffect(() => {
    let alive = true
    computeLegs(tripBookings).then(l => { if (alive) setLegs(l) })
    return () => { alive = false }
  }, [trip.id, tripBookings.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const here = tripPlace(trip, { legs, now: now.getTime() })
  const hereKey = here.lat != null ? `${Number(here.lat).toFixed(2)},${Number(here.lng).toFixed(2)}` : ''
  useEffect(() => {
    let alive = true
    const coords = here.lat != null ? Promise.resolve({ lat: Number(here.lat), lon: Number(here.lng) }) : tripCoords(trip)
    coords.then(c => c && fetchTodayWeather(c.lat, c.lon, tempUnit)).then(w => { if (alive && w) setWeather(w) })
    return () => { alive = false }
  }, [trip.id, tempUnit, hereKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep "in 1h 20m" honest
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  // Days are the days where you are on the trip (today's stop), not the phone's
  useTripZone(trip)
  const tz = tripZoneToday(trip)
  const today = tripToday(trip)
  const tomorrow = format(addDays(parseLocalDate(today), 1), 'yyyy-MM-dd')
  const items = sortByStart([
    ...bookings.filter(b => b.trip_id === trip.id),
    ...activities.filter(a => a.trip_id === trip.id && !a.is_completed).map(a => ({ ...a, _activity: true })),
  ], tz)
  // Next up prefers items with a real clock time (a hotel check-in date alone is not "next")
  const soon = items.filter(b => bookingStart(b, tz) > now && bookingDay(b, tz) <= tomorrow)
  // A flight or train others on the trip are on too shows once: your own booking of it, "with Maria and Tom"
  const shared = groupSharedLegs(tripBookings, me)
  const once = b => b._activity || !shared.has(b.id) || shared.get(b.id).items[0] === b
  const first = soon.find(hasClockTime) || soon[0]
  const leg = first && !first._activity ? shared.get(first.id) : null
  const next = leg ? leg.items[0] : first
  const companions = leg ? withLine(leg.items.filter(b => b !== next && b.created_by !== me)) : null
  const laterToday = items.filter(b => b !== next && once(b) && bookingDay(b, tz) === today && bookingStart(b, tz) > now)
  const tomorrowFirst = items.find(b => bookingDay(b, tz) === tomorrow && b !== next && once(b))
  const { n, total } = tripDay(trip)
  const w = weather && weatherInfo(weather.now.code)
  const openPlan = () => setActiveTrip(trip)
  const stays = routeCities(trip.trip_stops || []).filter(s => s.kind === 'stay')

  return (
    <Screen gap={4} labelledBy="today-title">
      <div className="today-top">
        <Button variant="secondary" size="sm" icon="chevron-left" className="today-back" onClick={onShowAll}>
          <Icon name="trips" size={20} strokeWidth={2} />
          All trips
        </Button>
        <GooseMark expression="happy" size={44} tile tileSize="sm" />
      </div>
      <ScreenHeader
        overline={`Day ${n} of ${total} · ${weekdayIn(now, tz)}${here.kind === 'travel' && here.inTransit ? ' · On the way' : ''}`}
        title={here.label || trip.destination_city}
        titleId="today-title"
      />

      {next ? <NextUp item={next} tz={tz} companions={companions} onShow={() => setDetail(next)} /> : (
        <Card variant="raised">
          <Overline tone="accent">Today</Overline>
          <Text variant="title">Nothing else booked today</Text>
          <Text variant="body" tone="secondary">A free afternoon. Ask Goose for something nearby, or check the full plan.</Text>
          <Button onClick={openPlan} icon="calendar">Open trip plan</Button>
        </Card>
      )}

      <div className="grid-2">
        <Card variant="plain" className="today-tile" aria-label={weather ? `Weather: ${weather.now.temp} degrees, ${w.label}` : 'Weather'}>
          <Stack row gap={3}>
            <Icon name={w?.icon || 'cloud-sun'} size={28} className={w?.icon === 'sun' ? 'today-sun' : 'tone-info'} />
            <Stack gap={0}>
              <Text variant="stat" as="p" className="today-temp">{weather ? `${weather.now.temp}°` : '–'}</Text>
              <Text variant="micro" tone="muted" as="p">{weather ? weatherHint(weather.today, tempUnit) : 'Checking the sky'}</Text>
            </Stack>
          </Stack>
        </Card>
        <Card variant="plain" className="today-tile" onClick={openPlan} aria-label="Tomorrow, open trip plan">
          <Text variant="micro" tone="muted" as="p">Tomorrow</Text>
          <Text variant="body" weight={600} as="p">
            {tomorrowFirst ? `${tomorrowFirst.title}${hasClockTime(tomorrowFirst) ? ` · ${bookingTime(tomorrowFirst, tz)}` : ''}` : 'Nothing booked yet'}
          </Text>
        </Card>
      </div>

      {laterToday.length > 0 && (
        <Section title="Later today">
          <Card variant="group">
            {laterToday.map(b => (
              <ListRow key={b.id} onClick={openPlan}
                leading={<span className="today-time t-caption tone-muted tabular">{hasClockTime(b) ? bookingTime(b, tz) : 'All day'}</span>}
                title={b.title}
                trailing={b._activity ? 'Plan' : category(bookingKind(b)).label} />
            ))}
          </Card>
        </Section>
      )}

      <PlanCard trip={trip} stops={stays} here={here} confirmed={tripBookings.length} onOpen={openPlan} />
      <LinkButton icon="trips" onClick={onShowAll} className="today-all">Back to all trips</LinkButton>
      {detail && <BookingDetailSheet item={detail} tripTz={tz} countryCode={trip.destination_country_code} isActivity={!!detail._activity} canDelete={false} onClose={() => setDetail(null)} />}
    </Screen>
  )
}
