import { useState, useEffect, useRef } from 'react'
import { gooseyDiscover } from '../../lib/gemini'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/http'
import { track } from '../../lib/analytics'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import {
  Screen, ScreenHeader, Card, Chip, Button, Text, Stack, Icon, IconTile, Banner, Loading, ErrorState, GooseMark, Toast, Sheet,
} from '../../ui'
import SectionTour from '../../components/shared/SectionTour'
import AiDisclosure from './AiDisclosure'
import { safeUrl } from '../../lib/safeUrl'
import { reverseGeocode } from '../../lib/places'
import { PlacePhoto, GoogleRating, OpenNow, GoogleAttribution, InkWait } from '../../components/shared/PlaceMedia'
import GetThereRow from '../../components/shared/GetThereRow'
import IdeaSheet from './IdeaSheet'
import { tripsForPlace, saveIdeaTo, moveIdea, createTripAndSave } from './saveIdea'
import { suggestForPlace } from '../../lib/tripPick'
import TripPickerSheet from '../../components/shared/TripPickerSheet'
import { useTripsStore, useIdeasStore, tripForCity } from '../../store'
import { MOODS } from '../../../supabase/functions/_shared/honkMoods.js'
import './explore.css'

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

/** HONK tab: pick a mood, Goose finds one great place near you, open now. The spot opens in a sheet. */
export default function HonkView() {
  const geo = useGeolocation()
  const [mood, setMood] = useState(null)   // the mood behind the open sheet
  const [queued, setQueued] = useState(null) // tapped before the location was known; runs once it is
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [manualCity, setManualCity] = useState(null)
  const [picking, setPicking] = useState(false) // "Change" location
  const seen = useRef([]) // Google places already suggested this session, so "Another spot" moves on
  const inFlight = useRef(false) // one request at a time: a double tap doesn't start two
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const say = (msg, change) => { setToast({ msg, change }); setTimeout(() => setToast(null), change ? 5000 : 2600) }

  // Effective location: a city picked by hand wins, else the GPS city
  const effectiveCity = manualCity?.city || geo.city || null
  const effectiveCountry = manualCity ? (manualCity.country || '') : geo.country
  const effectiveCountryCode = manualCity ? (manualCity.country_code || '') : geo.countryCode
  const gpsCoords = manualCity ? null : geo.coords

  // Save the spot to the trip that fits by dates and distance (or pick / start one), same as the guide
  const trips = useTripsStore(s => s.trips)
  const here = result?.lat != null ? { lat: Number(result.lat), lng: Number(result.lng) } : gpsCoords ? { lat: gpsCoords.latitude, lng: gpsCoords.longitude } : null
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

  const handleHonk = async (moodId) => {
    if (!moodId || inFlight.current) return
    setMood(moodId); setResult(null); setError(null)
    if (!effectiveCity) { setQueued(moodId); return }
    inFlight.current = true
    setLoading(true)
    try {
      const moodLabel = MOODS.find(m => m.id === moodId)?.label || moodId
      const ask = { city: effectiveCity, country: effectiveCountry, mood: moodLabel }
      // Facts first: the real place from Google shows at once, the Goose's words ink in after
      const discovered = await gooseyDiscover({ ...ask, lat: gpsCoords?.latitude, lng: gpsCoords?.longitude, exclude: seen.current, stage: 'facts' })
      if (discovered?.place_id) seen.current = [...seen.current, discovered.place_id].slice(-20)
      setResult(discovered)
      if (discovered?.pending) {
        setLoading(false)
        gooseyDiscover({ ...ask, stage: 'voice', place: discovered })
          .then(words => setResult(r => (r?.place_id === discovered.place_id ? { ...r, ...words, pending: false } : r)))
          .catch(() => setResult(r => (r?.place_id === discovered.place_id ? { ...r, why: r.summary || '', pending: false } : r)))
      }
      track('honk_used', { mood: moodId, gps: !!gpsCoords }, 'goosey')
      // Stat trigger: HONK used
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'honks_used', p_amount: 1 })
      } catch {}
    } catch (e) {
      track('ai_error', { feature: 'honk' }, 'goosey')
      setError(e?.message || 'Something went wrong on our side.')
    } finally { inFlight.current = false; setLoading(false) }
  }

  // A mood tapped while Goose was still finding you runs as soon as the location is known
  useEffect(() => {
    if (queued && effectiveCity) { const m = queued; setQueued(null); handleHonk(m) }
  }, [effectiveCity]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setMood(null); setQueued(null); setResult(null); setError(null) }
  // The Goose's words "ink in" when they arrive after the place is already on screen
  const inked = useRef(null)
  if (result?.pending) inked.current = result.place_id
  const honkInk = result && !result.pending && inked.current === result.place_id ? 'ink-in' : undefined
  const place = effectiveCity ? `${effectiveCity}${effectiveCountry ? `, ${effectiveCountry}` : ''}` : null
  const asking = picking || (!geo.loading && geo.error && !manualCity)
  const sheetOpen = !!mood && !asking

  const where = geo.loading && !manualCity ? 'Finding where you are' : place ? `Near ${place}` : 'Tell Goose where you are'
  const addLabel = honkStatus?.state === 'booked' ? `Booked on ${honkTrip.title}`
    : honkStatus ? `On ${honkTrip.title} ideas`
      : honkTrip ? `Add to ${honkTrip.title}` : 'Add to a trip'

  return (
    <Screen gap={4} labelledBy="honk-title" className="honk">
      <ScreenHeader title="HONK" titleId="honk-title" actions={<SectionTour section="honk" />}
        meta={(
          <span className="honk-where">
            <Icon name="navigation" size={16} />
            <span className="honk-where__text">{where}</span>
            {!asking && !(geo.loading && !manualCity) && <button type="button" className="honk-where__change" onClick={() => setPicking(true)} data-tour="honk-where">Change</button>}
          </span>
        )} />

      {asking ? (
        <Card variant="raised">
          <Stack row gap={3}>
            <GooseMark expression="worried" size={44} tile tileSize="sm" />
            <Stack gap={1} grow>
              <Text variant="card-title" as="h2">Where are you?</Text>
              <Text variant="caption" tone="muted">{picking ? 'Pick the city Goose should look in.' : geo.error}</Text>
            </Stack>
          </Stack>
          <CityAutocomplete label="Your city" placeholder="Type your city" icon="search" onSelect={(r) => { setManualCity(r); setPicking(false) }} />
          <Stack row gap={2} wrap>
            <Button variant="ghost" icon="navigation" onClick={() => { setManualCity(null); setPicking(false); geo.retry() }}>Use my location</Button>
            {picking && <Button variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>}
          </Stack>
        </Card>
      ) : (
        <Text variant="body" as="p" className="honk-blurb">Got time to kill? HONK your mood and Goose finds something great nearby, open now and a short walk away.</Text>
      )}

      <div className="honk-moods" role="group" aria-label="Moods" data-tour="honk-card">
        {MOODS.map(m => (
          <button key={m.id} type="button" className={`honk-mood tint-${m.tone}`} onClick={() => handleHonk(m.id)} disabled={asking}>
            <IconTile icon={m.icon} tone={m.tone} size="lg" className="c-tile--solid" />
            <span className="honk-mood__text">
              <span className="honk-mood__label">{m.label}</span>
              <span className="honk-mood__hint">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {sheetOpen && (
        <Sheet onClose={close} title={result?.name || MOODS.find(m => m.id === mood)?.label}
          subtitle={result ? [result.type, result.neighbourhood, result.price_range].filter(Boolean).join(' · ') : null} className="honk-sheet">
          <div className="honk-sheet__content" data-tour="honk-result">
          {(loading || (queued && !effectiveCity)) && (
            <Loading title={effectiveCity ? `Goose is scouting ${effectiveCity}` : 'Finding where you are'}>Usually under 10 seconds.</Loading>
          )}
          {error && !loading && (
            <ErrorState compact onRetry={() => handleHonk(mood)}>{`Goose couldn't find a spot this time. ${error}`}</ErrorState>
          )}
          {result && !loading && (
            <>
              {result.photo && <PlacePhoto name={result.photo} alt={result.name} className="honk-photo" />}
              <Stack row gap={2} wrap>
                {result.goose_rating && <Chip icon="star" tone="accent" className={honkInk} aria-label={`Goose says: ${result.goose_rating}`}>{result.goose_rating}</Chip>}
                <GoogleRating rating={result.rating} count={result.rating_count} />
                {result.open_now && <OpenNow open />}
                {result.walk_min != null && <Chip icon="walk">{`${result.walk_min} min walk`}</Chip>}
              </Stack>
              {result.pending ? <InkWait lines={2} label="The Goose is writing" />
                : result.why && <Text variant="body" tone="secondary" className={honkInk}>{result.why}</Text>}
              {result.insider_tip && <Banner icon="lightbulb" title="Insider tip" className={honkInk}>{result.insider_tip}</Banner>}
              <Button variant={honkStatus ? 'secondary' : 'primary'} size="lg" block
                icon={honkStatus?.state === 'booked' ? 'calendar' : honkStatus ? 'check' : 'plus'} onClick={saveHonk}>{addLabel}</Button>
              <Stack gap={2}>
                <Text variant="label" as="p">Get there</Text>
                {result.lat != null || result.address ? (
                  <GetThereRow place={result} countryCode={effectiveCountryCode}
                    onAnother={<Button variant="ghost" size="sm" icon="refresh" onClick={() => handleHonk(mood)}>Another spot</Button>} />
                ) : (
                  <Stack row gap={2}>
                    {safeUrl(result.google_maps_url) && (
                      <a className="c-btn c-btn--secondary c-btn--md grow" href={safeUrl(result.google_maps_url)} target="_blank" rel="noreferrer">Directions</a>
                    )}
                    <Button variant="ghost" icon="refresh" onClick={() => handleHonk(mood)}>Another spot</Button>
                  </Stack>
                )}
              </Stack>
              <Text variant="micro" tone="muted" as="p">Opening hours and walking times come from Google and can change. Check before you set off.</Text>
              {result.place_id && <GoogleAttribution />}
              <AiDisclosure city={effectiveCity} what="HONK" />
            </>
          )}
          </div>
        </Sheet>
      )}
      {pickFor && result && <TripPickerSheet title={pickFor.from ? 'Move to' : 'Save to'} subtitle={result.name} ranked={pickFor.ranked} city={effectiveCity}
        onPick={pickTrip} onCreate={createAndSave} onClose={() => setPickFor(null)} />}
      {ideaOpen && honkTrip && result && <IdeaSheet item={result} kind={honkKind} status={honkStatus} trip={honkTrip} onSaved={say} onClose={() => setIdeaOpen(false)} />}
      {toast && <Toast icon="check" title={toast.msg}
        action={toast.change && <Button size="sm" variant="secondary" onClick={() => { toast.change(); setToast(null) }}>Change</Button>} />}
    </Screen>
  )
}
