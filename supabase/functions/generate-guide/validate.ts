// Guards for the shared guide cache (audit S3). Pure functions, no Deno APIs: scripts/test-guide-validation.mjs
// bundles this file and throws hostile input at it.
//
// Everything the AI writes is shown to every member who opens the same city, so nothing reaches
// guide_cache_sections until it passes through here: place names from Google only, links only to hosts we trust,
// text capped and stripped of control characters.

// Letters (any script, with accents), spaces, hyphens, apostrophes and periods. No digits, commas, quotes,
// brackets, slashes or newlines: nothing that reads as an instruction or breaks out of the prompt.
const PLACE_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u
const MAX_PLACE_NAME = 60

/** The trimmed name when it is a plausible city or country name, else null. */
export function validPlaceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!s || s.length > MAX_PLACE_NAME || !PLACE_NAME.test(s)) return null
  if (s.split(' ').length > 6) return null // "Paris ignore previous instructions and ..." is not a city
  return s
}

/** "São Paulo" → "são-paulo": the same shape the app's guideStore uses, so its direct cache reads still hit. */
export const slug = (s: string) => s.toLowerCase().replace(/ /g, '-')

type Geo = { city: string | null, country: string | null, country_code: string | null, address: string }

/**
 * The city as Google knows it, plus the cache key. The prompt and the key both come from here, never from the
 * request body, so a guide is always about the place its key names.
 */
export function canonicalPlace(geo: Geo | null): { city: string, country: string, key: string } | null {
  if (!geo) return null
  // Islands and regions ("Bali") have no locality: the first part of Google's formatted address is the name
  const city = validPlaceName(geo.city) || validPlaceName((geo.address || '').split(',')[0])
  const country = validPlaceName(geo.country)
  const code = typeof geo.country_code === 'string' && /^[A-Z]{2}$/.test(geo.country_code) ? geo.country_code : null
  if (!city || !country || !code) return null
  return { city, country, key: `${slug(city)}-${slug(code)}` }
}

// ── Links ─────────────────────────────────────────────────────────────────────

// Any subdomain of these (en.wikipedia.org, fr.m.wikipedia.org, ...)
const LINK_SUFFIXES = ['wikipedia.org']
// Exactly these hosts: reference sites, official national and city tourism boards, big-city transit operators
export const LINK_HOSTS = new Set([
  'www.britannica.com',
  // national tourism boards
  'www.japan.travel', 'www.visitbritain.com', 'www.france.fr', 'www.spain.info', 'www.italia.it', 'www.germany.travel',
  'www.visitportugal.com', 'www.holland.com', 'www.myswitzerland.com', 'www.austria.info', 'www.visitgreece.gr',
  'www.goturkiye.com', 'www.visitdenmark.com', 'www.visitsweden.com', 'www.visitnorway.com', 'www.visitfinland.com',
  'www.visiticeland.com', 'www.ireland.com', 'www.visitscotland.com', 'www.czechtourism.com', 'www.visitcroatia.com',
  'www.visittheusa.com', 'www.destinationcanada.com', 'www.visitmexico.com', 'www.australia.com', 'www.newzealand.com',
  'www.visitsingapore.com', 'www.tourismthailand.org', 'www.discoverhongkong.com', 'english.visitkorea.or.kr',
  'www.incredibleindia.gov.in', 'www.visitmorocco.com', 'www.southafrica.net', 'www.indonesia.travel',
  // city tourism boards
  'www.gotokyo.org', 'www.visitlondon.com', 'parisjetaime.com', 'www.barcelonaturisme.com', 'www.esmadrid.com',
  'www.visitlisboa.com', 'www.iamsterdam.com', 'www.visitberlin.de', 'www.wien.info', 'www.prague.eu',
  'www.romeandyou.org', 'www.visitcopenhagen.com', 'www.visitstockholm.com', 'www.nycgo.com', 'www.sftravel.com',
  'www.discoverlosangeles.com', 'www.choosechicago.com', 'www.visitdubai.com', 'www.kyoto.travel',
  // transit operators the "Getting around" section links to
  'tfl.gov.uk', 'www.ratp.fr', 'new.mta.info', 'www.mta.info', 'www.tokyometro.jp', 'www.jreast.co.jp',
  'www.bvg.de', 'www.gvb.nl', 'www.metrolisboa.pt', 'www.tmb.cat', 'www.metromadrid.es', 'www.atac.roma.it',
  'www.wienerlinien.at', 'www.sbb.ch', 'www.mtr.com.hk', 'www.transitlink.com.sg',
])

/** https URL (host lowercased, no fragment, no trailing slash), or null when it is not a plain web link. */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s || s.length > 500 || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(s)) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null // javascript:, data:, file:, intent: ...
  if (u.username || u.password || u.port) return null // https://www.wien.info@evil.example, odd ports
  u.protocol = 'https:'
  u.hash = ''
  return u.toString().replace(/\/$/, '')
}

const hostOf = (url: string) => new URL(url).hostname.toLowerCase()

export function allowedHost(host: string): boolean {
  if (LINK_HOSTS.has(host)) return true
  return LINK_SUFFIXES.some(s => host === s || host.endsWith(`.${s}`))
}

/**
 * A link the AI wrote, kept only when it is Google's own website for this place (`googleSite`) or points at an
 * allow-listed host. Anything else becomes '' so the app hides the button.
 */
export function validLink(value: unknown, googleSite?: string | null): string {
  const url = normalizeUrl(value)
  if (!url) return ''
  const google = normalizeUrl(googleSite)
  if (google && url === google) return url
  return allowedHost(hostOf(url)) ? url : ''
}

// ── Text ──────────────────────────────────────────────────────────────────────

// C0/C1 controls except tab and newline, zero-width and bidi overrides (they reorder text on screen)
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g

export const FIELD_CAPS: Record<string, number> = {
  name: 120, description: 600, address: 300,
  history: 3000, overview: 1200, summary: 600,
  photo: 1000, // a Places photo resource name, not a URL; they run long
}
const DEFAULT_CAP = 300

export function cleanText(value: unknown, max = DEFAULT_CAP): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL, '').replace(/\r\n?/g, '\n').trim().slice(0, max)
}

const MAX_ITEMS = 60 // per array: a section never needs more
const MAX_DEPTH = 6

// Fields only Google may set. The AI writing them (a fake place_id to borrow a trusted site, a tracking "photo",
// a maps_url through a redirect) gets them dropped.
const GOOGLE_KEYS = new Set(['place_id', 'photo', 'maps_url', 'lat', 'lng', 'hours', 'rating', 'rating_count'])

/** Google's own Maps link for a place, or ''. Never google.com/url (an open redirect). */
export function validMapsLink(value: unknown): string {
  const url = normalizeUrl(value)
  if (!url) return ''
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  if (host === 'maps.google.com') return url
  return (host === 'www.google.com' || host === 'google.com') && u.pathname.startsWith('/maps') ? url : ''
}

/**
 * Walk a section and return a cache-safe copy: every *_url through validLink, every other string through
 * cleanText with its field cap, numbers kept only when finite, arrays cut to MAX_ITEMS, anything deeper than
 * MAX_DEPTH dropped.
 *   fromAi: the AI wrote it, so Google-only fields are dropped.
 *   googleSites: place_id → Google websiteUri, for the cards built from Google, so their "Official site" and
 *   Maps link survive.
 */
export function sanitizeSection(data: unknown, { fromAi = true, googleSites = new Map<string, string | null>() } = {}): any {
  const walk = (v: unknown, key: string, depth: number, place: { site: string | null } | null): unknown => {
    if (depth > MAX_DEPTH) return undefined
    if (typeof v === 'string') {
      if (key === 'maps_url') return place ? validMapsLink(v) : ''
      return /_url$/i.test(key) ? validLink(v, place?.site) : cleanText(v, FIELD_CAPS[key] ?? DEFAULT_CAP)
    }
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'boolean' || v === null) return v
    if (Array.isArray(v)) return v.slice(0, MAX_ITEMS).map(x => walk(x, key, depth + 1, null)).filter(x => x !== undefined)
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      const own = !fromAi && typeof o.place_id === 'string' && googleSites.has(o.place_id)
        ? { site: googleSites.get(o.place_id) ?? null } : null
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(o).slice(0, 60)) {
        if (!/^[a-z_][a-z0-9_]{0,40}$/i.test(k) || (fromAi && GOOGLE_KEYS.has(k))) continue
        const w = walk(x, k, depth + 1, own)
        if (w !== undefined) out[k] = w
      }
      return out
    }
    return undefined
  }
  return walk(data, '', 0, null)
}

/**
 * Names to steer a "load more" away from: only names already in the cached section (the request's list is a
 * trigger, never prompt text). Newest last, at most `max`.
 */
export function excludeFromCache(items: unknown, max = 60): string[] {
  if (!Array.isArray(items)) return []
  return items.map(it => cleanText((it as any)?.name, 120)).filter(Boolean).slice(-max)
}
