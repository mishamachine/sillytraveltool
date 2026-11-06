import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { welcomeEmail } from '../_shared/welcomeEmail.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { displayName } = await req.json().catch(() => ({}))
    const name = displayName || user.email?.split('@')[0] || 'Traveler'

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: 'Resend key not configured' }), { status: 500, headers: CORS })

    const { subject, html, text } = welcomeEmail({ name })

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'The Goose <noreply@bookings.sillytraveltool.com>',
        to: [user.email!],
        subject,
        html,
        text,
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
