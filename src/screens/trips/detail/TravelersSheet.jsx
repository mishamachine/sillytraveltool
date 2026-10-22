import { useState } from 'react'
import { useCollabStore, useTripsStore, useAuthStore } from '../../../store'
import ConfirmDialog from '../../../components/shared/ConfirmDialog'
import { Sheet, Field, Button, SegmentedControl, Banner, Card, ListRow, Chip, Section, Stack, Text } from '../../../ui'

const ACCESS = [{ value: 'collaborator', label: 'Can edit' }, { value: 'viewer', label: 'View only' }]
const statusLabel = (c) => (c.status === 'accepted' ? 'Joined' : c.status === 'declined' ? 'Declined' : 'Invited')

// Invite people to the trip and see who's on it. The owner can change access, remove people and cancel
// invites; someone the trip was shared with can leave it.
export default function TravelersSheet({ trip, onClose }) {
  const { inviteCollaborator, removeCollaborator, setCollaboratorRole } = useCollabStore()
  const { user } = useAuthStore()
  const isOwner = !trip._isShared
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('collaborator')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [collaborators, setCollaborators] = useState(trip.trip_collaborators || [])
  const [managing, setManaging] = useState(null) // a collaborator row
  const [confirm, setConfirm] = useState(null) // 'remove' | 'leave'
  const [error, setError] = useState(null)

  const refresh = async () => {
    try {
      const { supabase } = await import('../../../lib/supabase')
      const { data } = await supabase.from('trip_collaborators').select('id, user_id, role, status, invited_email').eq('trip_id', trip.id)
      if (data) setCollaborators(data)
    } catch { /* non-critical */ }
  }

  const handleInvite = async (e) => {
    e?.preventDefault()
    if (!email.trim() || !email.includes('@')) { setResult({ error: 'Enter a valid email address' }); return }
    setSending(true); setResult(null)
    const res = await inviteCollaborator(trip.id, email.trim().toLowerCase(), role, trip.title || 'your trip')
    if (res.success) {
      await refresh()
      setResult({ success: true })
      setEmail('')
    } else {
      setResult({ error: res.error || 'Failed to send invite. Try again.' })
    }
    setSending(false)
  }

  const changeRole = async (next) => {
    if (!managing || next === managing.role) return
    setError(null)
    try {
      await setCollaboratorRole(managing.id, next)
      setManaging(m => ({ ...m, role: next }))
      setCollaborators(cs => cs.map(c => (c.id === managing.id ? { ...c, role: next } : c)))
    } catch (e) { setError(e.message || 'Could not change access. Try again.') }
  }

  const remove = async (row) => {
    setError(null)
    try {
      await removeCollaborator(row.id)
      setCollaborators(cs => cs.filter(c => c.id !== row.id))
      setManaging(null)
    } catch (e) { setError(e.message || 'Could not remove them. Try again.') }
  }

  const others = collaborators.filter(c => c.role !== 'owner')
  const mine = collaborators.find(c => c.user_id === user?.id && c.role !== 'owner')

  return (
    <>
      <Sheet title="Travelers" subtitle={trip.title} onClose={onClose}>
        {isOwner && (
          <form className="detail-form" onSubmit={handleInvite}>
            <Field label="Invite by email" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="friend@example.com" />
            <Stack gap={2}>
              <Text variant="label" as="p">Access</Text>
              <SegmentedControl role="radiogroup" label="Access" value={role} onChange={setRole} options={ACCESS} />
            </Stack>
            {result?.success && <Banner tone="success" icon="check-circle" role="status">Invite sent. They'll see it when they sign in.</Banner>}
            {result?.error && <Banner tone="danger" icon="alert-circle" role="alert">{result.error}</Banner>}
            <Button type="submit" variant="primary" size="lg" block icon="mail" loading={sending}>
              {sending ? 'Sending' : 'Send invite'}
            </Button>
          </form>
        )}

        {error && !managing && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}

        {others.length > 0 && (
          <Section title="On this trip">
            <Card variant="group">
              {others.map((c, i) => (
                <ListRow key={c.id || i} icon="profile" tone="neutral"
                  title={c.invited_email || 'Traveler'}
                  meta={c.role === 'viewer' ? 'View only' : 'Can edit'}
                  chevron={isOwner}
                  onClick={isOwner ? () => { setError(null); setManaging(c) } : undefined}
                  aria-label={isOwner ? `Manage ${c.invited_email || 'traveler'}` : undefined}
                  trailing={<Chip tone={c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'neutral' : 'info'}
                    icon={c.status === 'accepted' ? 'check' : undefined}>{statusLabel(c)}</Chip>} />
              ))}
            </Card>
          </Section>
        )}

        {!isOwner && mine && (
          <Button variant="ghost" block icon="arrow-left" className="detail-delete" onClick={() => setConfirm('leave')}>Leave trip</Button>
        )}
      </Sheet>

      {managing && (
        <Sheet title={managing.invited_email || 'Traveler'} subtitle={statusLabel(managing)} onClose={() => setManaging(null)}>
          {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
          <Stack gap={2}>
            <Text variant="label" as="p">Access</Text>
            <SegmentedControl role="radiogroup" label="Access" value={managing.role} onChange={changeRole} options={ACCESS} />
          </Stack>
          <Button variant="ghost" block icon="trash" className="detail-delete" onClick={() => setConfirm('remove')}>
            {managing.status === 'pending' ? 'Cancel invite' : 'Remove from trip'}
          </Button>
        </Sheet>
      )}

      {confirm === 'remove' && managing && (
        <ConfirmDialog
          message={managing.status === 'pending' ? `Cancel the invite to ${managing.invited_email}?` : `Remove ${managing.invited_email || 'this traveler'}?`}
          detail={managing.status === 'pending' ? undefined : 'They lose access to this trip.'}
          confirmLabel={managing.status === 'pending' ? 'Cancel invite' : 'Remove'}
          onConfirm={async () => { await remove(managing); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'leave' && mine && (
        <ConfirmDialog
          message={`Leave "${trip.title}"?`}
          detail="You lose access to its plan. The organiser can invite you again."
          confirmLabel="Leave"
          onConfirm={async () => {
            await remove(mine)
            setConfirm(null)
            onClose()
            useTripsStore.getState().setActiveTrip(null)
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
