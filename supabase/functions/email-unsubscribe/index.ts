import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// One-click unsubscribe for member marketing emails (RFC 8058). Public: the token is the only key.
//   POST ?t=<token>  → mail apps' "Unsubscribe" button; turns marketing emails off, 200
//   GET  ?t=<token>  → someone opened the link; sends them to the website's unsubscribe page, which confirms it
Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') || ''
  if (req.method === 'GET') {
    return new Response(null, { status: 302, headers: { Location: `https://sillytraveltool.com/unsubscribe/?t=${encodeURIComponent(t)}` } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!/^[0-9a-f-]{36}$/i.test(t)) return new Response('Bad token', { status: 400 })
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/email_unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ p_token: t }),
  })
  return new Response(res.ok ? 'Unsubscribed' : 'Error', { status: res.ok ? 200 : 500 })
})
