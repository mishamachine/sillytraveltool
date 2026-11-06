// Analytics consent rules, kept free of app imports so they can be tested in plain Node.
// Visitors in the EU, EEA, UK or Switzerland start with usage stats OFF until they say yes; everyone else starts ON
// (the Settings switch turns it off). No IP lookups: the region comes from the browser's time zone and language.
// public/legal/consent.js (the banner on the static pages) repeats the same lists; scripts/test-consent.mjs checks they match.

export const PREF_KEY = 'stt_analytics'
export const CONSENT_EVENT = 'stt-consent-change'

// EU 27, EEA (Iceland, Liechtenstein, Norway), UK, Switzerland
export const CONSENT_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
]

// Europe/* zones that are clearly outside the group
export const NON_CONSENT_ZONES = [
  'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Kirov', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Astrakhan',
  'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Simferopol', 'Europe/Minsk', 'Europe/Istanbul',
]
// Non-Europe/* zones that belong to the group (Canaries, Madeira, Azores, Ceuta, Iceland)
export const EXTRA_CONSENT_ZONES = ['Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Africa/Ceuta', 'Atlantic/Reykjavik']

/** The region part of a language tag: 'de-AT' -> 'AT', 'en' -> null, 'zh-Hant-TW' -> 'TW'. */
export function languageRegion(tag) {
  const m = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?:[-_]|$)/i.exec(String(tag || ''))
  return m ? m[1].toUpperCase() : null
}

/** True when the time zone or any browser language region says EU/EEA/UK/CH. env = { timeZone, languages } */
export function isConsentRegion(env = browserEnv()) {
  const tz = env?.timeZone || ''
  if (EXTRA_CONSENT_ZONES.includes(tz)) return true
  if (tz.startsWith('Europe/') && !NON_CONSENT_ZONES.includes(tz)) return true
  return (env?.languages || []).some(l => CONSENT_COUNTRIES.includes(languageRegion(l)))
}

export function browserEnv() {
  let timeZone = ''
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* no Intl */ }
  let languages = []
  try { languages = Array.from(navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean) } catch { /* no navigator */ }
  return { timeZone, languages }
}

/** The stored choice: 'on', 'off' or null when none was made. */
export function readPref() {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch { return null }
}

export function writePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event(CONSENT_EVENT)) } catch { /* no window */ }
}

/** Whether usage stats are on. A saved choice wins; with none, EU/EEA/UK/CH and DNT/GPC browsers start off. */
export function resolveEnabled({ pref, region, browserNo }) {
  if (pref === 'on') return true
  if (pref === 'off') return false
  if (browserNo) return false
  return !region
}

/** The banner is for people in the region who have not chosen yet. */
export function needsChoice({ pref, region }) {
  return region && pref == null
}

/** Google Consent Mode v2 starting state. Only 'region' visitors can get here before saying yes (they start denied). */
export function consentDefaults(region) {
  return {
    analytics_storage: region ? 'denied' : 'granted',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  }
}
