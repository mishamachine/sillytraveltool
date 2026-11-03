import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { last4 } from '../_shared/invite.js'

// accept-invite Edge Function
// Uses SERVICE_ROLE_KEY to bypass RLS and write user_id onto the
// trip_collaborators row. Anon client in the browser cannot do this.
// Body shapes (all need a signed-in caller):
//   { action: 'preview', token }  who invited the caller, to which trip, as what (read-only, nothing is changed)
//   { token }                     email-link accept
//   { action: 'list' }            caller's pending invites (RLS hides rows matched only by invited_email)
//   { collaboratorId, accept }    accept or decline from the trip list

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // 1. Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')

    // Anon client — just to verify the JWT and get user identity
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    // 2. Read the request body
    const { token, action, collaboratorId, accept } = await req.json()

    // 3. Service role client — bypasses RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const email = (user.email || '').toLowerCase()
    const now = new Date().toISOString()
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // An address nobody has confirmed proves nothing about who holds it: refuse on every path
    if (!user.email_confirmed_at) {
      return json({ error: 'Confirm your email address first, then open the invite again.' }, 403)
    }

    // Preview: lets the app ask "Join <name>'s trip?" before anything is accepted. Only for a pending, unexpired invite
    // sent to the caller's own address; the answer holds the inviter's name, the trip title and the role, nothing else.
    if (action === 'preview') {
      const { data: inv } = typeof token === 'string' && token
        ? await adminClient.from('trip_collaborators')
            .select('invited_email, invited_by, role, trips(title, destination_city)')
            .eq('invite_token', token).eq('status', 'pending').gt('invite_expires_at', now).maybeSingle()
        : { data: null }
      if (!inv || inv.role === 'owner' || (inv.invited_email || '').toLowerCase() !== email) {
        return json({ error: 'Invite not found, already used, or expired' }, 404)
      }
      const { data: prof } = inv.invited_by
        ? await adminClient.from('user_profiles').select('display_name').eq('id', inv.invited_by).maybeSingle()
        : { data: null }
      const trip = inv.trips as any
      return json({
        success: true,
        inviter_name: String(prof?.display_name || 'Someone').slice(0, 60),
        trip_title: String(trip?.title || trip?.destination_city || 'a trip').slice(0, 60),
        role: inv.role,
      })
    }

    // In-app list: pending, unexpired invites sent to the caller's address or already bound to them
    if (action === 'list') {
      const cols = 'id, role, invited_at, trips(id, title, destination_city, destination_country, destination_country_code, start_date, end_date)'
      const pending = () => adminClient.from('trip_collaborators').select(cols)
        .eq('status', 'pending').neq('role', 'owner').gt('invite_expires_at', now)
      const [byUser, byEmail] = await Promise.all([
        pending().eq('user_id', user.id),
        email ? pending().eq('invited_email', email) : Promise.resolve({ data: [], error: null }),
      ])
      const listErr = byUser.error || byEmail.error
      if (listErr) {
        console.error('Invite list failed:', listErr.message)
        return json({ error: 'Could not load invites' }, 500)
      }
      const seen = new Set()
      const invites = [...(byUser.data || []), ...(byEmail.data || [])]
        .filter(i => !seen.has(i.id) && seen.add(i.id))
      return json({ invites })
    }

    // In-app accept or decline, same email binding as the token path
    if (collaboratorId) {
      if (typeof accept !== 'boolean') return json({ error: 'accept must be true or false' }, 400)
      const { data: row, error: rowErr } = await adminClient
        .from('trip_collaborators')
        .select('id, trip_id, invited_email, user_id, role, trips(title, destination_city)')
        .eq('id', collaboratorId)
        .eq('status', 'pending')
        .gt('invite_expires_at', now)
        .maybeSingle()
      const mine = row && row.role !== 'owner' &&
        ((row.invited_email || '').toLowerCase() === email || row.user_id === user.id)
      if (rowErr || !mine) {
        console.error('Invite respond refused:', collaboratorId, rowErr?.message || (row ? 'not this user' : 'no pending unexpired row'))
        return json({ error: 'Invite not found, already answered, or expired' }, 404)
      }

      const { error: respondErr } = await adminClient
        .from('trip_collaborators')
        .update(accept
          ? { status: 'accepted', user_id: user.id, accepted_at: now, invite_token: null }
          : { status: 'declined', invite_token: null })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (respondErr) {
        console.error('Invite respond failed:', respondErr.message)
        return json({ error: 'Could not answer the invite. Try again later.' }, 500)
      }

      console.log(`${accept ? '✅ Invite accepted' : '✖️ Invite declined'} (in app): user=${user.id} trip=${row.trip_id} collab=${row.id}`)
      return json({
        success: true,
        trip_id: row.trip_id,
        trip_title: (row.trips as any)?.title || null,
        trip_city: (row.trips as any)?.destination_city || null,
      })
    }

    if (!token) return json({ error: 'token required' }, 400)

    // 4. Look up the pending invite
    const { data: collab, error: lookupErr } = await adminClient
      .from('trip_collaborators')
      .select('id, trip_id, invited_email, trips(title, destination_city)')
      .eq('invite_token', token)
      .eq('status', 'pending')
      .gt('invite_expires_at', now)
      .maybeSingle()

    if (lookupErr || !collab) {
      console.error('Invite lookup failed:', last4(token), lookupErr?.message)
      return json({ error: 'Invite not found, already used, or expired' }, 404)
    }

    // Invites are bound to the address they were sent to
    if ((collab.invited_email || '').toLowerCase() !== email) {
      return json({ error: 'This invite was sent to a different email address' }, 403)
    }

    // 5. Accept it with the service role. Still pending and unexpired at write time, and the token is spent
    const { data: updated, error: updateErr } = await adminClient
      .from('trip_collaborators')
      .update({ status: 'accepted', user_id: user.id, accepted_at: now, invite_token: null })
      .eq('id', collab.id)
      .eq('status', 'pending')
      .gt('invite_expires_at', now)
      .select('id')

    if (updateErr) {
      console.error('Accept update failed:', updateErr.message)
      return json({ error: 'Could not accept the invite. Try again later.' }, 500)
    }
    if (!updated?.length) return json({ error: 'Invite not found, already used, or expired' }, 404)

    console.log(`✅ Invite accepted: user=${user.id} trip=${collab.trip_id} collab=${collab.id}`)

    return json({
      success: true,
      trip_id: collab.trip_id,
      trip_title: (collab.trips as any)?.title || null,
      trip_city: (collab.trips as any)?.destination_city || null,
    })

  } catch (e: any) {
    console.error('accept-invite error:', e)
    return new Response(JSON.stringify({ error: 'Something went wrong. Try again later.' }), { status: 500, headers: CORS })
  }
})
