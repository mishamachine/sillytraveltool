import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { checkAndAwardBadges } from './authStore'

export const useTripsStore = create((set, get) => ({
  trips: [], activeTrip: null, loading: false, error: null,
  bookings: [], activities: [], loadingDetail: false,

  fetchTrips: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      const { data: ownedTrips, error: ownedErr } = await supabase.from('trips')
        .select(`*, bookings(id, type, title, departure_time, check_in_date), trip_activities(id, title, date, is_completed)`)
        .eq('owner_id', user.id)
        .order('start_date', { ascending: true })
      if (ownedErr) throw ownedErr

      const ownedIds = (ownedTrips || []).map(t => t.id)
      let collaboratorsByTrip = {}
      if (ownedIds.length > 0) {
        const { data: collabData } = await supabase
          .from('trip_collaborators')
          .select('id, trip_id, user_id, role, status, invited_email')
          .in('trip_id', ownedIds)
        ;(collabData || []).forEach(c => {
          if (!collaboratorsByTrip[c.trip_id]) collaboratorsByTrip[c.trip_id] = []
          collaboratorsByTrip[c.trip_id].push(c)
        })
      }

      const ownedWithCollabs = (ownedTrips || []).map(t => ({
        ...t,
        trip_collaborators: collaboratorsByTrip[t.id] || [],
      }))

      const { data: collabRows } = await supabase
        .from('trip_collaborators')
        .select('trip_id, role')
        .or(`user_id.eq.${user.id},invited_email.eq.${user.email}`)
        .eq('status', 'accepted')
        .neq('role', 'owner')

      let sharedTrips = []
      if (collabRows && collabRows.length > 0) {
        const sharedIds = collabRows.map(r => r.trip_id).filter(id => !ownedIds.includes(id))
        if (sharedIds.length > 0) {
          const { data: sharedTripData } = await supabase.from('trips')
            .select(`*, bookings(id, type, title, departure_time, check_in_date), trip_activities(id, title, date, is_completed)`)
            .in('id', sharedIds)

          const { data: sharedCollabData } = await supabase
            .from('trip_collaborators')
            .select('id, trip_id, user_id, role, status, invited_email')
            .in('trip_id', sharedIds)
          const sharedCollabsByTrip = {}
          ;(sharedCollabData || []).forEach(c => {
            if (!sharedCollabsByTrip[c.trip_id]) sharedCollabsByTrip[c.trip_id] = []
            sharedCollabsByTrip[c.trip_id].push(c)
          })

          sharedTrips = (sharedTripData || []).map(t => {
            const myCollab = collabRows.find(r => r.trip_id === t.id)
            return {
              ...t,
              trip_collaborators: sharedCollabsByTrip[t.id] || [],
              _myRole: myCollab?.role,
              _isShared: true,
            }
          })
        }
      }

      const allTrips = [...ownedWithCollabs, ...sharedTrips]
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))

      set({ trips: allTrips })

      // Restore activeTrip if one was open before refresh
      try {
        const savedId = sessionStorage.getItem('stt_active_trip_id')
        if (savedId) {
          const match = allTrips.find(t => t.id === savedId)
          if (match) {
            set({ activeTrip: match })
            get().fetchTripDetail(match.id)
          }
        }
      } catch {}
    } catch (e) {
      set({ error: e.message })
    } finally {
      set({ loading: false })
    }
  },

  setActiveTrip: (trip) => {
    try {
      if (trip) sessionStorage.setItem('stt_active_trip_id', trip.id)
      else sessionStorage.removeItem('stt_active_trip_id')
    } catch {}
    set({ activeTrip: trip, bookings: [], activities: [] })
    if (trip) get().fetchTripDetail(trip.id)
  },

  fetchTripDetail: async (tripId) => {
    set({ loadingDetail: true })
    const [{ data: bookings }, { data: activities }] = await Promise.all([
      supabase.from('bookings').select('*').eq('trip_id', tripId).order('departure_time', { ascending: true }),
      supabase.from('trip_activities').select('*').eq('trip_id', tripId).order('date', { ascending: true })
    ])
    set({ bookings: bookings || [], activities: activities || [], loadingDetail: false })
  },

  createTrip: async (tripData) => {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not signed in — please refresh and try again')
    // Ensure country code is uppercase and non-empty
    const sanitized = {
      ...tripData,
      destination_country_code: (tripData.destination_country_code || 'XX').toUpperCase().slice(0, 2),
      destination_country: tripData.destination_country || '',
      status: 'planning',
    }
    const { data, error } = await supabase.from('trips').insert({ ...sanitized, owner_id: user.id }).select().single()
    if (error) {
      console.error('createTrip Supabase error:', error)
      throw new Error(error.message || 'Could not create trip — check your connection and try again')
    }
    set(state => ({ trips: [...state.trips, { ...data, trip_collaborators: [] }] }))
    try {
      await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'trips_created', p_amount: 1 })
      await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
      await useAuthStore.getState().fetchStats()
    } catch {}
    return data
  },

  updateTrip: async (id, updates) => {
    const { data, error } = await supabase.from('trips')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    set(state => ({
      trips: state.trips.map(t => t.id === id ? data : t),
      activeTrip: state.activeTrip?.id === id ? data : state.activeTrip
    }))
    if (updates.status === 'completed') {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const nights = data.end_date && data.start_date
            ? Math.round((new Date(data.end_date) - new Date(data.start_date)) / (1000 * 60 * 60 * 24))
            : 0
          await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'trips_completed', p_amount: 1 })
          if (nights > 0) await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'days_abroad', p_amount: nights })
          if (data.destination_country_code) await supabase.rpc('upsert_visited_country', { p_user_id: user.id, p_country: data.destination_country_code })
          await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
        }
      } catch {}
    }
    return data
  },

  deleteTrip: async (id) => {
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) throw error
    set(state => ({ trips: state.trips.filter(t => t.id !== id), activeTrip: state.activeTrip?.id === id ? null : state.activeTrip }))
  },

  // BOOKINGS
  createBooking: async (tripId, bookingData) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('bookings')
      .insert({ ...bookingData, trip_id: tripId, created_by: user.id }).select().single()
    if (error) throw error
    set(state => ({ bookings: [...state.bookings, data].sort((a, b) => {
      const da = a.departure_time || (a.check_in_date ? a.check_in_date + 'T12:00:00' : null) || '9999'
      const db = b.departure_time || (b.check_in_date ? b.check_in_date + 'T12:00:00' : null) || '9999'
      return da < db ? -1 : da > db ? 1 : 0
    }) }))
    if (bookingData.type === 'flight' && user?.id) {
      try {
        await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'total_flights', p_amount: 1 })
        await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
        await useAuthStore.getState().fetchStats()
      } catch {}
    } else if (bookingData.type === 'hotel' && user?.id) {
      try {
        await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'hotels_booked', p_amount: 1 })
        await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
        await useAuthStore.getState().fetchStats()
      } catch {}
    } else if ((bookingData.type === 'activity' || bookingData.type === 'other') && user?.id) {
      try {
        await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
        await useAuthStore.getState().fetchStats()
      } catch {}
    }
    return data
  },

  updateBooking: async (id, updates) => {
    const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select().single()
    if (error) throw error
    set(state => ({ bookings: state.bookings.map(b => b.id === id ? data : b) }))
    return data
  },

  deleteBooking: async (id) => {
    const { error } = await supabase.from('bookings').delete().eq('id', id)
    if (error) throw error
    set(state => ({ bookings: state.bookings.filter(b => b.id !== id) }))
  },

  // ACTIVITIES
  createActivity: async (tripId, activityData) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('trip_activities')
      .insert({ ...activityData, trip_id: tripId, created_by: user.id }).select().single()
    if (error) throw error
    set(state => ({ activities: [...state.activities, data] }))
    if (user?.id) {
      try {
        const field = activityData.category === 'food' ? 'restaurants_added'
          : activityData.category === 'museum' ? 'museums_visited'
          : 'activities_added'
        await supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: field, p_amount: 1 })
        await checkAndAwardBadges(user.id, useAuthStore.getState().session?.access_token)
        await useAuthStore.getState().fetchStats()
      } catch {}
    }
    return data
  },

  toggleActivity: async (id, completed) => {
    const { data, error } = await supabase.from('trip_activities')
      .update({ is_completed: completed }).eq('id', id).select().single()
    if (error) throw error
    set(state => ({ activities: state.activities.map(a => a.id === id ? data : a) }))
  },

  deleteActivity: async (id) => {
    const { error } = await supabase.from('trip_activities').delete().eq('id', id)
    if (error) throw error
    set(state => ({ activities: state.activities.filter(a => a.id !== id) }))
  },

  silentRefreshDetail: async (tripId) => {
    try {
      const [bookingsRes, activitiesRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('trip_id', tripId).order('start_date', { ascending: true }),
        supabase.from('trip_activities').select('*').eq('trip_id', tripId).order('date', { ascending: true }),
      ])
      if (bookingsRes.error) throw bookingsRes.error
      if (activitiesRes.error) throw activitiesRes.error
      set({ bookings: bookingsRes.data || [], activities: activitiesRes.data || [] })
    } catch (err) {
      console.warn('[tripsStore] silentRefreshDetail error:', err.message)
    }
  },

  subscribeToTrip: (tripId) => {
    let debounceTimer = null
    const handleChange = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => get().silentRefreshDetail(tripId), 250)
    }
    const channel = supabase.channel(`trip-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings',        filter: `trip_id=eq.${tripId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_activities', filter: `trip_id=eq.${tripId}` }, handleChange)
      .subscribe()
    return () => { clearTimeout(debounceTimer); supabase.removeChannel(channel) }
  }
}))
