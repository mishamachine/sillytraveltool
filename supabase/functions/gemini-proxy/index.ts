import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// gemini-proxy was an unauthenticated, open Gemini/TTS proxy that the client
// never used (security issue C1). It's retired: deploy this tombstone to shut
// it off immediately, then delete it with `supabase functions delete gemini-proxy`.

Deno.serve(() =>
  new Response(JSON.stringify({ error: 'Gone' }), { status: 410, headers: { 'Content-Type': 'application/json' } })
)
