import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

// The member's plan (docs/STRIPE_BILLING.md, plan A). The server decides access (entitlement(), free-limit triggers);
// this copy only drives the UI: badges, locks and the paywall sheet.
// plan: my_entitlement() → { plan: 'free' | 'first_class', until, web, store, limits_on }
export const usePlanStore = create((set, get) => ({
  plan: null,
  paywall: null,        // open paywall: { trigger }
  autoShown: false,     // automatic triggers show the paywall once per session

  load: async () => {
    const { data, error } = await supabase.rpc('my_entitlement')
    if (!error && data) set({ plan: data })
    return data
  },
  clear: () => set({ plan: null, paywall: null, autoShown: false }),

  // trigger: short code for analytics (settings, limit_trips, limit_reservations, limit_emails, handwritten_import, …).
  // auto: opened by the app rather than a tap; never twice in one session.
  openPaywall: (trigger, { auto = false } = {}) => {
    if (auto && get().autoShown) return false
    set({ paywall: { trigger }, autoShown: get().autoShown || auto })
    return true
  },
  closePaywall: () => set({ paywall: null }),
}))

export const isFirstClass = (plan) => plan?.plan === 'first_class'

/** A free-plan limit error from the server: trigger `upgrade:<feature>` or an Edge Function `{ code: 'upgrade', feature }`. */
export function upgradeFeature(err) {
  const m = /upgrade:([a-z_]+)/.exec(err?.message || '')
  if (m) return m[1]
  return err?.code === 'upgrade' ? err.feature || 'limit' : null
}

/** Opens the paywall for a limit error and returns a calm error for the form; other errors pass through. */
export function upgradeError(err) {
  const feature = upgradeFeature(err)
  if (!feature) return err
  usePlanStore.getState().openPaywall(`limit_${feature}`)
  track('limit_hit', { feature })
  const e = new Error(LIMIT_COPY[feature] || 'That’s past the free plan. First Class lifts the limit.')
  e.upgrade = feature
  return e
}

const LIMIT_COPY = {
  trips: 'The free plan has 2 upcoming trips. First Class makes it unlimited.',
  reservations: 'The free plan has 5 reservations per trip. First Class makes it unlimited.',
}
