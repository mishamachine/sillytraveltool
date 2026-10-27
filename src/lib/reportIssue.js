import { Capacitor } from '@capacitor/core'
import { track } from './analytics'

// "Report an issue": a pre-filled email to the team. The footer carries only the version, platform and
// screen, never the member's email, trips or bookings.
export const REPORT_EMAIL = 'hello@sillytraveltool.com'

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.20.0'

function platform() {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

/** mailto link for a bug report; `where` is a short code for the screen it came from (profile, help, settings, tour). */
export function reportIssueHref(where) {
  const subject = `STT issue (${where})`
  const body = [
    'What happened:', '', '',
    'What you expected:', '', '',
    'A screenshot helps a lot, if you have one.', '',
    '--',
    `App v${APP_VERSION} · ${platform()} · ${where}`,
  ].join('\n')
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const trackReport = (where) => track('report_issue', { where })
