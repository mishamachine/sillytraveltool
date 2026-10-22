import { useEffect, useState } from 'react'
import { Sheet, Card, ListRow, Text, Stack } from '../../ui'
import { getCurrentPosition } from '../../lib/geo'
import { mapsDirectionsUrl, openOut, rideOptions, travelTimes, formatMinutes, isIOS } from '../../lib/getThere'
import { track } from '../../lib/analytics'

const MODES = [
  { id: 'walk', label: 'Walk', icon: 'walk', tone: 'success' },
  { id: 'transit', label: 'Public transport', icon: 'metro', tone: 'info' },
  { id: 'drive', label: 'Drive', icon: 'car', tone: 'neutral' },
]

/**
 * "Get there": travel times from where you are, then the phone's maps app on that mode,
 * or a ride app (by country) with the destination filled in.
 * place: { name, address?, lat?, lng?, place_id? }; countryCode: ISO code of the place's country.
 */
export default function GetThereSheet({ place, countryCode, onClose }) {
  const [times, setTimes] = useState(null)
  const [status, setStatus] = useState('locating') // locating | ready | nolocation
  const rides = rideOptions(countryCode)

  useEffect(() => {
    let live = true
    getCurrentPosition({ timeout: 8000 })
      .then(({ latitude, longitude }) => travelTimes({ lat: latitude, lng: longitude }, place))
      .then(t => { if (live) { setTimes(t); setStatus('ready') } })
      .catch(() => { if (live) setStatus('nolocation') })
    return () => { live = false }
  }, [place.lat, place.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (kind, url, open) => {
    track('get_there', { kind }, 'explore')
    if (open) open(place)
    else openOut(url)
  }
  const meta = id => {
    if (status === 'locating') return 'Checking how far'
    const t = times?.[id]
    return t ? `${formatMinutes(t.minutes)}${t.metres ? ` · ${t.metres < 1000 ? `${Math.round(t.metres / 10) * 10} m` : `${(t.metres / 1000).toFixed(1)} km`}` : ''}` : 'Open in Maps'
  }

  return (
    <Sheet title="Get there" subtitle={place.name} onClose={onClose}>
      <Card variant="group">
        {MODES.map(m => (
          <ListRow key={m.id} icon={m.icon} tone={m.tone} title={m.label} meta={meta(m.id)} chevron
            onClick={() => go(m.id, mapsDirectionsUrl(place, m.id))} />
        ))}
      </Card>
      {isIOS() && (
        <Card variant="group">
          <ListRow icon="map" tone="neutral" title="Google Maps instead" meta="Directions in Google Maps" chevron
            onClick={() => go('google_maps', mapsDirectionsUrl(place, 'transit', 'google'))} />
        </Card>
      )}
      {rides.length > 0 && (
        <Stack gap={2}>
          <Text variant="label" as="p">Ride</Text>
          <Card variant="group">
            {rides.map(r => (
              <ListRow key={r.id} icon="taxi" tone="accent" title={r.label} meta="Opens the app with this place as the drop-off" chevron
                onClick={() => go(r.id, null, r.open)} />
            ))}
          </Card>
        </Stack>
      )}
      {status === 'nolocation' && (
        <Text variant="caption" tone="muted">Location is off, so no travel times. The apps still work: they use your location when they open.</Text>
      )}
    </Sheet>
  )
}
