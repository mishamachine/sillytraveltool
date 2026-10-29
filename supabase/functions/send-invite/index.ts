import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { cleanLine, inviteSubject, limitResponse } from '../_shared/invite.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ROLES = ['viewer', 'collaborator']

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    // Use service role key for server-side writes — bypasses RLS safely
    // Auth is still validated manually via the user JWT above
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    // Same gate as accept-invite: an unconfirmed address cannot send invites
    if (!user.email_confirmed_at) return json({ error: 'Confirm your email address first, then try again.' }, 403)

    const body = await req.json()
    const inviteeEmail = String(body.inviteeEmail ?? '').trim().toLowerCase().slice(0, 254)
    const tripId = body.tripId
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'viewer'
    if (!inviteeEmail || !tripId) {
      return new Response(JSON.stringify({ error: 'inviteeEmail and tripId required' }), { status: 400, headers: CORS })
    }
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(inviteeEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400, headers: CORS })
    }

    // Verify inviter owns or co-owns the trip
    const { data: trip } = await supabase.from('trips').select('id, owner_id, title, destination_city').eq('id', tripId).single()
    if (!trip || trip.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorised for this trip' }), { status: 403, headers: CORS })
    }

    // Use the stored trip name, never the client-supplied one
    const tripName = trip.title || trip.destination_city || 'a trip'

    // Re-inviting someone who already joined must not reset them to pending (which would also drop their access)
    const { data: existing, error: existingErr } = await supabase.from('trip_collaborators')
      .select('status').eq('trip_id', tripId).eq('invited_email', inviteeEmail).maybeSingle()
    if (existingErr) {
      console.error('send-invite existing lookup failed:', existingErr.message)
      return json({ error: 'Could not send the invite. Try again later.' }, 500)
    }
    if (existing?.status === 'accepted') return json({ error: 'That person is already on this trip' }, 409)

    // Limits come from an append-only send log (20 per hour per sender, 3 per day per recipient, a project-wide
    // daily cap). A failed check refuses the send: it never falls through.
    const { data: verdict, error: limitErr } = await supabase.rpc('invite_send_check', {
      p_sender: user.id, p_recipient: inviteeEmail, p_trip: tripId,
    })
    if (limitErr || typeof verdict !== 'string') {
      console.error('send-invite limit check failed:', limitErr?.message || 'no verdict')
      return json({ error: 'Invites are unavailable right now. Try again later.' }, 503)
    }
    if (verdict === 'global_limit') console.error('send-invite: kind=global_invite_cap_hit')
    const limited = limitResponse(verdict)
    if (limited) return json({ error: limited.error }, limited.status)

    // The inviter's name comes from their saved profile, never from the request
    const { data: prof } = await supabase.from('user_profiles').select('display_name').eq('id', user.id).maybeSingle()

    // Create or update collab record with token
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

    const { error: collabErr } = await supabase.from('trip_collaborators').upsert({
      trip_id: tripId,
      invited_email: inviteeEmail,
      invited_by: user.id,
      role,
      status: 'pending',
      invite_token: token,
      invite_expires_at: expiresAt,
      invited_at: new Date().toISOString(),
    }, { onConflict: 'trip_id,invited_email' })

    if (collabErr) {
      console.error('send-invite upsert failed:', collabErr.message)
      return json({ error: 'Could not send the invite. Try again later.' }, 500)
    }

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      console.error('send-invite: RESEND_API_KEY not configured')
      return json({ error: 'Could not send the invite. Try again later.' }, 500)
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://sillytraveltool.com'
    const acceptUrl = `${appUrl}/invite?token=${token}`
    const displayName = cleanLine(prof?.display_name) || 'Someone'
    const safeName = escapeHtml(displayName)
    const safeTrip = escapeHtml(cleanLine(tripName))

    const emailBody = {
      from: 'The Goose <noreply@bookings.sillytraveltool.com>',
      to: [inviteeEmail],
      subject: inviteSubject(displayName, tripName),
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(42,37,32,0.10);">
    <div style="background:#C4561E;padding:32px 32px 24px;text-align:center;">
      <div style="font-size:64px;line-height:1;margin-bottom:8px;">🪿</div>
      <div style="color:#fff;font-size:22px;font-weight:700;font-family:'Space Grotesk',Arial,sans-serif;">Silly Travel Tool</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">Trust The Goose. It knows a spot.</div>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px;font-size:20px;color:#2A2520;font-family:'Space Grotesk',Arial,sans-serif;">You've been invited! ✈️</h2>
      <p style="margin:0 0 20px;color:#6B6355;font-size:15px;line-height:1.6;">
        <strong style="color:#2A2520;">${safeName}</strong> has invited you to collaborate on their trip to <strong style="color:#B24A17;">${safeTrip}</strong>.
      </p>
      <p style="margin:0 0 28px;color:#6B6355;font-size:14px;line-height:1.6;">
        You'll be joining as a <strong>${role}</strong>. Click below to accept the invite and view the trip.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${acceptUrl}" style="display:inline-block;background:#C4561E;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:16px;font-family:'Space Grotesk',Arial,sans-serif;">
          Accept Invite 🪿
        </a>
      </div>
      <p style="margin:0 0 8px;color:#A09688;font-size:12px;text-align:center;">This invite expires in 7 days.</p>
      <p style="margin:0;color:#A09688;font-size:11px;text-align:center;line-height:1.5;">
        If you can't click the button, copy this link:<br>
        <span style="color:#C4561E;word-break:break-all;">${acceptUrl}</span>
      </p>
    </div>
    <div style="background:#F5F1EB;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#A09688;font-size:11px;">Silly Travel Tool · sillytraveltool.com</p>
    </div>
  </div>
</body>
</html>`,
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    })

    if (!resendRes.ok) {
      console.error('send-invite email failed:', resendRes.status, (await resendRes.text()).slice(0, 200))
      return json({ error: 'Could not send the invite. Try again later.' }, 502)
    }

    // The accept token only goes to the invitee's inbox; the inviter never receives it
    return json({ success: true })

  } catch (e) {
    console.error('send-invite error:', e?.message)
    return json({ error: 'Could not send the invite. Try again later.' }, 500)
  }
})
