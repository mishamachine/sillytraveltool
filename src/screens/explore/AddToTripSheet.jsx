import { useState } from 'react'
import { useTripsStore } from '../../store'
import { parseLocalDate, hasTripEnded } from '../../lib/dates'
import { formatRange } from '../../lib/trips'
import { Sheet, Card, ListRow, Field, Button, Banner, EmptyState, Text } from '../../ui'

/** Save a guide pick as a plan item on an upcoming trip. */
export default function AddToTripSheet({ item, itemType, onClose }) {
  const { trips, createActivity } = useTripsStore()
  const upcoming = trips
    .filter(t => !hasTripEnded(t) && t.status !== 'cancelled')
    .sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))

  const [selectedTripId, setSelectedTripId] = useState(upcoming[0]?.id || '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  const selectedTrip = upcoming.find(t => t.id === selectedTripId)

  const handleAdd = async () => {
    if (!selectedTripId) return
    setSaving(true); setError(null)
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
      setError(e?.message || 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="Add to a trip" subtitle={item.name} onClose={onClose}>
      {done ? (
        <EmptyState goose="excited" title="Added">It's in your trip plan.</EmptyState>
      ) : upcoming.length === 0 ? (
        <EmptyState goose="worried" title="No upcoming trips">Create a trip first, then save places to it.</EmptyState>
      ) : (
        <>
          {error && <Banner tone="danger" icon="alert-circle" title="Couldn't add it" role="alert">{error}</Banner>}
          <Text variant="label" as="p" id="att-trip">Trip</Text>
          <Card variant="group" role="radiogroup" aria-labelledby="att-trip">
            {upcoming.map(t => (
              <ListRow key={t.id} role="radio" aria-checked={selectedTripId === t.id} onClick={() => setSelectedTripId(t.id)}
                icon={selectedTripId === t.id ? 'check' : 'trips'} tone={selectedTripId === t.id ? 'accent' : 'neutral'}
                title={t.title} meta={`${t.destination_city} · ${formatRange(t.start_date, t.end_date)}`} />
            ))}
          </Card>
          <div className="grid-2">
            <Field label="Date" type="date" value={date} onChange={e => setDate(e.target.value)}
              min={selectedTrip?.start_date} max={selectedTrip?.end_date} />
            <Field label="Time (optional)" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <Button variant="primary" size="lg" block icon="plus" loading={saving} disabled={!selectedTripId} onClick={handleAdd}>
            {saving ? 'Adding' : 'Add to trip'}
          </Button>
        </>
      )}
    </Sheet>
  )
}
