// Shared plan helpers for the trip detail sheets.

// trip_activities.category → icon tile
export const ACTIVITY_CATEGORIES = {
  food: { icon: 'restaurant', tone: 'accent', label: 'Food' },
  sight: { icon: 'camera', tone: 'info', label: 'Sight' },
  museum: { icon: 'museum', tone: 'success', label: 'Museum' },
  event: { icon: 'event', tone: 'success', label: 'Event' },
  note: { icon: 'note', tone: 'neutral', label: 'Note' },
  custom: { icon: 'star', tone: 'accent', label: 'Custom' },
}

// Sanitize before insert: empty strings → null, datetime-local → ISO, price → float, guests → int
export function sanitizeBookingForm(form, type) {
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
    else if (k === 'party_size' && v) clean[k] = parseInt(v, 10) || null
    else clean[k] = v
  })
  return clean
}
