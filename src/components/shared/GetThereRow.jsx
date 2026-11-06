import { useEffect, useState } from 'react'
import { Icon, Text, Stack } from '../../ui'
import { getCurrentPosition } from '../../lib/geo'
import { mapsDirectionsUrl, openOut, rideOptions, travelTimes, formatMinutes, isIOS } from '../../lib/getThere'
import { track } from '../../lib/analytics'
import './getThere.css'

const MODES = [
  { id: 'walk', label: 'Walk', icon: 'walk' },
  { id: 'transit', label: 'Transit', icon: 'metro' },
  { id: 'drive', label: 'Drive', icon: 'car' },
]

/**
 * "Get there" inline: one tap per mode opens the phone's maps app on that mode, plus the first ride app for the
 * country. Same links as GetThereSheet, laid out as a row of tiles for the HONK result.
 * place: { name, address?, lat?, lng?, place_id? }; from: { latitude, longitude } when already known.
 */
export default function GetThereRow({ place, from, countryCode, onAnother }) {
  const [times, setTimes] = useState(null)
  const [status, setStatus] = useState('locating') // locating | ready | nolocation
  const ride = rideOptions(countryCode)[0]

  useEffect(() => {
    let live = true
    const origin = from ? Promise.resolve(from) : getCurrentPosition({ timeout: 8000 })
    origin
      .then(({ latitude, longitude }) => travelTimes({ lat: latitude, lng: longitude }, place))
      .then(t => { if (live) { setTimes(t); setStatus('ready') } })
      .catch(() => { if (live) setStatus('nolocation') })
    return () => { live = false }
  }, [place.lat, place.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (kind, url, open) => {
    track('get_there', { kind, ride: !!open, country: countryCode || null }, 'explore')
    if (open) open(place)
    else openOut(url)
  }
  // With a travel time the tile reads "6 min / Walk"; without one, "Walk / Maps"
  const time = id => formatMinutes(times?.[id]?.minutes)

  return (
    <Stack gap={2}>
      <div className="get-there-row" role="group" aria-label={`Get to ${place.name}`}>
        {MODES.map(m => (
          <button key={m.id} type="button" className="get-there-row__btn" onClick={() => go(m.id, mapsDirectionsUrl(place, m.id))}
            aria-label={`${m.label}${times?.[m.id] ? `, ${formatMinutes(times[m.id].minutes)}` : ''}`}>
            <Icon name={m.icon} size={22} />
            {status === 'locating' ? <><b className="is-waiting">…</b><span>{m.label}</span></>
              : time(m.id) ? <><b>{time(m.id)}</b><span>{m.label}</span></> : <><b>{m.label}</b><span>Maps</span></>}
          </button>
        ))}
        {ride && (
          <button type="button" className="get-there-row__btn" onClick={() => go(ride.id, null, ride.open)} aria-label={`Ride with ${ride.label}`}>
            <Icon name="taxi" size={22} />
            <b>{ride.label}</b>
            <span>Ride</span>
          </button>
        )}
      </div>
      <div className="get-there-row__foot">
        <Text variant="micro" tone="muted" as="p">
          {isIOS() ? <>Opens Apple Maps · <button type="button" className="get-there-row__link" onClick={() => go('google_maps', mapsDirectionsUrl(place, 'walk', 'google'))}>Google Maps</button></> : 'Opens Google Maps'}
        </Text>
        {onAnother}
      </div>
      {status === 'nolocation' && <Text variant="micro" tone="muted">Location is off, so no travel times. The maps app still finds the way.</Text>}
    </Stack>
  )
}
