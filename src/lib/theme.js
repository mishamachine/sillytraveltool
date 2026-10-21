// Theme: 'system' follows prefers-color-scheme; 'light' / 'dark' are explicit choices.
// tokens.css does the work: no data-theme → media query decides; data-theme forces a theme.
import { Capacitor } from '@capacitor/core'

const KEY = 'stt_theme'
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function getSavedTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

export function saveTheme(pref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {}
}

export function systemPrefersDark() {
  return !!media?.matches
}

export function resolveDark(pref) {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark())
}

/** Applies the preference to <html> and the native status bar. Returns the resolved dark flag. */
export function applyTheme(pref) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  const dark = resolveDark(pref)
  const page = getComputedStyle(root).getPropertyValue('--surface-page').trim()
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && page) meta.setAttribute('content', page)
  syncStatusBar(dark, page)
  return dark
}

/** Calls back with the resolved dark flag whenever the OS theme changes. */
export function onSystemThemeChange(cb) {
  if (!media) return () => {}
  const handler = () => cb(media.matches)
  media.addEventListener?.('change', handler)
  return () => media.removeEventListener?.('change', handler)
}

// Native: status bar icons and background follow the theme.
async function syncStatusBar(dark, color) {
  try {
    if (!Capacitor.isNativePlatform()) return
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    if (color && Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color })
  } catch { /* status bar is cosmetic */ }
}
