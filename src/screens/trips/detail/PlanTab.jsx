import { useState } from 'react'
import { format } from 'date-fns'
import { useAuthStore, useTripsStore } from '../../../store'
import { parseLocalDate } from '../../../lib/dates'
import { sortByStart, bookingDay, bookingKind, bookingMeta, hasClockTime, bookingTime, bookingArrival, bookingZone, zoneHint } from '../../../lib/trips'
import { Card, ListRow, IconButton, Button, Section, Text, Stack, Icon, EmptyState, Skeleton, IconTile, category } from '../../../ui'
import ImportSheet from '../ImportSheet'
import InboxHint from '../InboxHint'
import AddBookingSheet from './AddBookingSheet'
import BookingFormSheet from './BookingFormSheet'
import { lookupZone } from '../../../lib/zoneLookup'
import ActivityFormSheet from './ActivityFormSheet'
import { ACTIVITY_CATEGORIES } from './planKinds'
import BookingDetailSheet from './BookingDetailSheet'

// Flights and trains stand on their own card; everything else sits in a list group
const STANDALONE = new Set(['flight', 'train', 'bus', 'ferry'])

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

function ItemRow({ item, tz, currentUserId, readOnly, onOpen, onToggle }) {
  if (item._kind === 'activity' && item.is_idea) {
    const cat = ACTIVITY_CATEGORIES[item.category] || ACTIVITY_CATEGORIES.note
    return <ListRow icon={cat.icon} tone={cat.tone} title={item.title} meta={item.location_address || cat.label} chevron onClick={() => onOpen(item)} />
  }
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
      meta={meta || undefined} trailing={trailingFor(item, tz)} onClick={() => onOpen(item)} />
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
          {bookingMeta(item) && <Text variant="caption" tone="muted" as="span">{bookingMeta(item)}</Text>}
        </Stack>
        {trailingFor(item, rest.tz)}
      </Stack>
    </Card>
  )
}

/** Day's items as a run of standalone cards and list groups. */
function DayBlock({ items, ...rowProps }) {
  const blocks = []
  items.forEach(item => {
    if (item._kind === 'booking' && STANDALONE.has(bookingKind(item))) blocks.push({ solo: item })
    else if (blocks.length && blocks[blocks.length - 1].group) blocks[blocks.length - 1].group.push(item)
    else blocks.push({ group: [item] })
  })
  return blocks.map((b, i) => b.solo
    ? <StandaloneCard key={b.solo.id} item={b.solo} {...rowProps} />
    : <Card key={`g${i}`} variant="group">{b.group.map(item => <ItemRow key={item.id} item={item} {...rowProps} />)}</Card>)
}

export default function PlanTab({ trip, readOnly }) {
  const { bookings, activities, createBooking, deleteBooking, createActivity, toggleActivity, deleteActivity, loadingDetail, fetchTrips } = useTripsStore()
  const { user } = useAuthStore()
  const currentUserId = user?.id
  const [sheet, setSheet] = useState(null) // 'add' | 'paste' | 'plan' | { type, mode } | { detail }

  const tz = trip.destination_tz
  const items = sortByStart([
    // Store rows can briefly belong to another trip (the Today view loads its own trip)
    ...bookings.filter(b => b.trip_id === trip.id).map(b => ({ ...b, _kind: 'booking' })),
    ...activities.filter(a => a.trip_id === trip.id && !a.is_idea).map(a => ({ ...a, _kind: 'activity' })),
  ], tz)
  // Shortlisted from the guide / HONK, not booked yet
  const ideas = activities.filter(a => a.trip_id === trip.id && a.is_idea).map(a => ({ ...a, _kind: 'activity' }))
  const byDay = {}
  const unscheduled = []
  items.forEach(item => {
    const d = bookingDay(item, tz)
    if (!d) unscheduled.push(item)
    else (byDay[d] = byDay[d] || []).push(item)
  })

  const canDelete = (item) => !readOnly && (!currentUserId || !item.created_by || item.created_by === currentUserId)
  const rowProps = {
    tz, currentUserId, readOnly,
    onOpen: (item) => setSheet({ detail: item }),
    onToggle: (item, v) => toggleActivity(item.id, v),
  }
  const pick = (t) => setSheet(t.plan ? 'plan' : { type: t.type, mode: t.mode })
  const detail = sheet?.detail && [...items, ...ideas].find(i => i.id === sheet.detail.id && i._kind === sheet.detail._kind)
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

      {ideas.length > 0 && (
        <Section title="Trip ideas" action={<Text variant="micro" tone="muted">Not booked yet</Text>}>
          <DayBlock items={ideas} {...rowProps} />
        </Section>
      )}

      {!loadingDetail && items.length === 0 && ideas.length === 0 && (
        <EmptyState goose="worried" title="Nothing planned yet"
          action={!readOnly && <Button variant="primary" size="lg" block icon="plus" onClick={() => setSheet('add')}>Add to plan</Button>}>
          {readOnly ? 'This trip has no bookings saved.' : 'Forward a confirmation to your Goose inbox, paste it, or add it by hand.'}
        </EmptyState>
      )}

      {Object.entries(byDay).map(([d, dayItems]) => (
        <Section key={d} title={format(parseLocalDate(d), 'EEE · MMM d')}>
          <DayBlock items={dayItems} {...rowProps} />
        </Section>
      ))}

      {unscheduled.length > 0 && (
        <Section title="No date yet">
          <DayBlock items={unscheduled} {...rowProps} />
        </Section>
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
      {sheet?.type && (
        <BookingFormSheet tripId={trip.id} trip={trip} type={sheet.type} initial={sheet.initial || (sheet.mode ? { transport_mode: sheet.mode } : {})}
          onClose={() => setSheet(null)}
          onCreate={async (tripId, data) => {
            const booking = await createBooking(tripId, data)
            if (sheet.fromIdea) await deleteActivity(sheet.fromIdea.id)
            return booking
          }} />
      )}
      {detail && (
        <BookingDetailSheet item={detail} tripTz={tz} countryCode={trip.destination_country_code} isActivity={detail._kind === 'activity'} canDelete={canDelete(detail)}
          onConfirmVisit={!readOnly && detail.is_idea ? () => confirmIdea(detail) : undefined}
          onToggle={!readOnly && detail._kind === 'activity' ? (v) => toggleActivity(detail.id, v) : undefined}
          onDelete={() => (detail._kind === 'activity' ? deleteActivity(detail.id) : deleteBooking(detail.id))}
          onClose={() => setSheet(null)} />
      )}
    </Stack>
  )
}
