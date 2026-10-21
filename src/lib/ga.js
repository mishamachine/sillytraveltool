import { Capacitor } from '@capacitor/core'

// GA4 for acquisition only: web production builds, never in the native app.
// The MODE check is a build-time constant, so dev and native builds contain no GA code at all.

let started = false

export function initGA() {
  if (import.meta.env.MODE === 'production') {
    if (started || typeof window === 'undefined') return
    try { if (Capacitor.isNativePlatform()) return } catch { /* treat as web */ }
    started = true
    const GA_ID = 'G-H7ZP1DBHN3'
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() { window.dataLayer.push(arguments) } // gtag needs the arguments object, not an array
    window.gtag('js', new Date())
    // Page views are sent manually on tab change (routing is Zustand state).
    window.gtag('config', GA_ID, { anonymize_ip: true, send_page_view: false })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    document.head.appendChild(s)
  }
}

export function gaPageView(tab) {
  if (import.meta.env.MODE === 'production') {
    if (!started || !window.gtag) return
    try {
      window.gtag('event', 'page_view', {
        page_title: tab,
        page_location: `${window.location.origin}/${tab}`,
        page_path: `/${tab}`,
      })
    } catch { /* ignore */ }
  }
}
