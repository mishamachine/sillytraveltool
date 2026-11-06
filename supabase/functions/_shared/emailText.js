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

/** Raw email text or HTML longer than this is cut before any parsing: every step after it is linear, but bounded too. */
export const MAX_RAW_CHARS = 300000

const SKIP = new Set(['style', 'script', 'head', 'title', 'noscript'])
const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'table', 'tbody', 'thead', 'tfoot', 'section', 'article', 'header', 'footer', 'blockquote', 'center'])
const HREF = /\bhref\s*=\s*["']([^"'>]*)["']/i

/**
 * HTML email → light markdown: tables as "| a | b |" rows, headings, lists, links as text (host/path), no images.
 * One pass over the tags (indexOf only, no regex spanning the document), so an unclosed tag can't make it slow.
 */
export function htmlToText(html) {
  const s = decodeQuotedPrintable(String(html ?? '').slice(0, MAX_RAW_CHARS))
  const lower = s.toLowerCase()
  const unclosed = new Set()
  const out = []
  let row = null, cell = null, link = null // open table row (cells), cell text, link { href, text }
  const emit = t => {
    if (link) link.text.push(t)
    else if (cell) cell.push(t)
    else out.push(t)
  }
  let i = 0
  while (i < s.length) {
    const lt = s.indexOf('<', i)
    if (lt < 0) { emit(s.slice(i)); break }
    if (lt > i) emit(s.slice(i, lt))
    if (s.startsWith('<!--', lt)) { const end = s.indexOf('-->', lt + 4); i = end < 0 ? s.length : end + 3; continue }
    const gt = s.indexOf('>', lt + 1)
    if (gt < 0) { emit(s.slice(lt + 1)); break } // a stray "<": keep the text after it
    const tag = s.slice(lt + 1, gt)
    i = gt + 1
    const m = /^(\/?)\s*([a-z][a-z0-9]*)/i.exec(tag)
    if (!m) { emit(`<${tag}>`); continue }
    const close = m[1] === '/', name = m[2].toLowerCase()
    if (SKIP.has(name) && !close) {
      // Skip to its closing tag; once one is known to be missing, it's missing for every later tag of that name too
      const end = unclosed.has(name) ? -1 : lower.indexOf(`</${name}`, i)
      if (end < 0) unclosed.add(name); else i = s.indexOf('>', end) + 1 || s.length
      continue
    }
    if (name === 'img') continue
    if (name === 'a') {
      if (!close) { const h = HREF.exec(tag); link = { href: h ? decodeEntities(h[1]) : '', text: [] }; continue }
      if (link) {
        const text = flat(link.text.join(' ')), to = /^https?:/i.test(link.href) ? shortUrl(link.href) : ''
        link = null
        if (text) emit(to && !text.toLowerCase().includes(to.split('/')[0]) ? `${text} (${to})` : text)
      }
      continue
    }
    if (name === 'tr') {
      if (row) { if (cell) row.push(flat(cell.join(' '))); if (row.some(Boolean)) out.push(`\n| ${row.join(' | ')} |\n`) }
      row = close ? null : []; cell = null
      continue
    }
    if (name === 'td' || name === 'th') {
      if (row && cell) row.push(flat(cell.join(' ')))
      cell = !close && row ? [] : null
      continue
    }
    if (/^h[1-6]$/.test(name)) { emit(close ? '\n' : `\n${'#'.repeat(Number(name[1]))} `); continue }
    if (name === 'li') { if (!close) emit('\n- '); continue }
    if (name === 'br') { emit(cell ? ' ' : '\n'); continue }
    if (BLOCK.has(name)) { if (cell) emit(' '); else { if (row && name === 'table' && close) { row = null } out.push('\n') } continue }
    emit(' ')
  }
  if (row) { if (cell) row.push(flat(cell.join(' '))); if (row.some(Boolean)) out.push(`\n| ${row.join(' | ')} |\n`) }
  return tidy(decodeEntities(out.join('')))
}
const flat = t => t.replace(/\s+/g, ' ').replace(/\|/g, '/').trim()

const tidy = s => s.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()

/** The email's text: the HTML part as light markdown (tables survive), unless the plain part says clearly more. */
export function bestText(text, html) {
  const t = String(text ?? '').slice(0, MAX_RAW_CHARS).trim()
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
  let s = decodeQuotedPrintable(String(raw ?? '').slice(0, MAX_RAW_CHARS))
  s = /<(html|body|table|div|p|br|td)\b/i.test(s) ? htmlToText(s) : tidy(decodeEntities(s))
  s = s.replace(/https?:\/\/[^\s<>)"'\]]+/g, u => (/[?#]/.test(u) || u.length > 80 ? shortUrl(u) : u))
  const capped = s.length > max || before > MAX_RAW_CHARS
  if (capped) s = s.slice(0, max)
  return { text: s, before, after: s.length, capped }
}

/** A date, a time or a booking word with a number: the body may hold a booking of its own, not just "see attached". */
export function looksLikeBooking(text) {
  return /(\b\d{1,2}:\d{2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b(booking|reservation|confirmation|itinerary|check[- ]?in)\b[^\n]{0,200}\d)/i.test(String(text ?? '').slice(0, MAX_RAW_CHARS))
}
