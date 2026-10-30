import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// ============================================================
// inbox-release
// Files the forwarded emails that arrived before the member allowed AI reading (held_inbox_emails, migration
// 20261026120000_ai_consent). Called by the app right after "Allow". Each held email is fetched again from Resend
// (only its id was kept) and filed exactly like a new one; emails Resend no longer has are dropped and counted, so
// the app can say "forward it again". One email per call (release.ts) so a call stays well inside the function time
// limit; the app calls again while `remaining` > 0 and neither `limited` (daily inbox budget spent) nor `kept`
// (a temporary failure, put back for later) is set.
// ============================================================

import { consentCurrent } from '../_shared/consent.ts'
import { releaseHeld } from './release.ts'
import { fetchAttachments, fetchReceivedEmail } from '../receive-booking-email/resend.ts'
import { withGoogleScope } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(withGoogleScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await anon.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('user_profiles').select('*').eq('id', user.id).single()
    if (!profile) return json({ error: 'No profile' }, 404)
    if (!consentCurrent(profile)) return json({ error: 'Allow Goose to read your imports first.', code: 'ai_consent' }, 403)
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''

    const result = await releaseHeld(admin, { ...profile, account_email: user.email ?? null }, { fetchEmail: fetchReceivedEmail, fetchAttachments, GEMINI_API_KEY })
    return json(result)
  } catch (e) {
    console.error('inbox-release error:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
}))
