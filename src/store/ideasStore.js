import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { hasTripEnded, parseLocalDate, todayAtTrip } from '../lib/dates'
import { track } from '../lib/analytics'

/**
 * Trip ideas: places shortlisted from the guide or HONK (trip_activities.is_idea), plus the trip's bookings
 * that point at a Google place, so the guide can show each card as new / shortlisted / booked.
 * byTrip[tripId] = { ideas: [...], booked: [...], loaded: true }
 */
const norm = s => (s || '').trim().toLowerCase()

/** The trip a city's guide belongs to: the live or next trip whose destination is that city. */
export function tripForCity(trips, city) {
  const c = norm(city)
  if (!c) return null
  const matches = (trips || []).filter(t => norm(t.destination_city) === c && t.status !== 'cancelled' && !hasTripEnded(t) && t._myRole !== 'viewer')
  const live = matches.find(t => t.start_date <= todayAtTrip(t))
  return live || matches.sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))[0] || null
}

export const useIdeasStore = create((set, get) => ({
  byTrip: {},

  load: async (tripId) => {
    if (!tripId) return
    const [{ data: ideas }, { data: booked }] = await Promise.all([
      supabase.from('trip_activities').select('id, title, place_id, location_name, location_address, location_lat, location_lng, category, source')
        .eq('trip_id', tripId).eq('is_idea', true),
      supabase.from('bookings').select('id, type, place_id, venue_name, hotel_name, title, activity_date, activity_time, check_in_date')
        .eq('trip_id', tripId).not('place_id', 'is', null),
    ])
    set(s => ({ byTrip: { ...s.byTrip, [tripId]: { ideas: ideas || [], booked: booked || [], loaded: true } } }))
  },

  /** 'booked' | 'idea' | null for a guide item on this trip, matched by Google place, else by name. */
  statusFor: (tripId, item) => {
    const t = get().byTrip[tripId]
    if (!t || !item) return null
    const same = (pid, name) => (item.place_id && pid ? pid === item.place_id : norm(name) === norm(item.name))
    const booking = t.booked.find(b => same(b.place_id, b.venue_name || b.hotel_name || b.title))
    if (booking) return { state: 'booked', booking }
    const idea = t.ideas.find(i => same(i.place_id, i.location_name || i.title))
    return idea ? { state: 'idea', idea } : null
  },

  addIdea: async (tripId, item, kind, source = 'guide') => {
    const { data: { user } } = await supabase.auth.getUser()
    const row = {
      trip_id: tripId, created_by: user?.id, is_idea: true, is_completed: false, source,
      title: item.name || 'Place',
      category: kind === 'restaurant' ? 'food' : /museum|galler/i.test(item.type || '') ? 'museum' : 'sight',
      notes: (item.goose_quip || item.description || item.why || '').slice(0, 500) || null,
      location_name: item.name || null,
      location_address: item.address || null,
      location_lat: item.lat ?? null,
      location_lng: item.lng ?? null,
      place_id: item.place_id || null,
    }
    const { data, error } = await supabase.from('trip_activities').insert(row).select().single()
    if (error) throw error
    track('idea_added', { kind, source }, 'explore')
    set(s => {
      const t = s.byTrip[tripId] || { ideas: [], booked: [], loaded: true }
      return { byTrip: { ...s.byTrip, [tripId]: { ...t, ideas: [...t.ideas, data] } } }
    })
    return data
  },

  removeIdea: async (tripId, ideaId) => {
    const { error } = await supabase.from('trip_activities').delete().eq('id', ideaId)
    if (error) throw error
    set(s => {
      const t = s.byTrip[tripId]
      return t ? { byTrip: { ...s.byTrip, [tripId]: { ...t, ideas: t.ideas.filter(i => i.id !== ideaId) } } } : {}
    })
  },

  /** A visit was booked for this place: the booking replaces the idea. */
  markBooked: async (tripId, booking, ideaId) => {
    if (ideaId) await supabase.from('trip_activities').delete().eq('id', ideaId)
    track('idea_booked', { type: booking?.type || null }, 'explore')
    set(s => {
      const t = s.byTrip[tripId] || { ideas: [], booked: [], loaded: true }
      return { byTrip: { ...s.byTrip, [tripId]: { ...t, ideas: t.ideas.filter(i => i.id !== ideaId), booked: booking ? [...t.booked, booking] : t.booked } } }
    })
  },
}))
