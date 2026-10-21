import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    // Use service role key for server-side writes — bypasses RLS safely
    // Auth is still validated manually via the user JWT above
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { inviteeEmail, tripId, tripName, inviterName, role = 'viewer' } = await req.json()
    if (!inviteeEmail || !tripId || !tripName) {
      return new Response(JSON.stringify({ error: 'inviteeEmail, tripId, tripName required' }), { status: 400, headers: CORS })
    }

    // Verify inviter owns or co-owns the trip
    const { data: trip } = await supabase.from('trips').select('id, owner_id').eq('id', tripId).single()
    if (!trip || trip.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorised for this trip' }), { status: 403, headers: CORS })
    }

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
    }, { onConflict: 'trip_id,invited_email' })

    if (collabErr) return new Response(JSON.stringify({ error: collabErr.message }), { status: 500, headers: CORS })

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: 'Resend key not configured' }), { status: 500, headers: CORS })

    const appUrl = Deno.env.get('APP_URL') || 'https://sillytraveltool.com'
    const acceptUrl = `${appUrl}/invite?token=${token}`
    const displayName = inviterName || user.email?.split('@')[0] || 'Someone'

    const emailBody = {
      from: 'The Goose <noreply@bookings.sillytraveltool.com>',
      to: [inviteeEmail],
      subject: `${displayName} invited you to "${tripName}" 🪿`,
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
        <strong style="color:#2A2520;">${displayName}</strong> has invited you to collaborate on their trip to <strong style="color:#C4561E;">${tripName}</strong>.
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
      const err = await resendRes.text()
      return new Response(JSON.stringify({ error: `Resend error: ${err.slice(0, 200)}` }), { status: 502, headers: CORS })
    }

    return new Response(JSON.stringify({ success: true, token }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
