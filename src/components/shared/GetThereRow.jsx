import { Icon, Text, Stack } from '../../ui'
import { mapsDirectionsUrl, openOut, rideOptions, formatMinutes, isIOS } from '../../lib/getThere'
import { track } from '../../lib/analytics'
import './getThere.css'

const MODES = [
  { id: 'walk', label: 'Walk', icon: 'walk' },
  { id: 'transit', label: 'Transit', icon: 'metro' },
  { id: 'drive', label: 'Drive', icon: 'car' },
]

/**
 * "Get there" inline: one tap per mode opens the phone's maps app on that mode, plus the first ride app for the
 * country. Same links as GetThereSheet, laid out as a row of tiles for the HONK result. No travel-time lookup
 * (that's a paid Routes call): the walk tile shows the walk time the place already came with, when there is one.
 * place: { name, address?, lat?, lng?, place_id?, walk_min? }; countryCode: ISO code of the place's country.
 */
export default function GetThereRow({ place, countryCode, onAnother }) {
  const ride = rideOptions(countryCode)[0]
  const go = (kind, url, open) => {
    track('get_there', { kind, ride: !!open, country: countryCode || null }, 'explore')
    if (open) open(place)
    else openOut(url)
  }
  // With a time the tile reads "6 min / Walk"; without one, "Walk / Maps"
  const time = id => (id === 'walk' ? formatMinutes(place.walk_min) : null)

  return (
    <Stack gap={2}>
      <div className="get-there-row" role="group" aria-label={`Get to ${place.name}`}>
        {MODES.map(m => (
          <button key={m.id} type="button" className="get-there-row__btn" onClick={() => go(m.id, mapsDirectionsUrl(place, m.id))}
            aria-label={`${m.label}${time(m.id) ? `, ${time(m.id)}` : ''}`}>
            <Icon name={m.icon} size={22} />
            {time(m.id) ? <><b>{time(m.id)}</b><span>{m.label}</span></> : <><b>{m.label}</b><span>Maps</span></>}
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
    </Stack>
  )
}
