// Member email rendering for admin-email (plain JS so scripts/test-email-template.mjs can run it in Node).
// Body format: plain text, blank line = new paragraph, **bold**, [link text](https://…), {{variables}}.
// Clay colours inline (email clients ignore stylesheets): terracotta #B24A17, ink #2A2520, page #F4EEE6.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function fill(text, vars) {
  return String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : ''))
}

// Inline markup on already-escaped text: [label](https://url) and **bold**; only http(s) links
function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" style="color:#B24A17;font-weight:600;">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export function bodyHtml(text) {
  return esc(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2A2520;">${inline(p).replace(/\n/g, '<br>')}</p>`).join('')
}

export function bodyText(text) {
  return String(text ?? '').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1')
}

/**
 * render({ subject, body, cta_label, cta_url }, vars, { kind, unsubscribeUrl, why }) → { subject, html, text }
 * Marketing emails carry an unsubscribe line; service emails say why they were sent. `why` replaces the default reason.
 */
export function render(tpl, vars, { kind, unsubscribeUrl, why }) {
  const subject = fill(tpl.subject, vars).replace(/\s+/g, ' ').trim()
  const body = fill(tpl.body, vars)
  const ctaUrl = fill(tpl.cta_url, vars)
  const cta = tpl.cta_label && /^https?:\/\//.test(ctaUrl)
    ? `<p style="margin:24px 0 8px;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#B24A17;color:#FFFDF9;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:14px;">${esc(fill(tpl.cta_label, vars))}</a></p>`
    : ''
  const reason = why || (kind === 'marketing'
    ? "You're getting this because you said yes to travel tips from Silly Travel Tool."
    : "You're getting this because you have a Silly Travel Tool account.")
  const foot = kind === 'marketing'
    ? `${esc(reason)} <a href="${esc(unsubscribeUrl)}" style="color:#6B6355;">Unsubscribe</a>.`
    : esc(reason)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4EEE6;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EEE6;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF9;border-radius:22px;">
<tr><td style="padding:28px 28px 8px;"><img src="https://sillytraveltool.com/apple-touch-icon.png" width="40" height="40" alt="Silly Travel Tool" style="border-radius:10px;display:block;"></td></tr>
<tr><td style="padding:12px 28px 24px;">${bodyHtml(body)}${cta}</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6B6355;">${foot}<br>Silly Travel Tool · B&amp;B Project Factory, 402 Grandey Way NE, Renton, WA 98056, USA</p>
</td></tr></table></body></html>`
  const text = `${bodyText(body)}${tpl.cta_label && ctaUrl ? `\n\n${fill(tpl.cta_label, vars)}: ${ctaUrl}` : ''}\n\n--\n${kind === 'marketing' ? `${why ? `${why}\n` : ''}Unsubscribe: ${unsubscribeUrl}` : reason}\nSilly Travel Tool · B&B Project Factory, 402 Grandey Way NE, Renton, WA 98056, USA`
  return { subject, html, text }
}
