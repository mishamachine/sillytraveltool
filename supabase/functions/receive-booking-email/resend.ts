// Reading a received email back from Resend (the inbound webhook carries no body): used by receive-booking-email
// and, for emails held until the member allows AI reading, by inbox-release.

// Files worth reading: PDFs, images over 20 KB (not logos or signatures), CSV / Excel sheets; two at most, 6 MB each.
const READABLE = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|text\/(csv|plain|tab-separated-values)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/

export async function fetchAttachments(emailId: string | undefined, listed: unknown) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!emailId || !key || (Array.isArray(listed) && listed.length === 0)) return []
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) { console.warn(`attachments list ${res.status}`); return [] }
    const items = ((await res.json())?.data || []) as any[]
    const wanted = items.filter(a => {
      const mime = String(a.content_type || '').split(';')[0].trim().toLowerCase()
      const size = Number(a.size || 0)
      if (!READABLE.test(mime) && !/\.(csv|xlsx)$/i.test(a.filename || '')) return false
      if (size > 6 * 1024 * 1024) return false
      return !(mime.startsWith('image/') && size && size < 20000)
    }).slice(0, 2)
    const out = []
    for (const a of wanted) {
      const file = await fetch(a.download_url)
      if (!file.ok) continue
      out.push({ name: String(a.filename || 'attachment'), mime: String(a.content_type || '').split(';')[0].trim().toLowerCase(), bytes: new Uint8Array(await file.arrayBuffer()) })
    }
    if (out.length) console.log(`📎 ${out.length} attachment(s): ${out.map(a => a.mime).join(', ')}`)
    return out
  } catch (e) {
    console.warn('attachments fetch failed', (e as Error).message)
    return []
  }
}

// Extract plain text from HTML (basic — strips tags)
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The received email's subject, sender and text (HTML turned to text), or null when Resend no longer has it. */
export async function fetchReceivedEmail(emailId: string): Promise<{ subject: string, from: string, text: string, attachments: unknown } | null> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key || !emailId) return null
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) { console.warn(`Resend receiving ${emailId}: ${res.status}`); return null }
  const e = await res.json()
  const text = e.text || (e.html ? htmlToText(e.html) : '')
  return { subject: String(e.subject ?? ''), from: String(e.from ?? ''), text: String(text), attachments: e.attachments }
}
