import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useUIStore } from './uiStore'
import { checkAndAwardBadges } from './authStore'
import { compareTripStart, isUndated, bookingDates } from '../lib/trips'
import { pgQuote } from '../lib/postgrest'
import { track } from '../lib/analytics'

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
        .or(`user_id.eq.${pgQuote(user.id)},invited_email.eq.${pgQuote(user.email)}`)
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
        .sort(compareTripStart)

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
    // Opening a trip starts on Plan (a remembered Pack tab would start an AI packing run nobody asked for)
    if (trip && trip.id !== get().activeTrip?.id) useUIStore.getState().setTripTab('itinerary')
    set({ activeTrip: trip, bookings: [], activities: [] })
    if (trip) get().fetchTripDetail(trip.id)
  },

  fetchTripDetail: async (tripId) => {
    set({ loadingDetail: true })
    const [{ data: bookings }, { data: activities }] = await Promise.all([
      supabase.from('bookings').select('*').eq('trip_id', tripId).order('departure_time', { ascending: true }),
      supabase.from('trip_activities').select('*').eq('trip_id', tripId).order('date', { ascending: true })
    ])
    // A slower response for a trip that is no longer the open one must not overwrite it
    const open = get().activeTrip
    if (open && open.id !== tripId) { set({ loadingDetail: false }); return }
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
    track('trip_created', { country: sanitized.destination_country_code })
    // trips_created and other trip stats are recomputed server-side by DB triggers
    try {
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
          // trips_completed / days_abroad / countries_visited are recomputed server-side by DB triggers
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
    track('trip_deleted')
  },

  // BOOKINGS
  /**
   * Keep the trip's dates in step with its bookings, so a planning trip and the bookings that confirm it never
   * conflict: an undated trip takes the bookings' dates, and a dated one widens to cover a booking outside them
   * (the return flight added after the outbound one).
   */
  fillDatesIfUndated: async (tripId, bookings) => {
    const trip = get().trips.find(t => t.id === tripId) || (get().activeTrip?.id === tripId ? get().activeTrip : null)
    if (!trip) return
    const dates = bookings.flatMap(bookingDates).sort()
    if (!dates.length) return
    const start = isUndated(trip) || dates[0] < trip.start_date ? dates[0] : trip.start_date
    const end = isUndated(trip) || dates[dates.length - 1] > trip.end_date ? dates[dates.length - 1] : trip.end_date
    if (start === trip.start_date && end === trip.end_date) return
    try { await get().updateTrip(tripId, { start_date: start, end_date: end }) } catch { /* best-effort */ }
  },

  createBooking: async (tripId, bookingData, { fillDates = true } = {}) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('bookings')
      .insert({ ...bookingData, trip_id: tripId, created_by: user.id }).select().single()
    if (error) throw error
    if (fillDates) await get().fillDatesIfUndated(tripId, [data])
    track('booking_added', { type: bookingData.type || null, source: bookingData.source === 'email_import' ? 'email_import' : 'manual' })
    set(state => ({ bookings: [...state.bookings, data].sort((a, b) => {
      const da = a.departure_time || (a.check_in_date ? a.check_in_date + 'T12:00:00' : null) || '9999'
      const db = b.departure_time || (b.check_in_date ? b.check_in_date + 'T12:00:00' : null) || '9999'
      return da < db ? -1 : da > db ? 1 : 0
    }) }))
    // total_flights and other booking stats are recomputed server-side by DB triggers
    if (['flight', 'hotel', 'activity', 'other'].includes(bookingData.type) && user?.id) {
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
        // restaurants_added / museums_visited / activities_added are recomputed server-side by DB triggers
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
        supabase.from('bookings').select('*').eq('trip_id', tripId).order('departure_time', { ascending: true }),
        supabase.from('trip_activities').select('*').eq('trip_id', tripId).order('date', { ascending: true }),
      ])
      if (bookingsRes.error) throw bookingsRes.error
      if (activitiesRes.error) throw activitiesRes.error
      if (get().activeTrip?.id !== tripId) return // another trip was opened meanwhile
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
