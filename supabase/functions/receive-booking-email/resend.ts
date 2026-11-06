// Reading a received email back from Resend (the inbound webhook carries no body): used by receive-booking-email
// and, for emails held until the member allows AI reading, by inbox-release.
import { htmlToText, bestText } from '../_shared/emailText.js'

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

// HTML to text (tables kept as rows of cells, entities and quoted-printable decoded): _shared/emailText.js
export { htmlToText, bestText }

/**
 * The received email's subject, sender and text (HTML turned to text), or null when Resend no longer has it (404/410).
 * Any other failure throws: the caller keeps the email and tries again later.
 */
export async function fetchReceivedEmail(emailId: string): Promise<{ subject: string, from: string, text: string, attachments: unknown, created_at?: string | null } | null> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key || !emailId) throw new Error('Resend not configured')
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${key}` } })
  if (res.status === 404 || res.status === 410) { console.warn(`Resend receiving ${emailId}: ${res.status}`); return null }
  if (!res.ok) throw new Error(`Resend receiving ${res.status}`)
  const e = await res.json()
  const text = bestText(e.text, e.html)
  return { subject: String(e.subject ?? ''), from: String(e.from ?? ''), text: String(text), attachments: e.attachments, created_at: e.created_at ?? null }
}
