import { useState, useEffect } from 'react'
import { useAuthStore, useTripsStore, useUIStore, useCollabStore } from '../../store'
import { format } from 'date-fns'
import { parseLocalDate, todayLocalISO, daysBetween, isTripCompleted, hasTripEnded } from '../../lib/dates'
import { getFlagEmoji, getCountryColor } from '../../lib/countryColors'
import { parseBookingEmail } from '../../lib/gemini'
import Goose from '../../components/goose/Goose'
import ConfirmDialog from '../../components/shared/ConfirmDialog'

// ============================================================
// LIVE CLOCK
// ============================================================
function LiveClock({ city, country, lat, lng }) {
  const [time, setTime] = useState('')
  const [timezone, setTimezone] = useState(null)
  const [label, setLabel] = useState('local')

  useEffect(() => {
    const fetchTZ = async () => {
      // Use trip lat/lng if available, otherwise geocode
      let tzLat = lat, tzLng = lng
      if (!tzLat || !tzLng) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent((city || '') + ', ' + (country || ''))}`, { headers: { 'Accept-Language': 'en' } })
          const data = await res.json()
          if (data[0]) { tzLat = data[0].lat; tzLng = data[0].lon }
        } catch { /* fallback to device time */ }
      }
      if (tzLat && tzLng) {
        try {
          const res = await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${tzLat}&longitude=${tzLng}`)
          const data = await res.json()
          if (data.timeZone) { setTimezone(data.timeZone); setLabel(city || 'local') }
        } catch {
          // timeapi.io failed — try worldtimeapi as fallback (no key needed)
          try {
            const res2 = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${tzLat}&longitude=${tzLng}&timezone=auto&forecast_days=1`)
            const data2 = await res2.json()
            if (data2.timezone) { setTimezone(data2.timezone); setLabel(city || 'local') }
          } catch { /* give up, show device time */ }
        }
      }
    }
    if (city || (lat && lng)) fetchTZ()
  }, [city, lat, lng])

  useEffect(() => {
    const tick = () => {
      try {
        setTime(new Date().toLocaleTimeString('en-US', { timeZone: timezone || undefined, hour: '2-digit', minute: '2-digit', hour12: true }))
      } catch {
        setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }))
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timezone])

  return <span>{time} <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{label}</span></span>
}

// ============================================================
// BOOKING ICON
// ============================================================
function BookingIcon({ type }) {
  const icons = { flight: '✈️', hotel: '🏨', activity: '🎯', transport: '🚌', other: '📌' }
  const colors = { flight: '#4A7FC4', hotel: '#7B61C4', activity: '#2D8B55', transport: '#D4910A', other: '#A09688' }
  return (
    <div style={{ width: 36, height: 36, borderRadius: 8, background: (colors[type] || '#A09688') + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
      {icons[type] || '📌'}
    </div>
  )
}

// ============================================================
// ITINERARY TAB
// ============================================================
function ItineraryTab({ trip }) {
  const { bookings, activities, createBooking, deleteBooking, createActivity, toggleActivity, deleteActivity, loadingDetail } = useTripsStore()
  const { user } = useAuthStore()
  const currentUserId = user?.id
  const [showBookingSheet, setShowBookingSheet] = useState(false)
  const [showActivitySheet, setShowActivitySheet] = useState(false)
  const [showEmailImport, setShowEmailImport] = useState(false)

  // Group bookings + activities by date
  const allItems = [
    ...bookings.map(b => ({ ...b, _kind: 'booking', _date: b.departure_time || b.check_in_date || (b.activity_date ? b.activity_date + 'T12:00:00' : null) })),
    ...activities.map(a => ({ ...a, _kind: 'activity', _date: a.date }))
  ].filter(i => i._date).sort((a, b) => parseLocalDate(a._date) - parseLocalDate(b._date))

  const noDate = [
    ...bookings.filter(b => !b.departure_time && !b.check_in_date && !b.activity_date).map(b => ({ ...b, _kind: 'booking' })),
    ...activities.filter(a => !a.date).map(a => ({ ...a, _kind: 'activity' }))
  ]

  // Group by date
  const byDate = {}
  allItems.forEach(item => {
    const d = item._date?.substring(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(item)
  })

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Import + Add buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={() => setShowEmailImport(true)}
          style={{
            width: '100%', padding: '13px 16px', borderRadius: 12, border: '2px dashed var(--primary)',
            background: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 12, textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 28, flexShrink: 0 }}>📧</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
              Import from Email
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 1 }}>
              Paste any booking confirmation — The Goose extracts everything
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 18, flexShrink: 0 }}>→</span>
        </button>
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '14px', padding: '12px' }} onClick={() => setShowBookingSheet(true)}>
          + Add Booking Manually
        </button>
      </div>

      {loadingDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
        </div>
      )}

      {!loadingDetail && allItems.length === 0 && noDate.length === 0 && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="lost" size={72} />
          <div className="empty-state-title">No bookings yet</div>
          <p className="empty-state-text">Add flights, hotels, and activities — or paste a confirmation email and let The Goose parse it.</p>
        </div>
      )}

      {/* Date groups */}
      {Object.entries(byDate).map(([date, items]) => (
        <div key={date}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '12px', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            {format(new Date(date + 'T00:00:00'), 'EEE, MMM d')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => item._kind === 'booking'
              ? <BookingRow key={item.id} booking={item} onDelete={() => deleteBooking(item.id)} currentUserId={currentUserId} />
              : <ActivityRow key={item.id} activity={item} onToggle={(v) => toggleActivity(item.id, v)} onDelete={() => deleteActivity(item.id)} currentUserId={currentUserId} />
            )}
          </div>
        </div>
      ))}

      {/* No-date items */}
      {noDate.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '12px', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Unscheduled
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {noDate.map(item => item._kind === 'booking'
              ? <BookingRow key={item.id} booking={item} onDelete={() => deleteBooking(item.id)} currentUserId={currentUserId} />
              : <ActivityRow key={item.id} activity={item} onToggle={(v) => toggleActivity(item.id, v)} onDelete={() => deleteActivity(item.id)} currentUserId={currentUserId} />
            )}
          </div>
        </div>
      )}

      {/* + Add Activity */}
      <button className="btn btn-ghost btn-full" onClick={() => setShowActivitySheet(true)} style={{ fontSize: '13px', borderStyle: 'dashed' }}>
        + Add Activity / Note
      </button>

      {showBookingSheet && <BookingSheet tripId={trip.id} onClose={() => setShowBookingSheet(false)} onCreate={createBooking} />}
      {showActivitySheet && <ActivitySheet tripId={trip.id} onClose={() => setShowActivitySheet(false)} onCreate={createActivity} />}
      {showEmailImport && <EmailImportSheet tripId={trip.id} onClose={() => setShowEmailImport(false)} onCreate={createBooking} />}
    </div>
  )
}

function BookingRow({ booking, onDelete, currentUserId }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = !currentUserId || !booking.created_by || booking.created_by === currentUserId
  const typeColor = { flight: '#4A7FC4', hotel: '#7B61C4', activity: '#2D8B55', transport: '#D4910A', other: '#A09688' }
  const color = typeColor[booking.type] || '#A09688'

  // For shared trips: a flight is "mine" if no passenger_name stored, or if it matches
  // the current user (by created_by). Other-passenger flights are shown dimmed.
  const isFlight = booking.type === 'flight'
  const isOtherPassenger = isFlight && currentUserId && booking.created_by && booking.created_by !== currentUserId

  const timeStr = booking.departure_time ? format(new Date(booking.departure_time), 'h:mm a') :
    booking.check_in_date ? format(new Date(booking.check_in_date + 'T00:00:00'), 'MMM d') :
    booking.activity_date ? format(new Date(booking.activity_date + 'T00:00:00'), 'MMM d') : null

  // Collapsed sub-line: for flights show passenger + seat if available
  const collapsedSub = (() => {
    if (isFlight) {
      const parts = []
      if (booking.passenger_name) parts.push(booking.passenger_name)
      if (booking.seat_number)    parts.push(`Seat ${booking.seat_number}`)
      if (timeStr)                parts.push(timeStr)
      if (booking.confirmation_number) parts.push(booking.confirmation_number)
      return parts.join(' · ')
    }
    const parts = []
    if (timeStr) parts.push(timeStr)
    if (booking.confirmation_number) parts.push(booking.confirmation_number)
    return parts.join(' · ')
  })()

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1.5px solid var(--border)`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 12,
      overflow: 'hidden',
      opacity: isOtherPassenger ? 0.6 : 1,
    }}>
      {/* Other-passenger label strip */}
      {isOtherPassenger && (
        <div style={{
          background: color + '12',
          padding: '3px 14px',
          fontSize: 10,
          fontFamily: 'var(--font-heading)',
          fontWeight: 600,
          color: color,
          letterSpacing: '0.04em',
        }}>
          {booking.passenger_name ? `✈ ${booking.passenger_name}` : '✈ Other passenger'}
        </div>
      )}
      <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }}>
        <BookingIcon type={booking.type} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.title}</div>
          {collapsedSub && (
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collapsedSub}</div>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
          {booking.passenger_name && <Detail label="Passenger" value={booking.passenger_name} />}
          {booking.flight_number && <Detail label="Flight" value={`${booking.airline || ''} ${booking.flight_number}`.trim()} />}
          {booking.seat_number && <Detail label="Seat" value={booking.seat_number} />}
          {booking.departure_airport && <Detail label="From" value={booking.departure_airport} />}
          {booking.arrival_airport && <Detail label="To" value={booking.arrival_airport} />}
          {booking.arrival_time && <Detail label="Arrives" value={format(new Date(booking.arrival_time), 'h:mm a')} />}
          {booking.hotel_name && <Detail label="Hotel" value={booking.hotel_name} />}
          {booking.hotel_address && <Detail label="Address" value={booking.hotel_address} />}
          {booking.check_out_date && <Detail label="Check-out" value={format(new Date(booking.check_out_date + 'T00:00:00'), 'MMM d, yyyy')} />}
          {booking.room_type && <Detail label="Room" value={booking.room_type} />}
          {booking.ticket_quantity && <Detail label="Tickets" value={String(booking.ticket_quantity)} />}
          {booking.venue_name && <Detail label="Venue" value={booking.venue_name} />}
          {booking.venue_address && <Detail label="Address" value={booking.venue_address} />}
          {booking.activity_date && booking.activity_time && <Detail label="Time" value={`${format(new Date(booking.activity_date + 'T00:00:00'), 'MMM d')} at ${booking.activity_time}`} />}
          {booking.confirmation_number && <Detail label="Ref #" value={booking.confirmation_number} />}
          {booking.price && <Detail label="Price" value={`${booking.currency || ''} ${booking.price}`.trim()} />}
          {booking.notes && <Detail label="Notes" value={booking.notes} />}
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ marginTop: 8, fontSize: 12, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Delete booking
            </button>
          )}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${booking.title}"?`}
          confirmLabel="Delete"
          onConfirm={() => { onDelete(); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function ActivityRow({ activity, onToggle, onDelete, currentUserId }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = !currentUserId || !activity.created_by || activity.created_by === currentUserId
  const hasExpandable = !!(activity.notes || activity.location_name)

  const catConfig = {
    food:    { color: '#C4561E', icon: '🍽️', label: 'Food' },
    sight:   { color: '#1A73E8', icon: '📸', label: 'Sight' },
    museum:  { color: '#7B61C4', icon: '🏛️', label: 'Museum' },
    event:   { color: '#2D8B55', icon: '🎟️', label: 'Event' },
    note:    { color: '#A09688', icon: '📝', label: 'Note' },
    custom:  { color: '#D4910A', icon: '⭐', label: 'Custom' },
  }
  const cat = catConfig[activity.category] || catConfig.note
  const timeStr = activity.date
    ? (activity.time
        ? `${format(new Date(activity.date + 'T00:00:00'), 'MMM d')} · ${activity.time}`
        : format(new Date(activity.date + 'T00:00:00'), 'MMM d'))
    : null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1.5px solid var(--border)',
      borderLeft: `3px solid ${cat.color}`,
      borderRadius: 12,
      overflow: 'hidden',
      opacity: activity.is_completed ? 0.6 : 1,
    }}>
      <div
        style={{ padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: hasExpandable ? 'pointer' : 'default' }}
        onClick={() => hasExpandable && setExpanded(e => !e)}
      >
        {/* Checkbox — stop propagation so tapping it doesn't also expand */}
        <input
          type="checkbox"
          checked={activity.is_completed || false}
          onChange={e => onToggle(e.target.checked)}
          onClick={e => e.stopPropagation()}
          style={{ width: 18, height: 18, accentColor: cat.color, flexShrink: 0, marginTop: 2 }}
        />
        {/* Category icon tile */}
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: cat.color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>
          {cat.icon}
        </div>
        {/* Main content — title wraps fully, no truncation */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14,
            color: activity.is_completed ? 'var(--text-tert)' : 'var(--text)',
            textDecoration: activity.is_completed ? 'line-through' : 'none',
            // Collapsed: single-line truncate. Expanded: wrap fully.
            overflow: expanded ? 'visible' : 'hidden',
            textOverflow: expanded ? 'unset' : 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
            wordBreak: 'break-word',
          }}>
            {activity.title}
          </div>
          {/* Condensed sub-line: time only in collapsed state */}
          {!expanded && timeStr && (
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>
              🕐 {timeStr}
            </div>
          )}
        </div>
        {/* Category badge */}
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99,
          background: cat.color + '18', color: cat.color,
          fontFamily: 'var(--font-heading)', fontWeight: 700, flexShrink: 0,
          marginTop: 2,
        }}>
          {cat.label}
        </span>
        {/* Expand chevron — only shown when there's something to expand */}
        {hasExpandable && (
          <span style={{ fontSize: 11, color: 'var(--text-tert)', flexShrink: 0, marginTop: 3 }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
        {/* Delete */}
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tert)', fontSize: 16, padding: '0 0 0 2px', marginTop: 0 }}
          >×</button>
        )}
      </div>
      {/* Expanded detail panel: full location + notes */}
      {expanded && (
        <div style={{ padding: '0 14px 12px 76px', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
          {timeStr && (
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginBottom: 4 }}>🕐 {timeStr}</div>
          )}
          {activity.location_name && (
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>📍 {activity.location_name}</div>
          )}
          {activity.notes && (
            <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5 }}>{activity.notes}</div>
          )}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Remove "${activity.title}"?`}
          confirmLabel="Remove"
          onConfirm={() => { onDelete(); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 600, minWidth: 70 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-sec)', flex: 1 }}>{value}</span>
    </div>
  )
}

// ============================================================
// BOOKING SHEET
// ============================================================
function BookingSheet({ tripId, onClose, onCreate }) {
  const [type, setType] = useState('flight')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title) return setError('Title is required')
    setLoading(true)
    setError(null)
    try {
      // Sanitize: convert datetime-local strings to ISO with Z, clean empty strings to null
      const clean = {}
      Object.entries({ ...form, type }).forEach(([k, v]) => {
        if (v === '' || v === undefined) clean[k] = null
        else if ((k === 'departure_time' || k === 'arrival_time') && v && !v.includes('Z') && !v.includes('+')) {
          try {
            const d = new Date(v)
            clean[k] = isNaN(d.getTime()) ? null : d.toISOString()
          } catch { clean[k] = null }
        }
        else if (k === 'price' && v) clean[k] = parseFloat(v)
        else clean[k] = v
      })
      await onCreate(tripId, clean)
      onClose()
    }
    catch (e) { setError(e.message || 'Could not save booking. Check your connection.') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">Add Booking</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-sec)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '70vh' }}>
          {error && <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--error)' }}>{error}</div>}

          {/* Type selector */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['flight', 'hotel', 'activity', 'transport', 'other'].map(t => (
                <button key={t} onClick={() => setType(t)} className={`pill-tab ${type === t ? 'active' : ''}`} style={{ fontSize: 12, padding: '5px 12px' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Title *</label>
            <input className="form-input" value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder={type === 'flight' ? 'e.g. AA 123 NYC → LAX' : type === 'hotel' ? 'e.g. The Plaza Hotel' : 'e.g. Central Park Tour'} />
          </div>

          {type === 'flight' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Airline</label><input className="form-input" value={form.airline || ''} onChange={e => set('airline', e.target.value)} placeholder="American Airlines" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Flight #</label><input className="form-input" value={form.flight_number || ''} onChange={e => set('flight_number', e.target.value)} placeholder="AA123" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" value={form.departure_airport || ''} onChange={e => set('departure_airport', e.target.value)} placeholder="JFK" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" value={form.arrival_airport || ''} onChange={e => set('arrival_airport', e.target.value)} placeholder="LAX" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Departs</label><input type="datetime-local" className="form-input" value={form.departure_time || ''} onChange={e => set('departure_time', e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Arrives</label><input type="datetime-local" className="form-input" value={form.arrival_time || ''} onChange={e => set('arrival_time', e.target.value)} /></div>
            </div>
          </>}

          {type === 'hotel' && <>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Address</label><input className="form-input" value={form.hotel_address || ''} onChange={e => set('hotel_address', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Check-in</label><input type="date" className="form-input" value={form.check_in_date || ''} onChange={e => set('check_in_date', e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Check-out</label><input type="date" className="form-input" value={form.check_out_date || ''} onChange={e => set('check_out_date', e.target.value)} /></div>
            </div>
          </>}

          {(type === 'activity' || type === 'transport' || type === 'other') && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Date</label><input type="date" className="form-input" value={form.activity_date || ''} onChange={e => set('activity_date', e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Time</label><input type="time" className="form-input" value={form.activity_time || ''} onChange={e => set('activity_time', e.target.value)} /></div>
            </div>
          </>}

          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Confirmation #</label><input className="form-input" value={form.confirmation_number || ''} onChange={e => set('confirmation_number', e.target.value)} placeholder="ABC123" style={{ fontFamily: 'var(--font-mono)' }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Price</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" value={form.currency || ''} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="USD" maxLength={3} style={{ width: 72, fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
              <input type="number" className="form-input" value={form.price || ''} onChange={e => set('price', e.target.value)} placeholder="0.00" style={{ flex: 1 }} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Notes</label><textarea className="form-input" value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} style={{ resize: 'none' }} /></div>

          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Saving...' : 'Add Booking'}
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// ACTIVITY SHEET
// ============================================================
function ActivitySheet({ tripId, onClose, onCreate }) {
  const [form, setForm] = useState({ category: 'note' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const [error, setError] = useState(null)

  const handleSave = async () => {
    if (!form.title) return
    setLoading(true); setError(null)
    try { await onCreate(tripId, form); onClose() }
    catch (e) { setError(e.message || 'Could not save. Check your connection.') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">Add Activity</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-sec)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--error)' }}>{error}</div>}
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Category</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['food', 'sight', 'museum', 'event', 'note'].map(c => (
                <button key={c} onClick={() => set('category', c)} className={`pill-tab ${form.category === c ? 'active' : ''}`} style={{ fontSize: 12 }}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Title *</label><input className="form-input" value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="e.g. Visit MOMA" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Date</label><input type="date" className="form-input" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Time</label><input type="time" className="form-input" value={form.time || ''} onChange={e => set('time', e.target.value)} /></div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Location</label><input className="form-input" value={form.location_name || ''} onChange={e => set('location_name', e.target.value)} placeholder="Place name or address" /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Notes</label><textarea className="form-input" value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} style={{ resize: 'none' }} /></div>
          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={loading || !form.title}>{loading ? 'Saving...' : 'Add Activity'}</button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// EMAIL IMPORT SHEET
// ============================================================
function EmailImportSheet({ tripId, onClose, onCreate }) {
  const { profile } = useAuthStore()
  const [text, setText] = useState('')
  const [parsedBookings, setParsedBookings] = useState([])
  const [ultimateDest, setUltimateDest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const bookingEmail = profile?.booking_email_token
    ? `${profile.booking_email_token}@bookings.sillytraveltool.com`
    : null

  const handleCopy = () => {
    if (!bookingEmail) return
    navigator.clipboard.writeText(bookingEmail).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleParse = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setParsedBookings([])
    try {
      const result = await parseBookingEmail(text)
      const bookings = Array.isArray(result.bookings) ? result.bookings : [result]
      setParsedBookings(bookings)
      setUltimateDest(result.ultimate_destination || null)
    } catch (e) { setError(e?.message || 'Could not parse email. Try again or add manually.') }
    finally { setLoading(false) }
  }

  const sanitizeBooking = (raw) => {
    const BOOKING_COLS = new Set([
      'type','title','confirmation_number','booking_url','price','currency','notes',
      'flight_number','airline','departure_airport','arrival_airport',
      'departure_time','arrival_time','flight_class',
      'hotel_name','hotel_address','check_in_date','check_out_date','room_type',
      'activity_date','activity_time','venue_name','venue_address','is_shared',
    ])
    const clean = {}
    Object.entries(raw).forEach(([k, v]) => {
      if (!BOOKING_COLS.has(k)) return
      if (v === '' || v === undefined) clean[k] = null
      else if ((k === 'departure_time' || k === 'arrival_time') && v && typeof v === 'string') {
        try { const d = new Date(v); clean[k] = isNaN(d.getTime()) ? null : d.toISOString() }
        catch { clean[k] = null }
      }
      else if (k === 'price' && v) clean[k] = parseFloat(v)
      else clean[k] = v
    })
    return { ...clean, source: 'email_import' }
  }

  const handleSave = async () => {
    if (!parsedBookings.length) return
    setSaving(true); setError(null)
    try {
      for (const booking of parsedBookings) {
        await onCreate(tripId, sanitizeBooking(booking))
      }
      onClose()
    }
    catch (e) { setError(e.message || 'Could not save booking. Check your connection and try again.') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Goose variant="excited" size={32} />
            <h2 className="sheet-title">Import from Email</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-sec)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Option 1: Forward email */}
          {bookingEmail && (
            <div style={{ borderRadius: 12, border: '2px solid var(--primary)', background: 'var(--primary-light)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--primary)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✉️</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#fff' }}>
                  Option 1 — Forward your email
                </span>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--text-sec)', margin: 0, lineHeight: 1.5 }}>
                  Forward the confirmation to your Goose Inbox — it appears here automatically.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--primary)', fontWeight: 700, flex: 1, wordBreak: 'break-all' }}>
                    {bookingEmail}
                  </span>
                  <button onClick={handleCopy} style={{ background: copied ? 'var(--success)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tert)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            or paste it below
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6, margin: 0 }}>Paste the text of any booking confirmation email — flight, hotel, or activity — and The Goose will extract the details.</p>
          {error && <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--error)' }}>{error}</div>}
          {!parsedBookings.length && <>
            <textarea className="form-input" value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Paste confirmation email text here..." style={{ resize: 'none', fontSize: 13 }} />
            <button className="btn btn-primary btn-full" onClick={handleParse} disabled={loading || !text.trim()}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', lineHeight: 0 }}><Goose variant="excited" size={18} /></span>
                  Goose is reading...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Goose variant="excited" size={18} />
                  Parse Email
                </span>
              )}
            </button>
          </>}
          {parsedBookings.length > 0 && <>
            {parsedBookings.map((booking, i) => (
              <div key={i} className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, marginBottom: 2, color: 'var(--primary)' }}>
                  {parsedBookings.length > 1 ? `✈ Leg ${i + 1} of ${parsedBookings.length}` : '✓ Parsed — looks right?'}
                  {booking.title ? ` — ${booking.title}` : ''}
                </div>
                {Object.entries(booking).filter(([k, v]) => v != null && k !== 'type' && k !== 'destination_city' && k !== 'title').map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-tert)', minWidth: 120, fontFamily: 'var(--font-heading)', fontSize: 11 }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text)', flex: 1 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            ))}
            {ultimateDest?.city && (
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textAlign: 'center' }}>
                🏁 Ultimate destination: <strong>{ultimateDest.city}</strong>
                {ultimateDest.airport_code ? ` (${ultimateDest.airport_code})` : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setParsedBookings([]); setUltimateDest(null) }}>Try Again</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : parsedBookings.length > 1 ? `Save All (${parsedBookings.length} flights)` : 'Add Booking'}
              </button>
            </div>
          </>}
        </div>
      </div>
    </>
  )
}

// ============================================================
// WEATHER TAB
// ============================================================
function WeatherTab({ trip }) {
  const { profile } = useAuthStore()
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isHistorical, setIsHistorical] = useState(false)
  const [tripEnded, setTripEnded] = useState(false)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        if (hasTripEnded(trip)) {
          // Past trip: a live forecast would be today's weather, not the trip's
          setTripEnded(true)
          return
        }
        let lat = trip.destination_lat, lon = trip.destination_lng
        if (!lat || !lon) {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trip.destination_city + ', ' + trip.destination_country)}&limit=1`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const geoData = await geoRes.json()
          if (!geoData.length) throw new Error('City not found')
          lat = geoData[0].lat; lon = geoData[0].lon
        }

        const unit = profile?.temp_unit || 'C'
        const tempUnit = unit === 'F' ? 'fahrenheit' : 'celsius'

        const tripStart = parseLocalDate(trip.start_date)
        const daysUntilTrip = daysBetween(todayLocalISO(), trip.start_date)

        if (daysUntilTrip <= 16) {
          // Live forecast
          const forecastDays = Math.min(16, Math.max(7, daysUntilTrip + 3))
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tempUnit}&wind_speed_unit=mph&timezone=auto&forecast_days=${forecastDays}`
          )
          const weatherData = await weatherRes.json()
          setWeather({
            temp: Math.round(weatherData.current.temperature_2m),
            code: weatherData.current.weather_code,
            wind: Math.round(weatherData.current.wind_speed_10m),
            humidity: weatherData.current.relative_humidity_2m,
          })
          setForecast(weatherData.daily.time.map((date, i) => ({
            date, high: Math.round(weatherData.daily.temperature_2m_max[i]),
            low: Math.round(weatherData.daily.temperature_2m_min[i]),
            code: weatherData.daily.weather_code[i],
            precip: weatherData.daily.precipitation_sum[i],
          })))
          setIsHistorical(false)
        } else {
          // Historical climate averages for future trips
          const tripEnd = new Date(trip.end_date + 'T12:00:00')
          const refStart = new Date(tripStart); refStart.setFullYear(refStart.getFullYear() - 1)
          const refEnd = new Date(tripEnd); refEnd.setFullYear(refEnd.getFullYear() - 1)
          const fmt = (d) => d.toISOString().split('T')[0]

          const [climateRes, currentRes] = await Promise.all([
            fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(refStart)}&end_date=${fmt(refEnd)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tempUnit}&timezone=auto`),
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=${tempUnit}&wind_speed_unit=mph&timezone=auto&forecast_days=1`)
          ])
          const [climateData, currentData] = await Promise.all([climateRes.json(), currentRes.json()])

          setWeather({
            temp: Math.round(currentData.current.temperature_2m),
            code: currentData.current.weather_code,
            wind: Math.round(currentData.current.wind_speed_10m),
            humidity: currentData.current.relative_humidity_2m,
          })
          setForecast((climateData.daily?.time || []).map((date, i) => ({
            date: date.replace(String(refStart.getFullYear()), String(tripStart.getFullYear())),
            high: Math.round(climateData.daily.temperature_2m_max[i] ?? 0),
            low: Math.round(climateData.daily.temperature_2m_min[i] ?? 0),
            code: climateData.daily.weather_code[i] ?? 0,
            precip: climateData.daily.precipitation_sum[i] ?? 0,
          })))
          setIsHistorical(true)
        }
      } catch (e) { setError('Weather unavailable') }
      finally { setLoading(false) }
    }
    fetchWeather()
  }, [trip.destination_city, profile?.temp_unit])

  const weatherDesc = (code) => {
    if (code === 0) return ['☀️', 'Clear']
    if (code <= 3) return ['🌤️', 'Partly cloudy']
    if (code <= 49) return ['🌫️', 'Foggy']
    if (code <= 67) return ['🌧️', 'Rainy']
    if (code <= 77) return ['❄️', 'Snow']
    if (code <= 82) return ['🌦️', 'Showers']
    return ['⛈️', 'Stormy']
  }

  const packingTip = (code, high, low) => {
    if (code >= 60) return "Pack a waterproof jacket and umbrella — The Goose doesn't do wet feathers."
    if (high <= 5) return "Bundle up. Multiple layers, gloves, the works. The Goose is wearing a scarf."
    if (high >= 30) return "Light, breathable clothing. Sunscreen. The Goose recommends shade and cold drinks."
    if (high >= 20) return "Light layers — mornings can be cool. The Goose says you'll be fine."
    return "Layers are your friend. Jeans and a light jacket should do it."
  }

  if (loading) return <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16 }} /></div>
  if (tripEnded) return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      <Goose variant="pilot" size={72} />
      <div className="empty-state-title">Trip ended</div>
      <p className="empty-state-text">This trip ended on {format(parseLocalDate(trip.end_date), 'MMM d, yyyy')}, so there is no forecast to show.</p>
    </div>
  )
  if (error) return <div className="empty-state" style={{ marginTop: 40 }}><Goose variant="worried" size={72} /><div className="empty-state-title">{error}</div></div>

  const [icon, desc] = weatherDesc(weather.code)

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Current conditions */}
      <div style={{ background: 'linear-gradient(135deg, #1A73E8, #0D47A1)', borderRadius: 16, padding: '24px 20px', color: '#fff' }}>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>{trip.destination_city} · Now</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 56 }}>{icon}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{weather.temp}°{profile?.temp_unit || 'C'}</div>
            <div style={{ fontSize: 16, opacity: 0.9 }}>{desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 13, opacity: 0.85 }}>
          <span>💨 {weather.wind} mph</span>
          <span>💧 {weather.humidity}%</span>
        </div>
      </div>

      {/* Forecast — live or historical */}
      {isHistorical && (
        <div style={{ background: 'var(--surface-alt)', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: 'var(--text-sec)', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-light)' }}>
          <span>🗓️</span>
          <span><strong>Historical averages</strong> — your trip is too far ahead for a live forecast. These are typical conditions for this time of year based on last year's data.</span>
        </div>
      )}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Trip window indicator */}
        <div style={{ padding: '8px 16px', background: 'var(--primary-light)', borderBottom: '1px solid var(--border-light)', fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
          {isHistorical ? '🗓️ Typical weather for your trip dates' : '✈️ Trip'}: {format(new Date(trip.start_date + 'T12:00:00'), 'MMM d')} – {format(new Date(trip.end_date + 'T12:00:00'), 'MMM d')}
        </div>
        {forecast.map((day, i) => {
          const [dayIcon] = weatherDesc(day.code)
          const inTrip = day.date >= trip.start_date && day.date <= trip.end_date
          return (
            <div key={day.date} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderBottom: i < forecast.length - 1 ? '1px solid var(--border-light)' : 'none',
              background: inTrip ? 'rgba(196,86,30,0.04)' : 'transparent',
              borderLeft: inTrip ? '3px solid var(--primary)' : '3px solid transparent',
            }}>
              <div style={{ minWidth: 52 }}>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700, color: inTrip ? 'var(--primary)' : 'var(--text-sec)' }}>
                  {day.date === todayLocalISO() ? 'Today' : format(new Date(day.date + 'T12:00:00'), 'EEE')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-mono)' }}>
                  {format(new Date(day.date + 'T12:00:00'), 'MMM d')}
                </div>
              </div>
              <span style={{ fontSize: 22 }}>{dayIcon}</span>
              {day.precip > 0.5 && <span style={{ fontSize: 11, color: '#1A73E8' }}>☔ {day.precip}mm</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: inTrip ? 'var(--text)' : 'var(--text-sec)', marginLeft: 'auto', fontWeight: inTrip ? 700 : 400 }}>
                {day.high}°/{day.low}°
              </span>
            </div>
          )
        })}
      </div>

      {/* Goose packing tip */}
      {forecast.length > 0 && (
        <div style={{ background: 'var(--primary-light)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Goose variant="pilot" size={40} />
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 2 }}>Goose Packing Tip</div>
            <div style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5 }}>{packingTip(forecast[0]?.code, forecast[0]?.high, forecast[0]?.low)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// CHECKLIST TAB
// ============================================================
function ChecklistTab({ trip }) {
  const { bookings } = useTripsStore()
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [collapsed, setCollapsed] = useState({})

  const STORAGE_KEY = `checklist_${trip.id}`

  const [sections, setSections] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const DEFAULTS = {
    '✈️ Essentials': [
      { label: 'Passport', note: 'valid 6+ months beyond return date' },
      { label: 'Travel insurance docs', note: 'screenshot the emergency number' },
      { label: 'Hotel confirmation', note: 'offline copy in case of no signal' },
      { label: 'Local currency / card', note: 'have some cash for arrival' },
    ],
    '📱 Tech': [
      { label: 'Phone + charger', note: 'obvious, but people forget chargers' },
      { label: 'Power bank', note: 'full day of maps drains fast' },
      { label: 'Universal adapter', note: 'check your destination plug type' },
    ],
    '🧴 Toiletries': [
      { label: 'Sunscreen', note: 'airport markup is brutal' },
      { label: 'Medications', note: 'include any prescriptions + extras' },
      { label: 'Hand sanitizer', note: 'small bottle for transit' },
    ],
    '👗 Clothing': [
      { label: 'Comfortable walking shoes', note: 'broken in, not brand new' },
      { label: 'Light jacket', note: 'AC in restaurants can be aggressive' },
      { label: 'Smart outfit', note: 'one nicer option for dinners out' },
    ],
    '🗂️ Documents': [
      { label: 'Digital copies of all docs', note: 'email them to yourself too' },
      { label: 'Emergency contacts', note: 'written down, not just in your phone' },
    ],
  }

  const nights = daysBetween(trip.start_date, trip.end_date)
  const flightCount = bookings.filter(b => b.type === 'flight').length
  const tripOver = hasTripEnded(trip)

  const generateWithAI = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      // Fetch lightweight weather context for the trip window
      let weatherContext = null
      try {
        let lat = trip.destination_lat, lon = trip.destination_lng
        if (!lat || !lon) {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trip.destination_city + ', ' + trip.destination_country)}&limit=1`, { headers: { 'Accept-Language': 'en' } })
          const geoData = await geoRes.json()
          if (geoData[0]) { lat = geoData[0].lat; lon = geoData[0].lon }
        }
        if (lat && lon) {
          const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`)
          const wData = await wRes.json()
          if (wData?.daily?.time) {
            const days = wData.daily.time.map((date, i) => ({
              date,
              high: Math.round(wData.daily.temperature_2m_max[i]),
              low: Math.round(wData.daily.temperature_2m_min[i]),
              code: wData.daily.weather_code[i],
              precip: wData.daily.precipitation_sum[i] || 0,
            })).filter(d => d.date >= trip.start_date && d.date <= trip.end_date)
            if (days.length > 0) {
              const avgHigh = Math.round(days.reduce((s, d) => s + d.high, 0) / days.length)
              const avgLow = Math.round(days.reduce((s, d) => s + d.low, 0) / days.length)
              const rainDays = days.filter(d => d.precip > 1).length
              const codes = days.map(d => d.code)
              const dominantCode = codes.sort((a, b) => codes.filter(c => c === b).length - codes.filter(c => c === a).length)[0]
              const summary = dominantCode <= 3 ? 'clear/sunny' : dominantCode <= 49 ? 'cloudy/foggy' : dominantCode <= 67 ? 'rainy' : dominantCode <= 77 ? 'snowy' : 'stormy'
              weatherContext = { avgHigh, avgLow, rainDays, summary }
            }
          }
        }
      } catch { /* weather fetch failed — proceed without it */ }

      const { generateChecklist } = await import('../../lib/gemini.js')
      const aiSections = await generateChecklist(trip, bookings, weatherContext)
      if (!Array.isArray(aiSections)) throw new Error('The Goose returned an unexpected response. Please try again.')
      const result = aiSections.map(section => ({
        title: section.title,
        items: section.items.map(item => {
          // Handle both string items (legacy) and {label, note} objects
          if (typeof item === 'string') {
            return { label: item, note: null, checked: false, id: Math.random().toString(36).slice(2) }
          }
          return { label: item.label, note: item.note || null, checked: false, id: Math.random().toString(36).slice(2) }
        })
      }))
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)) } catch {}
      setSections(result)
    } catch (e) {
      setGenError(e?.message || 'Could not build your packing list.')
    } finally { setGenerating(false) }
  }

  const applyBasicList = () => {
    const result = objectToChecklist(DEFAULTS)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)) } catch {}
    setGenError(null)
    setSections(result)
  }

  const objectToChecklist = (obj) => Object.entries(obj).map(([title, items]) => ({
    title, items: items.map(item => ({
      label: typeof item === 'string' ? item : item.label,
      note: typeof item === 'string' ? null : (item.note || null),
      checked: false,
      id: Math.random().toString(36).slice(2)
    }))
  }))

  const toggleItem = (sectionIdx, itemId) => {
    setSections(prev => {
      const updated = prev.map((s, si) => si !== sectionIdx ? s : {
        ...s, items: s.items.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item)
      })
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const toggleSection = (title) => setCollapsed(c => ({ ...c, [title]: !c[title] }))

  // Auto-generate on mount if no saved checklist — never for trips that have already ended
  useEffect(() => {
    if (!sections && !generating && !tripOver) generateWithAI()
  }, []) // eslint-disable-line

  const totalItems = sections?.reduce((sum, s) => sum + s.items.length, 0) || 0
  const checkedItems = sections?.reduce((sum, s) => sum + s.items.filter(i => i.checked).length, 0) || 0

  if (genError && !generating) return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      <Goose variant="worried" size={72} />
      <div className="empty-state-title">Couldn't build your packing list</div>
      <p className="empty-state-text">{genError}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={generateWithAI}>Try again</button>
        <button className="btn btn-ghost" onClick={applyBasicList}>Use a basic list</button>
      </div>
    </div>
  )

  if (!sections && !generating && tripOver) return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      <Goose variant="pilot" size={72} />
      <div className="empty-state-title">Trip ended</div>
      <p className="empty-state-text">This trip is over, so there is no packing list to build.</p>
      <button className="btn btn-ghost" onClick={generateWithAI}>Build one anyway</button>
    </div>
  )

  if (!sections || generating) return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', marginTop: 40 }}>
      <div style={{ animation: 'bounce 1.5s ease-in-out infinite' }}><Goose variant="excited" size={80} /></div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700 }}>Building your packing list...</div>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6 }}>The Goose is tailoring it for your {trip.destination_city} trip.</p>
    </div>
  )

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-sec)' }}>Packed</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>{checkedItems}/{totalItems}</span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${totalItems ? (checkedItems / totalItems) * 100 : 0}%`, background: 'var(--primary)', borderRadius: 99, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, si) => (
        <div key={section.title} className="card" style={{ overflow: 'hidden' }}>
          <button onClick={() => toggleSection(section.title)} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{section.title}</span>
            <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>
              {section.items.filter(i => i.checked).length}/{section.items.length} {collapsed[section.title] ? '▼' : '▲'}
            </span>
          </button>
          {!collapsed[section.title] && (
            <div style={{ borderTop: '1px solid var(--border-light)' }}>
              {section.items.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={item.checked} onChange={() => toggleItem(si, item.id)} style={{ width: 17, height: 17, accentColor: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <span style={{ fontSize: 14, color: item.checked ? 'var(--text-tert)' : 'var(--text)', textDecoration: item.checked ? 'line-through' : 'none', display: 'block' }}>{item.label}</span>
                    {item.note && !item.checked && (
                      <span style={{ fontSize: 11, color: 'var(--text-tert)', display: 'block', marginTop: 1, lineHeight: 1.4 }}>{item.note}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <button className="btn btn-ghost btn-full" onClick={() => { try { localStorage.removeItem(STORAGE_KEY) } catch {}; setSections(null); generateWithAI() }} style={{ fontSize: 13 }}>Regenerate List</button>
    </div>
  )
}

// ============================================================
// TRIP DETAIL SCREEN
// ============================================================
const DETAIL_TABS = [
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'weather', label: 'Weather' },
  { id: 'checklist', label: 'Checklist' },
]


// ============================================================
// INVITE SHEET — Phase 7
// ============================================================
function InviteSheet({ trip, onClose }) {
  const { inviteCollaborator } = useCollabStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('collaborator')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [collaborators, setCollaborators] = useState(trip.trip_collaborators || [])

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) { setResult({ error: 'Enter a valid email address' }); return }
    setSending(true); setResult(null)
    const res = await inviteCollaborator(trip.id, email.trim().toLowerCase(), role, trip.title || 'your trip')
    if (res.success) {
      // Refetch collaborators from DB to get the actual record shape
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data: freshCollabs } = await supabase
          .from('trip_collaborators')
          .select('id, user_id, role, status, invited_email')
          .eq('trip_id', trip.id)
        if (freshCollabs) setCollaborators(freshCollabs)
      } catch { /* non-critical */ }
      setResult({ success: true })
      setEmail('')
    } else {
      setResult({ error: res.error || 'Failed to send invite. Try again.' })
    }
    setSending(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px',
        width: '100%', maxWidth: 428, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, margin: 0 }}>
            👥 Invite to Trip
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email Address</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="friend@example.com"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Access Level</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['collaborator', '✏️ Can edit'], ['viewer', '👁️ View only']].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setRole(val)}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid',
                    borderColor: role === val ? 'var(--primary)' : 'var(--border)',
                    background: role === val ? 'var(--primary-light)' : 'var(--surface)',
                    color: role === val ? 'var(--primary)' : 'var(--text-tert)',
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer',
                  }}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {result?.success && (
            <div style={{ fontSize: 13, color: 'var(--success)', background: '#EFF8F3', border: '1.5px solid var(--success)', borderRadius: 8, padding: '8px 12px' }}>
              ✓ Invite sent! They'll see it when they log in.
            </div>
          )}
          {result?.error && (
            <div style={{ fontSize: 13, color: 'var(--error)', background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 8, padding: '8px 12px' }}>{result.error}</div>
          )}

          <button className="btn btn-primary btn-full" onClick={handleInvite} disabled={sending}>
            {sending ? 'Sending...' : 'Send Invite'}
          </button>

          {collaborators.filter(c => c.role !== 'owner').length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Current Travelers
              </div>
              {collaborators.filter(c => c.role !== 'owner').map((c, i) => (
                <div key={c.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'var(--text)' }}>
                      {c.invited_email}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tert)' }}>{c.role} · {c.status}</div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 11,
                    fontFamily: 'var(--font-heading)', fontWeight: 700,
                    background: c.status === 'accepted' ? '#EFF8F3' : '#FFF8EB',
                    color: c.status === 'accepted' ? 'var(--success)' : 'var(--warning)',
                  }}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TripDetailScreen() {
  const { activeTrip, setActiveTrip, subscribeToTrip } = useTripsStore()
  const { activeTripTab, setTripTab, openTripForm } = useUIStore()
  const [showInvite, setShowInvite] = useState(false)
  const trip = activeTrip

  // Real-time subscription — Phase 7
  useEffect(() => {
    if (!trip?.id) return
    const unsubscribe = subscribeToTrip(trip.id)
    return unsubscribe
  }, [trip?.id])

  if (!trip) return null

  const today = todayLocalISO()
  const start = parseLocalDate(trip.start_date)
  const end = parseLocalDate(trip.end_date)
  const isActive = trip.start_date <= today && today <= trip.end_date
  const isUpcoming = trip.start_date > today
  const daysAway = daysBetween(today, trip.start_date)
  const dayOf = isActive ? daysBetween(trip.start_date, today) + 1 : null
  const totalDays = daysBetween(trip.start_date, trip.end_date) + 1

  const flag = getFlagEmoji(trip.destination_country_code)
  const accentColor = getCountryColor(trip.destination_country_code)

  const ActiveTab = { itinerary: ItineraryTab, weather: WeatherTab, checklist: ChecklistTab }[activeTripTab] || ItineraryTab

  return (
    <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 428, bottom: 'calc(var(--nav-height) + var(--safe-bottom))', background: 'var(--bg)', zIndex: 99, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: accentColor || 'var(--primary)',
        backgroundImage: accentColor ? `linear-gradient(135deg, ${accentColor}ee, ${accentColor}bb)` : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
        padding: 'calc(var(--safe-top) + 12px) 16px 20px',
        color: '#fff',
        flexShrink: 0,
      }}>
        {/* Back + Actions row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button onClick={() => setActiveTrip(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 99, padding: '6px 14px', color: '#fff', fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← My Trips
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowInvite(true)} style={{
              background: 'rgba(255,255,255,0.25)', border: '1.5px solid rgba(255,255,255,0.4)',
              borderRadius: 99, padding: '6px 14px', color: '#fff',
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              👥 {(() => {
                const collabs = (trip.trip_collaborators || []).filter(c => c.role !== 'owner' && c.status === 'accepted')
                const pending = (trip.trip_collaborators || []).filter(c => c.role !== 'owner' && c.status === 'pending')
                if (collabs.length > 0) return `${collabs.length + 1} people`
                if (pending.length > 0) return `Invite pending`
                return 'Share Trip'
              })()}
            </button>
            {!trip._isShared && (
              <button onClick={() => openTripForm(trip)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 99, padding: '6px 14px', color: '#fff', fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600, cursor: 'pointer' }}>
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Destination */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>{flag}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{trip.title}</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>{trip.destination_city}, {trip.destination_country}</div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, opacity: 0.9, fontFamily: 'var(--font-mono)' }}>
            {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
          </span>
          {isActive && (
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              Day {dayOf} of {totalDays}
            </span>
          )}
          {isUpcoming && (
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              {daysAway === 1 ? 'Tomorrow!' : `${daysAway} days away`}
            </span>
          )}
          {isTripCompleted(trip) && (
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              Completed
            </span>
          )}
          <span style={{ marginLeft: 'auto', opacity: 0.85, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            <LiveClock city={trip.destination_city} country={trip.destination_country} lat={trip.destination_lat} lng={trip.destination_lng} />
          </span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', padding: '0 8px' }}>
          {DETAIL_TABS.map(tab => (
            <button key={tab.id} onClick={() => setTripTab(tab.id)} style={{
              flex: 1, padding: '14px 8px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14,
              color: activeTripTab === tab.id ? 'var(--primary)' : 'var(--text-tert)',
              borderBottom: activeTripTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all var(--transition)',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ActiveTab trip={trip} />
      </div>
      {showInvite && <InviteSheet trip={trip} onClose={() => setShowInvite(false)} />}
    </div>
  )
}
