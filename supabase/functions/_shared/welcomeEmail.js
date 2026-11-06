// The welcome email new members get (send-welcome-email). Plain JS so scripts/test-email-template.mjs can run it in Node.
// Same house look as emailTemplate.js: tables plus inline styles so Gmail renders it; no emoji.
//
// Headline options (marketing picks; the first is used):
//   A. "Where to first, {name}?"                      (short, a question the CTA answers)
//   B. "Your first trip starts with one forwarded email."  (leads with the Goose inbox)
import { layout, FOOTER_LINE } from './emailTemplate.js'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// One display line: control characters and line breaks become spaces, capped so a long name cannot break the layout.
const cleanName = (v) => [...String(v ?? '')].map(c => { const n = c.codePointAt(0); return n < 32 || (n >= 127 && n <= 159) || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069) || n === 0xfeff ? ' ' : c }).join('').replace(/\s+/g, ' ').trim().slice(0, 40)

export const WELCOME_FEATURES = [
  { title: 'The Goose inbox', line: 'Forward any booking confirmation and it lands in your trip, times and all.' },
  { title: 'Day-by-day plans, with weather', line: 'Every day laid out in local time, with the forecast right beside it.' },
  { title: 'Fill my day', line: 'An empty afternoon? Goose suggests a plan you can keep or tweak.' },
  { title: 'HONK', line: 'Pick a mood, tap HONK, and Goose finds a great spot within walking distance.' },
]

const CTA_LABEL = 'Plan your first trip'
const CTA_URL = 'https://sillytraveltool.com'
const REASON = "You're getting this because you just created a Silly Travel Tool account."

export function welcomeEmail({ name, appUrl } = {}) {
  const ctaUrl = /^https?:\/\//.test(appUrl || '') ? appUrl : CTA_URL
  const first = cleanName(name) || 'Traveler'
  const subject = `Welcome to Silly Travel Tool, ${first}!`
  const headline = `Where to first, ${first}?`
  const intro = "Goose has the map out. Here's what's waiting for you."
  const rows = WELCOME_FEATURES.map((f, i) => `<tr>
<td width="36" valign="top" style="padding:0 0 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:#B24A17;border-radius:14px;color:#FFFDF9;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:28px;">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:0 0 18px 8px;"><p style="margin:0 0 2px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.35;font-weight:700;color:#2A2520;">${esc(f.title)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:#6B6355;">${esc(f.line)}</p></td>
</tr>`).join('\n')
  const inner = `<h1 style="margin:0 0 12px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:28px;line-height:1.2;color:#2A2520;">${esc(headline)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#2A2520;">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
</table>
<p style="margin:8px 0 8px;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#B24A17;color:#FFFDF9;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:14px;">${esc(CTA_LABEL)}</a></p>`
  const html = layout(subject, inner, esc(REASON))
  const text = `${headline}\n\n${intro}\n\n${WELCOME_FEATURES.map((f, i) => `${i + 1}. ${f.title}: ${f.line}`).join('\n')}\n\n${CTA_LABEL}: ${ctaUrl}\n\n--\n${REASON}\n${FOOTER_LINE}`
  return { subject, html, text }
}
