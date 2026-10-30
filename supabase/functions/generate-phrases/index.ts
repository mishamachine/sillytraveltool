import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { geminiFetch, cap, checkAiQuota, QUOTA_MESSAGE } from '../_shared/gemini.ts'
import { withRequestScope } from '../_shared/usage.ts'
import { targetLanguage, sourceLanguage } from './languages.ts'
import { aiConsentGiven, CONSENT_REQUIRED } from '../_shared/consent.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(withRequestScope(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const raw = await req.json()
    // Codes from a fixed list; the names that reach the prompt and the permanent cache are ours, not the request's
    const target = targetLanguage(raw.languageCode)
    // The traveler's own language; English unless they picked another
    const source = sourceLanguage(raw.sourceCode)
    if (!target || !source) return new Response(JSON.stringify({ error: 'Unsupported language' }), { status: 400, headers: CORS })
    const { code: languageCode, name: languageName } = target
    const { code: sourceCode, name: sourceName } = source

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) return new Response(JSON.stringify({ error: 'Gemini key not configured' }), { status: 500, headers: CORS })
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // Free text: one sentence the traveler typed. Not cached here (it can be personal); the app keeps it on the phone
    if (raw.mode === 'text') {
      const text = cap(raw.text, 300)
      if (!text) return reply({ error: 'text required' }, 400)
      if (!(await aiConsentGiven(user.id))) return reply(CONSENT_REQUIRED, 403)
      if (!(await checkAiQuota(user.id))) return reply({ error: QUOTA_MESSAGE }, 429)
      const res = await geminiFetch(GEMINI_API_KEY, { contents: [{ parts: [{ text: `Translate for a traveler, from ${sourceName} into ${languageName}. Natural, polite, as a local would say it.
Text: ${JSON.stringify(text)}
Return ONLY JSON: { "native": "the ${languageName} translation", "romanized": "pronunciation for a ${sourceName} speaker, or empty if ${languageName} uses the same script", "back": "the translation said back in ${sourceName}, to check the meaning" }` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 600 } })
      if (!res.ok) return reply({ error: `Gemini error: ${(await res.text()).slice(0, 200)}` }, 502)
      const out = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || ''
      try {
        const j = JSON.parse(out.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim())
        return reply({ native: cap(j.native, 600), romanized: cap(j.romanized, 600), back: cap(j.back, 600) })
      } catch { return reply({ error: 'Failed to parse Gemini response' }, 502) }
    }

    // Shared cache is server-written only (clients have read access)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // phrase_cache is permanent: a language is generated once, then served from here for everyone
    const { data: cached } = await admin.from('phrase_cache').select('*').eq('source_code', sourceCode).eq('language_code', languageCode).maybeSingle()
    if (cached) return new Response(JSON.stringify(cached), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    if (!(await checkAiQuota(user.id))) {
      return new Response(JSON.stringify({ error: QUOTA_MESSAGE }), { status: 429, headers: CORS })
    }

    // For a non-English traveler the "english" field carries the meaning in their language (kept for older app builds)
    const meaning = sourceCode === 'en' ? 'English' : sourceName
    const prompt = `Generate travel phrases in ${languageName} (${languageCode}) for a traveler who speaks ${meaning}.

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
"english" = what the phrase means, written in ${meaning}. "context" = when to use it, written in ${meaning}.

goose_specials should be funny and useful phrases unique to this culture that travelers love.
Make romanizations phonetically accurate for ${meaning} speakers.`

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

    const CATEGORIES = ['greetings', 'food', 'transport', 'hotel', 'shopping', 'health', 'social', 'goose_specials']
    const row: Record<string, unknown> = {
      source_code: sourceCode, language_code: languageCode, language_name: languageName,
      generated_at: new Date().toISOString(), expires_at: 'infinity',
    }
    // Kept forever and shown to everyone: only the four text fields, capped, no control characters
    const clean = (v: unknown) => cap(String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ''), 300)
    for (const c of CATEGORIES) {
      row[c] = (Array.isArray(result?.[c]) ? result[c] : []).slice(0, 12).filter((p: any) => p && typeof p === 'object')
        .map((p: any) => ({ english: clean(p.english), native: clean(p.native), romanized: clean(p.romanized), context: clean(p.context) }))
    }
    // Saved forever, so only a complete phrasebook goes in; a thin reply is shown but the next request retries
    const complete = CATEGORIES.every(c => (row[c] as unknown[]).filter((p: any) => p?.english && p?.native).length >= 5)
    if (complete) {
      const { error: cacheErr } = await admin.from('phrase_cache').upsert(row, { onConflict: 'source_code,language_code' })
      if (cacheErr) console.error('phrase_cache write failed:', cacheErr.message)
    } else console.warn(`phrases ${sourceCode}>${languageCode}: incomplete reply, not cached`)

    // Same shape as a cache hit
    return new Response(JSON.stringify(row), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
}))
