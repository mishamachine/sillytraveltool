import { useState, useEffect, useRef } from 'react'
import { fetchWithTimeout } from '../../lib/http'

/**
 * Shared city autocomplete using Photon API.
 * Props:
 *  - value: current text value
 *  - onChange: (text) => void — fired on every keystroke
 *  - onSelect: ({ city, country, country_code }) => void — fired when user picks a result
 *  - placeholder: input placeholder text
 *  - compact: boolean — smaller padding for inline usage (Guide search bar)
 */
export default function CityAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Tokyo, Paris, New York...',
  compact = false,
}) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = async (q) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place:city&osm_tag=place:town`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      const cities = (data.features || [])
        .filter(f => ['city', 'town', 'municipality'].includes(f.properties?.type))
        .map(f => ({
          city: f.properties.name,
          country: f.properties.country || '',
          country_code: (f.properties.countrycode || '').toUpperCase(),
        }))
        .filter(r => r.city && r.country)
        // Deduplicate by city+country_code
        .filter((r, i, arr) => arr.findIndex(x =>
          x.city.toLowerCase() === r.city.toLowerCase() && x.country_code === r.country_code
        ) === i)
        .slice(0, 5)
      setResults(cities)
      setOpen(cities.length > 0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    onChange?.(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  const handleSelect = (result) => {
    setQuery(result.city)
    setOpen(false)
    setResults([])
    onSelect?.(result)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: compact ? 1 : undefined }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
        style={compact ? { padding: '8px 12px', fontSize: '14px' } : undefined}
      />
      {loading && (
        <div style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          width: 16, height: 16, border: '2px solid var(--border)',
          borderTopColor: 'var(--primary)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          zIndex: 999, overflow: 'hidden',
        }}>
          {results.map((r, i) => (
            <button key={`${r.city}-${r.country_code}-${i}`} onClick={() => handleSelect(r)} style={{
              width: '100%', textAlign: 'left', padding: compact ? '8px 12px' : '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: i < results.length - 1 ? '1px solid var(--border-light)' : 'none',
              display: 'flex', flexDirection: 'column', gap: '2px',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-alt)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{r.city}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-tert)' }}>{r.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
