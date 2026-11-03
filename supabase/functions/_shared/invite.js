// Invite helpers shared by send-invite, accept-invite and receive-booking-email (and tested in scripts/test-invite.mjs).

/** One line of display text: control characters and line breaks become spaces, capped at max characters. */
export function cleanLine(value, max = 60) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Email subject: inviter and trip names are cleaned and capped at 60 characters each. */
export function inviteSubject(inviterName, tripName) {
  return `${cleanLine(inviterName) || 'Someone'} invited you to "${cleanLine(tripName) || 'a trip'}"`
}

/** Last four characters of a secret, for logs: enough to match a line to a row, not enough to use it. */
export function last4(secret) {
  const s = String(secret ?? '')
  return s ? `…${s.slice(-4)}` : '(none)'
}

/** The send-invite answer for each invite_send_check result. */
export function limitResponse(result) {
  switch (result) {
    case 'sender_limit': return { status: 429, error: 'Too many invites. Try again in an hour.' }
    case 'recipient_limit': return { status: 429, error: 'That address has had enough invites for today. Try again tomorrow.' }
    case 'global_limit': return { status: 503, error: 'Invites are paused for now. Try again later.' }
    default: return null // 'ok'
  }
}
