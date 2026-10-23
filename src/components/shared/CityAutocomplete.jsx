import { useState, useEffect, useRef, useId } from 'react'
import { fetchWithTimeout } from '../../lib/http'
import { suggestCities, cityDetails, newSession } from '../../lib/places'
import { Field, Icon } from '../../ui'
import './cityAutocomplete.css'

/**
 * Shared city autocomplete: Google Places (through the places Edge Function), Photon as a fallback.
 * Props:
 *  - value, onChange(text), onSelect({ city, country, country_code, lat?, lng?, tz?, place_id?, photo? })
 *  - label (visible label; hidden when hideLabel), placeholder, icon (leading icon, e.g. 'search')
 */
export default function CityAutocomplete({
  value = '',
  onChange,
  onSelect,
  label = 'Destination',
  hideLabel = false,
  placeholder = 'Tokyo, Paris, New York…',
  icon,
  autoFocus,
}) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)
  const searchId = useRef(0) // a reply to an older search (or one that lands after a pick) is dropped
  const listId = useId()
  const session = useRef(newSession())

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    // pointerdown covers touch as well as mouse, so a tap anywhere else closes the list
    document.addEventListener('pointerdown', handleClick)
    return () => { document.removeEventListener('pointerdown', handleClick); clearTimeout(debounceRef.current) }
  }, [])

  const search = async (q) => {
    const id = ++searchId.current
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const google = await suggestCities(q, session.current)
      if (id !== searchId.current) return
      if (google.length) {
        const cities = google.slice(0, 5).map(g => ({ place_id: g.place_id, city: g.main, country: g.secondary.split(', ').pop() || '', label: g.secondary }))
        setResults(cities)
        setActive(-1)
        setOpen(true)
        return
      }
      const res = await fetchWithTimeout(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place:city&osm_tag=place:town`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      if (id !== searchId.current) return
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
      setActive(-1)
      setOpen(cities.length > 0)
    } catch { setResults([]) }
    finally { if (id === searchId.current) setLoading(false) }
  }

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    onChange?.(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  const handleSelect = async (result) => {
    clearTimeout(debounceRef.current)
    searchId.current++
    setQuery(result.city)
    setOpen(false)
    setResults([])
    wrapperRef.current?.querySelector('input')?.blur() // put the phone keyboard away so the chosen city is in view
    if (!result.place_id) { onSelect?.(result); return }
    // Google suggestion: fetch country code, coordinates and time zone (same billing session)
    setLoading(true)
    const d = await cityDetails(result.place_id, session.current)
    session.current = newSession()
    setLoading(false)
    onSelect?.(d?.country_code ? { ...d, city: d.city || result.city } : { city: result.city, country: result.country, country_code: '' })
  }

  const onKeyDown = (e) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? results.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); handleSelect(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="city-ac">
      <Field
        label={label}
        hideLabel={hideLabel}
        icon={icon}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        trailing={loading ? <span className="city-ac__spinner" aria-hidden="true" /> : null}
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="city-ac__list" aria-label="Matching cities">
          {results.map((r, i) => (
            <li key={`${r.city}-${r.country_code}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className="city-ac__opt" onMouseDown={e => e.preventDefault()} onClick={() => handleSelect(r)} tabIndex={-1}>
                <Icon name="pin" size={20} className="city-ac__pin" />
                <span className="city-ac__text">
                  <span className="city-ac__city">{r.city}</span>
                  <span className="city-ac__country">{r.label || r.country}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
