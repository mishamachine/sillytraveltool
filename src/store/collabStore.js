import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useTripsStore } from './tripsStore'
import { pgQuote } from '../lib/postgrest'

export const useCollabStore = create((set, get) => ({
  pendingInvites: [],
  loadingInvites: false,

  fetchPendingInvites: async () => {
    const { user } = useAuthStore.getState()
    if (!user) return
    set({ loadingInvites: true })
    try {
      const { data } = await supabase
        .from('trip_collaborators')
        .select(`*, trips(id, title, destination_city, destination_country, destination_country_code, start_date, end_date, owner_id)`)
        .or(`user_id.eq.${pgQuote(user.id)},invited_email.eq.${pgQuote(user.email)}`)
        .eq('status', 'pending')
        .neq('role', 'owner')
      set({ pendingInvites: data || [] })
    } catch (e) {
      console.error('fetchPendingInvites error', e)
    } finally {
      set({ loadingInvites: false })
    }
  },

  respondToInvite: async (collaboratorId, accept) => {
    try {
      const { user } = useAuthStore.getState()
      const { error } = await supabase
        .from('trip_collaborators')
        .update({
          status: accept ? 'accepted' : 'declined',
          user_id: user?.id,
          accepted_at: accept ? new Date().toISOString() : null,
        })
        .eq('id', collaboratorId)
      if (error) throw error
      set(s => ({ pendingInvites: s.pendingInvites.filter(i => i.id !== collaboratorId) }))
      if (accept) {
        await useTripsStore.getState().fetchTrips()
      }
    } catch (e) {
      console.error('respondToInvite error', e)
    }
  },

  inviteCollaborator: async (tripId, email, role = 'collaborator', tripName = 'your trip') => {
    try {
      const { user, profile } = useAuthStore.getState()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          inviteeEmail: email,
          tripId,
          tripName,
          inviterName: profile?.display_name || user.email?.split('@')[0] || 'Someone',
          role,
        },
      })

      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      return { success: true, data }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },

  removeCollaborator: async (collaboratorId) => {
    try {
      await supabase.from('trip_collaborators').delete().eq('id', collaboratorId)
    } catch (e) {
      console.error('removeCollaborator error', e)
    }
  },
}))
