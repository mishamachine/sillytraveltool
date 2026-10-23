// First Class (the paid plan, docs/PAYWALL_PLAN.md) isn't built yet: features reserved for it sit behind this flag.
// Off for everyone until the paywall lands; on in dev with localStorage stt_first_class=1, or for a build with
// VITE_FIRST_CLASS=1 (testing). The paywall will replace this with the entitlement record checked server-side.
export function hasFirstClass() {
  if (import.meta.env.VITE_FIRST_CLASS === '1') return true
  try { return import.meta.env.DEV && localStorage.getItem('stt_first_class') === '1' } catch { return false }
}

/** Features that need First Class, with the line shown when it's locked. */
export const FIRST_CLASS_FEATURES = {
  handwritten_import: 'Reading handwritten agendas is part of First Class, coming soon.',
}
