import { useState, useEffect, useRef } from 'react'
import { gooseyDiscover } from '../../lib/gemini'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/http'
import { track } from '../../lib/analytics'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import {
  Screen, ScreenHeader, Card, Chip, Button, IconButton, Text, Stack, Icon, Banner, Loading, ErrorState, GooseMark, LinkButton, Toast,
} from '../../ui'
import AiDisclosure from './AiDisclosure'
import { safeUrl } from '../../lib/safeUrl'
import { reverseGeocode } from '../../lib/places'
import { PlacePhoto, GoogleRating, OpenNow, GoogleAttribution, InkWait } from '../../components/shared/PlaceMedia'
import GetThereSheet from '../../components/shared/GetThereSheet'
import IdeaSheet from './IdeaSheet'
import { tripsForPlace, saveIdeaTo, moveIdea, createTripAndSave } from './saveIdea'
import { suggestForPlace } from '../../lib/tripPick'
import TripPickerSheet from '../../components/shared/TripPickerSheet'
import { useTripsStore, useIdeasStore, tripForCity } from '../../store'

export const MOODS = [
  { id: 'hungry',    label: "I'm hungry",        icon: 'restaurant' },
  { id: 'explore',   label: 'Show me something', icon: 'compass' },
  { id: 'bored',     label: "I'm bored",         icon: 'sparkles' },
  { id: 'treat',     label: 'Treat myself',      icon: 'star' },
  { id: 'cheap',     label: 'On a budget',       icon: 'currency' },
  { id: 'culture',   label: 'Culture me',        icon: 'museum' },
  { id: 'nightlife', label: 'Night out',         icon: 'moon' },
  { id: 'local',     label: 'Be a local',        icon: 'map' },
]

function useGeolocation() {
  const [state, setState] = useState({ loading: true, city: null, country: null, error: null, coords: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, loading: false, error: 'This browser can\'t share your location.' }))
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setState(s => ({ ...s, coords: { latitude, longitude } }))
        try {
          // Google first (server-side), OpenStreetMap if that fails
          let place = await reverseGeocode(latitude, longitude)
          if (!place?.city) {
            const res = await fetchWithTimeout(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
              { headers: { 'Accept-Language': 'en' } }
            )
            const addr = (await res.json()).address || {}
            place = { city: addr.city || addr.town || addr.municipality || addr.village || addr.county || 'your area', country: addr.country || '' }
          }
          setState({ loading: false, city: place.city, country: place.country || '', countryCode: place.country_code || '', error: null, coords: { latitude, longitude } })
        } catch {
          setState({ loading: false, city: null, country: null, error: 'Couldn\'t work out the name of where you are.', coords: { latitude, longitude } })
        }
      },
      (err) => {
        const msgs = {
          1: 'Location is off for this app. Turn it on, or tell Goose the city.',
          2: 'Your location isn\'t available right now. Check your connection.',
          3: 'Finding your location took too long.',
        }
        setState({ loading: false, city: null, country: null, error: msgs[err.code] || 'Location error.', coords: null })
      },
      { timeout: 10000, maximumAge: 300000 }
    )
  }, [attempt])

  return { ...state, retry: () => setAttempt(a => a + 1) }
}

/** HONK: one great place near you, right now. */
export default function HonkView({ initialMood = null, onBack }) {
  const geo = useGeolocation()
  const [selectedMood, setSelectedMood] = useState(initialMood)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [manualCity, setManualCity] = useState(null)
  const seen = useRef([]) // Google places already suggested this session, so "Another spot" moves on
  const [getThere, setGetThere] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const say = (msg, change) => { setToast({ msg, change }); setTimeout(() => setToast(null), change ? 5000 : 2600) }
  const autoRan = useRef(false)

  // Effective location: GPS city if available, else manual selection
  const effectiveCity = geo.city || manualCity?.city || null
  const effectiveCountry = geo.city ? geo.country : (manualCity?.country || '')
  const effectiveCountryCode = geo.city ? geo.countryCode : (manualCity?.country_code || '')

  // Save the spot to the trip that fits by dates and distance (or pick / start one), same as the guide
  const trips = useTripsStore(s => s.trips)
  const here = result?.lat != null ? { lat: Number(result.lat), lng: Number(result.lng) } : geo.coords ? { lat: geo.coords.latitude, lng: geo.coords.longitude } : null
  const honkTrip = (here && suggestForPlace(trips, here)?.trip) || tripForCity(trips, effectiveCity)
  const { load: loadIdeas, statusFor } = useIdeasStore()
  useIdeasStore(s => s.byTrip[honkTrip?.id])
  useEffect(() => { if (honkTrip?.id) loadIdeas(honkTrip.id) }, [honkTrip?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const honkStatus = result && honkTrip ? statusFor(honkTrip.id, result) : null
  const honkKind = /restaurant|cafe|bar|food|bakery|eat/i.test(result?.type || '') ? 'restaurant' : 'attraction'
  const honkDest = { city: effectiveCity, country: effectiveCountry, country_code: effectiveCountryCode }
  const [pickFor, setPickFor] = useState(null) // { ranked, point, from?: { tripId, idea } }: the "Save to" picker
  const saveHonk = async () => {
    if (honkStatus) { setIdeaOpen(true); return }
    try {
      const { suggested, ranked, point } = await tripsForPlace(honkDest, result)
      if (!suggested) { setPickFor({ ranked, point }); return }
      const idea = await saveIdeaTo(suggested.trip, result, honkKind, 'goosey')
      say(`Saved to ${suggested.trip.title} ideas`, () => setPickFor({ ranked, point, from: { tripId: suggested.trip.id, idea } }))
    } catch { say('Couldn\'t save it. Check your connection.') }
  }
  const pickTrip = async (trip) => {
    const { from } = pickFor
    if (from?.tripId === trip.id) return
    await (from ? moveIdea(from.tripId, from.idea, trip, result, honkKind, 'goosey') : saveIdeaTo(trip, result, honkKind, 'goosey'))
    say(`Saved to ${trip.title} ideas`)
  }
  const createAndSave = async (title) => {
    const { from, point } = pickFor
    const trip = await createTripAndSave(honkDest, result, honkKind, 'goosey', { title, point })
    if (from?.idea) await useIdeasStore.getState().removeIdea(from.tripId, from.idea.id)
    say(`Saved to your new trip, ${trip.title}`)
  }

  const handleHonk = async (moodId = selectedMood) => {
    if (!moodId || !effectiveCity) return
    setLoading(true); setError(null)
    try {
      const moodLabel = MOODS.find(m => m.id === moodId)?.label || moodId
      const coords = geo.city ? geo.coords : null
      const ask = { city: effectiveCity, country: effectiveCountry, mood: moodLabel }
      // Facts first: the real place from Google shows at once, the Goose's words ink in after
      const discovered = await gooseyDiscover({ ...ask, lat: coords?.latitude, lng: coords?.longitude, exclude: seen.current, stage: 'facts' })
      if (discovered?.place_id) seen.current = [...seen.current, discovered.place_id].slice(-20)
      setResult(discovered)
      if (discovered?.pending) {
        setLoading(false)
        gooseyDiscover({ ...ask, stage: 'voice', place: discovered })
          .then(words => setResult(r => (r?.place_id === discovered.place_id ? { ...r, ...words, pending: false } : r)))
          .catch(() => setResult(r => (r?.place_id === discovered.place_id ? { ...r, why: r.summary || '', pending: false } : r)))
      }
      track('honk_used', { mood: moodId, gps: !!geo.city }, 'goosey')
      // Stat trigger: HONK used
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'honks_used', p_amount: 1 })
      } catch {}
    } catch (e) {
      track('ai_error', { feature: 'honk' }, 'goosey')
      setError(e?.message || 'Something went wrong on our side.')
    } finally { setLoading(false) }
  }

  // A mood picked on the Explore card runs as soon as the location is known
  useEffect(() => {
    if (initialMood && effectiveCity && !autoRan.current) { autoRan.current = true; handleHonk(initialMood) }
  }, [effectiveCity]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setResult(null); setSelectedMood(null); setError(null) }
  // The Goose's words "ink in" when they arrive after the place is already on screen
  const inked = useRef(null)
  if (result?.pending) inked.current = result.place_id
  const honkInk = result && !result.pending && inked.current === result.place_id ? 'ink-in' : undefined
  const place = effectiveCity ? `${effectiveCity}${effectiveCountry ? `, ${effectiveCountry}` : ''}` : null

  return (
    <Screen gap={4} labelledBy="honk-title">
      <ScreenHeader onBack={onBack} backLabel="Back to Explore" title="HONK" titleId="honk-title"
        meta={geo.loading ? 'Finding where you are' : place ? `Near ${place}` : 'Tell Goose where you are'} />

      {geo.loading && !manualCity && (
        <Loading title="Finding where you are">Goose uses your location to pick somewhere walkable.</Loading>
      )}

      {!geo.loading && geo.error && !manualCity && (
        <Card variant="raised">
          <Stack row gap={3}>
            <GooseMark expression="worried" size={44} tile tileSize="sm" />
            <Stack gap={1} grow>
              <Text variant="card-title" as="h2">Where are you?</Text>
              <Text variant="caption" tone="muted">{geo.error}</Text>
            </Stack>
          </Stack>
          <CityAutocomplete label="Your city" placeholder="Type your city" icon="search" onSelect={(r) => setManualCity(r)} />
          <Button variant="ghost" icon="navigation" onClick={geo.retry}>Try my location again</Button>
        </Card>
      )}

      {effectiveCity && !result && !loading && (
        <>
          {error && (
            <ErrorState compact onRetry={selectedMood ? () => handleHonk() : undefined}>
              {`Goose couldn't find a spot this time. ${error}`}
            </ErrorState>
          )}
          <Card variant="inverse">
            <Stack row gap={3}>
              <GooseMark expression={selectedMood ? 'excited' : 'happy'} size={44} tile tileSize="sm" />
              <Stack gap={1} grow>
                <Text variant="title" tone="inverse" as="h2">What are you in the mood for?</Text>
                <Text variant="caption" tone="inverse-muted">One great place, walkable from where you are.</Text>
              </Stack>
            </Stack>
            <div className="explore-moods" role="radiogroup" aria-label="Mood">
              {MOODS.map(m => (
                <Chip key={m.id} icon={m.icon} role="radio" aria-checked={selectedMood === m.id} aria-pressed={undefined}
                  selected={selectedMood === m.id} onClick={() => setSelectedMood(m.id)} className="explore-mood">
                  {m.label}
                </Chip>
              ))}
            </div>
          </Card>
          <Button variant="primary" size="lg" block icon="megaphone" disabled={!selectedMood} onClick={() => handleHonk()}>HONK</Button>
          {manualCity && <LinkButton icon="navigation" onClick={() => { setManualCity(null); geo.retry() }}>Use my location instead</LinkButton>}
        </>
      )}

      {loading && <Loading title={`Goose is scouting ${effectiveCity}`}>Usually under 10 seconds.</Loading>}

      {result && !loading && (
        <>
          <Card variant="raised" aria-labelledby="honk-result">
            <Stack row justify="between" align="start" gap={3}>
              <Stack gap={1} grow>
                <Text variant="overline" tone="accent" as="p">Goose says go here</Text>
                <Text variant="title" as="h2" id="honk-result">{result.name}</Text>
                <Text variant="caption" tone="muted">{[result.type, result.neighbourhood, result.price_range].filter(Boolean).join(' · ')}</Text>
              </Stack>
              {result.goose_rating && <Chip icon="star" className={honkInk} aria-label={`Goose says: ${result.goose_rating}`}>{result.goose_rating}</Chip>}
            </Stack>
            {result.photo && <PlacePhoto name={result.photo} alt={result.name} />}
            {(result.rating != null || result.walk_min != null || result.open_now) && (
              <Stack row gap={2} wrap>
                <GoogleRating rating={result.rating} count={result.rating_count} />
                {result.open_now && <OpenNow open />}
                {result.walk_min != null && <Chip icon="walk">{`${result.walk_min} min walk`}</Chip>}
              </Stack>
            )}
            {result.pending ? <InkWait lines={3} label="The Goose is writing" />
              : result.why && <Text variant="body" tone="secondary" className={honkInk}>{result.why}</Text>}
            {result.best_time && (
              <Stack row gap={2} className={honkInk}><Icon name="clock" size={18} className="tone-muted" /><Text variant="caption" tone="muted">Best time: {result.best_time}</Text></Stack>
            )}
            {result.insider_tip && <Banner icon="lightbulb" title="Insider tip" className={honkInk}>{result.insider_tip}</Banner>}
            <Stack row gap={2}>
              {(result.lat != null || result.address) && (
                <Button variant="primary" className="grow" icon="navigation" onClick={() => setGetThere(true)}>Get there</Button>
              )}
              {!result.lat && !result.address && safeUrl(result.google_maps_url) && (
                <a className="c-btn c-btn--primary c-btn--md grow" href={safeUrl(result.google_maps_url)} target="_blank" rel="noreferrer">Directions</a>
              )}
              <IconButton icon={honkStatus?.state === 'booked' ? 'calendar' : honkStatus ? 'check' : 'plus'} variant={honkStatus?.state === 'booked' ? 'accent' : 'sunken'}
                className={honkStatus?.state === 'idea' ? 'is-saved' : undefined} aria-pressed={!!honkStatus}
                label={honkStatus ? `${result.name} is on your trip` : `Save ${result.name} to trip ideas`} onClick={saveHonk} />
              <IconButton icon="refresh" variant="sunken" label="Another spot" onClick={reset} />
            </Stack>
          </Card>
          {result.place_id && <GoogleAttribution />}
          <AiDisclosure city={effectiveCity} what="HONK" />
          {getThere && <GetThereSheet place={result} countryCode={effectiveCountryCode} onClose={() => setGetThere(false)} />}
          {pickFor && <TripPickerSheet title={pickFor.from ? 'Move to' : 'Save to'} subtitle={result.name} ranked={pickFor.ranked} city={effectiveCity}
            onPick={pickTrip} onCreate={createAndSave} onClose={() => setPickFor(null)} />}
          {ideaOpen && honkTrip && <IdeaSheet item={result} kind={honkKind} status={honkStatus} trip={honkTrip} onSaved={say} onClose={() => setIdeaOpen(false)} />}
          {toast && <Toast icon="check" title={toast.msg}
            action={toast.change && <Button size="sm" variant="secondary" onClick={() => { toast.change(); setToast(null) }}>Change</Button>} />}
        </>
      )}
    </Screen>
  )
}
