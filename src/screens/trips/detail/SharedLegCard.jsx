import { useState } from 'react'
import { bookingKind } from '../../../lib/trips'
import { travellerName } from '../../../lib/sharedLegs'
import { Card, IconTile, Stack, Text, Icon, category } from '../../../ui'

const VISIBLE = 6

/**
 * One flight or train that several travellers on the trip are on (src/lib/sharedLegs.js): the leg once, then a
 * line per traveller with their seat and confirmation. Each line opens that traveller's booking.
 * Viewers see other travellers' confirmations as "Conf. hidden" (display only: the rows still reach the phone).
 */
export default function SharedLegCard({ items, me, hideConf, trailing, onOpen }) {
  const [open, setOpen] = useState(false)
  const lead = items[0] // the member's own booking when they have one (sorted first)
  const cat = category(bookingKind(lead))
  const operator = [lead.airline, lead.flight_number].filter(Boolean).join(' ')
  const route = `${lead.departure_airport} to ${lead.arrival_airport}`
  const shown = open || items.length <= VISIBLE ? items : items.slice(0, VISIBLE)
  const listId = `shared-leg-${lead.id}`
  return (
    <Card className="detail-solo shared-leg" as="section" aria-label={`${cat.label}: ${lead.title}, ${items.length} travellers`}>
      <button type="button" className="shared-leg__head" onClick={() => onOpen(lead)}
        aria-label={`${cat.label}: ${lead.title}, ${lead.created_by === me ? 'open your booking' : 'open booking'}`}>
        <Stack row gap={3}>
          <IconTile icon={cat.icon} tone={cat.tone} size="md" />
          <Stack gap={1} grow>
            <Text variant="card-title" as="span">{lead.title}</Text>
            <Text variant="caption" tone="muted" as="span">{[operator, `${items.length} travellers`].filter(Boolean).join(' · ')}</Text>
          </Stack>
          {trailing}
        </Stack>
      </button>
      <ul className="shared-leg__list" id={listId} aria-label={`${[operator, route].filter(Boolean).join(', ')}, ${items.length} travellers`}>
        {shown.map(b => {
          const mine = !!me && b.created_by === me
          const name = mine ? 'You' : travellerName(b)
          const seat = b.seat_number ? `Seat ${b.seat_number}` : mine ? 'Seat not added' : null
          const conf = b.confirmation_number ? (hideConf && !mine ? 'Conf. hidden' : `Conf. ${b.confirmation_number}`) : null
          return (
            <li key={b.id}>
              <button type="button" className="shared-leg__line" onClick={() => onOpen(b)}
                aria-label={`${[name, seat, conf].filter(Boolean).join(', ')}. Open booking`}>
                <span className="shared-leg__text">
                  <span className="shared-leg__name">{name}</span>
                  {(seat || conf) && (
                    <span className="shared-leg__bits">
                      {seat && <span className={`tabular${b.seat_number ? '' : ' shared-leg__nudge'}`}>{seat}</span>}
                      {conf && <span className="tabular">{conf}</span>}
                    </span>
                  )}
                </span>
                <Icon name="chevron-right" size={18} strokeWidth={2} className="shared-leg__chevron" />
              </button>
            </li>
          )
        })}
      </ul>
      {items.length > VISIBLE && !open && (
        <button type="button" className="shared-leg__more" aria-controls={listId} aria-expanded="false" onClick={() => setOpen(true)}>
          + {items.length - VISIBLE} more
        </button>
      )}
    </Card>
  )
}
