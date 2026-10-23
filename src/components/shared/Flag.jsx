import { useState } from 'react'

// Country flags as images (no emoji, brand rule), from flagcdn.com (allowed in the CSP img-src).
let byName = null
/** ISO alpha-2 code for a country name ("United States", "UK") or code; null when unknown. */
export function countryCode(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase()
  if (!byName) {
    byName = new Map([['uk', 'GB'], ['usa', 'US'], ['us', 'US'], ['united states of america', 'US'], ['great britain', 'GB']])
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' })
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b)
        const name = names.of(code)
        if (name && name !== code) byName.set(name.toLowerCase(), code)
      }
    } catch { /* old browsers: names only from the short list */ }
  }
  return byName.get(v.toLowerCase()) || null
}

/** A small flag for a country code or name; renders nothing when unknown or the image fails. */
export default function Flag({ country, size = 24, className }) {
  const [failed, setFailed] = useState(false)
  const cc = countryCode(country)
  if (!cc || failed) return null
  return (
    <img src={`https://flagcdn.com/${cc.toLowerCase()}.svg`} alt="" aria-hidden="true" width={Math.round(size * 4 / 3)} height={size}
      className={`c-flag ${className || ''}`} loading="lazy" onError={() => setFailed(true)} />
  )
}
