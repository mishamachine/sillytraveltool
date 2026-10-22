import { useState, useEffect, useRef, useId } from 'react'
import { suggestPlaces, placeDetails, newSession } from '../../lib/places'
import { Field, Icon } from '../../ui'
import './cityAutocomplete.css'

/**
 * Hotel / restaurant / venue search through Google Places. Free text always works; picking a
 * suggestion calls onPick({ place_id, name, address, lat, lng, phone, website, maps_url, ... }).
 * Props: label, value, onChange(text), onPick(place), near ({ lat, lng } to bias results), placeholder
 */
export default function PlaceAutocomplete({ label, value = '', onChange, onPick, near, placeholder, hideLabel, describedBy }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)
  const session = useRef(newSession())
  const typed = useRef(false) // only search after the user types, not for prefilled values
  const listId = useId()

  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => { document.removeEventListener('mousedown', handleClick); clearTimeout(debounceRef.current) }
  }, [])

  const search = async (q) => {
    if (q.trim().length < 3) { setResults([]); setOpen(false); return }
    setLoading(true)
    const found = (await suggestPlaces(q, session.current, near)).slice(0, 5)
    setLoading(false)
    setResults(found)
    setActive(-1)
    setOpen(found.length > 0)
  }

  const handleChange = (e) => {
    typed.current = true
    onChange?.(e.target.value)
    clearTimeout(debounceRef.current)
    const q = e.target.value
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  const handleSelect = async (r) => {
    setOpen(false)
    setResults([])
    onChange?.(r.main)
    setLoading(true)
    const d = await placeDetails(r.place_id, session.current)
    session.current = newSession()
    setLoading(false)
    if (d) onPick?.(d)
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
        placeholder={placeholder}
        value={value || ''}
        onChange={handleChange}
        onFocus={() => typed.current && results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-describedby={describedBy}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        trailing={loading ? <span className="city-ac__spinner" aria-hidden="true" /> : null}
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="city-ac__list" aria-label={`Matching places for ${label}`}>
          {results.map((r, i) => (
            <li key={r.place_id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className="city-ac__opt" onMouseDown={e => e.preventDefault()} onClick={() => handleSelect(r)} tabIndex={-1}>
                <Icon name="pin" size={20} className="city-ac__pin" />
                <span className="city-ac__text">
                  <span className="city-ac__city">{r.main}</span>
                  <span className="city-ac__country">{r.secondary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
