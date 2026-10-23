// Demo-mode fixtures (see src/dev/demoClient.js). Dates are relative to today so the
// Today view, countdowns and recaps always have something to show.
import { DEMO_FUNCTIONS } from './fixtureFunctions'
import { wallToInstant, partsIn } from '../lib/localTime'
import { flagshipTrip } from './fixtures/flagship'

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-00000000d3e0',
  email: 'sam@demo.sillytraveltool.test',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Sam Rivera' },
}

const pad = n => String(n).padStart(2, '0')
// Zones of the demo places. Dates and times are built as local wall-clock values at each place,
// exactly like real confirmations, so the demo shows local-time behaviour with the phone anywhere.
const MAD = 'Europe/Madrid', SEA = 'America/Los_Angeles', TYO = 'Asia/Tokyo', LIS = 'Europe/Lisbon', NYC = 'America/New_York'
function day(offset, tz = MAD) {
  const d = new Date(`${partsIn(Date.now(), tz).date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
// Day offsets count from today in Madrid (the trip in progress); the wall time is read in `tz`.
function at(offset, hh, mm = 0, tz = MAD) {
  return wallToInstant(`${day(offset)}T${pad(hh)}:${pad(mm)}`, tz).toISOString()
}

export function buildFixtures({ empty = false, flagship = null } = {}) {
  const U = DEMO_USER.id
  const next = partsIn(Date.now() + 80 * 60000, MAD) // Alhambra entry, 1h 20m from now in Granada

  const trips = empty ? [] : [
    { id: 'trip-spain', owner_id: U, title: 'Madrid · Granada · Sevilla', destination_city: 'Granada', destination_country: 'Spain', destination_country_code: 'ES', destination_lat: 37.1773, destination_lng: -3.5986, start_date: day(-3), end_date: day(6), status: 'planning', notes: null, destination_tz: MAD },
    { id: 'trip-japan', owner_id: U, title: 'Tokyo & Kyoto', destination_city: 'Tokyo', destination_country: 'Japan', destination_country_code: 'JP', start_date: day(24, TYO), end_date: day(32, TYO), status: 'planning', destination_tz: TYO },
    { id: 'trip-lisbon', owner_id: U, title: 'Lisbon', destination_city: 'Lisbon', destination_country: 'Portugal', destination_country_code: 'PT', start_date: '2026-03-06', end_date: '2026-03-12', status: 'completed', destination_tz: LIS },
    { id: 'trip-nyc', owner_id: U, title: 'New York', destination_city: 'New York', destination_country: 'United States', destination_country_code: 'US', start_date: '2026-01-16', end_date: '2026-01-20', status: 'completed', destination_tz: NYC },
  ]

  const b = (o) => ({ created_by: U, source: 'manual', currency: 'EUR', ...o })
  const bookings = empty ? [] : [
    b({ id: 'b1', trip_id: 'trip-spain', type: 'flight', title: 'SEA → MAD', airline: 'Iberia', flight_number: 'IB 6852', departure_airport: 'SEA', arrival_airport: 'MAD', departure_time: at(-4, 13, 5, SEA), arrival_time: at(-3, 8, 40), departure_tz: SEA, arrival_tz: MAD, seat_number: '14A', confirmation_number: 'K7Q2LM', source: 'email_import' }),
    b({ id: 'b2', trip_id: 'trip-spain', type: 'hotel', title: 'Hotel check-in · Madrid', hotel_name: 'Hotel Urban Letras', hotel_address: 'Calle del Prado 15, Madrid', check_in_date: day(-3), check_out_date: day(0), confirmation_number: '58213377', price: 642, source: 'email_import' }),
    b({ id: 'b3', trip_id: 'trip-spain', type: 'activity', title: 'Museo del Prado', venue_name: 'Museo del Prado', venue_address: 'Calle de Ruiz de Alarcón 23, Madrid', activity_date: day(-2), activity_time: '17:00:00', ticket_quantity: 2, confirmation_number: 'PRD-2231' }),
    b({ id: 'b4', trip_id: 'trip-spain', type: 'transport', transport_mode: 'train', title: 'Madrid → Granada', provider: 'Renfe AVE', departure_airport: 'Madrid Atocha', arrival_airport: 'Granada', departure_time: at(0, 7, 5), arrival_time: at(0, 10, 25), departure_tz: MAD, arrival_tz: MAD, seat_number: 'Coach 4 · 12C', confirmation_number: 'RNF8812' }),
    b({ id: 'b5', trip_id: 'trip-spain', type: 'activity', title: 'Alhambra · Nasrid Palaces', venue_name: 'Alhambra', venue_address: 'Calle Real de la Alhambra, Granada', activity_date: day(0), activity_time: `${next.time}:00`, ticket_quantity: 2, confirmation_number: 'ALH-90412' }),
    b({ id: 'b6', trip_id: 'trip-spain', type: 'restaurant', title: 'Dinner · Carmen de San Miguel', venue_name: 'Carmen de San Miguel', venue_address: 'Plaza de Torres Bermejas 3, Granada', activity_date: day(0), activity_time: '20:30:00', party_size: 2, confirmation_number: 'OT-55120', notes: 'Terrace table requested' }),
    b({ id: 'b7', trip_id: 'trip-spain', type: 'hotel', title: 'Hotel check-in · Granada', hotel_name: 'Casa Morisca', hotel_address: 'Cuesta de la Victoria 9, Granada', check_in_date: day(0), check_out_date: day(1), confirmation_number: 'CM-3310' }),
    b({ id: 'b8', trip_id: 'trip-spain', type: 'transport', transport_mode: 'train', title: 'Granada → Sevilla', provider: 'Renfe', departure_airport: 'Granada', arrival_airport: 'Sevilla Santa Justa', departure_time: at(1, 9, 12), arrival_time: at(1, 11, 41), departure_tz: MAD, arrival_tz: MAD, seat_number: 'Coach 2 · 7A', confirmation_number: 'RNF9920' }),
    b({ id: 'b9', trip_id: 'trip-spain', type: 'hotel', title: 'Hotel check-in · Sevilla', hotel_name: 'Hotel Amadeus', hotel_address: 'Calle Farnesio 6, Sevilla', check_in_date: day(1), check_out_date: day(6) }),
    b({ id: 'b10', trip_id: 'trip-spain', type: 'flight', title: 'SVQ → SEA', airline: 'Iberia', flight_number: 'IB 3121', departure_airport: 'SVQ', arrival_airport: 'SEA', departure_time: at(6, 11, 50), arrival_time: at(6, 13, 30, SEA), departure_tz: MAD, arrival_tz: SEA, seat_number: '22C', confirmation_number: 'K7Q2LM' }),
    b({ id: 'b11', trip_id: 'trip-japan', type: 'flight', title: 'SEA → HND', airline: 'ANA', flight_number: 'NH 117', departure_airport: 'SEA', arrival_airport: 'HND', departure_time: at(24, 13, 0, SEA), arrival_time: at(25, 16, 25, TYO), departure_tz: SEA, arrival_tz: TYO, currency: 'USD' }),
    b({ id: 'b12', trip_id: 'trip-japan', type: 'hotel', title: 'Hotel check-in · Tokyo', hotel_name: 'Hotel Gracery Shinjuku', check_in_date: day(25), check_out_date: day(29), currency: 'JPY' }),
    b({ id: 'b13', trip_id: 'trip-japan', type: 'transport', transport_mode: 'train', title: 'Tokyo → Kyoto', provider: 'JR Shinkansen', departure_time: at(29, 9, 0, TYO), departure_tz: TYO, currency: 'JPY' }),
    b({ id: 'b14', trip_id: 'trip-japan', type: 'hotel', title: 'Hotel check-in · Kyoto', hotel_name: 'Hotel Kanra', check_in_date: day(29), check_out_date: day(32), currency: 'JPY' }),
    b({ id: 'b15', trip_id: 'trip-japan', type: 'flight', title: 'KIX → SEA', departure_time: at(32, 17, 0, TYO), departure_tz: TYO, currency: 'USD' }),
    b({ id: 'b16', trip_id: 'trip-lisbon', type: 'flight', title: 'SEA → LIS', departure_time: '2026-03-06T08:10:00Z' }),
    b({ id: 'b17', trip_id: 'trip-lisbon', type: 'hotel', title: 'Hotel check-in · Lisbon', check_in_date: '2026-03-06', check_out_date: '2026-03-12' }),
    b({ id: 'b18', trip_id: 'trip-lisbon', type: 'restaurant', title: 'Dinner · Taberna da Rua das Flores', activity_date: '2026-03-08', activity_time: '20:00:00', party_size: 2 }),
    b({ id: 'b19', trip_id: 'trip-lisbon', type: 'activity', title: 'Tram 28 + São Jorge Castle', activity_date: '2026-03-09' }),
    b({ id: 'b20', trip_id: 'trip-nyc', type: 'flight', title: 'SEA → JFK', departure_time: '2026-01-16T07:00:00Z' }),
    b({ id: 'b21', trip_id: 'trip-nyc', type: 'hotel', title: 'Hotel check-in · New York', check_in_date: '2026-01-16', check_out_date: '2026-01-20' }),
  ]

  // Hotels, restaurants and tickets carry the venue zone. Past-trip flights stay zone-less on purpose:
  // that is what rows saved before time zones existed look like.
  const VENUE_TZ = { 'trip-spain': MAD, 'trip-japan': TYO, 'trip-lisbon': LIS, 'trip-nyc': NYC }
  bookings.forEach(x => { if (!x.departure_time) x.local_tz = VENUE_TZ[x.trip_id] })

  // ?demo&flagship=<day>: the multi-city flagship trip in place of the Spain trip, on that trip day
  if (!empty && flagship != null) {
    const offset = Math.max(0, Math.min(18, Number(flagship) || 0))
    const fs = flagshipTrip({ owner: U, day: n => day(n - offset), wall: (n, hhmm, tz) => wallToInstant(`${day(n - offset)}T${hhmm}`, tz).toISOString() })
    trips.splice(trips.findIndex(t => t.id === 'trip-spain'), 1, fs.trip)
    for (let i = bookings.length - 1; i >= 0; i--) if (bookings[i].trip_id === 'trip-spain') bookings.splice(i, 1)
    bookings.push(...fs.bookings)
  }

  const trip_activities = empty ? [] : [
    { id: 'a1', trip_id: 'trip-spain', created_by: U, title: 'Sunset · Mirador San Nicolás', category: 'sight', date: day(0), time: '19:45:00', is_completed: false, source: 'guide' },
    { id: 'a2', trip_id: 'trip-spain', created_by: U, title: 'Tapas crawl in Calle Navas', category: 'food', date: day(2), is_completed: false, source: 'goosey' },
  ]

  const trip_collaborators = empty ? [] : [
    { id: 'c1', trip_id: 'trip-spain', user_id: '00000000-0000-4000-8000-0000000000aa', invited_email: 'jo@example.com', role: 'collaborator', status: 'accepted' },
  ]

  return {
    trips, bookings, trip_activities, trip_collaborators, trip_stops: [],
    user_profiles: [{ id: U, display_name: 'Sam Rivera', avatar_url: null, home_currency: 'USD', passport_country: 'US', home_city: 'Seattle', temp_unit: 'C', booking_email_token: '6f1c2a9e', created_at: '2025-11-02T10:00:00Z' }],
    user_stats: [{ user_id: U, countries_visited: 6, trips_completed: 5, trips_created: 7, total_flights: 14, days_abroad: 61, restaurants_added: 8, museums_visited: 4, continents_visited: 3, goose_score: 1240 }],
    user_badges: [
      { id: 'ub1', user_id: U, badge_id: 'first_trip', badge_name: 'Bag Dropped', badge_tier: 'easy', unlocked_at: '2025-11-02T10:00:00Z' },
      { id: 'ub2', user_id: U, badge_id: 'wheels_up', badge_name: 'Finally Left', badge_tier: 'easy', unlocked_at: '2025-11-03T10:00:00Z' },
      { id: 'ub3', user_id: U, badge_id: 'first_honk', badge_name: "Honk If You're Winging It", badge_tier: 'easy', unlocked_at: '2026-01-17T10:00:00Z' },
      { id: 'ub4', user_id: U, badge_id: 'continent_hopper', badge_name: 'Mild Globetrotter', badge_tier: 'medium', unlocked_at: '2026-03-07T10:00:00Z' },
      { id: 'ub5', user_id: U, badge_id: 'planner_goose', badge_name: 'Suspiciously Organised', badge_tier: 'medium', unlocked_at: '2026-03-12T10:00:00Z' },
    ],
    wallet_documents: [
      { id: 'd1', user_id: U, type: 'passport', title: 'US Passport', issuing_country: 'United States', document_number: null, document_number_last4: '4821', issue_date: '2021-05-14', expiry_date: '2031-05-13' },
      { id: 'd2', user_id: U, type: 'insurance', title: 'World Nomads travel insurance', issuing_country: null, document_number: 'WN-7781-22', expiry_date: day(40), notes: 'Emergency line +1 844 207 1932' },
      { id: 'd3', user_id: U, type: 'vaccine', title: 'Yellow fever certificate', issue_date: '2024-02-01', expiry_date: null },
    ],
    loyalty_cards: [
      { id: 'l1', user_id: U, program_name: 'Iberia Plus', card_number: 'IB 55 2219 004', member_name: 'Sam Rivera', tier: 'Silver', points_balance: 18250 },
      { id: 'l2', user_id: U, program_name: 'Marriott Bonvoy', card_number: '882 211 930', member_name: 'Sam Rivera', tier: 'Gold', points_balance: 64010 },
    ],
    guide_cache_sections: [],
    phrase_cache: [],
    analytics_events: [],
    revealed: { d1: 'X12344821' },
    functions: DEMO_FUNCTIONS,
  }
}
