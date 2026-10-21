// Shared Gemini caller for all AI Edge Functions.
// - Model comes from the GEMINI_MODEL secret (default gemini-2.5-flash); on a 404
//   (model retired) it retries once on the gemini-flash-latest alias so the app
//   doesn't go dark again the way it did when gemini-2.0-flash was shut down.
// - Hard timeout so the client never hangs; a timeout returns a 504 Response.
// - API key goes in a header, not the URL (keeps it out of logs).

const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-flash-latest'

export async function geminiFetch(
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
