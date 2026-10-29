import { supabase } from './supabase'

// Email-link invites. The link carries a one-time token; the app shows who invited you (preview), and only a tap on
// Join accepts it. Both calls go to the accept-invite Edge Function, which also checks the address is confirmed.
async function call(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, status: 401, error: 'Sign in first.' }
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const result = await res.json().catch(() => ({}))
  return { ok: res.ok && result.success === true, status: res.status, error: result.error, result }
}

/** Who invited you, to which trip, as what. Read-only; null when the invite is not yours, used or expired. */
export async function previewInvite(token) {
  const r = await call({ action: 'preview', token })
  return r.ok ? { inviter: r.result.inviter_name, tripTitle: r.result.trip_title, role: r.result.role } : { error: r.error, status: r.status }
}

/** Accept the invite behind a token. */
export async function acceptInviteToken(token) {
  const r = await call({ token })
  return r.ok ? { tripTitle: r.result.trip_title } : { error: r.error, status: r.status }
}

export const roleLabel = (role) => (role === 'viewer' ? 'a viewer (can look, not edit)' : 'a collaborator (can edit)')
