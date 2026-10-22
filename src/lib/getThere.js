// "Get there": open the phone's maps app on a travel mode, or a ride-hailing app with the destination filled in.
// Travel times come from the places Edge Function (Google Routes); the links themselves need no key.
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const platform = () => Capacitor.getPlatform() // 'ios' | 'android' | 'web'

/** Hand a URL to the OS so the matching app opens (Capacitor launches external URLs and app schemes as intents). */
export function openOut(url) {
  if (platform() === 'web') window.open(url, '_blank', 'noopener')
  else window.location.href = url
}

/** Custom-scheme apps (grab://, bolt://): try the app, fall back to its store page if nothing took over. */
function openAppOrStore(appUrl, stores) {
  if (platform() === 'web') { openOut(stores.web); return }
  let left = false
  const onHide = () => { if (document.visibilityState === 'hidden') left = true }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = appUrl
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!left) openOut(platform() === 'ios' ? stores.ios : stores.android)
  }, 1500)
}

const enc = encodeURIComponent

// ── Maps: the default app per platform (Apple Maps on iPhone, Google Maps on Android and the web) ──
const APPLE_MODE = { walk: 'w', transit: 'r', drive: 'd' }
const GOOGLE_MODE = { walk: 'walking', transit: 'transit', drive: 'driving' }

export function mapsDirectionsUrl(dest, mode, app = platform() === 'ios' ? 'apple' : 'google') {
  const at = dest.lat != null ? `${dest.lat},${dest.lng}` : dest.address || dest.name
  if (app === 'apple') return `https://maps.apple.com/?daddr=${enc(at)}&dirflg=${APPLE_MODE[mode]}${dest.name ? `&q=${enc(dest.name)}` : ''}`
  const place = dest.place_id ? `&destination_place_id=${enc(dest.place_id)}` : ''
  return `https://www.google.com/maps/dir/?api=1&destination=${enc(dest.lat != null ? at : (dest.address || dest.name))}${place}&travelmode=${GOOGLE_MODE[mode]}`
}

export const isIOS = () => platform() === 'ios'

// ── Ride-hailing, by country. Affiliate / partner IDs go in AFFILIATE when the programmes are set up. ──
const AFFILIATE = { uber: '', lyft: '' }

const SEA = ['SG', 'MY', 'TH', 'VN', 'ID', 'PH', 'KH', 'MM']
const LYFT = ['US', 'CA']
const BOLT = ['EE', 'LV', 'LT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'RS', 'PT', 'ES', 'GB', 'IE', 'NL', 'BE', 'DE', 'AT', 'SE', 'NO', 'FI', 'DK', 'GE', 'UA', 'CY', 'MT', 'ZA', 'NG', 'KE', 'GH', 'TZ', 'UG', 'TN', 'MA', 'MX']
// Uber pulled out of most of Southeast Asia (Grab bought it) and isn't in China
const NO_UBER = [...SEA, 'CN', 'DK']

const RIDES = {
  uber: {
    label: 'Uber',
    open: d => openOut(`https://m.uber.com/ul/?action=setPickup&pickup=my_location${d.lat != null ? `&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}` : ''}&dropoff[nickname]=${enc(d.name || '')}&dropoff[formatted_address]=${enc(d.address || '')}${AFFILIATE.uber ? `&client_id=${AFFILIATE.uber}` : ''}`),
  },
  lyft: {
    label: 'Lyft',
    open: d => openOut(`https://lyft.com/ride?id=lyft${d.lat != null ? `&destination[latitude]=${d.lat}&destination[longitude]=${d.lng}` : ''}${AFFILIATE.lyft ? `&partner=${AFFILIATE.lyft}` : ''}`),
  },
  grab: {
    label: 'Grab',
    open: d => openAppOrStore(
      `grab://open?screenType=BOOKING${d.lat != null ? `&dropOffLatitude=${d.lat}&dropOffLongitude=${d.lng}` : ''}&dropOffName=${enc(d.name || '')}`,
      { ios: 'https://apps.apple.com/app/id647268330', android: 'https://play.google.com/store/apps/details?id=com.grabtaxi.passenger', web: 'https://www.grab.com/' },
    ),
  },
  bolt: {
    label: 'Bolt',
    open: d => openAppOrStore(
      `bolt://ride${d.lat != null ? `?destination_lat=${d.lat}&destination_lng=${d.lng}` : ''}`,
      { ios: 'https://apps.apple.com/app/id675033630', android: 'https://play.google.com/store/apps/details?id=ee.mtakso.client', web: 'https://bolt.eu/' },
    ),
  },
}

/** Ride apps that work in a country (ISO code), most useful first. Unknown country: Uber. */
export function rideOptions(countryCode) {
  const cc = (countryCode || '').toUpperCase()
  const out = []
  if (SEA.includes(cc)) out.push('grab')
  if (!NO_UBER.includes(cc)) out.push('uber')
  if (LYFT.includes(cc)) out.push('lyft')
  if (BOLT.includes(cc)) out.push('bolt')
  return out.map(id => ({ id, ...RIDES[id] }))
}

/** Walk / transit / drive times from `from` to `to` ({ lat, lng }); null when Google can't say. */
export async function travelTimes(from, to) {
  if (!from || to?.lat == null) return null
  try {
    const { data, error } = await supabase.functions.invoke('places', { body: { action: 'routes', lat: from.lat, lng: from.lng, to_lat: to.lat, to_lng: to.lng } })
    return error ? null : data
  } catch { return null }
}

export const formatMinutes = m => (m == null ? null : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`)
