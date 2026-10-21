// Shared plan helpers for the trip detail sheets.
import { wallToInstant } from '../../../lib/localTime'

// trip_activities.category → icon tile
export const ACTIVITY_CATEGORIES = {
  food: { icon: 'restaurant', tone: 'accent', label: 'Food' },
  sight: { icon: 'camera', tone: 'info', label: 'Sight' },
  museum: { icon: 'museum', tone: 'success', label: 'Museum' },
  event: { icon: 'event', tone: 'success', label: 'Event' },
  note: { icon: 'note', tone: 'neutral', label: 'Note' },
  custom: { icon: 'star', tone: 'accent', label: 'Custom' },
}

// Sanitize before insert: empty strings → null, datetime-local → ISO, price → float, guests → int.
// datetime-local values are the local time at the place: departure_time is read in departure_tz,
// arrival_time in arrival_tz (never the phone's zone).
export function sanitizeBookingForm(form, type) {
  const clean = {}
  const zoneFor = { departure_time: form.departure_tz, arrival_time: form.arrival_tz }
  Object.entries({ ...form, type }).forEach(([k, v]) => {
    if (v === '' || v === undefined) clean[k] = null
    else if ((k === 'departure_time' || k === 'arrival_time') && v && !v.includes('Z') && !v.includes('+')) {
      const d = wallToInstant(v, zoneFor[k])
      clean[k] = d && !isNaN(d.getTime()) ? d.toISOString() : null
    }
    else if (k === 'price' && v) clean[k] = parseFloat(v)
    else if (k === 'party_size' && v) clean[k] = parseInt(v, 10) || null
    else clean[k] = v
  })
  return clean
}
