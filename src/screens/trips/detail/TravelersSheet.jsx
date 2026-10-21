import { useState } from 'react'
import { useCollabStore } from '../../../store'
import { Sheet, Field, Button, SegmentedControl, Banner, Card, ListRow, Chip, Section, Stack, Text } from '../../../ui'

// Invite people to the trip and see who's on it.
export default function TravelersSheet({ trip, onClose }) {
  const { inviteCollaborator } = useCollabStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('collaborator')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [collaborators, setCollaborators] = useState(trip.trip_collaborators || [])

  const handleInvite = async (e) => {
    e?.preventDefault()
    if (!email.trim() || !email.includes('@')) { setResult({ error: 'Enter a valid email address' }); return }
    setSending(true); setResult(null)
    const res = await inviteCollaborator(trip.id, email.trim().toLowerCase(), role, trip.title || 'your trip')
    if (res.success) {
      // Refetch collaborators from DB to get the actual record shape
      try {
        const { supabase } = await import('../../../lib/supabase')
        const { data: freshCollabs } = await supabase
          .from('trip_collaborators')
          .select('id, user_id, role, status, invited_email')
          .eq('trip_id', trip.id)
        if (freshCollabs) setCollaborators(freshCollabs)
      } catch { /* non-critical */ }
      setResult({ success: true })
      setEmail('')
    } else {
      setResult({ error: res.error || 'Failed to send invite. Try again.' })
    }
    setSending(false)
  }

  const others = collaborators.filter(c => c.role !== 'owner')

  return (
    <Sheet title="Travelers" subtitle={trip.title} onClose={onClose}>
      <form className="detail-form" onSubmit={handleInvite}>
        <Field label="Invite by email" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="friend@example.com" />
        <Stack gap={2}>
          <Text variant="label" as="p">Access</Text>
          <SegmentedControl role="radiogroup" label="Access" value={role} onChange={setRole}
            options={[{ value: 'collaborator', label: 'Can edit' }, { value: 'viewer', label: 'View only' }]} />
        </Stack>
        {result?.success && <Banner tone="success" icon="check-circle" role="status">Invite sent. They'll see it when they sign in.</Banner>}
        {result?.error && <Banner tone="danger" icon="alert-circle" role="alert">{result.error}</Banner>}
        <Button type="submit" variant="primary" size="lg" block icon="mail" loading={sending}>
          {sending ? 'Sending' : 'Send invite'}
        </Button>
      </form>

      {others.length > 0 && (
        <Section title="On this trip">
          <Card variant="group">
            {others.map((c, i) => (
              <ListRow key={c.id || i} icon="profile" tone="neutral"
                title={c.invited_email || 'Traveler'}
                meta={c.role === 'viewer' ? 'View only' : 'Can edit'}
                trailing={<Chip tone={c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'neutral' : 'info'}
                  icon={c.status === 'accepted' ? 'check' : undefined}>
                  {c.status === 'accepted' ? 'Joined' : c.status === 'declined' ? 'Declined' : 'Invited'}
                </Chip>} />
            ))}
          </Card>
        </Section>
      )}
    </Sheet>
  )
}
