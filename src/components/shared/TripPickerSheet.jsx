import { useState } from 'react'
import { Sheet, Card, ListRow, Stack, Text, Banner } from '../../ui'
import { NewTripNameForm } from './NewTripNameSheet'
import { fitReason } from '../../lib/tripPick'
import { tripDates } from '../../lib/trips'

/**
 * "Save to": every trip the traveller can edit, the best fit first and marked, then "New trip" (name it first).
 * A new trip is only ever made from here, never on its own.
 * ranked: [{ trip, fit, score }] best first (lib/tripPick). onPick(trip) and onCreate(title) may throw.
 */
export default function TripPickerSheet({ title = 'Save to', subtitle, ranked = [], city, onPick, onCreate, onClose, newHint, submitLabel }) {
  const [naming, setNaming] = useState(!ranked.length)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const best = ranked[0]?.score > 0 ? ranked[0].trip.id : null

  const pick = async (trip) => {
    setBusy(trip.id); setError(null)
    try { await onPick(trip); onClose() }
    catch (e) { setError(e.message || 'Couldn\'t save it. Check your connection.'); setBusy(null) }
  }

  return (
    <Sheet title={naming && !ranked.length ? 'Start a new trip' : title} subtitle={subtitle} onClose={onClose}>
      <Stack gap={4}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        {ranked.length > 0 && (
          <Card variant="group" aria-label="Your trips">
            {ranked.map(r => (
              <ListRow key={r.trip.id} icon={r.trip.id === best ? 'pin' : 'trips'} tone={r.trip.id === best ? 'accent' : 'neutral'}
                title={r.trip.title} meta={(r.trip.id === best && fitReason(r)) || tripDates(r.trip)}
                trailing={busy === r.trip.id ? 'Saving' : r.trip.id === best ? 'Suggested' : undefined}
                aria-label={`${r.trip.title}${r.trip.id === best ? ', suggested' : ''}`}
                onClick={busy ? undefined : () => pick(r.trip)} />
            ))}
            {!naming && <ListRow icon="plus" tone="neutral" title="New trip" meta={city ? `Start one for ${city}` : 'Name it first'} onClick={() => setNaming(true)} />}
          </Card>
        )}
        {naming && (
          <>
            {ranked.length > 0 && <Text variant="label">New trip</Text>}
            <NewTripNameForm city={city} onCreate={onCreate} onDone={onClose} hint={newHint} submitLabel={submitLabel} />
          </>
        )}
      </Stack>
    </Sheet>
  )
}
