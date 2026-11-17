// Service notice to a member when their Goose inbox dropped an email because of the sender check.
// Goes only to the member's own account address (never the sender). Carries the sender's DOMAIN and the date, nothing
// from the message, and no offer or marketing block.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const DROPPED_SUBJECT = "We didn't add an email sent to your Goose inbox"
export const DROPPED_TEMPLATE_KEY = 'inbox_dropped_sender'

/** "16 November 2026" (UTC) */
export function longDate(d = new Date()) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** A sender domain that is safe to print: letters, digits, dots and hyphens only, or null. */
export function safeDomain(domain) {
  const d = String(domain || '').toLowerCase()
  return /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(d) && d.includes('.') ? d : null
}

export function droppedSenderEmail({ domain, date, accountEmail }) {
  const paras = [
    `An email from ${domain} reached your Goose inbox on ${date}. Goose only reads mail you forward from ${accountEmail}, so it didn't add anything to your trips or send the email to AI.`,
    `If it was a booking you meant to send, forward it again from ${accountEmail}. If your airline or hotel sends to your Goose inbox directly, turn on Accept from any sender in Settings. Anyone who learns your address can then add bookings.`,
    `Don't recognise it? You don't need to do anything. You can get a new inbox address in Settings.`,
  ]
  const text = paras.join('\n\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px">${paras.map(p => `<p>${esc(p)}</p>`).join('')}</div>`
  return { subject: DROPPED_SUBJECT, text, html }
}
