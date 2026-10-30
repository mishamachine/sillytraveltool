import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { useAuthStore } from './authStore'
import { Capacitor } from '@capacitor/core'
import { AI_CONSENT_VERSION, AI_CONSENT_ROUTING, consentCurrent } from '../lib/aiConsentPolicy'

const platform = () => { try { return Capacitor.getPlatform() } catch { return 'web' } }
const SOURCES = { tour: 'tour', settings: 'settings' }  // anything else is the sheet

// Goose's AI reading permission (Apple 5.1.2(i), legal review L1): asked once in the tour, or at the first import or
// typed translation. Stored on the profile (ai_consent_at, through my_record_ai_consent); the server checks it too.
// Forwarded emails that arrive before the yes wait in held_inbox_emails and are filed by inbox-release after it.
export { AI_CONSENT_VERSION } from '../lib/aiConsentPolicy'

// A yes to older wording or routing counts as no: the member is asked again
export const hasAiConsent = () => consentCurrent(useAuthStore.getState().profile)

export const useConsentStore = create((set, get) => ({
  asking: null,   // { reason, resolve } while the Allow sheet is open
  saving: false,
  saveError: null,
  held: 0,        // forwarded emails waiting for the yes
  releasing: false,
  released: null, // { filed, ignored, expired, failed, kept, limited } after the last release, for one toast

  /** Resolves true when AI reading is allowed (asks first if needed), false on "Not now". */
  ensure: (reason) => {
    if (hasAiConsent()) return Promise.resolve(true)
    get().asking?.resolve(false)
    return new Promise(resolve => set({ asking: { reason, resolve } }))
  },

  answer: async (yes) => {
    const { asking } = get()
    if (yes) {
      // The sheet stays open on a failed save, with the message
      set({ saving: true, saveError: null })
      try { await get().setConsent(true, asking?.reason) } catch {
        set({ saving: false, saveError: 'Couldn’t save that. Check your connection and try again.' }); return
      }
    } else {
      get().recordDeclined(asking?.reason)
    }
    set({ asking: null, saving: false, saveError: null })
    track('ai_consent_answer', { reason: asking?.reason || 'unknown', choice: yes ? 'allow' : 'not_now' })
    asking?.resolve(yes)
  },

  /** "Not now" is recorded too (best effort: the answer itself doesn't wait for the network). */
  recordDeclined: (where = 'sheet') => {
    record('declined', where).catch(() => {})
  },

  /** Settings switch, the tour step and the sheet all land here: on = granted, off = withdrawn (one tap, at once). */
  setConsent: async (on, where = 'settings') => {
    const at = await record(on ? 'granted' : 'withdrawn', where)
    if (on && at == null) throw new Error('No answer from the server')
    useAuthStore.setState(s => ({ profile: s.profile ? { ...s.profile, ai_consent_at: on ? at : null, ai_consent_version: on ? AI_CONSENT_VERSION : null, ai_consent_routing: on ? AI_CONSENT_ROUTING : null } : s.profile }))
    track('ai_consent', { on, where })
    if (on && get().held > 0) get().release()
  },

  loadHeld: async () => {
    const { count, error } = await supabase.from('held_inbox_emails').select('id', { count: 'exact', head: true })
    set({ held: error ? 0 : count || 0 })
  },

  /** Files the held emails, a few per call, until none are left. */
  release: async () => {
    if (get().releasing) return
    set({ releasing: true })
    const total = { filed: 0, ignored: 0, expired: 0, failed: 0, kept: 0, limited: false }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      for (let i = 0; i < 55; i++) {  // one email per call, at most 50 held
        const { data, error } = await supabase.functions.invoke('inbox-release', {
          body: JSON.stringify({}), headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        })
        if (error || !data) break
        for (const k of ['filed', 'ignored', 'expired', 'failed', 'kept']) total[k] += data[k] || 0
        total.limited = total.limited || !!data.limited
        set({ held: data.remaining || 0 })
        // Done, today's inbox limit is spent, or a temporary failure (retried next time the app opens)
        if (!data.remaining || data.limited || data.kept) break
      }
      track('inbox_released', total)
      set({ released: total })
      const { useTripsStore } = await import('./tripsStore')
      useTripsStore.getState().fetchTrips()
    } finally {
      set({ releasing: false })
      get().loadHeld()
    }
  },

  clearReleased: () => set({ released: null }),
}))

/** One answer to the server's record (my_record_ai_consent); returns the time it set, null unless granted. */
async function record(event, where) {
  const { data, error } = await supabase.rpc('my_record_ai_consent', {
    p_event: event, p_version: AI_CONSENT_VERSION, p_source: SOURCES[where] || 'sheet',
    p_platform: platform(), p_app_version: import.meta.env.VITE_APP_VERSION || null,
  })
  if (error) throw error
  return data
}
