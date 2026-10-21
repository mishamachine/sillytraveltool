import { useState } from 'react'
import { useAuthStore, useTripsStore } from '../../store'
import { Screen, ScreenHeader, Card, Button, Field, Dialog, Text, Stack, Icon, GooseMark } from '../../ui'

// Account deletion: UI only for now. Server-side deletion ships in Phase 2, so the
// final button explains that instead of deleting anything.
export default function DeleteAccountView({ docCount, cardCount, onBack }) {
  const trips = useTripsStore(s => s.trips)
  const badges = useAuthStore(s => s.badges)
  const [confirmText, setConfirmText] = useState('')
  const [notice, setNotice] = useState(false)
  const owned = trips.filter(t => !t._isShared).length

  const items = [
    owned ? `${owned} ${owned === 1 ? 'trip' : 'trips'} and their bookings` : 'Your trips and their bookings',
    docCount ? `${docCount} travel ${docCount === 1 ? 'document' : 'documents'}` : 'Travel documents',
    cardCount ? `${cardCount} loyalty ${cardCount === 1 ? 'card' : 'cards'}` : null,
    `Goose score and ${badges?.length ? `${badges.length} ` : ''}badges`,
    'Your Goose inbox address',
  ].filter(Boolean)

  const ready = confirmText.trim() === 'DELETE'

  return (
    <Screen gap={4} labelledBy="delete-title">
      <ScreenHeader onBack={onBack} backLabel="Back to settings" />
      <Stack gap={3} align="start">
        <GooseMark expression="sad" size={58} tile tileSize="sm" />
        <Text variant="h1" id="delete-title">Delete your account?</Text>
        <Text variant="body" tone="secondary">This can't be undone. Everything below is erased within 30 days, including backups.</Text>
      </Stack>

      <Card variant="group" as="ul" className="profile-erase" aria-label="What gets erased">
        {items.map(t => (
          <li key={t} className="c-row">
            <Icon name="close" size={18} strokeWidth={2} className="tone-danger" />
            <span className="c-row__body"><span className="c-row__title profile-erase__item">{t}</span></span>
          </li>
        ))}
      </Card>

      <Button variant="ghost" icon="download" disabled className="profile-export">Download my data first (coming soon)</Button>

      <Field label="Type DELETE to confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)}
        autoComplete="off" autoCapitalize="characters" spellCheck={false} inputClassName="profile-delete-input" />

      <Stack gap={2} className="profile-delete-actions">
        <Button variant="danger" size="lg" block disabled={!ready} onClick={() => setNotice(true)}>Delete account permanently</Button>
        <Button variant="ghost" block onClick={onBack}>Keep my account</Button>
      </Stack>

      <Dialog open={notice} onClose={() => setNotice(false)} title="Deletion arrives in the next release"
        actions={<>
          <a className="c-btn c-btn--secondary c-btn--md" href="mailto:hello@sillytraveltool.com?subject=Delete%20my%20account">Email us</a>
          <Button variant="primary" onClick={() => setNotice(false)}>OK</Button>
        </>}>
        Nothing has been deleted. Until in-app deletion ships, email hello@sillytraveltool.com from your account address and we'll erase everything for you.
      </Dialog>
    </Screen>
  )
}
