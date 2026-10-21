import { Sheet, Card, Button, IconTile, Text, Stack, Icon, Overline, CATEGORY } from '../../../ui'
import { useCopyInbox } from '../InboxHint'

// Manual entry tiles: booking type (+ transport mode) or a plan/note
const TILES = [
  { key: 'flight', label: 'Flight', type: 'flight' },
  { key: 'hotel', label: 'Stay', type: 'hotel' },
  { key: 'train', label: 'Train', type: 'transport', mode: 'train' },
  { key: 'restaurant', label: 'Restaurant', type: 'restaurant' },
  { key: 'ticket', label: 'Ticket', type: 'activity' },
  { key: 'car', label: 'Car', type: 'transport', mode: 'car' },
  { key: 'bus', label: 'Bus or ferry', type: 'transport', mode: 'bus' },
  { key: 'note', label: 'Plan or note', plan: true, icon: 'pin', tone: 'accent' },
  { key: 'other', label: 'Other', type: 'other', icon: 'more', tone: 'neutral' },
]

/** "Add to this trip": forward the email, paste it, or add by hand (A-AddBooking). */
export default function AddBookingSheet({ onClose, onPaste, onPick }) {
  const { address, copied, copy } = useCopyInbox()
  return (
    <Sheet title="Add to this trip" onClose={onClose}>
      {address && (
        <Card variant="inverse" className="add-forward">
          <Stack row gap={3}>
            <IconTile icon="mail" tone="inverse" size="sm" />
            <Stack gap={1} grow>
              <Text variant="card-title" tone="inverse" as="p">Forward the email</Text>
              <Text variant="caption" tone="inverse-muted">Fastest. Goose fills everything in.</Text>
            </Stack>
          </Stack>
          <Button variant="inverse" block icon={copied ? 'check' : 'copy'} onClick={copy}>
            {copied ? 'Address copied' : 'Copy Goose inbox address'}
          </Button>
        </Card>
      )}

      <Card onClick={onPaste} className="add-paste">
        <Stack row gap={3}>
          <Icon name="clipboard" className="tone-accent" />
          <Stack gap={0} grow>
            <Text variant="body" weight={600} as="span">Paste confirmation text</Text>
            <Text variant="micro" tone="muted" as="span">From an app, PDF or screenshot text</Text>
          </Stack>
          <Icon name="chevron-right" size={18} className="tone-muted" />
        </Stack>
      </Card>

      <Overline as="h3">Or add by hand</Overline>
      <div className="grid-3">
        {TILES.map(t => {
          const cat = t.icon ? t : CATEGORY[t.key] || CATEGORY[t.type] || CATEGORY.other
          return (
            <Card key={t.key} variant="tile" className="add-tile" onClick={() => onPick(t)}>
              <IconTile icon={cat.icon} tone={cat.tone} />
              <Text variant="label" as="span" align="center">{t.label}</Text>
            </Card>
          )
        })}
      </div>
    </Sheet>
  )
}
