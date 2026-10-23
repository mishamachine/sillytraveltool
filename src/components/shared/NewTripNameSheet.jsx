import { useState } from 'react'
import { Sheet, Field, Button, Banner, Text, Stack } from '../../ui'

import { suggestTripName } from '../../lib/trips'

/**
 * Before a flow creates a trip on the traveller's behalf (saving an idea for a city with no trip yet),
 * show the name it will get, filled in and editable. onCreate(title) does the saving; it may throw.
 */
export default function NewTripNameSheet({ city, onCreate, onClose }) {
  return (
    <Sheet title="Start a new trip" subtitle={city ? `No ${city} trip yet` : undefined} onClose={onClose}>
      <NewTripNameForm city={city} onCreate={onCreate} onDone={onClose} />
    </Sheet>
  )
}

/** The name field and create button on their own, for sheets that offer "New trip" among other choices. */
export function NewTripNameForm({ city, onCreate, onDone, hint = 'No dates needed yet. A flight or hotel you add later fills them in.', submitLabel = 'Create trip and save' }) {
  const [title, setTitle] = useState(suggestTripName(city))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setError(null)
    try { await onCreate(title.trim()); onDone?.() }
    catch (err) { setError(err.message || 'Couldn\'t save it. Check your connection.'); setSaving(false) }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={4}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Field label="Trip name" value={title} onChange={e => setTitle(e.target.value)} onFocus={e => e.target.select()}
          autoComplete="off" required />
        {hint && <Text variant="caption" tone="muted">{hint}</Text>}
        <Button type="submit" variant="primary" size="lg" block loading={saving} disabled={!title.trim()}>
          {saving ? 'Saving' : submitLabel}
        </Button>
      </Stack>
    </form>
  )
}
