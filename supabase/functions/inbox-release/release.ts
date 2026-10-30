// The filing loop of inbox-release, apart from the HTTP wrapper so the offline replay can run it.
//
// Each held email is CLAIMED first (claim_held_emails deletes it and returns it, skipping rows another call has
// locked), so two calls at once never file the same email. It is put back only when filing failed for a temporary
// reason (daily limit, Resend or database trouble); it is gone for good when it was filed, ignored, expired at
// Resend, or failed five times.
import { ingestEmail } from '../receive-booking-email/ingest.ts'

export const PER_CALL = 1      // one email per call: a call stays well inside the function time limit
export const MAX_ATTEMPTS = 5  // tries before a held email is dropped

export type ReleaseDeps = {
  fetchEmail: (emailId: string) => Promise<{ subject: string, from: string, text: string, attachments: unknown } | null>
  fetchAttachments: (emailId: string, listed: unknown) => Promise<{ name: string, mime: string, bytes: Uint8Array }[]>
  GEMINI_API_KEY: string
}

export type ReleaseResult = {
  filed: number, ignored: number, expired: number, failed: number,
  kept: number,      // put back to try again later (temporary failure)
  limited: boolean,  // today's inbox budget is spent: stop calling until tomorrow
  remaining: number,
}

export async function releaseHeld(admin: any, profile: any, deps: ReleaseDeps): Promise<ReleaseResult> {
  const out: ReleaseResult = { filed: 0, ignored: 0, expired: 0, failed: 0, kept: 0, limited: false, remaining: 0 }
  const userId = profile.id as string

  const logError = async (kind: string, status: number | null, message: string) => {
    try { await admin.from('function_errors').insert({ fn: 'inbox-release', kind, status, user_id: userId, message: message.slice(0, 280) }) } catch { /* best-effort */ }
  }
  // Back of the queue, one try more (a daily-limit stop doesn't count as a try: it isn't the email's fault)
  const putBack = async (h: any, countTry: boolean) => {
    const attempts = (h.attempts || 0) + (countTry ? 1 : 0)
    if (attempts >= MAX_ATTEMPTS) {
      out.failed++
      await logError('held_email_dropped', null, `dropped after ${attempts} tries`)
      return
    }
    const { error } = await admin.from('held_inbox_emails').upsert({
      user_id: userId, email_id: h.email_id, from_domain: h.from_domain ?? null, subject: h.subject ?? null,
      received_at: new Date().toISOString(), attempts,
    }, { onConflict: 'user_id,email_id', ignoreDuplicates: true })
    if (error) { out.failed++; await logError('held_email_requeue_failed', null, error.message || 'requeue failed'); return }
    if (countTry) out.kept++
  }

  const { data: claimed, error: claimErr } = await admin.rpc('claim_held_emails', { p_user: userId, p_n: PER_CALL })
  if (claimErr) throw new Error(`claim_held_emails: ${claimErr.message}`)

  for (const h of (claimed || []) as any[]) {
    try {
      // Already filed (an earlier call got as far as the booking but not the cleanup): nothing to do
      const { data: dupe } = await admin.from('bookings').select('id').eq('created_by', userId).eq('raw_email_id', h.email_id).limit(1)
      if (dupe?.length) { out.filed++; continue }

      const email = await deps.fetchEmail(h.email_id)
      if (!email) { out.expired++; continue }   // Resend no longer has it: the member is told to forward it again

      const res = await ingestEmail(admin, profile, {
        subject: email.subject, fromAddress: email.from, bodyText: email.text, GEMINI_API_KEY: deps.GEMINI_API_KEY,
        loadAttachments: () => deps.fetchAttachments(h.email_id, email.attachments),
        emailId: h.email_id, released: true,
      })
      if (res.status === 429) { await putBack(h, false); out.limited = true; break }
      if (res.status >= 500) { await putBack(h, true); continue }
      if (!res.ok) { out.failed++; continue }   // refused for good (e.g. unreadable): the member can forward it again
      const body = await res.clone().json().catch(() => ({}))
      if (body?.ignored) out.ignored++; else out.filed++
    } catch (e) {
      await putBack(h, true)
      await logError('held_email_release_error', null, (e as Error).message || 'release error')
    }
    if (out.kept) break   // a temporary failure: stop here, the app tries again next time it opens
  }

  const { count } = await admin.from('held_inbox_emails').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  out.remaining = count || 0
  return out
}
