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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { displayName } = await req.json().catch(() => ({}))
    const name = displayName || user.email?.split('@')[0] || 'Traveler'
    const appUrl = Deno.env.get('APP_URL') || 'https://sillytraveltool.com'

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: 'Resend key not configured' }), { status: 500, headers: CORS })

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(42,37,32,0.10);">
    <div style="background:#2A2520;padding:32px 32px 24px;text-align:center;">
      <img src="https://sillytraveltool.com/pwa-192x192.png" width="80" height="80" alt="The Goose" style="border-radius:50%;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
      <div style="color:#F5F0E8;font-size:22px;font-weight:700;font-family:'Space Grotesk',Arial,sans-serif;">Silly Travel Tool</div>
      <div style="color:rgba(245,240,232,0.6);font-size:13px;margin-top:4px;">Trust The Goose. It knows a spot.</div>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px;font-size:20px;color:#2A2520;font-family:'Space Grotesk',Arial,sans-serif;">Welcome aboard, ${name}! ✈️</h2>
      <p style="margin:0 0 20px;color:#6B6355;font-size:15px;line-height:1.6;">
        The Goose is ready. Your travel companion is set up and waiting — plan trips, track bookings, discover hidden spots, and never get lost again.
      </p>
      <div style="background:#FFF0EB;border-radius:14px;padding:20px 20px 16px;margin-bottom:24px;">
        <div style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:14px;color:#C4561E;margin-bottom:10px;">A few things to try first:</div>
        <div style="font-size:13px;color:#6B6355;line-height:2;">
          ✈️ &nbsp;Add a trip and set your dates<br>
          📧 &nbsp;Forward a booking confirmation to The Goose<br>
          🗺️ &nbsp;Ask the Guide about any city<br>
          🪿 &nbsp;Hit HONK to discover what's nearby
        </div>
      </div>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${appUrl}" style="display:inline-block;background:#C4561E;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:16px;font-family:'Space Grotesk',Arial,sans-serif;">
          Open Silly Travel Tool 🪿
        </a>
      </div>
      <p style="margin:0;color:#A09688;font-size:12px;text-align:center;line-height:1.6;">
        Your personal booking inbox:<br>
        <strong style="color:#C4561E;">forward confirmations to the address in your app</strong>
      </p>
    </div>
    <div style="background:#FFF0EB;padding:24px 32px;text-align:center;border-top:1px solid #F0E8DF;">
      <div style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:15px;color:#2A2520;margin-bottom:6px;">Know a fellow traveller? 🪿</div>
      <p style="margin:0 0 16px;color:#6B6355;font-size:13px;line-height:1.6;">Send them The Goose — because everyone deserves a travel companion with opinions.</p>
      <a href="https://sillytraveltool.com" style="display:inline-block;background:#2A2520;color:#F5F0E8;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;font-family:'Space Grotesk',Arial,sans-serif;">
        Share Silly Travel Tool
      </a>
    </div>
    <div style="background:#F5F1EB;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#A09688;font-size:11px;">Silly Travel Tool · sillytraveltool.com</p>
    </div>
  </div>
</body>
</html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'The Goose <noreply@bookings.sillytraveltool.com>',
        to: [user.email!],
        subject: `Welcome to Silly Travel Tool, ${name}! 🪿`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      // Non-fatal — log but don't fail the signup flow
      console.error('Resend welcome email error:', err.slice(0, 200))
      return new Response(JSON.stringify({ success: false, error: err.slice(0, 200) }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e: any) {
    console.error('send-welcome-email error:', e)
    // Always return 200 — welcome email failure must never block the signup flow
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
