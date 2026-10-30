import { useState } from 'react'
import { useAuthStore, useTripsStore } from '../../../store'
import { fillMyDay } from '../../../lib/gemini'
import { track } from '../../../lib/analytics'
import { todayAtTrip } from '../../../lib/dates'
import { timeIn } from '../../../lib/localTime'
import { PACES, BUDGETS, VIBES, MAX_VIBES, DEFAULT_PACE, DEFAULT_BUDGET, buildRequest, proposalToActivities } from '../../../../supabase/functions/_shared/fillDay'
import { Sheet, Button, Banner, Chip, Stack, Text, ListRow, IconButton, Card } from '../../../ui'
import { ACTIVITY_CATEGORIES } from './planKinds'

const ERROR_COPY = 'Goose couldn’t find enough for that mix. Try fewer vibes or another pace.'

/** Start no earlier than 30 minutes from now when the day is today at the trip. */
function startAfterFor(trip, date, tz) {
  if (date !== todayAtTrip(trip) || !tz) return undefined
  const t = timeIn(Date.now() + 30 * 60000, tz)
  return t > '09:00' && t < '20:00' ? t : undefined
}

/**
 * Fill my day: pick a pace, a budget and some vibes; Goose proposes a timed day of real places; the member
 * removes what they don't want and adds the rest as plans. Nothing is saved until "Add to my day".
 * place: { city, country, lat, lng, tz } of where the member is on that date.
 */
export default function FillDaySheet({ trip, date, place, onClose }) {
  const createActivities = useTripsStore(s => s.createActivities)
  const userId = useAuthStore(s => s.user?.id)
  const [pace, setPace] = useState(DEFAULT_PACE)
  const [budget, setBudget] = useState(DEFAULT_BUDGET)
  const [vibes, setVibes] = useState([])
  const [state, setState] = useState('form') // form | loading | proposal | saving
  const [proposal, setProposal] = useState(null)
  const [keep, setKeep] = useState([])
  const [error, setError] = useState(null)

  const toggleVibe = (v) => setVibes(cur => cur.includes(v) ? cur.filter(x => x !== v) : cur.length < MAX_VIBES ? [...cur, v] : cur)

  const run = async (again = false) => {
    setState('loading'); setError(null)
    const request = buildRequest({
      city: place.city, country: place.country, date, pace, budget, vibes, lat: place.lat, lng: place.lng,
      startAfter: startAfterFor(trip, date, place.tz), exclude: again ? proposal?.stops.map(s => s.place_id) : undefined,
    })
    track('fill_day_request', { pace, budget, vibes: request.vibes.length, again })
    try {
      const res = await fillMyDay(request)
      if (!res?.stops?.length) throw Object.assign(new Error(ERROR_COPY), { empty: true })
      setProposal(res); setKeep(res.stops.map(s => s.place_id)); setState('proposal')
      track('fill_day_result', { count: res.stops.length, source: res.source || 'ai' })
    } catch (e) {
      track('fill_day_error', { empty: !!e.empty })
      setError(e.empty ? ERROR_COPY : e.message || ERROR_COPY); setState('form')
    }
  }

  const add = async () => {
    setState('saving'); setError(null)
    try {
      const rows = proposalToActivities(proposal, { tripId: trip.id, userId, keep })
      await createActivities(trip.id, rows)
      track('fill_day_added', { count: rows.length, removed: proposal.stops.length - rows.length })
      onClose()
    } catch (e) { setError(e.message || 'Could not save. Check your connection.'); setState('proposal') }
  }

  const group = (id, label, items, value, onPick, multi) => (
    <Stack gap={2}>
      <Text variant="label" as="p" id={`fmd-${id}`}>{label}</Text>
      <div className="fmd-chips" role="group" aria-labelledby={`fmd-${id}`}>
        {items.map(([k, text]) => (
          <Chip key={k} selected={multi ? value.includes(k) : value === k} onClick={() => onPick(k)}>{text}</Chip>
        ))}
      </div>
    </Stack>
  )

  if (state === 'proposal' || state === 'saving') {
    const stops = proposal.stops
    return (
      <Sheet title="Fill my day" subtitle={`${place.city} · ${stops.length} stops`} onClose={onClose}>
        <Stack gap={4}>
          {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
          <Card variant="group">
            {stops.map(s => {
              const cat = ACTIVITY_CATEGORIES[s.category] || ACTIVITY_CATEGORIES.sight
              const on = keep.includes(s.place_id)
              return (
                <div key={s.place_id} className={`fmd-stop${on ? '' : ' is-off'}`}>
                  <ListRow icon={cat.icon} tone={cat.tone} title={s.name}
                    meta={[s.reason, s.walk_min ? `${s.walk_min} min walk from the last stop` : null].filter(Boolean).join(' · ')}
                    trailing={<span className="c-row__trailing tabular">{s.start}</span>} />
                  <IconButton icon={on ? 'close' : 'plus'} label={on ? `Remove ${s.name}` : `Put back ${s.name}`} size="sm"
                    onClick={() => setKeep(k => on ? k.filter(x => x !== s.place_id) : [...k, s.place_id])} />
                </div>
              )
            })}
          </Card>
          <Text variant="caption" tone="muted" as="p">Check times before you go</Text>
          <Button variant="primary" size="lg" block loading={state === 'saving'} disabled={!keep.length} onClick={add}>Add to my day</Button>
          <Stack row gap={2}>
            <Button variant="secondary" block disabled={state === 'saving'} onClick={() => run(true)}>Try another</Button>
            <Button variant="ghost" block disabled={state === 'saving'} onClick={onClose}>Cancel</Button>
          </Stack>
        </Stack>
      </Sheet>
    )
  }

  return (
    <Sheet title="Fill my day" subtitle="Pick a pace, a budget and what you're in the mood for." onClose={onClose}>
      <Stack gap={4} aria-busy={state === 'loading'}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        {group('pace', 'Pace', Object.entries(PACES).map(([k, p]) => [k, p.chip]), pace, setPace)}
        {group('budget', 'Budget', Object.entries(BUDGETS).map(([k, b]) => [k, b.label]), budget, setBudget)}
        {group('vibe', 'Vibe', Object.entries(VIBES).map(([k, v]) => [k, v.label]), vibes, toggleVibe, true)}
        <Button variant="primary" size="lg" block icon="calendar-plus" loading={state === 'loading'} onClick={() => run(false)}>
          {state === 'loading' ? 'Goose is planning…' : 'Fill my day'}
        </Button>
      </Stack>
    </Sheet>
  )
}
