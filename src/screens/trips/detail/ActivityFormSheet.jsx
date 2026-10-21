import { useState } from 'react'
import { ACTIVITY_CATEGORIES } from './planKinds'
import { Sheet, Field, Button, Banner, Chip, Stack, Text } from '../../../ui'


// A plan or note on the trip (trip_activities), not a booking.
export default function ActivityFormSheet({ tripId, onClose, onCreate }) {
  const [form, setForm] = useState({ category: 'note' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const bind = (k) => ({ value: form[k] || '', onChange: e => set(k, e.target.value) })

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.title) return
    setLoading(true); setError(null)
    try { await onCreate(tripId, form); onClose() }
    catch (err) { setError(err.message || 'Could not save. Check your connection.') }
    finally { setLoading(false) }
  }

  return (
    <Sheet title="Add a plan or note" onClose={onClose}>
      <form className="detail-form" onSubmit={handleSave}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Stack gap={2}>
          <Text variant="label" as="p" id="cat-label">Kind</Text>
          <div className="c-chip-row" role="group" aria-labelledby="cat-label">
            {['food', 'sight', 'museum', 'event', 'note'].map(c => (
              <Chip key={c} icon={ACTIVITY_CATEGORIES[c].icon} selected={form.category === c} onClick={() => set('category', c)}>
                {ACTIVITY_CATEGORIES[c].label}
              </Chip>
            ))}
          </div>
        </Stack>
        <Field label="Title" required {...bind('title')} placeholder="Sunset at Mirador San Nicolás" />
        <div className="grid-2">
          <Field label="Date" type="date" {...bind('date')} />
          <Field label="Time" type="time" {...bind('time')} />
        </div>
        <Field label="Place" {...bind('location_name')} placeholder="Place name or address" />
        <Field label="Notes" as="textarea" rows={2} {...bind('notes')} />
        <Button type="submit" variant="primary" size="lg" block loading={loading} disabled={!form.title}>{loading ? 'Saving' : 'Add to plan'}</Button>
      </form>
    </Sheet>
  )
}
