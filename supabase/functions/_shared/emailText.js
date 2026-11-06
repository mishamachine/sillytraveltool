// An inbound email made fit for the AI, losslessly: HTML becomes light markdown (tables as | cell | rows, headings,
// lists, link text with host and path), and only pure noise goes (style, script, head, attributes, images and tracking
// pixels, tracking query strings, extra whitespace). Entities and quoted-printable leftovers are decoded. Nothing is cut
// by content: the prompt tells the AI to ignore marketing, legal text and reply history, and to find the booking
// anywhere, however deep in a forwarded chain. Plain JS so node tests import it.

/** Safety cap on the cleaned email text (about 25k-30k tokens): far inside DeepSeek's and Gemini's context windows. */
export const MAX_EMAIL_CHARS = 100000

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', euro: '€',
  pound: '£', yen: '¥', copy: '©', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»',
  middot: '·', bull: '•', deg: '°', times: '×', rarr: '→', larr: '←', shy: '', zwnj: '', zwj: '' }
const ACCENTS = { acute: '́', grave: '̀', uml: '̈', circ: '̂', tilde: '̃', cedil: '̧', ring: '̊' }

/** "&eacute;", "&#233;", "&#xE9;" → "é" (unknown names left as they are). */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      try { return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m } catch { return m }
    }
    const k = e.toLowerCase()
    if (k in NAMED) return NAMED[k]
    const a = /^([a-z])(acute|grave|uml|circ|tilde|cedil|ring)$/i.exec(e)
    return a ? (a[1] + ACCENTS[a[2].toLowerCase()]).normalize('NFC') : m
  })
}

/**
 * Quoted-printable left in the text ("Reykjav=C3=ADk", "=\n" soft breaks) decoded as UTF-8. Only when it clearly is
 * quoted-printable (UTF-8 byte pairs, or soft line breaks with =3D / =20 codes), so "price=100" in a URL and a
 * "=====" rule stay as they are.
 */
export function decodeQuotedPrintable(s) {
  const t = String(s ?? '')
  const pairs = (t.match(/=[C-F][0-9A-F]=[89AB][0-9A-F]/g) || []).length
  // Soft line breaks count only alongside other quoted-printable codes: "======== FLIGHTS ========" is a heading
  const soft = /[^=\s]=\r?\n/.test(t) && /=(3D|20|09)/.test(t)
  if (!pairs && !soft) return t
  const joined = t.replace(/([^=])=\r?\n/g, '$1')
  if (!pairs) return joined
  return joined.replace(/(?:=[0-9A-F]{2})+/g, run => {
    const bytes = new Uint8Array(run.split('=').slice(1).map(h => parseInt(h, 16)))
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return run }
  })
}

/** A URL without its query string or fragment (tracking lives there): host and path are kept. */
export function shortUrl(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 60 ? `${u.pathname.slice(0, 60)}…` : u.pathname
    return `${u.hostname.replace(/^www\./, '')}${path === '/' ? '' : path}`
  } catch { return url }
}

const cellText = h => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\|/g, '/').trim()

/** HTML email → light markdown: tables as "| a | b |" rows, headings, lists, links as text (host/path), no images. */
export function htmlToText(html) {
  let s = decodeQuotedPrintable(String(html ?? ''))
  s = s.replace(/<(style|script|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    // Links: their text, and where they go (host and path, no tracking query)
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const text = cellText(inner)
      const to = /^https?:/i.test(href) ? shortUrl(decodeEntities(href)) : ''
      if (!text) return ''
      return to && !text.toLowerCase().includes(to.split('/')[0]) ? `${text} (${to})` : text
    })
    // Table rows: one line each, cells between pipes
    .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
      const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => cellText(m[1]))
      return cells.some(Boolean) ? `| ${cells.join(' | ')} |\n` : '\n'
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n${'#'.repeat(Number(n))} ${cellText(t)}\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|ul|ol|li|table|tbody|thead|tfoot|section|article|header|footer|blockquote|center)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return tidy(decodeEntities(s))
}

const tidy = s => s.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()

/** The email's text: the HTML part as light markdown (tables survive), unless the plain part says clearly more. */
export function bestText(text, html) {
  const t = String(text ?? '').trim()
  if (!html) return t
  const h = htmlToText(html)
  return !h || t.length > h.length * 2 ? t : h
}

/**
 * Text for the prompt: HTML (if any is left) as light markdown, entities and quoted-printable decoded, tracking query
 * strings dropped from URLs, whitespace collapsed; then the safety cap. Returns { text, before, after, capped }.
 */
export function prepareEmailText(raw, { max = MAX_EMAIL_CHARS } = {}) {
  const before = String(raw ?? '').length
  let s = decodeQuotedPrintable(String(raw ?? ''))
  s = /<(html|body|table|div|p|br|td)\b/i.test(s) ? htmlToText(s) : tidy(decodeEntities(s))
  s = s.replace(/https?:\/\/[^\s<>)"'\]]+/g, u => (/[?#]/.test(u) || u.length > 80 ? shortUrl(u) : u))
  const capped = s.length > max
  if (capped) s = s.slice(0, max)
  return { text: s, before, after: s.length, capped }
}

/** A date, a time or a booking word with a number: the body may hold a booking of its own, not just "see attached". */
export function looksLikeBooking(text) {
  return /(\b\d{1,2}:\d{2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b(booking|reservation|confirmation|itinerary|check[- ]?in)\b.*\d)/i.test(String(text ?? ''))
}
