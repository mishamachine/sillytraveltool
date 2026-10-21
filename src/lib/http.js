// fetch() with a hard timeout. Rejects with an Error named 'TimeoutError'
// when the request takes longer than `ms`. A caller-supplied `signal` still works.
export async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController()
  const { signal: outer, ...rest } = opts
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, ms)
  const onOuterAbort = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (e) {
    if (timedOut) {
      const err = new Error(`Request timed out after ${ms}ms`)
      err.name = 'TimeoutError'
      throw err
    }
    throw e
  } finally {
    clearTimeout(timer)
    if (outer) outer.removeEventListener('abort', onOuterAbort)
  }
}

// Convenience: fetch + JSON with timeout; throws on non-2xx.
export async function fetchJson(url, opts = {}, ms = 8000) {
  const res = await fetchWithTimeout(url, opts, ms)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
