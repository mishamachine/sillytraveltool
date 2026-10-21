import { useState, useEffect } from 'react'
import Goose from '../../components/goose/Goose'
import { gooseyDiscover } from '../../lib/gemini'
import ShareNudge from '../../components/shared/ShareNudge'
import { supabase } from '../../lib/supabase'
import CityAutocomplete from '../../components/shared/CityAutocomplete'

const MOODS = [
  { id: 'hungry',    label: "I'm hungry",       emoji: '🍜', gooseVariant: 'hungry' },
  { id: 'explore',  label: 'Show me something', emoji: '👀', gooseVariant: 'detective' },
  { id: 'bored',    label: "I'm bored",         emoji: '😴', gooseVariant: 'excited' },
  { id: 'treat',    label: 'Treat myself',      emoji: '✨', gooseVariant: 'fancy' },
  { id: 'cheap',    label: 'On a budget',       emoji: '💰', gooseVariant: 'broke' },
  { id: 'culture',  label: 'Culture me',        emoji: '🏛️', gooseVariant: 'museum' },
  { id: 'nightlife',label: 'Night out',         emoji: '🌙', gooseVariant: 'celebrating' },
  { id: 'local',    label: 'Be a local',        emoji: '🗺️', gooseVariant: 'pilot' },
]

function useGeolocation() {
  const [state, setState] = useState({ loading: true, city: null, country: null, error: null, coords: null })

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, loading: false, error: 'Geolocation not supported by your browser.' }))
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setState(s => ({ ...s, coords: { latitude, longitude } }))
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const addr = data.address || {}
          const city = addr.city || addr.town || addr.municipality || addr.village || addr.county || 'your area'
          const country = addr.country || ''
          setState({ loading: false, city, country, error: null, coords: { latitude, longitude } })
        } catch {
          setState({ loading: false, city: null, country: null, error: 'Could not determine your location name.', coords: { latitude, longitude } })
        }
      },
      (err) => {
        const msgs = {
          1: 'Location access denied. Allow location in your browser to use HONK.',
          2: 'Location unavailable. Check your connection.',
          3: 'Location request timed out. Try again.',
        }
        setState({ loading: false, city: null, country: null, error: msgs[err.code] || 'Location error.', coords: null })
      },
      { timeout: 10000, maximumAge: 300000 }
    )
  }, [])

  return state
}

export default function GooseyScreen() {
  const geo = useGeolocation()
  const [selectedMood, setSelectedMood] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [honked, setHonked] = useState(false)
  const [error, setError] = useState(null)
  const [manualCity, setManualCity] = useState(null)

  // Effective location: GPS city if available, else manual selection
  const effectiveCity = geo.city || manualCity?.city || null
  const effectiveCountry = geo.city ? geo.country : (manualCity?.country || '')

  const handleHonk = async () => {
    if (!selectedMood || !effectiveCity) return
    setLoading(true); setHonked(true); setError(null)
    try {
      const moodLabel = MOODS.find(m => m.id === selectedMood)?.label || selectedMood
      const discovered = await gooseyDiscover({ city: effectiveCity, country: effectiveCountry, mood: moodLabel })
      setResult(discovered)
      // Stat trigger: HONK used
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'honks_used', p_amount: 1 })
      } catch {}
    } catch (e) {
      setError('The Goose hit a snag. Check your Gemini API key or try again.')
      setHonked(false)
    } finally { setLoading(false) }
  }

  return (
    <div className="screen">
      <div className="screen-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="screen-title">HONK</h1>
          <p style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 1 }}>
            {geo.loading ? 'Finding your location...' : effectiveCity ? `📍 ${effectiveCity}${effectiveCountry ? ', ' + effectiveCountry : ''}` : 'Pick a city below'}
          </p>
        </div>
        {effectiveCity && !result && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              LIVE
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tert)', marginTop: 3 }}>🚶 walking distance</div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px' }}>

        {/* Geolocation loading */}
        {geo.loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 48, textAlign: 'center' }}>
            <div style={{ animation: 'wiggle 1s ease-in-out infinite' }}><Goose variant="detective" size={80} /></div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Finding where you are...</div>
            <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>The Goose needs your location to find nearby spots.</p>
          </div>
        )}

        {/* Location error — show manual city picker instead of dead end */}
        {!geo.loading && geo.error && !manualCity && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 48, textAlign: 'center' }}>
            <Goose variant="worried" size={80} />
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Location access denied</div>
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6, maxWidth: 280 }}>
              No worries — just tell The Goose where you are.
            </p>
            <div style={{ width: '100%', maxWidth: 320 }}>
              <CityAutocomplete
                placeholder="Type your city..."
                onSelect={(result) => setManualCity(result)}
              />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()} style={{ fontSize: 12, marginTop: 4 }}>
              Try GPS again
            </button>
          </div>
        )}

        {/* Main UI — location found (GPS or manual) */}
        {!geo.loading && effectiveCity && (
          <>
            {/* Goose display */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ animation: loading ? 'wiggle 0.5s ease-in-out infinite' : honked && result ? 'bounce 2.2s ease-in-out infinite' : 'none' }}>
                <Goose
                  variant={result ? 'celebrating' : selectedMood ? MOODS.find(m => m.id === selectedMood)?.gooseVariant : 'happy'}
                  size={96}
                />
              </div>
            </div>

            {error && (
              <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--error)', marginBottom: 16, textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* What is HONK blurb */}
            {!result && (
              <div style={{ textAlign: 'center', marginBottom: 20, padding: '10px 16px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5, margin: 0 }}>
                  Pick a vibe and The Goose finds you <strong>one great place right now</strong> — walkable from where you're standing.
                </p>
              </div>
            )}

            {/* Mood grid */}
            {!result && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {MOODS.map(mood => (
                  <button key={mood.id} onClick={() => setSelectedMood(mood.id)} style={{
                    padding: '14px 12px', borderRadius: 'var(--radius-md)',
                    border: selectedMood === mood.id ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                    background: selectedMood === mood.id ? 'var(--primary-light)' : 'var(--surface)',
                    cursor: 'pointer', transition: 'all var(--transition)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                      <Goose variant={mood.gooseVariant} size={52} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: selectedMood === mood.id ? 'var(--primary)' : 'var(--text)', textAlign: 'center' }}>
                      {mood.label}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* HONK button */}
            {!result && (
              <button className="btn btn-primary btn-full" onClick={handleHonk} disabled={!selectedMood || loading} style={{ fontSize: 17, padding: 16, gap: 10 }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', lineHeight: 0 }}>
                      <Goose variant="excited" size={20} />
                    </span>
                    The Goose is thinking...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Goose variant="happy" size={22} />
                    HONK
                  </span>
                )}
              </button>
            )}

            {/* Result card */}
            {result && !loading && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '2px solid var(--primary)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{result.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>{result.type} · {result.neighbourhood} · {result.price_range}</div>
                  </div>
                  <div style={{ padding: '5px 10px', background: 'var(--primary)', borderRadius: 99, fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Goose variant="happy" size={14} />
                    {result.goose_rating}
                  </div>
                </div>

                <p style={{ fontSize: 14, color: 'var(--text-sec)', lineHeight: 1.6 }}>{result.why}</p>

                {result.best_time && (
                  <div style={{ fontSize: 13, color: 'var(--text-tert)' }}>⏰ Best time: {result.best_time}</div>
                )}

                {result.insider_tip && (
                  <div style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--primary)' }}>
                    <span style={{ fontWeight: 700 }}>💡 Tip:</span> {result.insider_tip}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {result.google_maps_url && (
                    <a href={result.google_maps_url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ flex: 1, textDecoration: 'none', justifyContent: 'center', display: 'flex' }}>
                      📍 Open in Maps
                    </a>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setResult(null); setHonked(false); setSelectedMood(null); setError(null); if (manualCity) setManualCity(null) }}>
                    🔄 Again
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ShareNudge />
    </div>
  )
}
