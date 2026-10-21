import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap } from '../_shared/gemini.ts'

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const raw = await req.json()
    const languageCode = cap(raw.languageCode, 12), languageName = cap(raw.languageName, 60)
    if (!languageCode || !languageName) return new Response(JSON.stringify({ error: 'languageCode and languageName required' }), { status: 400, headers: CORS })

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })

    const prompt = `Generate travel phrases in ${languageName} (${languageCode}).

Return ONLY a valid JSON object with no markdown, no explanation. Just raw JSON.

{
  "greetings": [],
  "food": [],
  "transport": [],
  "hotel": [],
  "shopping": [],
  "health": [],
  "social": [],
  "goose_specials": []
}

Each array must have exactly 8 phrase objects: { "english": "", "native": "", "romanized": "", "context": "" }

goose_specials should be funny and useful phrases unique to this culture that travelers love.
Make romanizations phonetically accurate for English speakers.`

    const gemRes = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 4096 } })

    if (!gemRes.ok) {
      const err = await gemRes.text()
      return new Response(JSON.stringify({ error: `Gemini error: ${err.slice(0, 200)}` }), { status: 502, headers: CORS })
    }

    const gemData = await gemRes.json()
    const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return new Response(JSON.stringify({ error: 'No content from Gemini' }), { status: 502, headers: CORS })

    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    let result
    try { result = JSON.parse(cleaned) } catch {
      const m = cleaned.match(/(\{[\s\S]*\})/)
      if (m) result = JSON.parse(m[0])
      else return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 502, headers: CORS })
    }

    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
