import { useState, useEffect, useRef, useId } from 'react'
import { fetchWithTimeout } from '../../lib/http'
import { Field, Icon } from '../../ui'
import './cityAutocomplete.css'

/**
 * Shared city autocomplete using Photon API (combobox + listbox).
 * Props:
 *  - value, onChange(text), onSelect({ city, country, country_code })
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
  const listId = useId()

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = async (q) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
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
      setActive(-1)
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
                  <span className="city-ac__country">{r.country}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
