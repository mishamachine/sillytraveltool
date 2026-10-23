import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useUIStore } from './uiStore'
import { checkAndAwardBadges } from './authStore'
import { compareTripStart, isUndated, bookingDates } from '../lib/trips'
import { daysBetween, findCurrentOrNextTrip } from '../lib/dates'
import { pgQuote } from '../lib/postgrest'
import { track } from '../lib/analytics'

const stopRuns = new Map() // tripId → { timer, chain }: see refreshStops

export const useTripsStore = create((set, get) => ({
  trips: [], activeTrip: null, loading: false, error: null,
  bookings: [], activities: [], loadingDetail: false,

  fetchTrips: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      const { data: ownedTrips, error: ownedErr } = await supabase.from('trips')
        .select(`*, bookings(id, type, title, departure_time, check_in_date), trip_activities(id, title, date, is_completed), trip_stops(*)`)
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
            .select(`*, bookings(id, type, title, departure_time, check_in_date), trip_activities(id, title, date, is_completed), trip_stops(*)`)
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
      // Stops of the trip you're on (or the next one): Today, the header and the tools read them, and an emailed
      // booking may have changed them since they were saved
      const current = findCurrentOrNextTrip(allTrips).trip
      if (current && current._myRole !== 'viewer') get().refreshStops(current.id)

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
    get().refreshStops(tripId, bookings || [])
  },

  /**
   * Re-derive a trip's stops from all its bookings (src/lib/stops.js) and save them when they changed. Stops the
   * traveller edited by hand (source 'manual') are kept as they are. Best-effort and quiet: a failure leaves the
   * saved stops.
   */
  refreshStops: (tripId, bookingsIn) => {
    // Several bookings saved in a row (an import) make one refresh, and refreshes of a trip never overlap
    const r = stopRuns.get(tripId) || { timer: null, chain: Promise.resolve() }
    stopRuns.set(tripId, r)
    clearTimeout(r.timer)
    return new Promise(resolve => {
      r.timer = setTimeout(() => { r.chain = r.chain.then(() => get()._refreshStops(tripId, bookingsIn)).then(resolve) }, 400)
    })
  },

  _refreshStops: async (tripId, bookingsIn) => {
    try {
      const trip = get().trips.find(t => t.id === tripId)
      if (!trip || trip._myRole === 'viewer') return
      const saved = trip.trip_stops || []
      if (saved.some(s => s.source === 'manual')) return
      const bookings = bookingsIn || (await supabase.from('bookings').select('*').eq('trip_id', tripId)).data || []
      const { computeStops, stopsChanged, homePoint } = await import('../lib/stops')
      const next = await computeStops(trip, bookings, { home: await homePoint(useAuthStore.getState().profile) })
      if (!stopsChanged(saved, next)) return
      await supabase.from('trip_stops').delete().eq('trip_id', tripId).eq('source', 'derived')
      let rows = []
      if (next.length) {
        const { data, error } = await supabase.from('trip_stops').insert(next.map(s => ({ ...s, trip_id: tripId, source: 'derived' }))).select()
        if (error) throw error
        rows = data || []
      }
      const withStops = t => (t.id === tripId ? { ...t, trip_stops: rows } : t)
      set(state => ({ trips: state.trips.map(withStops), activeTrip: state.activeTrip && withStops(state.activeTrip) }))
    } catch (e) { console.warn('refreshStops', e?.message || e) }
  },

  // via: 'form' | 'import' | 'one_tap' (analytics only)
  createTrip: async (tripData, { via = 'form' } = {}) => {
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
    track('trip_created', { country: sanitized.destination_country_code, dated: !!sanitized.start_date, via })
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
    // Keep what was loaded with the trip (collaborators, stops) and take the saved fields
    set(state => ({
      trips: state.trips.map(t => t.id === id ? { ...t, ...data } : t),
      activeTrip: state.activeTrip?.id === id ? { ...state.activeTrip, ...data } : state.activeTrip
    }))
    if ('start_date' in updates || 'end_date' in updates) get().refreshStops(id)
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
   * conflict: an undated trip takes the bookings' dates, and a dated one widens by a day on its own (the
   * overnight flight home). A booking further outside asks first (datePrompt → OutsideDatesSheet): extend the
   * trip, move the booking to another trip, or start a new one.
   */
  fillDatesIfUndated: async (tripId, bookings) => {
    const trip = get().trips.find(t => t.id === tripId) || (get().activeTrip?.id === tripId ? get().activeTrip : null)
    if (!trip) return
    const dates = bookings.flatMap(bookingDates).sort()
    if (!dates.length) return
    const first = dates[0], last = dates[dates.length - 1]
    const start = isUndated(trip) || first < trip.start_date ? first : trip.start_date
    const end = isUndated(trip) || last > trip.end_date ? last : trip.end_date
    if (start === trip.start_date && end === trip.end_date) return
    const over = isUndated(trip) ? 0 : Math.max(daysBetween(start, trip.start_date), daysBetween(trip.end_date, end))
    if (over > 1) {
      set({ datePrompt: { tripId, widen: { start_date: start, end_date: end }, span: { start: first, end: last }, bookings } })
      return
    }
    try { await get().updateTrip(tripId, { start_date: start, end_date: end }) } catch { /* best-effort */ }
  },

  datePrompt: null,
  clearDatePrompt: () => set({ datePrompt: null }),

  /** Move bookings to another trip (the outside-dates prompt), then fit that trip's dates to them. */
  moveBookings: async (bookings, toTripId) => {
    const ids = bookings.map(b => b.id)
    const { error } = await supabase.from('bookings').update({ trip_id: toTripId }).in('id', ids)
    if (error) throw error
    const fromTrip = bookings[0]?.trip_id
    set(state => ({ bookings: state.bookings.filter(b => !ids.includes(b.id)) }))
    track('booking_moved', { count: ids.length })
    if (fromTrip) get().refreshStops(fromTrip)
    get().refreshStops(toTripId)
    await get().fillDatesIfUndated(toTripId, bookings.map(b => ({ ...b, trip_id: toTripId })))
  },

  // via (analytics only): 'manual' | 'paste_import' | 'idea'; email-inbox bookings say so in bookingData.source
  createBooking: async (tripId, bookingData, { fillDates = true, via = 'manual' } = {}) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('bookings')
      .insert({ ...bookingData, trip_id: tripId, created_by: user.id }).select().single()
    if (error) throw error
    if (fillDates) await get().fillDatesIfUndated(tripId, [data])
    get().refreshStops(tripId, get().activeTrip?.id === tripId ? [...get().bookings, data] : undefined)
    track('booking_added', { type: bookingData.type || null, source: bookingData.source === 'email_import' ? 'email_import' : via })
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
    track('booking_edited', { type: data?.type || null })
    set(state => ({ bookings: state.bookings.map(b => b.id === id ? data : b) }))
    if (data?.trip_id) get().refreshStops(data.trip_id, get().activeTrip?.id === data.trip_id ? get().bookings : undefined)
    return data
  },

  deleteBooking: async (id) => {
    const type = get().bookings.find(b => b.id === id)?.type || null
    const { error } = await supabase.from('bookings').delete().eq('id', id)
    if (error) throw error
    track('booking_deleted', { type })
    const tripId = get().bookings.find(b => b.id === id)?.trip_id
    set(state => ({ bookings: state.bookings.filter(b => b.id !== id) }))
    if (tripId) get().refreshStops(tripId, get().activeTrip?.id === tripId ? get().bookings : undefined)
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
