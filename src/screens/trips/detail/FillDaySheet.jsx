import { useState, useEffect } from 'react'
import { useAuthStore, useTripsStore } from '../../../store'
import { fillMyDay } from '../../../lib/gemini'
import { track } from '../../../lib/analytics'
import { todayAtTrip } from '../../../lib/dates'
import { timeIn } from '../../../lib/localTime'
import { PACES, VIBES, MAX_VIBES, DEFAULT_PACE, DEFAULT_BUDGET, buildRequest, proposalToActivities } from '../../../../supabase/functions/_shared/fillDay'
import { Sheet, Button, Banner, Chip, Stack, Text, ListRow, IconButton, Card, SegmentedControl } from '../../../ui'
import { COPY, PACE_COPY, BUDGET_OPTIONS, VIBE_COPY } from './fillDayCopy'
import { BUDGET_POP } from './fillDayBudgetPop'
import { ACTIVITY_CATEGORIES } from './planKinds'

const ERROR_COPY = COPY.error

/** Start no earlier than 30 minutes from now when the day is today at the trip. */
function startAfterFor(trip, date, tz) {
  if (date !== todayAtTrip(trip) || !tz) return undefined
  const t = timeIn(Date.now() + 30 * 60000, tz)
  return t > '09:00' && t < '20:00' ? t : undefined
}

/**
 * Fill my day: pick a pace, a budget and some vibes; Goose proposes a timed day of real places; the member
 * removes what they don't want and adds the rest as plans. Nothing is saved until "Add to my day".
 * place: { city, country, tz } of where the member is on that date.
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
  const [capNote, setCapNote] = useState(false)
  const [pop, setPop] = useState(null) // { text, n }: the line above the budget row, gone after 1.8 s
  useEffect(() => {
    if (!pop) return
    const t = setTimeout(() => setPop(null), 1800)
    return () => clearTimeout(t)
  }, [pop])
  const pickBudget = (b) => { setBudget(b); setPop({ text: BUDGET_POP[b], n: Date.now() }) }

  const toggleVibe = (v) => {
    if (!vibes.includes(v) && vibes.length >= MAX_VIBES) { setCapNote(true); return } // say why, never ignore
    setCapNote(false)
    setVibes(cur => cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])
  }

  const run = async (again = false) => {
    setState('loading'); setError(null)
    const request = buildRequest({
      city: place.city, country: place.country, date, pace, budget, vibes,
      startAfter: startAfterFor(trip, date, place.tz), exclude: again ? proposal?.stops.map(s => s.place_id) : undefined,
    })
    track('fill_day_request', { pace, budget, vibes: request.vibes.length, again })
    try {
      const res = await fillMyDay(request)
      if (!res?.stops?.length) throw Object.assign(new Error(res?.reason && res.reason !== 'too_few_places' ? COPY.errorLater : ERROR_COPY), { empty: true, reason: res?.reason || 'too_few_places' })
      setProposal(res); setKeep(res.stops.map(s => s.place_id)); setState('proposal')
      track('fill_day_result', { count: res.stops.length, source: res.source || 'ai' })
    } catch (e) {
      track('fill_day_error', { empty: !!e.empty, reason: e.reason || 'other' })
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
    } catch (e) { console.warn('fill my day: add failed', e); setError(COPY.addError); setState('proposal') }
  }

  const single = (id, title, options, value, onChange, above) => (
    <Stack gap={2}>
      <Text variant="label" as="p" id={`fmd-${id}`}>{title}</Text>
      {above}
      <SegmentedControl role="radiogroup" label={title} options={options} value={value} onChange={onChange} className="fmd-seg" />
    </Stack>
  )

  if (state === 'proposal' || state === 'saving') {
    const stops = proposal.stops
    return (
      <Sheet title={COPY.title} subtitle={`${place.city} · ${stops.length} stops`} onClose={onClose}>
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
          <Text variant="caption" tone="muted" as="p">{COPY.footnote}</Text>
          <Button variant="primary" size="lg" block loading={state === 'saving'} disabled={!keep.length} onClick={add}>{COPY.add}</Button>
          <Stack row gap={2}>
            <Button variant="secondary" block disabled={state === 'saving'} onClick={() => run(true)}>{COPY.another}</Button>
            <Button variant="ghost" block disabled={state === 'saving'} onClick={onClose}>{COPY.cancel}</Button>
          </Stack>
        </Stack>
      </Sheet>
    )
  }

  return (
    <Sheet title={COPY.title} subtitle={COPY.subtitle} onClose={onClose}>
      <Stack gap={4} aria-busy={state === 'loading'}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        {single('pace', COPY.paceTitle, Object.keys(PACES).map(k => ({ value: k, label: <span className="fmd-opt">{PACE_COPY[k][0]}<small>{PACE_COPY[k][1]}</small></span> })), pace, setPace)}
        {single('budget', COPY.budgetTitle, BUDGET_OPTIONS.map(k => ({ value: k, label: k })), budget, pickBudget,
          <div className="fmd-pop" aria-live="polite">{pop && <span key={pop.n} className="fmd-pop__line">{pop.text}</span>}</div>)}
        <Stack gap={2}>
          <Text variant="label" as="p" id="fmd-vibe">{COPY.vibeTitle}</Text>
          <div className="fmd-chips" role="group" aria-labelledby="fmd-vibe">
            {Object.keys(VIBES).map(k => (
              <Chip key={k} selected={vibes.includes(k)} icon={vibes.includes(k) ? 'check' : undefined} onClick={() => toggleVibe(k)}>{VIBE_COPY[k]}</Chip>
            ))}
          </div>
          <Text variant="caption" tone={capNote ? 'accent' : 'muted'} as="p" role={capNote ? 'status' : undefined}>{capNote ? COPY.vibeCap : COPY.vibeHint}</Text>
        </Stack>
        <Button variant="primary" size="lg" block icon="calendar-plus" loading={state === 'loading'} onClick={() => run(false)}>
          {state === 'loading' ? COPY.loading : COPY.go}
        </Button>
      </Stack>
    </Sheet>
  )
}

/** The tappable pill that sits in an empty day. */
export function FillDayPill({ onClick }) {
  return <Chip tone="accent" icon="calendar-plus" className="fmd-pill" onClick={onClick}>{COPY.pill}</Chip>
}
