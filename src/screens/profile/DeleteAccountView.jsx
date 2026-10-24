import { useState } from 'react'
import { useAuthStore, useTripsStore } from '../../store'
import { usePlanStore } from '../../store/planStore'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { Screen, ScreenHeader, Card, Button, Field, Dialog, Text, Stack, Icon, GooseMark } from '../../ui'

// Account deletion (Apple 5.1.1(v), Google Play): the delete-account Edge Function cancels a website subscription,
// then erases the member (public.delete_account). Store subscriptions are the member's to cancel in their store.
export default function DeleteAccountView({ docCount, cardCount, onBack }) {
  const trips = useTripsStore(s => s.trips)
  const badges = useAuthStore(s => s.badges)
  const signOut = useAuthStore(s => s.signOut)
  const storePlan = usePlanStore(s => s.plan?.store)
  const [confirmText, setConfirmText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const owned = trips.filter(t => !t._isShared).length

  const items = [
    owned ? `${owned} ${owned === 1 ? 'trip' : 'trips'} and their bookings` : 'Your trips and their bookings',
    docCount ? `${docCount} travel ${docCount === 1 ? 'document' : 'documents'}` : 'Travel documents',
    cardCount ? `${cardCount} loyalty ${cardCount === 1 ? 'card' : 'cards'}` : null,
    `Goose score and ${badges?.length ? `${badges.length} ` : ''}badges`,
    'Your Goose inbox address',
  ].filter(Boolean)

  const ready = confirmText.trim() === 'DELETE'

  const erase = async () => {
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
    if (err || !data?.deleted) {
      let msg = data?.error
      try { msg = msg || (await err?.context?.json())?.error } catch { /* not JSON */ }
      setError(msg || 'Couldn’t delete your account. Nothing was deleted; try again.')
      setBusy(false)
      return
    }
    track('account_deleted')
    await signOut()
  }

  return (
    <Screen gap={4} labelledBy="delete-title">
      <ScreenHeader onBack={onBack} backLabel="Back to settings" />
      <Stack gap={3} align="start">
        <GooseMark expression="sad" size={58} tile tileSize="sm" />
        <Text variant="h1" id="delete-title">Delete your account?</Text>
        <Text variant="body" tone="secondary">This can't be undone. Everything below is erased right away; backup copies are gone within 30 days.</Text>
      </Stack>

      <Card variant="group" as="ul" className="profile-erase" aria-label="What gets erased">
        {items.map(t => (
          <li key={t} className="c-row">
            <Icon name="close" size={18} strokeWidth={2} className="tone-danger" />
            <span className="c-row__body"><span className="c-row__title profile-erase__item">{t}</span></span>
          </li>
        ))}
      </Card>

      <Field label="Type DELETE to confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)}
        autoComplete="off" autoCapitalize="characters" spellCheck={false} inputClassName="profile-delete-input" />

      <Stack gap={2} className="profile-delete-actions">
        <Button variant="danger" size="lg" block disabled={!ready} onClick={() => setConfirming(true)}>Delete my account</Button>
        <Button variant="ghost" block onClick={onBack}>Keep my account</Button>
      </Stack>

      <Dialog open={confirming} onClose={() => !busy && setConfirming(false)} title="Delete everything now?"
        actions={<>
          <Button onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={erase} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </>}>
        {storePlan
          ? 'Your account and everything in it is erased right away. Your App Store or Google Play subscription isn’t cancelled by this: cancel it in your store account.'
          : 'Your account and everything in it is erased right away. A First Class subscription bought on our website is cancelled.'}
        {error && <Text variant="caption" as="span" tone="danger" role="alert" style={{ display: 'block', marginTop: 8 }}>{error}</Text>}
      </Dialog>
    </Screen>
  )
}
