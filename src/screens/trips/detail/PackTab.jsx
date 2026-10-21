import { useState, useEffect } from 'react'
import { useTripsStore } from '../../../store'
import { hasTripEnded } from '../../../lib/dates'
import { fetchWithTimeout } from '../../../lib/http'
import { track } from '../../../lib/analytics'
import { Card, Field, IconButton, Button, LinkButton, Text, Stack, Icon, Loading, ErrorState, EmptyState, ProgressBar } from '../../../ui'

const DEFAULTS = {
  Essentials: [
    { label: 'Passport', note: 'valid 6+ months beyond return date' },
    { label: 'Travel insurance docs', note: 'screenshot the emergency number' },
    { label: 'Hotel confirmation', note: 'offline copy in case of no signal' },
    { label: 'Local currency / card', note: 'have some cash for arrival' },
  ],
  Tech: [
    { label: 'Phone + charger', note: 'obvious, but people forget chargers' },
    { label: 'Power bank', note: 'full day of maps drains fast' },
    { label: 'Universal adapter', note: 'check your destination plug type' },
  ],
  Toiletries: [
    { label: 'Sunscreen', note: 'airport markup is brutal' },
    { label: 'Medications', note: 'include any prescriptions + extras' },
    { label: 'Hand sanitizer', note: 'small bottle for transit' },
  ],
  Clothing: [
    { label: 'Comfortable walking shoes', note: 'broken in, not brand new' },
    { label: 'Light jacket', note: 'AC in restaurants can be aggressive' },
    { label: 'Smart outfit', note: 'one nicer option for dinners out' },
  ],
  Documents: [
    { label: 'Digital copies of all docs', note: 'email them to yourself too' },
    { label: 'Emergency contacts', note: 'written down, not just in your phone' },
  ],
}

const AI_REPORT = 'mailto:hello@sillytraveltool.com?subject=AI%20report%3A%20packing%20list'
const newId = () => Math.random().toString(36).slice(2)
// Saved lists from before the rebuild may have emoji in section titles
const cleanTitle = t => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'Other'

const objectToChecklist = (obj) => Object.entries(obj).map(([title, items]) => ({
  title, items: items.map(item => ({
    label: typeof item === 'string' ? item : item.label,
    note: typeof item === 'string' ? null : (item.note || null),
    checked: false,
    id: newId(),
  })),
}))

export default function PackTab({ trip }) {
  const { bookings } = useTripsStore()
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [newItem, setNewItem] = useState('')

  const STORAGE_KEY = `checklist_${trip.id}`

  const [sections, setSections] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const tripOver = hasTripEnded(trip)

  const save = (next) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    setSections(next)
  }

  const generateWithAI = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      // Fetch lightweight weather context for the trip window
      let weatherContext = null
      try {
        let lat = trip.destination_lat, lon = trip.destination_lng
        if (!lat || !lon) {
          const geoRes = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trip.destination_city + ', ' + trip.destination_country)}&limit=1`, { headers: { 'Accept-Language': 'en' } })
          const geoData = await geoRes.json()
          if (geoData[0]) { lat = geoData[0].lat; lon = geoData[0].lon }
        }
        if (lat && lon) {
          const wRes = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`)
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

      const { generateChecklist } = await import('../../../lib/gemini.js')
      const aiSections = await generateChecklist(trip, bookings, weatherContext)
      if (!Array.isArray(aiSections)) throw new Error('Goose sent back something odd. Try again.')
      const result = aiSections.map(section => ({
        title: section.title,
        items: section.items.map(item => {
          // Handle both string items (legacy) and {label, note} objects
          if (typeof item === 'string') return { label: item, note: null, checked: false, id: newId() }
          return { label: item.label, note: item.note || null, checked: false, id: newId() }
        }),
      }))
      save(result)
      track('checklist_generated', { sections: result.length, weather: !!weatherContext }, 'trip')
    } catch (e) {
      track('ai_error', { feature: 'checklist' }, 'trip')
      setGenError(e?.message || 'Could not build your packing list.')
    } finally { setGenerating(false) }
  }

  const applyBasicList = () => { setGenError(null); save(objectToChecklist(DEFAULTS)) }

  const toggleItem = (sectionIdx, itemId) => {
    setSections(prev => {
      const updated = prev.map((s, si) => si !== sectionIdx ? s : {
        ...s, items: s.items.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item),
      })
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const addItem = (e) => {
    e.preventDefault()
    const label = newItem.trim()
    if (!label || !sections) return
    const idx = sections.findIndex(s => cleanTitle(s.title) === 'Your items')
    const item = { label, note: null, checked: false, id: newId() }
    save(idx >= 0
      ? sections.map((s, i) => (i === idx ? { ...s, items: [...s.items, item] } : s))
      : [...sections, { title: 'Your items', items: [item] }])
    setNewItem('')
  }

  // Auto-generate on mount if no saved checklist — never for trips that have already ended
  useEffect(() => {
    if (!sections && !generating && !tripOver) generateWithAI()
  }, []) // eslint-disable-line

  const totalItems = sections?.reduce((sum, s) => sum + s.items.length, 0) || 0
  const checkedItems = sections?.reduce((sum, s) => sum + s.items.filter(i => i.checked).length, 0) || 0

  if (genError && !generating) return (
    <ErrorState onRetry={generateWithAI} onReport={() => { window.location.href = AI_REPORT }}
      secondary={<Button onClick={applyBasicList}>Basic list</Button>}>
      {genError} Your trip and bookings are fine. Try again, or start from a basic list.
    </ErrorState>
  )

  if (!sections && !generating && tripOver) return (
    <EmptyState goose="sleepy" title="This trip is over"
      action={<Button onClick={generateWithAI} icon="sparkles">Build a list anyway</Button>}>
      No packing list was saved for it, and there's nothing left to pack.
    </EmptyState>
  )

  if (!sections || generating) return (
    <Loading title={`Goose is packing for ${trip.destination_city}`}>
      Reading your bookings and the forecast. Usually under 15 seconds.
    </Loading>
  )

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Stack row justify="between">
          <Text variant="body" weight={600} as="span">{checkedItems} of {totalItems} packed</Text>
          <Text variant="caption" tone="muted" as="span">For {trip.destination_city}</Text>
        </Stack>
        <ProgressBar value={totalItems ? checkedItems / totalItems : 0} tone={checkedItems === totalItems && totalItems ? 'success' : 'accent'} label="Packing progress" />
      </Stack>

      {sections.map((section, si) => (
        <Card key={`${section.title}-${si}`} variant="group" role="group" aria-label={cleanTitle(section.title)}>
          <Stack row justify="between" className="pack-head">
            <Text variant="overline" tone="muted" as="h3">{cleanTitle(section.title)}</Text>
            <Text variant="micro" tone="muted" as="span">{section.items.filter(i => i.checked).length}/{section.items.length}</Text>
          </Stack>
          {section.items.map(item => (
            <label key={item.id} className={`pack-item${item.checked ? ' is-done' : ''}`}>
              <input type="checkbox" className="sr-only" checked={item.checked} onChange={() => toggleItem(si, item.id)} />
              <Icon name={item.checked ? 'checkbox-checked' : 'checkbox'} className={item.checked ? 'tone-success' : 'tone-muted'} />
              <span className="pack-item__text">
                <span className="pack-item__label">{item.label}</span>
                {item.note && !item.checked && <span className="t-micro tone-muted">{item.note}</span>}
              </span>
            </label>
          ))}
        </Card>
      ))}

      <form onSubmit={addItem}>
        <Field label="Add an item" hideLabel placeholder="Add an item" value={newItem} onChange={e => setNewItem(e.target.value)}
          trailing={<IconButton type="submit" icon="plus" label="Add item" variant="sunken" disabled={!newItem.trim()} />} />
      </form>

      <Text variant="micro" tone="muted" as="p" className="pack-ai">
        Suggested by Goose (AI) from your bookings and forecast.{' '}
        <LinkButton onClick={() => { save(null); try { localStorage.removeItem(STORAGE_KEY) } catch {}; generateWithAI() }}>Redo</LinkButton>
        {' · '}
        <a className="c-link" href={AI_REPORT}>Report</a>
      </Text>
    </Stack>
  )
}
