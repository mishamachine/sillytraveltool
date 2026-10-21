import { useEffect, useState } from 'react'
import { format, addDays } from 'date-fns'
import { useTripsStore, useUIStore, useAuthStore } from '../../store'
import { todayLocalISO } from '../../lib/dates'
import {
  tripDay, sortByStart, bookingStart, bookingDay, bookingKind, bookingMeta, hasClockTime, timeLabel, relativeIn, mapsUrl,
} from '../../lib/trips'
import BookingDetailSheet from './detail/BookingDetailSheet'
import { tripCoords, fetchTodayWeather, weatherInfo, weatherHint } from '../../lib/weather'
import {
  Screen, ScreenHeader, Section, Card, Button, IconButton, IconTile, ListRow, Text, Overline, Stack, Icon, GooseMark, category,
} from '../../ui'
import { safeUrl } from '../../lib/safeUrl'

function placeOf(b) {
  return b.venue_address || b.hotel_address || b.venue_name || b.hotel_name || b.location_address || b.location_name ||
    (b.departure_airport ? (b.type === 'flight' ? `${b.departure_airport} airport` : b.departure_airport) : null)
}

const SHOW_LABEL = { flight: 'Show boarding info', activity: 'Show tickets', restaurant: 'Show reservation', hotel: 'Show booking', transport: 'Show tickets' }

function NextUp({ item, onShow }) {
  const start = bookingStart(item)
  const cat = category(bookingKind(item))
  const place = placeOf(item)
  return (
    <Card variant="raised" aria-labelledby="next-up-title">
      <Stack row justify="between">
        <Overline tone="accent">Next up · {relativeIn(start)}</Overline>
        {hasClockTime(item) && <Text variant="micro" tone="muted">{timeLabel(start)}</Text>}
      </Stack>
      <Stack row gap={3}>
        <IconTile icon={cat.icon} tone={cat.tone} size="md" />
        <Stack gap={1} grow>
          <Text variant="title" id="next-up-title">{item.title}</Text>
          {bookingMeta(item) && <Text variant="caption" tone="muted">{bookingMeta(item)}</Text>}
        </Stack>
      </Stack>
      <Stack row gap={2}>
        {safeUrl(item.booking_url)
          ? <a className="c-btn c-btn--primary c-btn--md grow" href={safeUrl(item.booking_url)} target="_blank" rel="noreferrer">Open booking</a>
          : <Button variant="primary" className="grow" onClick={onShow}>{item._activity ? 'Show plan' : SHOW_LABEL[item.type] || 'Show booking'}</Button>}
        {place && <a className="c-btn c-btn--secondary c-btn--md grow" href={mapsUrl(place)} target="_blank" rel="noreferrer">Directions</a>}
      </Stack>
    </Card>
  )
}

export default function TodayView({ trip, onShowAll }) {
  const { bookings, activities, fetchTripDetail, setActiveTrip, activeTrip } = useTripsStore()
  const openExplore = useUIStore(s => s.openExplore)
  const tempUnit = useAuthStore(s => (s.profile?.temp_unit === 'F' ? 'fahrenheit' : 'celsius'))
  const [weather, setWeather] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [detail, setDetail] = useState(null)

  // The store holds one trip's bookings: only load ours when no other trip is open on top
  const overlayOpen = !!activeTrip
  useEffect(() => { if (!overlayOpen) fetchTripDetail(trip.id) }, [trip.id, overlayOpen])
  useEffect(() => {
    let alive = true
    tripCoords(trip).then(c => c && fetchTodayWeather(c.lat, c.lon, tempUnit)).then(w => { if (alive && w) setWeather(w) })
    return () => { alive = false }
  }, [trip.id, tempUnit])
  // Keep "in 1h 20m" honest
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  const today = todayLocalISO()
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const items = sortByStart([
    ...bookings.filter(b => b.trip_id === trip.id),
    ...activities.filter(a => a.trip_id === trip.id && !a.is_completed).map(a => ({ ...a, _activity: true })),
  ])
  // Next up prefers items with a real clock time (a hotel check-in date alone is not "next")
  const soon = items.filter(b => bookingStart(b) > now && bookingDay(b) <= tomorrow)
  const next = soon.find(hasClockTime) || soon[0]
  const laterToday = items.filter(b => b !== next && bookingDay(b) === today && bookingStart(b) > now)
  const tomorrowFirst = items.find(b => bookingDay(b) === tomorrow && b !== next)
  const { n, total } = tripDay(trip)
  const w = weather && weatherInfo(weather.now.code)
  const openPlan = () => setActiveTrip(trip)

  return (
    <Screen gap={4} labelledBy="today-title">
      <ScreenHeader
        overline={`Day ${n} of ${total} · ${format(now, 'EEEE')}`}
        title={trip.destination_city}
        titleId="today-title"
        actions={(
          <>
            <IconButton icon="trips" label="All trips" onClick={onShowAll} />
            <GooseMark expression="happy" size={44} tile tileSize="sm" />
          </>
        )}
      />

      {next ? <NextUp item={next} onShow={() => setDetail(next)} /> : (
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
              <Text variant="micro" tone="muted" as="p">{weather ? weatherHint(weather.today) : 'Checking the sky'}</Text>
            </Stack>
          </Stack>
        </Card>
        <Card variant="plain" className="today-tile" onClick={openPlan} aria-label="Tomorrow, open trip plan">
          <Text variant="micro" tone="muted" as="p">Tomorrow</Text>
          <Text variant="body" weight={600} as="p">
            {tomorrowFirst ? `${tomorrowFirst.title}${hasClockTime(tomorrowFirst) ? ` · ${timeLabel(bookingStart(tomorrowFirst))}` : ''}` : 'Nothing booked yet'}
          </Text>
        </Card>
      </div>

      <Card variant="inverse" onClick={() => openExplore('honk')} className="today-honk">
        <Stack row gap={3}>
          <IconTile icon="megaphone" tone="inverse" size="md" />
          <Stack gap={1} grow>
            <Text variant="card-title" tone="inverse" as="p">HONK: find me a spot</Text>
            <Text variant="caption" tone="inverse-muted">Goose picks somewhere good near you, right now</Text>
          </Stack>
          <Icon name="chevron-right" size={20} className="tone-inverse-muted" />
        </Stack>
      </Card>

      {laterToday.length > 0 && (
        <Section title="Later today">
          <Card variant="group">
            {laterToday.map(b => (
              <ListRow key={b.id} onClick={openPlan}
                leading={<span className="today-time t-caption tone-muted tabular">{hasClockTime(b) ? timeLabel(bookingStart(b)) : 'All day'}</span>}
                title={b.title}
                trailing={b._activity ? 'Plan' : category(bookingKind(b)).label} />
            ))}
          </Card>
        </Section>
      )}

      <Button variant="ghost" icon="calendar" onClick={openPlan}>Full trip plan</Button>
      {detail && <BookingDetailSheet item={detail} isActivity={!!detail._activity} canDelete={false} onClose={() => setDetail(null)} />}
    </Screen>
  )
}
