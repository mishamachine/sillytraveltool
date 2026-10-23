import { useState } from 'react'
import { Sheet, Field, Button, Banner, Text, Stack } from '../../ui'

import { suggestTripName } from '../../lib/trips'

/**
 * Before a flow creates a trip on the traveller's behalf (saving an idea for a city with no trip yet),
 * show the name it will get, filled in and editable. onCreate(title) does the saving; it may throw.
 */
export default function NewTripNameSheet({ city, onCreate, onClose }) {
  const [title, setTitle] = useState(suggestTripName(city))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setError(null)
    try { await onCreate(title.trim()); onClose() }
    catch (err) { setError(err.message || 'Couldn\'t save it. Check your connection.'); setSaving(false) }
  }

  return (
    <Sheet title="Start a new trip" subtitle={city ? `No ${city} trip yet` : undefined} onClose={onClose}>
      <form onSubmit={submit}>
        <Stack gap={4}>
          {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
          <Field label="Trip name" value={title} onChange={e => setTitle(e.target.value)} onFocus={e => e.target.select()}
            autoComplete="off" required />
          <Text variant="caption" tone="muted">No dates needed yet. A flight or hotel you add later fills them in.</Text>
          <Button type="submit" variant="primary" size="lg" block loading={saving} disabled={!title.trim()}>
            {saving ? 'Saving' : 'Create trip and save'}
          </Button>
        </Stack>
      </form>
    </Sheet>
  )
}
