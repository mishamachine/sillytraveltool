import { Browser } from '@capacitor/browser'
import { isNative } from '../lib/authRedirect'

// The native WebView ignores target="_blank": open external http(s) links (maps, bookings,
// guide sources, Terms/Privacy) in the in-app browser instead. tel: and mailto: are left to Android.
let started = false

export function initExternalLinks() {
  if (!isNative || started) return
  started = true
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]')
    if (!a) return
    const url = a.href
    if (!/^https?:/i.test(url) || new URL(url).host === location.host) return
    e.preventDefault()
    Browser.open({ url }).catch(() => {})
  })
}
