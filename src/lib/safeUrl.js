// Links built from booking emails, collaborators or AI output: only http(s) may become an href.
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch { return null }
}
