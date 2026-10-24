import { usePlanStore, isFirstClass } from '../store/planStore'

// First Class (the paid plan, docs/PAYWALL_PLAN.md). The server decides access (entitlement()); this reads the member's
// plan as loaded by usePlanStore for the UI. Testing: VITE_FIRST_CLASS=1 builds, or localStorage stt_first_class=1 in dev.
export function hasFirstClass() {
  if (import.meta.env.VITE_FIRST_CLASS === '1') return true
  try { if (import.meta.env.DEV && localStorage.getItem('stt_first_class') === '1') return true } catch { /* storage off */ }
  return isFirstClass(usePlanStore.getState().plan)
}
