// One-time onboarding flag (localStorage, per device).
export const ONBOARDED_KEY = 'stt_onboarded'

export function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, '1') } catch {}
}
