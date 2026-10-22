import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore, useTripsStore } from '../../store'
import { findCurrentOrNextTrip } from '../../lib/dates'
import { getCurrentPosition, reverseGeocodeCountry } from '../../lib/geo'
import { nearby, embassy as findEmbassy, geocode, distanceM } from '../../lib/places'
import { safeUrl } from '../../lib/safeUrl'
import { GoogleAttribution } from '../../components/shared/PlaceMedia'
import { track } from '../../lib/analytics'
import { Card, ListRow, Button, IconTile, Banner, Text, Stack, Icon, Section, IconButton, SegmentedControl, Skeleton } from '../../ui'
import { EMERGENCY, EMBASSY_DATA, PASSPORT_COUNTRY_NAMES } from './data'

function regionName(code) {
  if (!code || code === 'DEFAULT') return null
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code } catch { return code }
}

// Last device-location lookup, reused for 10 minutes so reopening SOS is instant
let cachedLocation = null // { at, loc: { countryCode, countryName, city } }

// Resolves the device's current country. status: 'locating' | 'found' | 'unavailable'
function useCurrentCountry() {
  const fresh = cachedLocation && Date.now() - cachedLocation.at < 10 * 60 * 1000
  const [state, setState] = useState(fresh ? { status: 'found', loc: cachedLocation.loc } : { status: 'locating', loc: null })
  useEffect(() => {
    if (fresh) return
    let cancelled = false
    ;(async () => {
      try {
        const { latitude, longitude } = await getCurrentPosition({ timeout: 10000 })
        const loc = { ...(await reverseGeocodeCountry(latitude, longitude, 6000)), lat: latitude, lng: longitude }
        cachedLocation = { at: Date.now(), loc }
        if (!cancelled) setState({ status: 'found', loc })
      } catch {
        if (!cancelled) setState({ status: 'unavailable', loc: null })
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

const tel = (num) => `tel:${String(num).replace(/\s/g, '')}`

/** The main number, big, plus the rest as rows. */
function Numbers({ nums }) {
  const allSame = nums.police === nums.ambulance && nums.ambulance === nums.fire
  // 112 (EU and many others) reaches every service, whichever row it sits in
  const general = allSame ? nums.police : [nums.ambulance, nums.police, nums.fire].find(n => String(n) === '112')
  const hero = general
    ? { num: general, label: 'All emergencies', icon: 'sos' }
    : { num: nums.ambulance, label: 'Ambulance · medical emergency', icon: 'medical' }
  const rows = [
    !allSame && { label: 'Police', num: nums.police, icon: 'police' },
    !allSame && { label: 'Fire', num: nums.fire, icon: 'fire' },
    nums.tourist && { label: 'Tourist help', num: nums.tourist, icon: 'info' },
  ].filter(Boolean)
  return (
    <>
      <a className="sos-hero" href={tel(hero.num)} aria-label={`Call ${hero.num}, ${hero.label}`}>
        <span className="sos-hero__tile"><Icon name={hero.icon} size={32} /></span>
        <span className="sos-hero__text">
          <span className="sos-hero__num">{hero.num}</span>
          <span className="sos-hero__label">{hero.label}</span>
        </span>
        <Icon name="phone" size={24} />
      </a>
      {rows.length > 0 && (
        <Card variant="group">
          {rows.map(r => (
            <ListRow key={r.label} href={tel(r.num)} aria-label={`Call ${r.label}, ${r.num}`}
              icon={r.icon} tone={r.icon === 'info' ? 'neutral' : 'danger'} title={r.label}
              trailing={<span className="sos-num">{r.num}</span>} />
          ))}
        </Card>
      )}
    </>
  )
}

function EmergencyCard({ onClose, countryName, nums, profile }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="sos-card" role="dialog" aria-modal="true" aria-labelledby="sos-card-title" tabIndex={-1} ref={ref}>
      <Stack row justify="between">
        <Text variant="h2" as="h2" id="sos-card-title" className="sos-card__ink">Emergency card</Text>
        <IconButton icon="close" label="Close emergency card" onClick={onClose} />
      </Stack>
      <Text variant="body-lg" className="sos-card__muted">{countryName} · Show this screen to anyone helping you</Text>
      {[['Police', nums.police], ['Ambulance', nums.ambulance], ['Fire', nums.fire]].map(([label, num]) => (
        <a key={label} href={tel(num)} className="sos-card__row">
          <span className="sos-card__label">{label}</span>
          <span className="sos-card__num">{num}</span>
        </a>
      ))}
      <div className="sos-card__name">
        <span className="sos-card__label">{profile?.display_name ? 'My name' : 'Tip'}</span>
        <span className={profile?.display_name ? 'sos-card__who' : 'sos-card__tip'}>
          {profile?.display_name || 'Set your name in Profile, Settings so it shows here in an emergency.'}
        </span>
      </div>
    </div>,
    document.body,
  )
}

const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)

const HELP_KINDS = [
  { value: 'hospital', label: 'Hospitals', icon: 'medical' },
  { value: 'police', label: 'Police', icon: 'police' },
  { value: 'pharmacy', label: 'Pharmacies', icon: 'plus' },
]

/** Nearest hospitals, police stations and pharmacies from Google, with call and directions. */
function NearestHelp({ point }) {
  const [kind, setKind] = useState('hospital')
  const [state, setState] = useState({ loading: true, places: [] })
  useEffect(() => {
    let live = true
    setState({ loading: true, places: [] })
    nearby(kind, point.lat, point.lng).then(p => { if (live) setState({ loading: false, places: (p || []).slice(0, 3) }) })
    return () => { live = false }
  }, [kind, point.lat, point.lng])
  const meta = HELP_KINDS.find(k => k.value === kind)
  return (
    <Section title="Nearest help">
      <SegmentedControl label="Kind of help" value={kind} onChange={setKind} options={HELP_KINDS.map(({ value, label }) => ({ value, label }))} />
      {state.loading ? <Skeleton lines={3} /> : state.places.length === 0 ? (
        <Text variant="caption" tone="muted">Nothing found nearby. Call the emergency number above.</Text>
      ) : (
        <Card variant="group">
          {state.places.map(p => (
            <Stack key={p.place_id} row gap={3} align="center" className="sos-near">
              <IconTile icon={meta.icon} tone="danger" size="sm" />
              <Stack gap={0} grow>
                <Text variant="body" weight={600} as="p">{p.name}</Text>
                <Text variant="caption" tone="muted">{[p.lat != null && km(distanceM(point, { lat: p.lat, lng: p.lng })), p.short_address || p.address].filter(Boolean).join(' · ')}</Text>
              </Stack>
              {p.phone && <a className="c-iconbtn c-iconbtn--sunken" href={tel(p.phone)} aria-label={`Call ${p.name}`}><Icon name="phone" size={20} strokeWidth={2} /></a>}
              {safeUrl(p.maps_url) && <a className="c-iconbtn c-iconbtn--sunken" href={safeUrl(p.maps_url)} target="_blank" rel="noreferrer" aria-label={`Directions to ${p.name}`}><Icon name="navigation" size={20} strokeWidth={2} /></a>}
            </Stack>
          ))}
        </Card>
      )}
      <GoogleAttribution />
    </Section>
  )
}

/** Embassy from Google when the built-in list doesn't have this passport/country pair. */
function useGoogleEmbassy(passportName, dest, point, enabled) {
  const [found, setFound] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    ;(async () => {
      const at = point || (dest?.city ? await geocode(`${dest.city}, ${dest.country}`) : await geocode(dest.country))
      if (!at) return
      const list = await findEmbassy(passportName, at.lat, at.lng)
      if (live && list?.length) setFound(list[0])
    })()
    return () => { live = false }
  }, [enabled, passportName, dest?.code, dest?.city, point?.lat, point?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  return found
}

function Embassy({ profile, embassyDest, point }) {
  if (!profile?.passport_country) {
    return <ListRow as="div" icon="passport" tone="info" title="Your embassy" meta="Set your passport country in Profile, Settings to find it here." />
  }
  const passportName = PASSPORT_COUNTRY_NAMES[profile.passport_country] || profile.passport_country
  if (!embassyDest) {
    return <ListRow as="div" icon="passport" tone="info" title={`${passportName} embassy`} meta="Add an upcoming trip to find your embassy at the destination." />
  }
  if (embassyDest.code === profile.passport_country) {
    return <ListRow as="div" icon="passport" tone="info" title="Your embassy" meta={`${embassyDest.country} is your passport country, so no embassy needed. Abroad, it shows up here.`} />
  }
  const builtIn = EMBASSY_DATA[`${profile.passport_country}_${embassyDest.code}`]
  return <EmbassyDetails passportName={passportName} embassyDest={embassyDest} builtIn={builtIn} point={point} />
}

function EmbassyDetails({ passportName, embassyDest, builtIn, point }) {
  const google = useGoogleEmbassy(passportName, embassyDest, point, !builtIn)
  const known = builtIn || (google && { address: google.address, phone: google.phone })
  const mapsHref = safeUrl(google?.maps_url) || `https://maps.google.com/?q=${encodeURIComponent(known ? known.address : `${passportName} embassy ${embassyDest.city || embassyDest.country}`)}`
  return (
    <Stack gap={3}>
      <Stack row gap={3} align="center">
        <IconTile icon="passport" tone="info" />
        <Stack gap={1} grow>
          <Text variant="body" weight={600} as="p">{passportName} embassy · {embassyDest.country}</Text>
          <Text variant="caption" tone="muted">{known ? known.address : 'Exact details unavailable. Maps finds the nearest one.'}</Text>
        </Stack>
        {known?.phone && <a className="c-iconbtn c-iconbtn--sunken" href={tel(known.phone)} aria-label={`Call embassy, ${known.phone}`}><Icon name="phone" size={20} strokeWidth={2} /></a>}
      </Stack>
      <a className="c-btn c-btn--secondary c-btn--md" href={mapsHref} target="_blank" rel="noopener noreferrer">
        <Icon name="map" size={18} strokeWidth={2} />Open in Maps
      </a>
      <Text variant="micro" tone="muted">Staying long? Register your trip with your embassy.</Text>
    </Stack>
  )
}

const SAFETY_TIPS = [
  'Screenshot this page before going offline',
  'Save your hotel address in the local script',
  'Keep a photo of your passport on your phone',
  'Put your travel insurance number in your contacts',
  'Know the nearest hospital to where you are staying',
]

export default function SosTool({ onTitle }) {
  const { profile } = useAuthStore()
  const { trips } = useTripsStore()
  const [showCard, setShowCard] = useState(false)
  const current = useCurrentCountry()

  // Priority: device location → active/next trip country → passport country → default
  const { trip: destinationTrip, isLive: hasLiveTrip } = findCurrentOrNextTrip(trips)
  const activeTrip = hasLiveTrip ? destinationTrip : null
  const nextTrip = hasLiveTrip ? null : destinationTrip
  const locCountry = current.status === 'found' ? current.loc : null
  const locPoint = locCountry?.lat != null ? { lat: locCountry.lat, lng: locCountry.lng } : null
  const source = locCountry ? 'location'
    : activeTrip?.destination_country_code ? 'active_trip'
    : nextTrip?.destination_country_code ? 'next_trip'
    : profile?.passport_country ? 'passport'
    : 'default'
  const countryCode = locCountry?.countryCode || destinationTrip?.destination_country_code || profile?.passport_country || 'DEFAULT'
  const countryName = locCountry?.countryName || destinationTrip?.destination_country || regionName(profile?.passport_country) || 'your destination'
  const nums = EMERGENCY[countryCode] || EMERGENCY.DEFAULT

  const sourceLabel = {
    location: `From your location${locCountry?.city ? `, ${locCountry.city}` : ''}`,
    active_trip: `From your trip to ${countryName}`,
    next_trip: `From your next trip to ${countryName}`,
    passport: `From your passport country, ${countryName}`,
    default: 'General international emergency numbers',
  }[source]

  // Embassy lookup: the country you're in (by location) wins over the trip destination
  const embassyDest = locCountry
    ? { code: locCountry.countryCode, country: locCountry.countryName, city: locCountry.city }
    : destinationTrip
      ? { code: destinationTrip.destination_country_code, country: destinationTrip.destination_country, city: destinationTrip.destination_city }
      : null

  const trackedRef = useRef(false)
  useEffect(() => {
    if (trackedRef.current || current.status === 'locating') return
    trackedRef.current = true
    track('sos_opened', { source, country: countryCode === 'DEFAULT' ? null : countryCode }, 'toolbox')
  }, [current.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onTitle?.(countryCode === 'DEFAULT' ? 'SOS' : `SOS · ${countryName}`, current.status === 'locating' ? `${sourceLabel} · checking your location` : sourceLabel)
  }, [countryName, sourceLabel, current.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack gap={4}>
      {showCard && <EmergencyCard onClose={() => setShowCard(false)} countryName={countryName} nums={nums} profile={profile} />}

      <Numbers nums={nums} />

      <Card>
        <Embassy profile={profile} embassyDest={embassyDest} point={locPoint} />
      </Card>

      {locPoint && <NearestHelp point={locPoint} />}

      <Button variant="dark" size="lg" icon="id-card" block onClick={() => setShowCard(true)}>Show emergency card</Button>

      {!profile?.display_name && (
        <Banner variant="hint" icon="info">Set your name in Profile, Settings so it appears on the emergency card.</Banner>
      )}

      <Section title="Safety basics">
        <Card variant="group">
          {SAFETY_TIPS.map(tip => <ListRow key={tip} as="div" title={tip} titleClassName="w-500" />)}
        </Card>
      </Section>

      <Text variant="micro" tone="muted" align="center">If in doubt, call {nums.police === '112' || nums.ambulance === '112' ? '112' : nums.ambulance}.</Text>
    </Stack>
  )
}
