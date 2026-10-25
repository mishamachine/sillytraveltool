import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

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
      // Server derives the user from the JWT; body.user_id is not sent
      body: JSON.stringify({}),
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
  // Set by a password-reset link (web: PASSWORD_RECOVERY event, native: deep link).
  // Keeps AuthScreen's "set new password" step up even though the link signs the user in.
  passwordRecovery: false,
  authError: null,   // deep-link sign-in failure, shown by AuthScreen
  inviteNonce: 0,    // bumped when an invite deep link arrives while already signed in

  setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),
  setAuthError: (authError) => set({ authError }),
  bumpInvite: () => set(state => ({ inviteNonce: state.inviteNonce + 1 })),

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
    // Supabase runs this callback while it holds its auth lock (sign-in, hourly token refresh). Every
    // supabase query waits for that lock, so awaiting one in here deadlocks the client and all data calls
    // hang until the app restarts. Keep the callback synchronous and do the profile work on the next tick.
    supabase.auth.onAuthStateChange((event, session) => {
      const prevUserId = get().user?.id
      set({ session, user: session?.user ?? null })
      if (event === 'PASSWORD_RECOVERY') set({ passwordRecovery: true })
      // Supabase also sends SIGNED_IN for a session it restores (page load, tab focus); count only real sign-ins
      if (event === 'SIGNED_IN' && session?.user && session.user.id !== prevUserId) {
        const provider = session.user.app_metadata?.provider
        track('sign_in', provider ? { provider } : {})
      }
      setTimeout(() => {
        if (session?.user) {
          // A token refresh doesn't need the profile reloaded; sign-in and first load do
          if (event === 'TOKEN_REFRESHED' && get().profileReady) return
          get().ensureProfile(session.user, session.access_token, event === 'SIGNED_IN').catch(e => console.error('ensureProfile', e))
        } else set({ profile: null, profileReady: false })
      }, 0)
    })
  },

  ensureProfile: async (user, accessToken, shouldCheckBadges = true) => {
    const { data: existing } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
    if (existing) {
      set({ profile: existing })
      if (shouldCheckBadges) await checkAndAwardBadges(user.id, accessToken)
      await get().fetchStats()
      set({ profileReady: true })
      return
    }
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Traveler'
    // The inbox address (booking_email_token) is made by the database on insert, never here
    const { data: newProfile } = await supabase.from('user_profiles')
      .insert({ id: user.id, display_name: displayName, avatar_url: user.user_metadata?.avatar_url || null })
      .select().single()
    if (newProfile) {
      set({ profile: newProfile })
      track('sign_up', { provider: user.app_metadata?.provider || 'email' })
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

  // A new Goose inbox address; the old one stops working at once. The server makes the token.
  rotateInboxAddress: async () => {
    const { data: token, error } = await supabase.rpc('my_rotate_inbox_token')
    if (error) throw error
    if (!token) throw new Error('Could not make a new address. Try again.')
    set(s => ({ profile: s.profile ? { ...s.profile, booking_email_token: token } : s.profile }))
    track('inbox_address_rotated')
    return token
  },

  signOut: async () => {
    // Must be written while the session is still valid (insert-own RLS); capped so sign-out never hangs.
    await Promise.race([track('sign_out'), new Promise(r => setTimeout(r, 1500))])
    await supabase.auth.signOut()
    set({ user: null, profile: null, session: null })
  }
}))
