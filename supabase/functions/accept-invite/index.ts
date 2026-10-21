import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// accept-invite Edge Function
// Uses SERVICE_ROLE_KEY to bypass RLS and write user_id onto the
// trip_collaborators row. Anon client in the browser cannot do this.

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

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')

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

    // 2. Get the invite token from request body
    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), { status: 400, headers: CORS })
    }

    // 3. Service role client — bypasses RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 4. Look up the pending invite
    const { data: collab, error: lookupErr } = await adminClient
      .from('trip_collaborators')
      .select('id, trip_id, trips(title, destination_city)')
      .eq('invite_token', token)
      .eq('status', 'pending')
      .gt('invite_expires_at', new Date().toISOString())
      .maybeSingle()

    if (lookupErr || !collab) {
      console.error('Invite lookup failed:', token, lookupErr?.message)
      return new Response(
        JSON.stringify({ error: 'Invite not found, already used, or expired' }),
        { status: 404, headers: CORS }
      )
    }

    // 5. Accept it — write user_id with service role (bypasses RLS)
    const { error: updateErr } = await adminClient
      .from('trip_collaborators')
      .update({
        status: 'accepted',
        user_id: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', collab.id)

    if (updateErr) {
      console.error('Accept update failed:', updateErr.message)
      return new Response(
        JSON.stringify({ error: `Failed to accept invite: ${updateErr.message}` }),
        { status: 500, headers: CORS }
      )
    }

    console.log(`✅ Invite accepted: user=${user.id} trip=${collab.trip_id} collab=${collab.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        trip_id: collab.trip_id,
        trip_title: (collab.trips as any)?.title || null,
        trip_city: (collab.trips as any)?.destination_city || null,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('accept-invite error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
