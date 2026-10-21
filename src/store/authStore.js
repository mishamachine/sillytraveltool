import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// Call Edge Function to check and award badges server-side
async function checkAndAwardBadges(userId, accessToken) {
  try {
    let token = accessToken
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      token = session.access_token
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    await fetch(`${supabaseUrl}/functions/v1/check-badges`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    })
  } catch (e) {
    console.error('checkAndAwardBadges error', e)
  }
}

export { checkAndAwardBadges }

export const useAuthStore = create((set, get) => ({
  user: null, profile: null, session: null, loading: true,
  profileReady: false,
  stats: null, badges: [],

  fetchStats: async () => {
    const { user } = get()
    if (!user) return
    try {
      const [{ data: statsData }, { data: badgesData }] = await Promise.all([
        supabase.from('user_stats').select('*').eq('user_id', user.id).single(),
        supabase.from('user_badges').select('*').eq('user_id', user.id),
      ])
      if (statsData) set({ stats: statsData })
      if (badgesData) set({ badges: badgesData })
    } catch (e) { console.error('fetchStats error', e) }
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) { set({ session, user: session.user }); await get().ensureProfile(session.user, session.access_token, false) }
    set({ loading: false })
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null })
      if (session?.user) {
        const shouldCheckBadges = event === 'SIGNED_IN'
        await get().ensureProfile(session.user, session.access_token, shouldCheckBadges)
      }
      else set({ profile: null, profileReady: false })
    })
  },

  ensureProfile: async (user, accessToken, shouldCheckBadges = true) => {
    const { data: existing } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
    if (existing) {
      if (!existing.booking_email_token) {
        const tokenArr = new Uint8Array(4)
        crypto.getRandomValues(tokenArr)
        const token = Array.from(tokenArr).map(b => b.toString(16).padStart(2, '0')).join('')
        const { data: patched } = await supabase.from('user_profiles')
          .update({ booking_email_token: token }).eq('id', user.id).select().single()
        set({ profile: patched || existing })
      } else {
        set({ profile: existing })
      }
      if (shouldCheckBadges) await checkAndAwardBadges(user.id, accessToken)
      await get().fetchStats()
      set({ profileReady: true })
      return
    }
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Traveler'
    const tokenArr = new Uint8Array(4)
    crypto.getRandomValues(tokenArr)
    const bookingEmailToken = Array.from(tokenArr).map(b => b.toString(16).padStart(2, '0')).join('')
    const { data: newProfile } = await supabase.from('user_profiles')
      .insert({ id: user.id, display_name: displayName, avatar_url: user.user_metadata?.avatar_url || null, booking_email_token: bookingEmailToken })
      .select().single()
    if (newProfile) {
      set({ profile: newProfile })
      await supabase.from('user_stats').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true }).select().single()
      // Fire welcome email — non-blocking, failure must never affect signup
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (currentSession?.access_token) {
        fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentSession.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName }),
        }).catch(() => {}) // intentionally swallowed
      }
    }
    if (shouldCheckBadges) await checkAndAwardBadges(user.id, accessToken)
    await get().fetchStats()
    set({ profileReady: true })
  },

  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) return
    const { data, error } = await supabase.from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user.id).select().single()
    if (error) throw error
    if (data) set({ profile: data })
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, session: null })
  }
}))
