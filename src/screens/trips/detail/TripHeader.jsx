import { useEffect, useState } from 'react'
import { useTripsStore, useUIStore } from '../../../store'
import { fetchWithTimeout } from '../../../lib/http'
import { tripPhase, tripDay, nightsOf, formatRange, plural } from '../../../lib/trips'
import { daysBetween, todayLocalISO } from '../../../lib/dates'
import { ScreenHeader, IconButton, Button, Sheet, Card, ListRow, Text, Stack, Chip } from '../../../ui'
import TravelersSheet from './TravelersSheet'

// ============================================================
// LIVE CLOCK — local time at the destination
// ============================================================
function useLocalTime({ city, country, lat, lng }) {
  const [time, setTime] = useState('')
  const [timezone, setTimezone] = useState(null)

  useEffect(() => {
    const fetchTZ = async () => {
      // Use trip lat/lng if available, otherwise geocode
      let tzLat = lat, tzLng = lng
      if (!tzLat || !tzLng) {
        try {
          const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent((city || '') + ', ' + (country || ''))}`, { headers: { 'Accept-Language': 'en' } })
          const data = await res.json()
          if (data[0]) { tzLat = data[0].lat; tzLng = data[0].lon }
        } catch { /* fallback to device time */ }
      }
      if (tzLat && tzLng) {
        try {
          const res = await fetchWithTimeout(`https://timeapi.io/api/timezone/coordinate?latitude=${tzLat}&longitude=${tzLng}`)
          const data = await res.json()
          if (data.timeZone) setTimezone(data.timeZone)
        } catch {
          // timeapi.io failed — Open-Meteo returns the zone too
          try {
            const res2 = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${tzLat}&longitude=${tzLng}&timezone=auto&forecast_days=1`)
            const data2 = await res2.json()
            if (data2.timezone) setTimezone(data2.timezone)
          } catch { /* give up, show device time */ }
        }
      }
    }
    if (city || (lat && lng)) fetchTZ()
  }, [city, country, lat, lng])

  useEffect(() => {
    const tick = () => {
      try {
        setTime(new Date().toLocaleTimeString('en-GB', { timeZone: timezone || undefined, hour: '2-digit', minute: '2-digit' }))
      } catch {
        setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
      }
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [timezone])

  return timezone ? time : null
}

function travelersLabel(trip) {
  const others = (trip.trip_collaborators || []).filter(c => c.role !== 'owner')
  const accepted = others.filter(c => c.status === 'accepted').length
  if (accepted) return String(accepted + 1)
  if (others.some(c => c.status === 'pending')) return 'Invited'
  return 'Share'
}

export default function TripHeader({ trip, readOnly }) {
  const setActiveTrip = useTripsStore(s => s.setActiveTrip)
  const openTripForm = useUIStore(s => s.openTripForm)
  const [showTravelers, setShowTravelers] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const localTime = useLocalTime({ city: trip.destination_city, country: trip.destination_country, lat: trip.destination_lat, lng: trip.destination_lng })

  const phase = tripPhase(trip)
  const { n, total } = tripDay(trip)
  const away = daysBetween(todayLocalISO(), trip.start_date)
  const status = phase === 'active' ? `Day ${n} of ${total}`
    : phase === 'upcoming' ? (away === 1 ? 'Tomorrow' : `In ${plural(away, 'day')}`)
    : phase === 'cancelled' ? 'Cancelled' : 'Completed'
  const meta = [formatRange(trip.start_date, trip.end_date), plural(nightsOf(trip), 'night'), trip.destination_country].filter(Boolean).join(' · ')

  return (
    <>
      <div className="detail-bar">
        <IconButton icon="chevron-left" label="Back to trips" onClick={() => setActiveTrip(null)} />
        <Stack row gap={2}>
          <Button size="sm" variant="secondary" icon="users" onClick={() => setShowTravelers(true)}
            aria-label={`Travelers: ${travelersLabel(trip)}`}>{travelersLabel(trip)}</Button>
          <IconButton icon="more" label="Trip options" onClick={() => setShowMenu(true)} />
        </Stack>
      </div>
      <ScreenHeader titleId="detail-title" title={trip.title} meta={meta}>
        <Stack row gap={2} wrap className="detail-status">
          <Chip tone={phase === 'active' ? 'accent' : phase === 'upcoming' ? 'info' : phase === 'past' ? 'success' : 'neutral'}
            icon={phase === 'past' ? 'check' : undefined}>{status}</Chip>
          {localTime && <Text variant="micro" tone="muted" as="span">{localTime} in {trip.destination_city}</Text>}
        </Stack>
      </ScreenHeader>

      {showMenu && (
        <Sheet title="Trip options" onClose={() => setShowMenu(false)}>
          <Card variant="group">
            {!trip._isShared && (
              <ListRow icon="edit" tone="neutral" title="Edit trip" meta={readOnly ? 'Dates, name and notes' : 'Dates, name, notes or delete'} chevron
                onClick={() => { setShowMenu(false); openTripForm(trip) }} />
            )}
            <ListRow icon="user-plus" tone="accent" title="Invite travelers" meta="They get an email from Goose" chevron
              onClick={() => { setShowMenu(false); setShowTravelers(true) }} />
            <ListRow icon="arrow-left" tone="neutral" title="Back to trips" chevron onClick={() => { setShowMenu(false); setActiveTrip(null) }} />
          </Card>
        </Sheet>
      )}
      {showTravelers && <TravelersSheet trip={trip} onClose={() => setShowTravelers(false)} />}
    </>
  )
}
