import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useTripsStore } from './tripsStore'
import { track } from '../lib/analytics'

export const useCollabStore = create((set, get) => ({
  pendingInvites: [],
  loadingInvites: false,

  // Invitees can't read invite rows matched only by email (RLS), so accept-invite lists and answers them
  fetchPendingInvites: async () => {
    const { user } = useAuthStore.getState()
    if (!user) return
    set({ loadingInvites: true })
    try {
      const { data, error } = await supabase.functions.invoke('accept-invite', { body: { action: 'list' } })
      if (error) throw error
      set({ pendingInvites: data?.invites || [] })
    } catch (e) {
      console.error('fetchPendingInvites error', e)
    } finally {
      set({ loadingInvites: false })
    }
  },

  // Returns { success } or { success: false, error }; the invite stays listed until the function confirms
  respondToInvite: async (collaboratorId, accept) => {
    const { data, error } = await supabase.functions.invoke('accept-invite', { body: { collaboratorId, accept } })
    if (error || !data?.success) {
      let msg = data?.error
      try { msg = msg || (await error?.context?.json())?.error } catch { /* not JSON */ }
      console.error('respondToInvite error', msg || error)
      track('invite_respond_failed', { accept })
      return { success: false, error: msg || `Couldn't ${accept ? 'join' : 'decline'} the trip. Try again.` }
    }
    set(s => ({ pendingInvites: s.pendingInvites.filter(i => i.id !== collaboratorId) }))
    track(accept ? 'invite_accepted' : 'invite_declined', { source: 'list' })
    if (accept) await useTripsStore.getState().fetchTrips()
    return { success: true }
  },

  inviteCollaborator: async (tripId, email, role = 'collaborator', tripName = 'your trip') => {
    try {
      const { user } = useAuthStore.getState()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          inviteeEmail: email,
          tripId,
          role,
        },
      })

      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      track('invite_sent', { role })
      return { success: true, data }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },

  // Owner removes someone or cancels an invite; a traveler removing their own row leaves the trip (RLS allows both)
  removeCollaborator: async (collaboratorId) => {
    const { error } = await supabase.from('trip_collaborators').delete().eq('id', collaboratorId)
    if (error) throw error
    await useTripsStore.getState().fetchTrips()
  },

  setCollaboratorRole: async (collaboratorId, role) => {
    const { error } = await supabase.from('trip_collaborators').update({ role }).eq('id', collaboratorId)
    if (error) throw error
    track('collaborator_role_changed', { role })
    await useTripsStore.getState().fetchTrips()
  },
}))
