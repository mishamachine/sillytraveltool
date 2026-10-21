import { useState } from 'react'
import { format } from 'date-fns'
import { useAuthStore, useTripsStore } from '../../../store'
import { parseLocalDate } from '../../../lib/dates'
import { sortByStart, bookingStart, bookingDay, bookingKind, bookingMeta, hasClockTime, timeLabel } from '../../../lib/trips'
import { Card, ListRow, IconButton, Button, Section, Text, Stack, Icon, EmptyState, Skeleton, IconTile, category } from '../../../ui'
import ImportSheet from '../ImportSheet'
import InboxHint from '../InboxHint'
import AddBookingSheet from './AddBookingSheet'
import BookingFormSheet from './BookingFormSheet'
import ActivityFormSheet from './ActivityFormSheet'
import { ACTIVITY_CATEGORIES } from './planKinds'
import BookingDetailSheet from './BookingDetailSheet'

// Flights and trains stand on their own card; everything else sits in a list group
const STANDALONE = new Set(['flight', 'train', 'bus', 'ferry'])

function trailingFor(item) {
  if (item._kind === 'activity') {
    return item.time ? <span className="c-row__trailing tabular">{item.time.slice(0, 5)}</span> : null
  }
  if (!hasClockTime(item)) return null
  const start = timeLabel(bookingStart(item))
  if (!item.arrival_time) return <span className="c-row__trailing tabular">{start}</span>
  const arr = new Date(item.arrival_time)
  const plusDays = Math.round((parseLocalDate(format(arr, 'yyyy-MM-dd')) - parseLocalDate(format(bookingStart(item), 'yyyy-MM-dd'))) / 86400000)
  return (
    <span className="detail-times">
      <span className="t-body w-600 tabular">{start}</span>
      <span className="t-micro tone-muted tabular">arr. {timeLabel(arr)}{plusDays > 0 ? ` +${plusDays}` : ''}</span>
    </span>
  )
}

function ItemRow({ item, currentUserId, readOnly, onOpen, onToggle }) {
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
          trailing={trailingFor(item)} onClick={() => onOpen(item)} />
      </div>
    )
  }
  const cat = category(bookingKind(item))
  // On shared trips, another traveler's flight is shown dimmed and labelled
  const otherPassenger = item.type === 'flight' && currentUserId && item.created_by && item.created_by !== currentUserId
  const meta = [otherPassenger ? (item.passenger_name || 'Other passenger') : null, bookingMeta(item)].filter(Boolean).join(' · ')
  return (
    <ListRow className={otherPassenger ? 'detail-other' : undefined} icon={cat.icon} tone={cat.tone} title={item.title}
      meta={meta || undefined} trailing={trailingFor(item)} onClick={() => onOpen(item)} />
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
        {trailingFor(item)}
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

  const items = sortByStart([
    // Store rows can briefly belong to another trip (the Today view loads its own trip)
    ...bookings.filter(b => b.trip_id === trip.id).map(b => ({ ...b, _kind: 'booking' })),
    ...activities.filter(a => a.trip_id === trip.id).map(a => ({ ...a, _kind: 'activity' })),
  ])
  const byDay = {}
  const unscheduled = []
  items.forEach(item => {
    const d = bookingDay(item)
    if (!d) unscheduled.push(item)
    else (byDay[d] = byDay[d] || []).push(item)
  })

  const canDelete = (item) => !readOnly && (!currentUserId || !item.created_by || item.created_by === currentUserId)
  const rowProps = {
    currentUserId, readOnly,
    onOpen: (item) => setSheet({ detail: item }),
    onToggle: (item, v) => toggleActivity(item.id, v),
  }
  const pick = (t) => setSheet(t.plan ? 'plan' : { type: t.type, mode: t.mode })
  const detail = sheet?.detail && items.find(i => i.id === sheet.detail.id && i._kind === sheet.detail._kind)

  return (
    <Stack gap={4} className="detail-plan">
      {loadingDetail && items.length === 0 && (
        <Stack gap={3} aria-busy="true" aria-label="Loading plan">
          {[1, 2, 3].map(i => <Card key={i}><Skeleton lines={1} /></Card>)}
        </Stack>
      )}

      {!loadingDetail && items.length === 0 && (
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
        <BookingFormSheet tripId={trip.id} type={sheet.type} initial={sheet.mode ? { transport_mode: sheet.mode } : {}}
          onClose={() => setSheet(null)} onCreate={createBooking} />
      )}
      {detail && (
        <BookingDetailSheet item={detail} isActivity={detail._kind === 'activity'} canDelete={canDelete(detail)}
          onToggle={!readOnly && detail._kind === 'activity' ? (v) => toggleActivity(detail.id, v) : undefined}
          onDelete={() => (detail._kind === 'activity' ? deleteActivity(detail.id) : deleteBooking(detail.id))}
          onClose={() => setSheet(null)} />
      )}
    </Stack>
  )
}
