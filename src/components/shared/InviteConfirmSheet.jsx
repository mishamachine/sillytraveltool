import { useState } from 'react'
import { Sheet, Stack, Text, Button, Banner } from '../../ui'
import { acceptInviteToken, roleLabel } from '../../lib/invite'

/**
 * Asks before joining a trip from an email link: "Join <name>'s trip <title>?". Nothing is accepted until Join.
 * invite: { token, inviter, tripTitle, role }. onJoined(tripTitle) after a successful accept; onClose for Not now.
 */
export default function InviteConfirmSheet({ invite, onJoined, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const join = async () => {
    setBusy(true); setError(null)
    const r = await acceptInviteToken(invite.token)
    if (!r.ok) { setError(r.error); setBusy(false); return }
    onJoined(r.tripTitle)
  }

  return (
    <Sheet title={`Join ${invite.inviter}'s trip?`} subtitle={invite.tripTitle} onClose={busy ? undefined : onClose}>
      <Stack gap={4}>
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Text>You would join {invite.tripTitle} as {roleLabel(invite.role)}.</Text>
        <Button variant="primary" size="lg" block loading={busy} onClick={join}>Join trip</Button>
        <Button variant="ghost" block disabled={busy} onClick={onClose}>Not now</Button>
      </Stack>
    </Sheet>
  )
}
