import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useAuthStore, useTripsStore } from '../../../store'
import { parseLocalDate } from '../../../lib/dates'
import { sortByStart, bookingDay, bookingKind, bookingMeta, hasClockTime, bookingTime, bookingArrival, bookingZone, zoneHint } from '../../../lib/trips'
import { Card, ListRow, IconButton, Button, Section, Text, Stack, Icon, EmptyState, Skeleton, IconTile, Chip, Banner, category } from '../../../ui'
import RouteStrip from './RouteStrip'
import { tripPlace, computeLegs } from '../../../lib/stops'
import { planConflicts } from '../../../lib/conflicts'
import { distanceKm, NEAR_KM } from '../../../../supabase/functions/_shared/tripMatch.js'
import { formatRange, plural } from '../../../lib/trips'
import ImportSheet from '../ImportSheet'
import InboxHint from '../InboxHint'
import AddBookingSheet from './AddBookingSheet'
import BookingFormSheet from './BookingFormSheet'
import { lookupZone } from '../../../lib/zoneLookup'
import ActivityFormSheet from './ActivityFormSheet'
import { ACTIVITY_CATEGORIES } from './planKinds'
import BookingDetailSheet from './BookingDetailSheet'
import SharedLegCard from './SharedLegCard'
import { groupSharedLegs, nearMisses } from '../../../lib/sharedLegs'
import { track } from '../../../lib/analytics'
import FillDaySheet, { FillDayPill } from './FillDaySheet'
import { COPY } from './fillDayCopy'
import { countryFor, emptyDays } from '../../../../supabase/functions/_shared/fillDay'
import { tripPlace as placeOnDate } from '../../../lib/stops'
import { tripToday } from '../../../lib/trips'

// Flights and trains stand on their own card; everything else sits in a list group
const STANDALONE = new Set(['flight', 'train', 'bus', 'ferry'])
// Trips whose near-miss legs were already counted this session
const nearMissSent = new Set()

// Times are local to the place (departure airport, venue); a zone name appears when it differs from the phone.
function trailingFor(item, tz) {
  if (item._kind === 'activity') {
    return item.time ? <span className="c-row__trailing tabular">{item.time.slice(0, 5)}</span> : null
  }
  if (!hasClockTime(item)) return null
  const start = bookingTime(item, tz)
  const hint = zoneHint(bookingZone(item, tz))
  const arr = bookingArrival(item)
  if (!arr && !hint) return <span className="c-row__trailing tabular">{start}</span>
  return (
    <span className="detail-times">
      <span className="t-body w-600 tabular">{start}</span>
      {arr && <span className="t-micro tone-muted tabular">arr. {arr.time}{arr.plusDays > 0 ? ` +${arr.plusDays}` : ''}</span>}
      {hint && <span className="t-micro tone-muted">{hint}</span>}
    </span>
  )
}

// Saved ideas by kind, in this order; a group with nothing in it is not shown
const IDEA_GROUPS = [
  { id: 'food', label: 'Restaurants', has: c => c === 'food' },
  { id: 'event', label: 'Events', has: c => c === 'event' },
  { id: 'sight', label: 'Sights and museums', has: c => c === 'sight' || c === 'museum' },
  { id: 'other', label: 'Other', has: () => true },
]
function groupIdeas(ideas) {
  const groups = IDEA_GROUPS.map(g => ({ ...g, items: [] }))
  ideas.forEach(i => groups.find(g => g.has(i.category)).items.push(i))
  return groups.filter(g => g.items.length)
}

/** The stop a plan day belongs to: where you sleep that night (the arrival stop on a travel day), else home. */
function stopFor(stops, d) {
  return stops.find(s => s.nights > 0 && (s.kind === 'stay' || s.kind === 'home') && d >= s.start_date && d < s.end_date) ||
    stops.find(s => s.kind === 'home' && s.start_date === d) ||
    stops.find(s => (s.kind === 'stay' || s.kind === 'home') && s.end_date === d) || null
}

/** Header of a stop on a multi-city trip: "Granada · 2 nights · Nov 14 – 16". The route strip scrolls here. */
function StopHead({ stop }) {
  const meta = stop.kind === 'home'
    ? 'Home'
    : [plural(stop.nights, 'night'), formatRange(stop.start_date, stop.end_date)].join(' · ')
  return (
    <div className="detail-stop" id={`stop-${stop.position}`}>
      <span className="detail-stop__title">
        <Icon name={stop.kind === 'home' ? 'pin' : 'stay'} size={18} className="tone-accent" />
        <Text variant="title" as="h3">{stop.city}</Text>
      </span>
      <Text variant="caption" tone="muted">{meta}</Text>
    </div>
  )
}

/** Ideas grouped by the stop they're near (within NEAR_KM), the rest under "Anywhere on this trip". */
function ideasByStop(ideas, stops) {
  const stays = stops.filter(s => s.kind === 'stay' && s.lat != null)
  const groups = stays.map(s => ({ stop: s, items: [] }))
  const anywhere = []
  for (const i of ideas) {
    const p = i.location_lat != null ? { lat: Number(i.location_lat), lng: Number(i.location_lng) } : null
    const best = p && groups.map(g => ({ g, km: distanceKm(p, { lat: Number(g.stop.lat), lng: Number(g.stop.lng) }) })).sort((a, b) => a.km - b.km)[0]
    if (best && best.km <= NEAR_KM) best.g.items.push(i); else anywhere.push(i)
  }
  const out = groups.filter(g => g.items.length).map(g => ({ id: `stop-${g.stop.position}`, label: g.stop.city, items: g.items }))
  if (anywhere.length) out.push({ id: 'anywhere', label: out.length ? 'Anywhere on this trip' : null, items: anywhere })
  return out
}

/** Header of the Booked / Ideas blocks: a tile, a title and a line, so status reads without colour. */
function BlockHead({ icon, tone, title, note, id }) {
  return (
    <div className="detail-block-head">
      <IconTile icon={icon} tone={tone} size="sm" />
      <Stack gap={0} grow>
        <Text variant="card-title" as="h2" id={id}>{title}</Text>
        {note && <Text variant="caption" tone="muted" as="p">{note}</Text>}
      </Stack>
    </div>
  )
}

function IdeaRow({ item, onOpen }) {
  const cat = ACTIVITY_CATEGORIES[item.category] || ACTIVITY_CATEGORIES.note
  return (
    <ListRow className="detail-idea" icon={cat.icon} tone="neutral" title={item.title} meta={item.location_address || cat.label}
      trailing={<Chip tone="neutral" className="detail-idea__chip">Not booked</Chip>} onClick={() => onOpen(item)}
      aria-label={`${item.title}, idea, not booked yet`} />
  )
}

// A confirmed booking: its confirmation reference (or "Booked") behind a check, before the usual details
function bookedMeta(item, extra) {
  const ref = item.confirmation_number ? `Conf. ${item.confirmation_number}` : 'Booked'
  // The details may end with the same reference; show it once
  const rest = extra && String(extra).split(' · ').filter(bit => bit !== ref).join(' · ')
  return (
    <span className="detail-booked">
      <Icon name="check" size={14} strokeWidth={2.5} className="tone-success" />
      <span>{[ref, rest].filter(Boolean).join(' · ')}</span>
    </span>
  )
}

function ItemRow({ item, tz, currentUserId, readOnly, onOpen, onToggle }) {
  if (item._kind === 'activity') {
    const cat = ACTIVITY_CATEGORIES[item.category] || ACTIVITY_CATEGORIES.note
    return (
      <div className={`detail-activity${item.is_completed ? ' is-done' : ''}`}>
        <label className="detail-check">
          <input type="checkbox" className="sr-only" checked={!!item.is_completed} disabled={readOnly}
            onChange={e => onToggle(item, e.target.checked)} />
          <Icon name={item.is_completed ? 'checkbox-checked' : 'checkbox'} className={item.is_completed ? 'tone-success' : 'tone-muted'} />
          <span className="sr-only">Done: {item.title}</span>
        </label>
        <ListRow className="grow" icon={cat.icon} tone={cat.tone} title={item.title}
          titleClassName={item.is_completed ? 'detail-done' : undefined}
          meta={[cat.label, item.location_name].filter(Boolean).join(' · ')}
          trailing={trailingFor(item, tz)} onClick={() => onOpen(item)} />
      </div>
    )
  }
  const cat = category(bookingKind(item))
  // On shared trips, another traveler's flight is shown dimmed and labelled
  const otherPassenger = item.type === 'flight' && currentUserId && item.created_by && item.created_by !== currentUserId
  const meta = [otherPassenger ? (item.passenger_name || 'Other passenger') : null, bookingMeta(item)].filter(Boolean).join(' · ')
  return (
    <ListRow className={otherPassenger ? 'detail-other' : undefined} icon={cat.icon} tone={cat.tone} title={item.title}
      meta={bookedMeta(item, meta)} trailing={trailingFor(item, tz)} onClick={() => onOpen(item)} />
  )
}

function StandaloneCard({ item, ...rest }) {
  const cat = category(bookingKind(item))
  return (
    <Card className="detail-solo" onClick={() => rest.onOpen(item)} aria-label={`${cat.label}: ${item.title}`}>
      <Stack row gap={3}>
        <IconTile icon={cat.icon} tone={cat.tone} size="md" />
        <Stack gap={1} grow>
          <Text variant="card-title" as="span">{item.title}</Text>
          <Text variant="caption" tone="muted" as="span">{bookedMeta(item, bookingMeta(item))}</Text>
        </Stack>
        {trailingFor(item, rest.tz)}
      </Stack>
    </Card>
  )
}

/** Day's items as a run of standalone cards and list groups; travellers on one flight or train share a card. */
function DayBlock({ items, ...rowProps }) {
  if (items[0]?._empty) return rowProps.emptyDay(items[0].date)
  const blocks = []
  const placed = new Set()
  items.forEach(item => {
    const leg = item._kind === 'booking' && rowProps.shared?.get(item.id)
    if (leg) { if (!placed.has(leg.key)) { placed.add(leg.key); blocks.push({ leg }) } }
    else if (item._kind === 'booking' && STANDALONE.has(bookingKind(item))) blocks.push({ solo: item })
    else if (blocks.length && blocks[blocks.length - 1].group) blocks[blocks.length - 1].group.push(item)
    else blocks.push({ group: [item] })
  })
  return blocks.map((b, i) => b.leg
    ? <SharedLegCard key={b.leg.key} items={b.leg.items} me={rowProps.currentUserId} hideConf={rowProps.hideConf}
        trailing={trailingFor(b.leg.items[0], rowProps.tz)} onOpen={rowProps.onOpen} />
    : b.solo
    ? <StandaloneCard key={b.solo.id} item={b.solo} {...rowProps} />
    : <Card key={`g${i}`} variant="group">{b.group.map(item => <ItemRow key={item.id} item={item} {...rowProps} />)}</Card>)
}

/**
 * Booked days under their stops, in order. A stop with nothing booked still gets its header (the route strip
 * scrolls to it).
 */
function planByStop(byDay, stops, dayTitle, rowProps) {
  const entries = Object.keys(byDay).map(d => ({ d, stop: stopFor(stops, d) }))
  const used = new Set(entries.map(e => e.stop?.position))
  for (const s of stops) {
    if ((s.kind === 'stay' || s.kind === 'home') && !used.has(s.position)) entries.push({ d: s.start_date, stop: s, empty: true })
  }
  entries.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.empty === b.empty ? (a.stop?.position ?? 0) - (b.stop?.position ?? 0) : a.empty ? -1 : 1))
  let last = null
  return entries.map(e => {
    const head = e.stop && e.stop.position !== last ? <StopHead stop={e.stop} /> : null
    if (e.stop) last = e.stop.position
    if (e.empty) return <div key={`empty-${e.stop.position}`}>{head}<Text variant="caption" tone="muted">Nothing booked here yet</Text></div>
    return (
      <div key={e.d}>
        {head}
        <Section title={dayTitle(e.d)}>
          <DayBlock items={byDay[e.d]} {...rowProps} />
        </Section>
      </div>
    )
  })
}

export default function PlanTab({ trip, readOnly }) {
  const { bookings, activities, createBooking, updateBooking, deleteBooking, createActivity, toggleActivity, deleteActivity, fillDatesIfUndated, loadingDetail, fetchTrips } = useTripsStore()
  const { user } = useAuthStore()
  const currentUserId = user?.id
  const [sheet, setSheet] = useState(null) // 'add' | 'paste' | 'plan' | { type, mode } | { detail }
  const [legs, setLegs] = useState([])
  const [hiddenWarnings, setHiddenWarnings] = useState(false)

  const tz = trip.destination_tz
  const items = sortByStart([
    // Store rows can briefly belong to another trip (the Today view loads its own trip)
    ...bookings.filter(b => b.trip_id === trip.id).map(b => ({ ...b, _kind: 'booking' })),
    ...activities.filter(a => a.trip_id === trip.id && !a.is_idea).map(a => ({ ...a, _kind: 'activity' })),
  ], tz)
  // Shortlisted from the guide / HONK, not booked yet
  const ideas = activities.filter(a => a.trip_id === trip.id && a.is_idea).map(a => ({ ...a, _kind: 'activity' }))
  const bookingCount = items.filter(i => i._kind === 'booking').length

  // Multi-city: the route, a header per stop, travel days named "Madrid → Granada", and checks that never block
  const tripBookings = bookings.filter(b => b.trip_id === trip.id)
  useEffect(() => {
    let alive = true
    computeLegs(tripBookings).then(l => { if (alive) setLegs(l) })
    return () => { alive = false }
  }, [trip.id, tripBookings.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const stops = [...(trip.trip_stops || [])].sort((a, b) => a.position - b.position)
  const multi = stops.filter(s => s.kind === 'stay').length >= 2
  const warnings = readOnly ? [] : planConflicts(trip, tripBookings)
  // Same flight or train, several travellers: one card. Legs that miss by a minute are counted, never merged.
  const shared = groupSharedLegs(items, currentUserId)
  const misses = nearMisses(tripBookings)
  useEffect(() => {
    if (!misses || nearMissSent.has(trip.id)) return
    nearMissSent.add(trip.id)
    track('shared_leg_near_miss', { count: misses })
  }, [trip.id, misses])

  const byDay = {}
  const unscheduled = []
  items.forEach(item => {
    const d = bookingDay(item, tz)
    if (!d) unscheduled.push(item)
    else (byDay[d] = byDay[d] || []).push(item)
  })

  // Days with nothing on them, from today on: Goose can sketch one
  const freeDays = !readOnly && trip.destination_city ? emptyDays(trip, byDay, tripToday(trip)) : []
  // Empty days sit in date order among the real days
  const allDays = { ...byDay }
  freeDays.forEach(d => { allDays[d] = [{ _empty: true, date: d }] })

  const canDelete = (item) => !readOnly && (!currentUserId || !item.created_by || item.created_by === currentUserId)
  // Same rule as the database: the person who added a booking, or the trip owner, can change it
  const canEdit = (item) => !readOnly && item._kind === 'booking' && (canDelete(item) || trip.owner_id === currentUserId)
  const rowProps = {
    tz, currentUserId, readOnly, shared,
    emptyDay: (d) => (
      <div className="fmd-empty">
        <Text variant="caption" tone="muted" as="p">{COPY.emptyDay}</Text>
        <FillDayPill onClick={() => { track('fill_day_open', { surface: 'plan' }); setSheet({ fill: d }) }} />
      </div>
    ),
    // View-only travellers don't see other travellers' confirmation numbers (display only until RLS enforces it)
    hideConf: !!trip._isShared && trip._myRole === 'viewer',
    onOpen: (item) => setSheet({ detail: item }),
    onToggle: (item, v) => toggleActivity(item.id, v),
  }
  const pick = (t) => setSheet(t.plan ? 'plan' : { type: t.type, mode: t.mode })
  const found = sheet?.detail && [...items, ...ideas].find(i => i.id === sheet.detail.id && i._kind === sheet.detail._kind)
  // A viewer opening another traveller's line on a shared card doesn't see their confirmation there either
  const detail = found && rowProps.hideConf && shared.has(found.id) && found.created_by !== currentUserId
    ? { ...found, confirmation_number: null } : found
  // "Confirm a visit" on an idea: the booking form, filled in; the booking then replaces the idea
  const confirmIdea = async (idea) => {
    const local_tz = idea.location_lat != null ? await lookupZone({ lat: idea.location_lat, lng: idea.location_lng }) : null
    openConfirm(idea, local_tz)
  }
  const openConfirm = (idea, local_tz) => setSheet({
    type: idea.category === 'food' ? 'restaurant' : 'activity', fromIdea: idea,
    initial: {
      title: idea.category === 'food' ? `Dinner at ${idea.title}` : idea.title,
      venue_name: idea.location_name || idea.title, venue_address: idea.location_address || '',
      place_id: idea.place_id || null, place_lat: idea.location_lat ?? null, place_lng: idea.location_lng ?? null,
      ...(local_tz ? { local_tz } : {}),
    },
  })

  return (
    <Stack gap={4} className="detail-plan">
      {loadingDetail && items.length === 0 && (
        <Stack gap={3} aria-busy="true" aria-label="Loading plan">
          {[1, 2, 3].map(i => <Card key={i}><Skeleton lines={1} /></Card>)}
        </Stack>
      )}

      {!loadingDetail && items.length === 0 && ideas.length === 0 && (
        <EmptyState goose="worried" title="Nothing planned yet"
          action={!readOnly && <Button variant="primary" size="lg" block icon="plus" onClick={() => setSheet('add')}>Add to plan</Button>}>
          {readOnly ? 'This trip has no bookings saved.' : 'Forward a confirmation to your Goose inbox, paste it, or add it by hand.'}
        </EmptyState>
      )}

      {multi && <RouteStrip stops={stops} />}

      {warnings.length > 0 && !hiddenWarnings && (
        <Banner tone="accent" icon="alert-triangle" className="detail-warnings" role="status" onDismiss={() => setHiddenWarnings(true)}
          title={warnings.length === 1 ? warnings[0].title : `${warnings.length} things to check`}>
          {warnings.length === 1 ? warnings[0].detail : (
            <ul>{warnings.map(w => <li key={w.id}><strong>{w.title}.</strong> {w.detail}</li>)}</ul>
          )}
        </Banner>
      )}

      {items.length > 0 && (
        <BlockHead icon="check-circle" tone="success" title="Booked" id="plan-booked"
          note={bookingCount ? `${bookingCount} confirmed${items.length > bookingCount ? ', plus your plans and notes' : ''}` : 'Your plans and notes'} />
      )}

      {multi ? planByStop(allDays, stops, (d) => {
        const p = tripPlace(trip, { date: d, legs, now: null })
        const where = p.kind === 'travel' ? ` · ${p.label}` : p.kind === 'day_trip' ? ` · Day trip to ${p.city}` : ''
        return `${format(parseLocalDate(d), 'EEE · MMM d')}${where}`
      }, rowProps) : Object.entries(allDays).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, dayItems]) => (
        <Section key={d} title={format(parseLocalDate(d), 'EEE · MMM d')}>
          <DayBlock items={dayItems} {...rowProps} />
        </Section>
      ))}

      {unscheduled.length > 0 && (
        <Section title="No date yet">
          <DayBlock items={unscheduled} {...rowProps} />
        </Section>
      )}

      {ideas.length > 0 && (
        <section className="detail-ideas-block" aria-labelledby="plan-ideas">
          <BlockHead icon="lightbulb" tone="neutral" title="Ideas, not booked yet" id="plan-ideas"
            note={readOnly ? 'Saved from the guide' : 'Saved from the guide. Tap one to confirm a visit.'} />
          {(multi ? ideasByStop(ideas, stops) : [{ id: 'all', label: null, items: ideas }]).map(stopGroup => (
            <Stack key={stopGroup.id} gap={3}>
              {stopGroup.label && <Text variant="title" as="h3">{stopGroup.label}</Text>}
              {groupIdeas(stopGroup.items).map(g => (
                <Section key={g.id} title={g.label}>
                  <Card variant="group" className="detail-ideas">
                    {g.items.map(item => <IdeaRow key={item.id} item={item} onOpen={rowProps.onOpen} />)}
                  </Card>
                </Section>
              ))}
            </Stack>
          ))}
        </section>
      )}

      {!readOnly && items.length > 0 && (
        <>
          <Button variant="ghost" icon="plus" onClick={() => setSheet('plan')}>Add a plan or note</Button>
          <InboxHint text="Forward confirmations to your Goose inbox" />
        </>
      )}

      {!readOnly && (
        <IconButton icon="plus" label="Add to plan" variant="accent" size="lg" className="detail-fab" onClick={() => setSheet('add')} />
      )}

      {sheet === 'add' && <AddBookingSheet onClose={() => setSheet(null)} onPaste={() => setSheet('paste')} onPick={pick} />}
      {sheet === 'paste' && <ImportSheet trip={trip} onClose={() => setSheet(null)} onBookingCreated={() => fetchTrips()} />}
      {sheet === 'plan' && <ActivityFormSheet tripId={trip.id} onClose={() => setSheet(null)} onCreate={createActivity} />}
      {sheet?.fill && (() => {
        const p = placeOnDate(trip, { date: sheet.fill, legs, now: null })
        return <FillDaySheet trip={trip} date={sheet.fill} place={{ city: p.city || trip.destination_city, country: countryFor(trip, p), lat: p.lat, lng: p.lng, tz: p.tz || tz }} onClose={() => setSheet(null)} />
      })()}
      {sheet?.type && (
        <BookingFormSheet tripId={trip.id} trip={trip} type={sheet.type} initial={sheet.initial || (sheet.mode ? { transport_mode: sheet.mode } : {})}
          booking={sheet.edit || null}
          onClose={() => setSheet(null)}
          onCreate={async (tripId, data) => {
            if (sheet.edit) {
              const saved = await updateBooking(sheet.edit.id, data)
              await fillDatesIfUndated(tripId, [saved]) // a booking moved outside the trip widens it
              return saved
            }
            const booking = await createBooking(tripId, data)
            if (sheet.fromIdea) await deleteActivity(sheet.fromIdea.id)
            return booking
          }} />
      )}
      {detail && (
        <BookingDetailSheet item={detail} tripTz={tz} countryCode={trip.destination_country_code} isActivity={detail._kind === 'activity'} canDelete={canDelete(detail)}
          onConfirmVisit={!readOnly && detail.is_idea ? () => confirmIdea(detail) : undefined}
          onEdit={canEdit(detail) ? () => setSheet({ type: detail.type || 'other', edit: detail }) : undefined}
          onToggle={!readOnly && detail._kind === 'activity' ? (v) => toggleActivity(detail.id, v) : undefined}
          onDelete={() => (detail._kind === 'activity' ? deleteActivity(detail.id) : deleteBooking(detail.id))}
          onClose={() => setSheet(null)} />
      )}
    </Stack>
  )
}
