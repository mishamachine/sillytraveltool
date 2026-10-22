// Shared AI caller for all AI Edge Functions (DeepSeek first, Gemini fallback; see geminiFetch).
// - Model comes from the GEMINI_MODEL secret (default gemini-2.5-flash); on a 404
//   (model retired) it retries once on the gemini-flash-latest alias so the app
//   doesn't go dark again the way it did when gemini-2.0-flash was shut down.
// - Hard timeout so the client never hangs; a timeout returns a 504 Response.
// - API key goes in a header, not the URL (keeps it out of logs).

const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-flash-latest'
const DEEPSEEK_MODEL = Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-chat'

/**
 * The app's AI call. DeepSeek is the primary provider when DEEPSEEK_API_KEY is set (owner decision,
 * 21 Oct 2026); Gemini is the fallback. Callers send and receive Gemini-shaped JSON either way, so the
 * Edge Functions don't need to know which provider answered.
 */
export async function geminiFetch(
  apiKey: string,
  body: Record<string, any>,
  { timeoutMs = 25000 }: { timeoutMs?: number } = {},
): Promise<Response> {
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY')
  if (deepseekKey) {
    let res = await deepseekFetch(deepseekKey, body, timeoutMs)
    // One retry on a passing hiccup (rate limit, server error, dropped connection); not on a timeout
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 500) res = await deepseekFetch(deepseekKey, body, timeoutMs)
    if (res.ok || !apiKey) return res
    console.warn(`DeepSeek ${res.status}, falling back to Gemini: ${(await res.clone().text()).slice(0, 200)}`)
  }
  return geminiDirect(apiKey, body, { timeoutMs })
}

/** DeepSeek chat completion (OpenAI-compatible), returned in Gemini's response shape. */
async function deepseekFetch(key: string, body: Record<string, any>, timeoutMs: number): Promise<Response> {
  const gc = body.generationConfig || {}
  const prompt = (body.contents || []).flatMap((c: any) => c.parts || []).map((p: any) => p.text || '').join('\n')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: gc.temperature ?? 0.7,
        max_tokens: Math.min(gc.maxOutputTokens || 4000, 8000),
        // JSON mode; every prompt here already asks for JSON, which DeepSeek requires
        ...(gc.responseMimeType === 'application/json' ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })
    if (!res.ok) return new Response(await res.text(), { status: res.status })
    const text = (await res.json()).choices?.[0]?.message?.content || ''
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], provider: 'deepseek' }), { status: 200 })
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `DeepSeek timed out after ${timeoutMs / 1000}s` : `DeepSeek failed: ${e?.message}`
    return new Response(JSON.stringify({ error: { message: msg } }), { status: e?.name === 'AbortError' ? 504 : 502 })
  } finally {
    clearTimeout(timer)
  }
}

async function geminiDirect(
  apiKey: string,
  body: Record<string, any>,
  { timeoutMs = 25000 }: { timeoutMs?: number } = {},
): Promise<Response> {
  const models = PRIMARY_MODEL === FALLBACK_MODEL ? [PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL]

  for (const model of models) {
    const payload = structuredClone(body)
    const gc = (payload.generationConfig ||= {})
    // 2.5 models "think" by default and spend the output budget on it; these
    // prompts are structured extraction/generation, so turn thinking off.
    if (model.startsWith('gemini-2.5') && !gc.thinkingConfig) gc.thinkingConfig = { thinkingBudget: 0 }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return new Response(JSON.stringify({ error: { message: `Gemini timed out after ${timeoutMs / 1000}s` } }), { status: 504 })
      }
      throw e
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 404 && model !== models[models.length - 1]) {
      console.warn(`Gemini model ${model} returned 404, retrying on ${FALLBACK_MODEL}`)
      continue
    }
    return res
  }
  // Unreachable: the loop always returns on the last model.
  return new Response(JSON.stringify({ error: { message: 'No Gemini model available' } }), { status: 502 })
}

// Trim and cap a user-supplied string before it goes into a prompt.
export function cap(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

// Daily per-user AI quota (public.consume_ai_quota, service role only).
// Returns false once the user is over the limit. Fails open: a quota-check
// outage must not take the AI features down with it.
// "guide" = sections written into the shared guide cache (for every user), on their own allowance so they
// don't use up the user's own AI requests.
export const AI_DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') || 100)
export const GUIDE_DAILY_LIMIT = Number(Deno.env.get('GUIDE_DAILY_LIMIT') || 40)

export async function checkAiQuota(userId: string, kind: 'ai' | 'guide' = 'ai'): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_limit: kind === 'guide' ? GUIDE_DAILY_LIMIT : AI_DAILY_LIMIT, p_kind: kind }),
    })
    if (!res.ok) {
      console.error('consume_ai_quota failed:', res.status, await res.text())
      return true
    }
    return (await res.json()) !== false
  } catch (e) {
    console.error('consume_ai_quota error:', e)
    return true
  }
}

export const QUOTA_MESSAGE = 'You have reached today\'s AI limit. It resets at midnight UTC.'
export const GUIDE_QUOTA_MESSAGE = 'Goose has written a lot of new guide pages for you today. More tomorrow (resets at midnight UTC).'
