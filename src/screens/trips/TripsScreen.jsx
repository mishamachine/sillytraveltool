import { useEffect, useState } from 'react'
import { useTripsStore, useUIStore, useCollabStore, useAuthStore } from '../../store'
import { format, isPast, isFuture, isWithinInterval } from 'date-fns'
import Goose from '../../components/goose/Goose'
import { getCountryColor, getFlagEmoji } from '../../lib/countryColors'
import ShareNudge from '../../components/shared/ShareNudge'
import { parseBookingEmail } from '../../lib/gemini'

// Fetch climate normals from Open-Meteo (free, no API key)
// Uses monthly aggregates — tiny payload vs 30yr daily
async function fetchClimateForecast(lat, lon, startDate, endDate) {
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    // Collect unique months covered by the trip (1-12)
    const months = new Set()
    const d = new Date(start)
    while (d <= end) { months.add(d.getMonth()); d.setMonth(d.getMonth() + 1) }
    months.add(end.getMonth())

    // Use a 3-year window around trip month to get monthly averages — tiny payload
    const tripYear = start.getFullYear()
    const currentYear = new Date().getFullYear()
    // Cap refEnd to last complete year — archive API only has data up to ~2 months ago
    // Using tripYear+1 would request future data that doesn't exist, returning empty arrays
    const archiveEndYear = Math.min(tripYear + 1, currentYear - 1)
    const refStart = `${Math.min(tripYear - 1, archiveEndYear - 1)}-01-01`
    const refEnd   = `${archiveEndYear}-12-31`
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${refStart}&end_date=${refEnd}&monthly=temperature_2m_max,temperature_2m_min&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const times = data.monthly?.time || []
    const highs = data.monthly?.temperature_2m_max || []
    const lows  = data.monthly?.temperature_2m_min || []

    // Filter to matching months
    const matchingHighs = [], matchingLows = []
    times.forEach((dateStr, i) => {
      const m = parseInt(dateStr.slice(5, 7), 10) - 1 // 0-indexed
      if (months.has(m)) {
        if (highs[i] != null) matchingHighs.push(highs[i])
        if (lows[i] != null) matchingLows.push(lows[i])
      }
    })
    if (!matchingHighs.length) return null
    const avgHigh = Math.round(matchingHighs.reduce((a, b) => a + b, 0) / matchingHighs.length)
    const avgLow  = Math.round(matchingLows.reduce((a, b) => a + b, 0) / matchingLows.length)
    return { avgLow, avgHigh }
  } catch { return null }
}

// Geocode city to lat/lon using Photon
async function geocodeCity(city, country) {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(city + ' ' + country)}&limit=1&lang=en`)
    const data = await res.json()
    const f = data.features?.[0]
    if (!f) return null
    return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }
  } catch { return null }
}

// ── Client-side trip matcher ──────────────────────────────
// Requires BOTH city match AND date range overlap. No match → null (→ "Create New Trip").
function matchTrip(trips, ultimateDestination, bookings) {
  if (!trips?.length) return null

  const allBookings = Array.isArray(bookings) ? bookings : [bookings]
  const departureDates = allBookings
    .map(b => b.departure_time || b.check_in_date || b.activity_date)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()))
  const arrivalDates = allBookings
    .map(b => b.arrival_time || b.check_out_date)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()))

  const bookingStart = departureDates.length ? new Date(Math.min(...departureDates)) : null
  const bookingEnd   = arrivalDates.length   ? new Date(Math.max(...arrivalDates))   : bookingStart
  const destCity = (ultimateDestination?.city || '').toLowerCase().trim()

  for (const trip of trips.filter(t => t.status !== 'cancelled')) {
    const tripCity = (trip.destination_city || '').toLowerCase().trim()
    const cityWords = tripCity.split(/\s+/).filter(w => w.length >= 3)
    const cityMatch = destCity && tripCity && (
      destCity.includes(tripCity) || tripCity.includes(destCity) ||
      cityWords.some(w => destCity.includes(w))
    )
    if (!cityMatch) continue

    if (bookingStart) {
      const tripStart = new Date(trip.start_date)
      const tripEnd   = new Date(trip.end_date)
      tripStart.setDate(tripStart.getDate() - 7)
      tripEnd.setDate(tripEnd.getDate() + 7)
      if (!(bookingStart <= tripEnd && (bookingEnd || bookingStart) >= tripStart)) continue
    }

    return trip
  }

  return null // Never auto-select; no confident match
}

// ── Global Email Import Sheet ─────────────────────────────
function GlobalEmailImportSheet({ onClose, trips, onBookingCreated }) {
  const { createBooking, createTrip } = useTripsStore()
  const { openTripForm } = useUIStore()

  const [step, setStep] = useState('paste') // paste | preview | pick | success
  const [text, setText] = useState('')
  const [parsedBookings, setParsedBookings] = useState([]) // array of booking objects
  const [ultimateDest, setUltimateDest] = useState(null)   // { city, airport_code }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [matched, setMatched] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [newTripName, setNewTripName] = useState('')
  const [creatingTrip, setCreatingTrip] = useState(false)

  const handleParse = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null)
    try {
      const result = await parseBookingEmail(text)
      // result shape: { bookings: [...], ultimate_destination: { city, airport_code } }
      const bookings = Array.isArray(result.bookings) ? result.bookings : [result]
      const dest = result.ultimate_destination || null
      setParsedBookings(bookings)
      setUltimateDest(dest)
      const match = matchTrip(trips, dest, bookings)
      setMatched(match)
      setSelectedTripId(match?.id || null)
      setStep('preview')
    } catch (e) { setError(e.message || 'Could not parse email. Try again or add manually.') }
    finally { setLoading(false) }
  }

  const sanitizeBooking = (raw) => {
    // Whitelist: only columns that exist in the bookings table
    const BOOKING_COLS = new Set([
      'type','title','confirmation_number','booking_url','price','currency','notes',
      'flight_number','airline','departure_airport','arrival_airport',
      'departure_time','arrival_time','flight_class',
      'hotel_name','hotel_address','check_in_date','check_out_date','room_type',
      'activity_date','activity_time','venue_name','venue_address','is_shared',
    ])
    const clean = {}
    Object.entries(raw).forEach(([k, v]) => {
      if (!BOOKING_COLS.has(k)) return // drop unknown keys (destination_city, title leg label, etc)
      if (v === '' || v === undefined || v === null) clean[k] = null
      else if ((k === 'departure_time' || k === 'arrival_time') && typeof v === 'string') {
        const d = new Date(v); clean[k] = isNaN(d.getTime()) ? null : d.toISOString()
      } else if (k === 'price') { const p = parseFloat(v); clean[k] = isNaN(p) ? null : p }
      else clean[k] = v
    })
    return { ...clean, source: 'email_import' }
  }

  const handleSave = async (tripId) => {
    if (!parsedBookings.length || !tripId) return
    setSaving(true); setError(null)
    try {
      for (const booking of parsedBookings) {
        await createBooking(tripId, sanitizeBooking(booking))
      }
      setStep('success')
      if (onBookingCreated) onBookingCreated()
    } catch (e) { setError(e.message || 'Could not save booking.') }
    finally { setSaving(false) }
  }

  const handleCreateTrip = async () => {
    if (!parsedBookings.length) return
    setCreatingTrip(true); setError(null)
    try {
      const city = ultimateDest?.city ||
        parsedBookings[parsedBookings.length - 1]?.destination_city ||
        parsedBookings[parsedBookings.length - 1]?.arrival_airport ||
        parsedBookings[0]?.hotel_name || 'Unknown'

      // Derive date range from all booking legs
      const allDates = parsedBookings.flatMap(b => [
        b.departure_time, b.arrival_time, b.check_in_date, b.check_out_date, b.activity_date
      ]).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()))

      const earliest = allDates.length ? new Date(Math.min(...allDates)) : new Date()
      const latest   = allDates.length ? new Date(Math.max(...allDates)) : earliest
      const startDate = earliest.toISOString().slice(0, 10)
      const endDate   = latest.toISOString().slice(0, 10)

      // Best-effort country geocode via Photon
      let countryName = '', countryCode = ''
      try {
        const geo = await geocodeCity(city)
        if (geo) {
          const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${geo.lat}&lon=${geo.lon}&format=json&accept-language=en`)
          const revData = await rev.json()
          countryName = revData.address?.country || ''
          countryCode = (revData.address?.country_code || '').toUpperCase()
        }
      } catch { /* geocode is best-effort — silently ignore */ }

      const tripData = {
        title: newTripName || `Trip to ${city}`,
        destination_city: city,
        destination_country: countryName,
        destination_country_code: countryCode,
        start_date: startDate,
        end_date: endDate,
        status: 'planning',
      }
      const newTrip = await createTrip(tripData)
      await handleSave(newTrip.id)
    } catch (e) { setError(e.message || 'Could not create trip.') }
    finally { setCreatingTrip(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Goose variant="excited" size={32} />
            <h2 className="sheet-title">Import Booking</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-sec)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--error)' }}>{error}</div>}

          {step === 'paste' && <>
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6, margin: 0 }}>
              Paste a flight, hotel, or activity confirmation — The Goose will extract the details and match it to your trip.
            </p>
            <textarea className="form-input" value={text} onChange={e => setText(e.target.value)} rows={8}
              placeholder="Paste confirmation email text here..." style={{ resize: 'none', fontSize: 13 }} />
            <button className="btn btn-primary btn-full" onClick={handleParse} disabled={loading || !text.trim()}>
              {loading
                ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', lineHeight: 0 }}><Goose variant="excited" size={18} /></span>
                    Goose is reading...
                  </span>
                : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Goose variant="excited" size={18} /> Parse Email
                  </span>}
            </button>
          </>}

          {step === 'preview' && parsedBookings.length > 0 && <>
            {/* All parsed legs */}
            {parsedBookings.map((booking, i) => (
              <div key={i} className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, marginBottom: 2, color: 'var(--primary)' }}>
                  {parsedBookings.length > 1 ? `✈ Leg ${i + 1} of ${parsedBookings.length}` : '✓ Parsed — looks right?'}
                  {booking.title ? ` — ${booking.title}` : ''}
                </div>
                {Object.entries(booking).filter(([k, v]) => v != null && k !== 'type' && k !== 'destination_city' && k !== 'title').map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-tert)', minWidth: 130, fontFamily: 'var(--font-heading)', fontSize: 11 }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text)', flex: 1 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            ))}

            {ultimateDest?.city && (
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textAlign: 'center', padding: '2px 0' }}>
                🏁 Ultimate destination: <strong>{ultimateDest.city}</strong>
                {ultimateDest.airport_code ? ` (${ultimateDest.airport_code})` : ''}
              </div>
            )}

            {matched ? (
              <div style={{ background: 'var(--primary-light)', border: '1.5px solid var(--primary)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 2 }}>
                  🎯 Matched to: {matched.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>{matched.destination_city} · {format(new Date(matched.start_date), 'MMM d')} – {format(new Date(matched.end_date), 'MMM d, yyyy')}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setStep('pick')}>Change trip</button>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => handleSave(matched.id)} disabled={saving}>
                    {saving ? 'Saving...' : parsedBookings.length > 1 ? `Save All (${parsedBookings.length} flights) →` : 'Add to trip →'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--surface-alt)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>No trip matched — where should this go?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setStep('pick')}>Pick a trip</button>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => setStep('create')}>+ New trip</button>
                </div>
              </div>
            )}
            <button className="btn btn-ghost btn-full" style={{ fontSize: 13 }} onClick={() => setStep('paste')}>← Re-paste</button>
          </>}

          {step === 'pick' && <>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Pick a trip</div>
            {trips.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>No trips yet. Create one first.</p>
              : trips.map(t => (
                <button key={t.id} onClick={() => setSelectedTripId(t.id)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  border: selectedTripId === t.id ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                  background: selectedTripId === t.id ? 'var(--primary-light)' : 'var(--surface)',
                  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)',
                }}>
                  {t.title}
                  <div style={{ fontSize: 12, color: 'var(--text-tert)', fontWeight: 400, marginTop: 2 }}>{t.destination_city} · {format(new Date(t.start_date), 'MMM d, yyyy')}</div>
                </button>
              ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep('preview')}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleSave(selectedTripId)} disabled={!selectedTripId || saving}>
                {saving ? 'Saving...' : 'Add to trip'}
              </button>
            </div>
            <button className="btn btn-ghost btn-full" style={{ fontSize: 13 }} onClick={() => setStep('create')}>+ Create new trip instead</button>
          </>}

          {step === 'create' && <>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Create a new trip</div>
            <p style={{ fontSize: 13, color: 'var(--text-sec)', margin: 0 }}>
              We'll create a trip from the booking details. You can edit it after.
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Trip name (optional)</label>
              <input className="form-input" value={newTripName} onChange={e => setNewTripName(e.target.value)}
                placeholder={`Trip to ${ultimateDest?.city || parsedBookings[parsedBookings.length-1]?.destination_city || parsedBookings[parsedBookings.length-1]?.arrival_airport || 'Destination'}`} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep('preview')}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateTrip} disabled={creatingTrip}>
                {creatingTrip ? 'Creating...' : 'Create & add'}
              </button>
            </div>
          </>}

          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Goose variant="happy" size={64} animated />
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>Booking added!</div>
              <p style={{ fontSize: 13, color: 'var(--text-sec)', margin: 0 }}>The Goose has filed it away.</p>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TripCard({ trip, onPress, climate, climateLoading }) {
  const now = new Date()
  const start = new Date(trip.start_date)
  const end = new Date(trip.end_date)
  const isActive = isWithinInterval(now, { start, end })
  const isUpcoming = isFuture(start)

  const statusColor = isActive ? '#2D8B55' : isUpcoming ? '#1A73E8' : '#A09688'
  const statusLabel = isActive ? 'Active' : isUpcoming ? 'Upcoming' : 'Completed'

  const nights = Math.round((end - start) / (1000 * 60 * 60 * 24))
  const flightCount = trip.bookings?.filter(b => b.type === 'flight').length || 0
  const tempLabel = climate ? `${climate.avgLow}° – ${climate.avgHigh}°C` : null
  const showTempSkeleton = climateLoading && (isActive || isUpcoming)

  const flag = getFlagEmoji(trip.destination_country_code)
  const accentColor = getCountryColor(trip.destination_country_code)

  return (
    <button
      className="trip-card"
      onClick={() => onPress(trip)}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        // Subtle left border accent in country color
        borderLeft: accentColor ? `4px solid ${accentColor}` : '4px solid var(--border)',
        paddingLeft: '16px',
        paddingTop: '14px',
        paddingBottom: '14px',
      }}
    >
      {/* Country color wash */}
      {accentColor && (
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 100, height: 100,
          borderRadius: '0 0 0 100px',
          background: accentColor + '16',
          pointerEvents: 'none',
        }}/>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {/* Flag tile — larger */}
          <div style={{
            width: 56, height: 56,
            borderRadius: 'var(--radius-md)',
            background: accentColor ? accentColor + '22' : 'var(--surface-alt)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px', flexShrink: 0,
            border: accentColor ? `1.5px solid ${accentColor}30` : 'none',
          }}>
            {flag}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '18px',
              color: accentColor || 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {trip.title}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-sec)', marginTop: '2px', fontWeight: 500 }}>
              {trip.destination_city}, {trip.destination_country}
            </div>
          </div>
        </div>
        <span style={{
          flexShrink: 0,
          padding: '3px 9px',
          borderRadius: 'var(--radius-full)',
          background: statusColor + '18',
          color: statusColor,
          fontFamily: 'var(--font-heading)',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {statusLabel}
        </span>
      </div>

      {/* Dates row */}
      <div style={{
        display: 'flex', gap: '10px', marginTop: '4px',
        fontSize: '13px', color: 'var(--text-sec)', fontFamily: 'var(--font-mono)',
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span>{format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}</span>
        <span style={{ color: 'var(--text-tert)' }}>·</span>
        <span>{nights}n</span>
        {flightCount > 0 && <>
          <span style={{ color: 'var(--text-tert)' }}>·</span>
          <span>✈️ {flightCount}</span>
        </>}
        {(trip.bookings?.length || 0) > flightCount && <>
          <span style={{ color: 'var(--text-tert)' }}>·</span>
          <span style={{ fontSize: 12 }}>📋 {trip.bookings.length} booking{trip.bookings.length !== 1 ? 's' : ''}</span>
        </>}
        {showTempSkeleton && !tempLabel && <>
          <span style={{ color: 'var(--text-tert)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-mono)' }}>🌡️ …</span>
        </>}
        {tempLabel && <>
          <span style={{ color: 'var(--text-tert)' }}>·</span>
          <span style={{ fontSize: 12, color: '#1A73E8', fontWeight: 600 }}>🌡️ {tempLabel}</span>
        </>}
      </div>

      {trip._isShared && (
        <div style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '4px', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
          👥 Shared with you
        </div>
      )}
      {!trip._isShared && trip.trip_collaborators?.some(c => c.status === 'accepted') && (
        <div style={{ fontSize: '12px', color: 'var(--text-tert)', marginTop: '4px' }}>
          👥 {trip.trip_collaborators.filter(c => c.status === 'accepted').length + 1} travelers
        </div>
      )}
    </button>
  )
}

export default function TripsScreen() {
  const { trips, loading, fetchTrips, setActiveTrip } = useTripsStore()
  const { openTripForm } = useUIStore()
  const { pendingInvites, fetchPendingInvites, respondToInvite } = useCollabStore()
  const { profile } = useAuthStore()
  const [view, setView] = useState('upcoming')
  const [inboxCopied, setInboxCopied] = useState(false)
  const [inboxExpanded, setInboxExpanded] = useState(() => {
    try { return localStorage.getItem('stt_inbox_seen') === '1' ? false : true } catch { return true }
  })

  const [showImport, setShowImport] = useState(false)
  const [climateMap, setClimateMap] = useState({})
  const [climateLoading, setClimateLoading] = useState(false)

  // Geocode + fetch climate for all upcoming trips once on mount / when trips change
  useEffect(() => {
    if (!trips.length) return
    const now = new Date()
    const relevant = trips.filter(t =>
      new Date(t.end_date) >= now &&
      t.destination_city &&
      t.start_date &&
      !(t.id in climateMap)  // skip already-fetched
    )
    if (!relevant.length) return

    setClimateLoading(true)
    Promise.all(
      relevant.map(async (trip) => {
        try {
          // Use stored lat/lng if available, else geocode once
          let lat = trip.destination_lat, lon = trip.destination_lng
          if (!lat || !lon) {
            const coords = await geocodeCity(trip.destination_city, trip.destination_country || '')
            if (!coords) return [trip.id, null]
            lat = coords.lat; lon = coords.lon
          }
          const result = await fetchClimateForecast(lat, lon, trip.start_date, trip.end_date)
          return [trip.id, result]
        } catch {
          return [trip.id, null]
        }
      })
    ).then(results => {
      setClimateMap(prev => {
        const next = { ...prev }
        results.forEach(([id, data]) => { next[id] = data })
        return next
      })
      setClimateLoading(false)
    })
  }, [trips.length]) // re-run only when trip count changes

  const bookingEmail = profile?.booking_email_token
    ? `${profile.booking_email_token}@bookings.sillytraveltool.com`
    : null

  const handleCopyInbox = () => {
    if (!bookingEmail) return
    navigator.clipboard.writeText(bookingEmail).then(() => {
      setInboxCopied(true)
      setTimeout(() => setInboxCopied(false), 2000)
    })
  }

  useEffect(() => { fetchTrips() }, [])

  const now = new Date()
  const upcoming = trips.filter(t => new Date(t.end_date) >= now || t.status === 'active')
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
  const past = trips.filter(t => new Date(t.end_date) < now && t.status !== 'active')
    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

  const shown = view === 'upcoming' ? upcoming : past

  return (
    <div className="screen">
      <div className="screen-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Goose variant="happy" size={52} animated />
          <div>
            <h1 className="screen-title" style={{ marginBottom: 0, lineHeight: 1 }}>My Trips</h1>
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>Trust The Goose.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(true)}>📧 Import</button>
          <button className="btn btn-primary btn-sm" onClick={() => openTripForm()}>+ Trip</button>
        </div>
      </div>

      {/* ── Goose Inbox Banner ── collapsible, only on upcoming tab */}
      {bookingEmail && view === 'upcoming' && (
        <div style={{
          margin: '8px 16px 0',
          borderRadius: 14,
          border: '1.5px solid var(--primary)',
          background: 'var(--primary-light)',
          overflow: 'hidden',
        }}>
          {/* Header row — always visible, tappable */}
          <button
            onClick={() => {
              const next = !inboxExpanded
              setInboxExpanded(next)
              if (!next) try { localStorage.setItem('stt_inbox_seen', '1') } catch {}
            }}
            style={{
              width: '100%', background: 'var(--primary)',
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
              border: 'none', cursor: 'pointer',
            }}>
            <span style={{ fontSize: 18 }}>📧</span>
            <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#fff', textAlign: 'left' }}>
              Email reservations to The Goose
            </span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{inboxExpanded ? '▲' : '▼'}</span>
          </button>
          {/* Expandable details */}
          {inboxExpanded && (
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--primary)',
                  fontWeight: 700, flex: 1, wordBreak: 'break-all',
                }}>
                  {bookingEmail}
                </span>
                <button
                  onClick={handleCopyInbox}
                  style={{
                    background: inboxCopied ? 'var(--success)' : 'var(--primary)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '5px 12px', fontFamily: 'var(--font-heading)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {inboxCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5 }}>
                Save as contact <strong>"The Goose 🪿"</strong> — forward any flight, hotel or tour confirmation and it appears in your trip automatically.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending invites banner */}
      {pendingInvites.length > 0 && (
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
            Pending Invites
          </div>
          {pendingInvites.map(invite => (
            <div key={invite.id} style={{
              background: 'var(--primary-light)',
              border: '1.5px solid var(--primary)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  👥 {invite.trips?.title || 'Trip Invite'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>
                  {invite.trips?.destination_city} · {invite.trips?.destination_country}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => respondToInvite(invite.id, true)}
                  style={{ padding: '5px 12px', borderRadius: 99, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 700 }}
                >
                  Accept
                </button>
                <button
                  onClick={() => respondToInvite(invite.id, false)}
                  style={{ padding: '5px 12px', borderRadius: 99, background: 'none', color: 'var(--text-tert)', border: '1.5px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 600 }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 16px 4px' }}>
        <div className="pill-tabs" style={{ margin: 0 }}>
          {[['upcoming', `Upcoming (${upcoming.length})`], ['past', `Past (${past.length})`]].map(([id, label]) => (
            <button key={id} className={`pill-tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading && [1,2,3].map(i => (
          <div key={i} style={{ height: 100, borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1.5px solid var(--border)' }} className="skeleton"/>
        ))}

        {!loading && shown.length === 0 && (
          <div className="empty-state" style={{ marginTop: '40px' }}>
            <Goose variant="happy" size={100} animated />
            <div className="empty-state-title" style={{ fontSize: 20, marginTop: 12 }}>
              {view === 'upcoming' ? 'No trips planned yet' : 'No past trips'}
            </div>
            <p className="empty-state-text" style={{ fontSize: 14 }}>
              {view === 'upcoming'
                ? "Where are we going? Add a trip and The Goose will guide you."
                : "Complete some trips and they'll show up here."}
            </p>
            {view === 'upcoming' && (
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => openTripForm()}>🗺️ Plan a trip</button>
            )}
          </div>
        )}

        {!loading && shown.map(trip => (
          <TripCard
            key={trip.id}
            trip={trip}
            onPress={setActiveTrip}
            climate={climateMap[trip.id] ?? null}
            climateLoading={climateLoading && !(trip.id in climateMap)}
          />
        ))}
      </div>

      {showImport && (
        <GlobalEmailImportSheet
          onClose={() => setShowImport(false)}
          trips={trips}
          onBookingCreated={() => { fetchTrips() }}
        />
      )}
      <ShareNudge />
    </div>
  )
}
