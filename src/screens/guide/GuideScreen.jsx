import { useState, useRef, useEffect } from 'react'
import { useTripsStore, useUIStore, useGuideStore, useAuthStore } from '../../store'
import Goose from '../../components/goose/Goose'
import ShareNudge from '../../components/shared/ShareNudge'
import { parseLocalDate, hasTripEnded } from '../../lib/dates'

const GUIDE_TABS = [
  { id: 'know',   emoji: '🧠', label: 'Know'   },
  { id: 'eat',    emoji: '🍜', label: 'Eat'    },
  { id: 'see',    emoji: '👁', label: 'See'    },
  { id: 'move',   emoji: '🚇', label: 'Move'   },
  { id: 'events', emoji: '🎉', label: 'Events' },
]

// ─────────────────────────────────────────────
// ADD TO TRIP SHEET
// ─────────────────────────────────────────────
function AddToTripSheet({ item, itemType, onClose }) {
  const { trips, createActivity } = useTripsStore()
  const { user } = useAuthStore()
  const upcoming = trips
    .filter(t => !hasTripEnded(t) && t.status !== 'cancelled')
    .sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))

  const [selectedTripId, setSelectedTripId] = useState(upcoming[0]?.id || '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const selectedTrip = upcoming.find(t => t.id === selectedTripId)

  const handleAdd = async () => {
    if (!selectedTripId) return
    setSaving(true)
    try {
      await createActivity(selectedTripId, {
        title: item.name || 'Activity',
        notes: (item.description || item.goose_quip || '').slice(0, 500),
        date: date || null,
        time: time || null,
        category: itemType === 'restaurant' ? 'food' : 'sight',
        is_completed: false,
      })
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (e) {
      console.error('Add to trip error', e)
      alert('Could not add to trip: ' + (e?.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 428 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>Add to Trip</div>
            <div style={{ fontSize: 13, color: 'var(--text-tert)', marginTop: 2 }}>{item.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginTop: 10 }}>Added!</div>
          </div>
        ) : upcoming.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-tert)', fontSize: 14 }}>No upcoming trips. Create one first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Trip</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcoming.map(t => (
                  <button key={t.id} onClick={() => setSelectedTripId(t.id)} style={{
                    padding: '10px 14px', borderRadius: 10, border: '1.5px solid',
                    borderColor: selectedTripId === t.id ? 'var(--primary)' : 'var(--border)',
                    background: selectedTripId === t.id ? 'var(--primary-light)' : 'var(--surface)',
                    textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: selectedTripId === t.id ? 'var(--primary)' : 'var(--text)' }}>{t.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>{t.destination_city}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Date</div>
                <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)}
                  min={selectedTrip?.start_date} max={selectedTrip?.end_date} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Time <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
                <input type="time" className="form-input" value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={handleAdd} disabled={saving || !selectedTripId}>
              {saving ? 'Adding...' : '+ Add to Trip'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CITY SEARCH
// ─────────────────────────────────────────────
function CitySearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = async (q) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place:city&osm_tag=place:town`, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      const cities = (data.features || [])
        .filter(f => ['city','town','municipality'].includes(f.properties?.type))
        .map(f => ({ city: f.properties.name, country: f.properties.country || '', country_code: (f.properties.countrycode || '').toUpperCase() }))
        .filter(r => r.city && r.country)
        .filter((r, i, arr) => arr.findIndex(x => x.city.toLowerCase() === r.city.toLowerCase() && x.country_code === r.country_code) === i)
        .slice(0, 5)
      setResults(cities); setOpen(cities.length > 0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  const handleChange = (e) => {
    const q = e.target.value; setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  const handleSelect = (r) => { setQuery(''); setOpen(false); setResults([]); onSelect(r) }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <input className="form-input" placeholder="Search any city..." value={query} onChange={handleChange} autoComplete="off" style={{ paddingRight: 36 }} />
      {loading && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>}
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 999, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < results.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-alt)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{r.city}</span>
              <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>{r.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SCORE BADGE — right-aligned, colour-coded
// ─────────────────────────────────────────────
function ScoreBadge({ score }) {
  if (!score) return null
  const s = parseFloat(score)
  const color = s >= 9 ? '#1A8A4A' : s >= 7.5 ? 'var(--primary)' : s >= 6 ? '#D4910A' : '#888'
  return (
    <div style={{
      minWidth: 46, height: 46, borderRadius: 10,
      background: color + '15', border: `1.5px solid ${color}35`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, gap: 1,
    }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>⭐</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color, lineHeight: 1 }}>{s.toFixed(1)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// KNOW TAB
// ─────────────────────────────────────────────
function KnowTab({ data }) {
  const [expanded, setExpanded] = useState(false)

  if (!data?.history_text) return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      <Goose variant="lost" size={72} />
      <div className="empty-state-title">No content yet</div>
    </div>
  )

  const stats = data.city_stats || {}
  const comparisons = stats.comparisons || []
  const gooseFacts = stats.goose_facts || []

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Hero card */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--primary)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Goose variant="happy" size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: '#fff' }}>{data.destination_city}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>{data.destination_country}</div>
          </div>
          {data.generated_at && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)' }}>
              {Math.round((Date.now() - new Date(data.generated_at)) / (1000*60*60*24))}d ago
            </span>
          )}
        </div>
        <div style={{ padding: '14px 16px' }}>
          <p style={{
            fontSize: 14, color: 'var(--text-sec)', lineHeight: 1.75, margin: 0,
            display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 4,
            WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
          }}>{data.history_text}</p>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, padding: '8px 0 0', display: 'block' }}>
            {expanded ? '▲ Show less' : '▼ Read more'}
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {data.wikipedia_url && <a href={data.wikipedia_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>📖 Wikipedia</a>}
            {data.britannica_url && <a href={data.britannica_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>🌐 Britannica</a>}
          </div>
        </div>
      </div>

      {/* Quick stats grid */}
      {Object.values(stats).some(v => v && typeof v !== 'object') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['👥', 'Population', stats.population],
            ['🌐', 'Language', stats.language],
            ['💱', 'Currency', stats.currency],
            ['🕐', 'Timezone', stats.timezone],
            ['🌡️', 'Summer avg', stats.avg_temp_summer],
            ['❄️', 'Winter avg', stats.avg_temp_winter],
            ['📅', 'Founded', stats.founded],
            ['📐', 'Area', stats.area_km2 ? `${Number(stats.area_km2).toLocaleString()} km²` : null],
          ].filter(([,,v]) => v).map(([icon, label, value]) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 2, fontFamily: 'var(--font-heading)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison callouts */}
      {comparisons.length > 0 && (
        <div style={{ background: 'var(--primary-light)', border: '1.5px solid var(--primary)', borderRadius: 14, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>📊 By the numbers</div>
          {comparisons.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0, fontWeight: 700 }}>→</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {/* Goose facts */}
      {gooseFacts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🪿 Goose on {data.destination_city}</div>
          {gooseFacts.map((f, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.55 }}>{f.fact}</div>
              {f.goose_take && (
                <div style={{ fontSize: 13, color: 'var(--primary)', fontStyle: 'italic', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-light)', lineHeight: 1.5 }}>
                  🪿 "{f.goose_take}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// RESTAURANT CARD
// ─────────────────────────────────────────────
function RestaurantCard({ r, onAddToTrip }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      background: r.is_goose_pick ? '#FFF7F4' : 'var(--surface)',
      borderRadius: 14,
      border: r.is_goose_pick ? '2px solid var(--primary)' : '1.5px solid var(--border)',
      overflow: 'hidden',
      boxShadow: r.is_goose_pick ? '0 4px 20px rgba(196,86,30,0.18)' : '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {r.is_goose_pick && (
        <div style={{ background: 'var(--primary)', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Goose Pick</span>
        </div>
      )}
      {/* Collapsed row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button onClick={() => setExpanded(!expanded)} style={{ flex: 1, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>{r.cuisine}</div>
            {r.goose_quip && !expanded && (
              <p style={{ fontSize: 12, color: 'var(--primary)', fontStyle: 'italic', marginTop: 5, lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <span>"{r.goose_quip}"</span>
              </p>
            )}
          </div>
          <ScoreBadge score={r.goose_score || r.rating_estimate} />
        </button>
        {/* Always-visible add button */}
        <button
          onClick={() => onAddToTrip(r, 'restaurant')}
          title="Add to Trip"
          style={{ padding: '12px 14px', background: 'none', border: 'none', borderLeft: '1px solid var(--border-light)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="var(--primary)" strokeWidth="1.5"/>
            <path d="M10 6v8M6 10h8" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-light)' }}>
          {r.description && <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.65, marginTop: 10 }}>{r.description}</p>}
          {r.goose_quip && (
            <p style={{ fontSize: 13, color: 'var(--primary)', fontStyle: 'italic', marginTop: 8, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8, borderLeft: '3px solid var(--primary)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span>"{r.goose_quip}"</span>
            </p>
          )}
          {r.address && <p style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 8 }}>📍 {r.address}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => onAddToTrip(r, 'restaurant')} className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>+ Add to Trip</button>
            {r.google_maps_query && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.google_maps_query)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>📍 Maps</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// EAT TAB
// ─────────────────────────────────────────────
function EatTab({ data, onAddToTrip, onLoadMore, loadingMore, destination }) {
  const [tier, setTier] = useState('cheap')
  const sectionKey = { cheap: 'eat_cheap', mid: 'eat_mid', splurge: 'eat_splurge' }[tier]
  const restaurants = { cheap: data?.eat_cheap, mid: data?.eat_mid, splurge: data?.eat_splurge }[tier] || []
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pill-tabs" style={{ margin: '0 0 4px' }}>
        {[['cheap', '$ Cheap'], ['mid', '$$ Mid'], ['splurge', '$$$ Splurge']].map(([id, label]) => (
          <button key={id} className={`pill-tab ${tier === id ? 'active' : ''}`} onClick={() => setTier(id)}>{label}</button>
        ))}
      </div>
      {restaurants.length === 0 && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="hungry" size={72} />
          <div className="empty-state-title">No restaurants yet</div>
        </div>
      )}
      {restaurants.map((r, i) => <RestaurantCard key={i} r={r} onAddToTrip={onAddToTrip} />)}
      {restaurants.length > 0 && (
        <button
          onClick={() => onLoadMore(sectionKey)}
          disabled={loadingMore === sectionKey}
          style={{
            marginTop: 4, padding: '12px', borderRadius: 12, border: '1.5px dashed var(--border)',
            background: 'none', cursor: loadingMore === sectionKey ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
            color: loadingMore === sectionKey ? 'var(--text-tert)' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loadingMore === sectionKey
            ? <><span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Loading more...</>
            : <><Goose variant="hungry" size={18} /> Load 10 More</>
          }
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ATTRACTION CARD
// ─────────────────────────────────────────────
function AttractionCard({ item, onAddToTrip }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      background: item.is_goose_pick ? '#FFF7F4' : 'var(--surface)',
      borderRadius: 14,
      border: item.is_goose_pick ? '2px solid var(--primary)' : '1.5px solid var(--border)',
      overflow: 'hidden',
      boxShadow: item.is_goose_pick ? '0 4px 20px rgba(196,86,30,0.18)' : '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {item.is_goose_pick && (
        <div style={{ background: 'var(--primary)', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Goose Pick</span>
        </div>
      )}
      {/* Collapsed row */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button onClick={() => setExpanded(!expanded)} style={{ flex: 1, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{item.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>{item.type}</div>
            {item.goose_quip && !expanded && (
              <p style={{ fontSize: 12, color: 'var(--primary)', fontStyle: 'italic', marginTop: 5, lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <span>"{item.goose_quip}"</span>
              </p>
            )}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-tert)', flexShrink: 0, marginTop: 2 }}>{expanded ? '▲' : '▼'}</span>
        </button>
        {/* Always-visible add button */}
        <button
          onClick={() => onAddToTrip(item, 'attraction')}
          title="Add to Trip"
          style={{ padding: '12px 14px', background: 'none', border: 'none', borderLeft: '1px solid var(--border-light)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="var(--primary)" strokeWidth="1.5"/>
            <path d="M10 6v8M6 10h8" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-light)' }}>
          {item.description && <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.65, marginTop: 10 }}>{item.description}</p>}
          {item.goose_quip && (
            <p style={{ fontSize: 13, color: 'var(--primary)', fontStyle: 'italic', marginTop: 8, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8, borderLeft: '3px solid var(--primary)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span>"{item.goose_quip}"</span>
            </p>
          )}
          {item.address && <p style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 8 }}>📍 {item.address}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => onAddToTrip(item, 'attraction')} className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>+ Add to Trip</button>
            {item.google_maps_query && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.google_maps_query)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>📍 Maps</a>
            )}
            {item.official_url && <a href={item.official_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>🌐 Official</a>}
            {item.wikipedia_url && <a href={item.wikipedia_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>📖 Wiki</a>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SEE TAB
// ─────────────────────────────────────────────
function SeeTab({ data, onAddToTrip, onLoadMore, loadingMore }) {
  const [category, setCategory] = useState('museums')
  const sectionKey = { museums: 'see_museums', neighbourhoods: 'see_neighbourhoods', parks: 'see_parks', daytrips: 'see_daytrips' }[category]
  const items = { museums: data?.see_museums, neighbourhoods: data?.see_neighbourhoods, parks: data?.see_parks, daytrips: data?.see_daytrips }[category] || []
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pill-tabs" style={{ margin: '0 0 4px' }}>
        {[['museums','Museums'],['neighbourhoods','Areas'],['parks','Parks'],['daytrips','Day Trips']].map(([id, label]) => (
          <button key={id} className={`pill-tab ${category === id ? 'active' : ''}`} onClick={() => setCategory(id)}>{label}</button>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="detective" size={72} />
          <div className="empty-state-title">Nothing here yet</div>
        </div>
      )}
      {items.map((item, i) => <AttractionCard key={i} item={item} onAddToTrip={onAddToTrip} />)}
      {items.length > 0 && (
        <button
          onClick={() => onLoadMore(sectionKey)}
          disabled={loadingMore === sectionKey}
          style={{
            marginTop: 4, padding: '12px', borderRadius: 12, border: '1.5px dashed var(--border)',
            background: 'none', cursor: loadingMore === sectionKey ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
            color: loadingMore === sectionKey ? 'var(--text-tert)' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loadingMore === sectionKey
            ? <><span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Loading more...</>
            : <><Goose variant="detective" size={18} /> Load 10 More</>
          }
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MOVE TAB — with official links
// ─────────────────────────────────────────────
function MoveTab({ data }) {
  const move = data?.move_content || {}
  const options = move.options || []

  const transportIcon = (type = '') => {
    const t = type.toLowerCase()
    if (t.includes('metro') || t.includes('subway') || t.includes('underground') || t.includes('tube')) return '🚇'
    if (t.includes('bus')) return '🚌'
    if (t.includes('taxi') || t.includes('cab')) return '🚕'
    if (t.includes('ride') || t.includes('grab') || t.includes('uber') || t.includes('bolt')) return '📱'
    if (t.includes('train') || t.includes('rail')) return '🚆'
    if (t.includes('tram') || t.includes('streetcar')) return '🚊'
    if (t.includes('ferry') || t.includes('boat')) return '⛴️'
    if (t.includes('bike') || t.includes('cycl')) return '🚲'
    if (t.includes('walk') || t.includes('foot')) return '🚶'
    if (t.includes('car') || t.includes('driv')) return '🚗'
    return '🗺️'
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {move.overview && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--border)', padding: '14px 16px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-sec)', lineHeight: 1.75, margin: 0 }}>{move.overview}</p>
        </div>
      )}
      {options.length === 0 && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="pilot" size={72} />
          <div className="empty-state-title">Transport info loading</div>
        </div>
      )}
      {options.map((opt, i) => (
        <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
              {transportIcon(opt.type)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{opt.type}</div>
              {opt.app_name && <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 1 }}>App: {opt.app_name}</div>}
            </div>
            {opt.official_url && (
              <a href={opt.official_url} target="_blank" rel="noreferrer" style={{
                fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-heading)', fontWeight: 700,
                background: 'var(--primary-light)', padding: '5px 10px', borderRadius: 8,
                textDecoration: 'none', flexShrink: 0, border: '1px solid var(--primary)',
              }}>
                Official ↗
              </a>
            )}
          </div>
          <div style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.65, margin: 0 }}>{opt.description}</p>
            {opt.tip && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8, borderLeft: '3px solid var(--primary)' }}>
                <p style={{ fontSize: 12, color: 'var(--primary)', margin: 0, lineHeight: 1.5 }}>💡 {opt.tip}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// EVENTS TAB
// ─────────────────────────────────────────────
function EventsTab({ data }) {
  const events = data?.events || []
  const typeColor = (type = '') => {
    const t = type.toLowerCase()
    if (t.includes('festival')) return '#7B61C4'
    if (t.includes('music')) return '#1A8A4A'
    if (t.includes('market')) return '#D4910A'
    if (t.includes('sports')) return '#1A73E8'
    return 'var(--primary)'
  }

  if (events.length === 0) return (
    <div className="empty-state" style={{ marginTop: 60 }}>
      <Goose variant="sleeping" size={96} />
      <div className="empty-state-title" style={{ fontSize: 20, marginTop: 12 }}>Quiet city</div>
      <p className="empty-state-text">The Goose suggests making your own chaos.</p>
    </div>
  )
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {events.map((evt, i) => (
        <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ height: 4, background: typeColor(evt.type) }} />
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{evt.name || evt.title}</div>
              {evt.month && (
                <span style={{ fontSize: 11, color: typeColor(evt.type), fontFamily: 'var(--font-heading)', fontWeight: 700, background: typeColor(evt.type) + '18', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
                  {evt.month}
                </span>
              )}
            </div>
            {evt.description && <p style={{ fontSize: 13, color: 'var(--text-sec)', marginTop: 6, lineHeight: 1.6 }}>{evt.description}</p>}
            {evt.type && (
              <div style={{ fontSize: 11, color: typeColor(evt.type), fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>
                {evt.type}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN GUIDE SCREEN
// ─────────────────────────────────────────────
export default function GuideScreen() {
  const { trips } = useTripsStore()
  const { activeGuideTab, setGuideTab, activeTab } = useUIStore()
  const { getGuideData, loadingSections, error: guideError, currentDestination, sections, loadGuide, loadGuideSection, loadMoreSection, clearGuide, lastSectionFromCache } = useGuideStore()
  const guideData = getGuideData()
  const loading = !!loadingSections['overview']
  const [addToTripItem, setAddToTripItem] = useState(null)
  const [loadingMore, setLoadingMore] = useState(null)

  const upcomingTrips = trips
    .filter(t => !hasTripEnded(t) && t.status !== 'cancelled')
    .sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))

  const upcomingTrip = upcomingTrips[0]

  const [destination, setDestination] = useState(
    upcomingTrip
      ? { city: upcomingTrip.destination_city, country: upcomingTrip.destination_country, country_code: upcomingTrip.destination_country_code }
      : null
  )
  const [showTripPicker, setShowTripPicker] = useState(false)

  useEffect(() => {
    if (!destination && upcomingTrip) {
      setDestination({ city: upcomingTrip.destination_city, country: upcomingTrip.destination_country, country_code: upcomingTrip.destination_country_code })
    }
  }, [upcomingTrip])

  // Load overview on destination change — also fires when activeTab becomes 'guide'
  // so navigating TO the guide tab always triggers load, not just city changes
  useEffect(() => {
    if (destination && destination.country_code !== 'IL') loadGuide(destination.city, destination.country, destination.country_code)
  }, [destination?.city, activeTab])

  // Sub-sections each tab needs
  const TAB_SECTIONS = {
    know:   ['overview'],
    eat:    ['eat_cheap', 'eat_mid', 'eat_splurge'],
    see:    ['see_temples', 'see_neighbourhoods', 'see_museums', 'see_parks', 'see_daytrips'],
    move:   ['move'],
    events: ['events'],
  }

  // Load sub-sections when tab switches (lazy, parallel)
  useEffect(() => {
    if (!destination || !currentDestination) return
    const needed = TAB_SECTIONS[activeGuideTab] || []
    needed.forEach(section => {
      if (!sections[section]) loadGuideSection(destination.city, destination.country, section)
    })
  }, [activeGuideTab, destination?.city])

  const handleCitySelect = (result) => setDestination({ city: result.city, country: result.country, country_code: result.country_code })
  const handleAddToTrip = (item, itemType) => setAddToTripItem({ item, itemType })
  const handleLoadMore = async (section) => {
    if (!destination) return
    setLoadingMore(section)
    await loadMoreSection(destination.city, destination.country, section)
    setLoadingMore(null)
  }

  // A tab is loading if any of its sub-sections are currently loading
  const neededSections = TAB_SECTIONS[activeGuideTab] || []
  const isSectionLoading = neededSections.some(s => !!loadingSections[s])
  // A tab is loaded when ALL its sub-sections are present
  const isSectionLoaded = neededSections.length > 0 && neededSections.every(s => !!sections[s])

  const TAB_CONTENT = {
    know:   <KnowTab data={guideData} />,
    eat:    <EatTab data={guideData} onAddToTrip={handleAddToTrip} onLoadMore={handleLoadMore} loadingMore={loadingMore} destination={destination} />,
    see:    <SeeTab data={guideData} onAddToTrip={handleAddToTrip} onLoadMore={handleLoadMore} loadingMore={loadingMore} />,
    move:   <MoveTab data={guideData} />,
    events: <EventsTab data={guideData} />,
  }

  return (
    <div className="screen">
      <div className="screen-header" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* City title — dropdown if multiple trips */}
          {upcomingTrips.length > 1 && destination ? (
            <button
              onClick={() => setShowTripPicker(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <div>
                <h1 className="screen-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {destination.city}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: 2 }}>
                    <path d="M4 6l4 4 4-4" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-tert)', marginTop: 2 }}>{destination.country} · {upcomingTrips.length} trips</p>
              </div>
            </button>
          ) : (
            <div>
              <h1 className="screen-title" style={{ marginBottom: 0 }}>{destination ? destination.city : 'Guide'}</h1>
              {destination && <p style={{ fontSize: 13, color: 'var(--text-tert)', marginTop: 2 }}>{destination.country}</p>}
            </div>
          )}
          {isSectionLoading && <div style={{ width: 20, height: 20, border: '2.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CitySearch onSelect={handleCitySelect} />
          {destination && upcomingTrip && destination.city !== upcomingTrip.destination_city && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDestination({ city: upcomingTrip.destination_city, country: upcomingTrip.destination_country, country_code: upcomingTrip.destination_country_code })} style={{ flexShrink: 0 }}>
              My Trip
            </button>
          )}
        </div>
      </div>

      {/* Trip Picker Sheet */}
      {showTripPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowTripPicker(false)}>
          <div style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 428 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>Your Trips</div>
              <button onClick={() => setShowTripPicker(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingTrips.map(t => {
                const isSelected = destination?.city === t.destination_city
                return (
                  <button key={t.id} onClick={() => {
                    setDestination({ city: t.destination_city, country: t.destination_country, country_code: t.destination_country_code })
                    setShowTripPicker(false)
                  }} style={{
                    padding: '12px 14px', borderRadius: 12, border: '1.5px solid',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    background: isSelected ? 'var(--primary-light)' : 'var(--surface)',
                    textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ fontSize: 28, lineHeight: 1 }}>
                      {t.destination_country_code ? String.fromCodePoint(...[...t.destination_country_code.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65)) : '🌍'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: isSelected ? 'var(--primary)' : 'var(--text)' }}>{t.destination_city}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 1 }}>{t.title} · {t.destination_country}</div>
                    </div>
                    {isSelected && <span style={{ fontSize: 16, color: 'var(--primary)' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {destination && (
        <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          <div className="pill-tabs" style={{ margin: 0 }}>
            {GUIDE_TABS.map(tab => (
              <button key={tab.id} onClick={() => setGuideTab(tab.id)}
                className={`pill-tab ${activeGuideTab === tab.id ? 'active' : ''}`}
                style={{ flexDirection: 'column', gap: 2, padding: '6px 4px', fontSize: 11 }}>
                <span style={{ fontSize: 15 }}>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!destination && (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Goose variant="lost" size={80} />
          <div className="empty-state-title">Search any city</div>
          <p className="empty-state-text">Type a city above. If you have an upcoming trip, it loads automatically.</p>
        </div>
      )}

      {destination && destination.country_code === 'IL' && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <img
            src="/excluded-country-image.png"
            alt=""
            style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: 16, marginBottom: 8 }}
            onError={e => { e.target.style.display = 'none' }}
          />
          <Goose variant="worried" size={80} />
          <div className="empty-state-title">Guide unavailable</div>
          <p className="empty-state-text">The Goose doesn't currently provide guides for this destination.</p>
        </div>
      )}

      {destination && destination.country_code !== 'IL' && isSectionLoading && (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div style={{ animation: 'bounce 1.5s ease-in-out infinite' }}><Goose variant="excited" size={96} /></div>
          <div className="empty-state-title">
            {lastSectionFromCache ? 'Loading...' : 'Generating your guide...'}
          </div>
          <p className="empty-state-text">
            {lastSectionFromCache
              ? `Fetching ${activeGuideTab === 'know' ? 'the overview' : activeGuideTab} for ${destination.city}.`
              : `This takes ~10 seconds the first time for ${destination.city}.`}
          </p>
          <div style={{ width: 200, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: '60%', background: 'var(--primary)', borderRadius: 99, animation: 'shimmer 1.5s infinite' }} />
          </div>
        </div>
      )}

      {destination && destination.country_code !== 'IL' && !isSectionLoading && guideError && !isSectionLoaded && (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Goose variant="worried" size={80} />
          <div className="empty-state-title">Couldn't load this section</div>
          <p className="empty-state-text">{guideError}</p>
          <button className="btn btn-primary" onClick={async () => {
            if (!useGuideStore.getState().sections.overview) {
              clearGuide()
              await loadGuide(destination.city, destination.country, destination.country_code)
            }
            // Re-request any sub-sections this tab still needs
            neededSections.forEach(s => {
              if (!useGuideStore.getState().sections[s]) loadGuideSection(destination.city, destination.country, s)
            })
          }}>
            Try again
          </button>
        </div>
      )}

      {destination && destination.country_code !== 'IL' && !isSectionLoading && isSectionLoaded && (
        <>
          {TAB_CONTENT[activeGuideTab]}
          {lastSectionFromCache && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-mono)', padding: '4px 0 12px' }}>
              ✓ Cached — future loads are instant
            </div>
          )}
        </>
      )}

      {addToTripItem && (
        <AddToTripSheet
          item={addToTripItem.item}
          itemType={addToTripItem.itemType}
          onClose={() => setAddToTripItem(null)}
        />
      )}
      <ShareNudge />
    </div>
  )
}
