// The flagship multi-city trip (docs/MULTI_CITY_PLAN.md): Seattle → Madrid → trains around Spain → Barcelona →
// Berlin → trains in Germany → night train to Rome → Seattle, 18 nights. Used by the demo (?demo&flagship=<day>)
// and scripts/test-route.mjs. Times are wall-clock values at each place, like real confirmations.
//
// day(n) → 'YYYY-MM-DD' for trip day n (0 = departure from Seattle); wall(n, 'HH:MM', tz) → ISO instant.
export const SEA = 'America/Los_Angeles', MAD = 'Europe/Madrid', BER = 'Europe/Berlin', ROM = 'Europe/Rome'
// Maria joined the trip and forwarded her family's booking for the Berlin flight: three travellers, one card
export const MARIA = '00000000-0000-4000-8000-0000000000bb'

export function flagshipTrip({ id = 'trip-flagship', owner, day, wall }) {
  const trip = {
    id, owner_id: owner, title: 'Spain, Germany & Italy', destination_city: 'Madrid', destination_country: 'Spain',
    destination_country_code: 'ES', destination_lat: 40.4168, destination_lng: -3.7038, destination_tz: MAD,
    start_date: day(0), end_date: day(18), status: 'planning', notes: null,
  }
  let n = 0
  const b = (x) => ({ id: `fs${++n}`, trip_id: id, created_by: owner, is_shared: true, source: 'email_import', price: null, currency: 'EUR', ...x })
  const leg = (type, mode, title, from, to, dep, arr, depTz, arrTz, extra = {}) => b({
    type, transport_mode: mode, title, departure_airport: from, arrival_airport: to,
    departure_time: wall(dep[0], dep[1], depTz), arrival_time: wall(arr[0], arr[1], arrTz), departure_tz: depTz, arrival_tz: arrTz, ...extra,
  })
  const hotel = (name, address, inDay, outDay, tz, lat, lng) => b({
    type: 'hotel', title: name, hotel_name: name, hotel_address: address, check_in_date: day(inDay), check_out_date: day(outDay),
    local_tz: tz, place_lat: lat, place_lng: lng,
  })
  const visit = (type, title, venue, address, d, time, tz, lat, lng, extra = {}) => b({
    type, title, venue_name: venue, venue_address: address, activity_date: day(d), activity_time: time, local_tz: tz,
    place_lat: lat, place_lng: lng, ...extra,
  })

  const bookings = [
    leg('flight', null, 'SEA → MAD', 'SEA', 'MAD', [0, '13:05'], [1, '08:40'], SEA, MAD, { airline: 'Iberia', flight_number: 'IB 6852', confirmation_number: 'K7Q2LM', currency: 'USD' }),
    hotel('Hotel Urban Letras', 'Calle del Prado 15, Madrid', 1, 4, MAD, 40.4146, -3.6990),
    visit('activity', 'Museo del Prado', 'Museo del Prado', 'Calle de Ruiz de Alarcón 23, Madrid', 2, '17:00', MAD, 40.4138, -3.6921, { ticket_quantity: 2 }),
    visit('activity', 'Toledo Cathedral', 'Catedral Primada', 'Calle Cardenal Cisneros 1, Toledo', 3, '11:00', MAD, 39.8570, -4.0233, { ticket_quantity: 2 }),
    leg('transport', 'train', 'Madrid → Granada', 'Madrid Atocha', 'Granada', [4, '07:05'], [4, '10:25'], MAD, MAD, { airline: 'Renfe AVE', confirmation_number: 'RNF8812' }),
    hotel('Casa Morisca', 'Cuesta de la Victoria 9, Granada', 4, 6, MAD, 37.1793, -3.5904),
    visit('activity', 'Alhambra · Nasrid Palaces', 'Alhambra', 'Calle Real de la Alhambra, Granada', 5, '09:30', MAD, 37.1761, -3.5881, { ticket_quantity: 2 }),
    leg('transport', 'train', 'Granada → Sevilla', 'Granada', 'Sevilla Santa Justa', [6, '09:12'], [6, '11:41'], MAD, MAD, { airline: 'Renfe', confirmation_number: 'RNF9920' }),
    hotel('Hotel Amadeus', 'Calle Farnesio 6, Sevilla', 6, 8, MAD, 37.3874, -5.9897),
    leg('transport', 'train', 'Sevilla → Barcelona', 'Sevilla Santa Justa', 'Barcelona Sants', [8, '08:45'], [8, '14:20'], MAD, MAD, { airline: 'Renfe AVE', confirmation_number: 'RNF1044' }),
    hotel('Hotel Neri', 'Carrer de Sant Sever 5, Barcelona', 8, 10, MAD, 41.3834, 2.1762),
    visit('restaurant', 'Dinner · Cal Pep', 'Cal Pep', 'Plaça de les Olles 8, Barcelona', 9, '20:30', MAD, 41.3840, 2.1828, { party_size: 2 }),
    leg('flight', null, 'BCN → BER', 'BCN', 'BER', [10, '10:15'], [10, '12:50'], MAD, BER, { airline: 'Vueling', flight_number: 'VY 1886', confirmation_number: 'VY77QK', seat_number: '14A', passenger_name: 'Sam Rivera' }),
    leg('flight', null, 'BCN → BER', 'BCN', 'BER', [10, '10:15'], [10, '12:50'], MAD, BER, { airline: 'Vueling', flight_number: 'VY1886', confirmation_number: 'VY88RT', seat_number: '14B', passenger_name: 'Maria Silva', created_by: MARIA }),
    leg('flight', null, 'BCN → BER', 'BCN', 'BER', [10, '10:15'], [10, '12:50'], MAD, BER, { airline: 'Vueling', flight_number: 'VY1886', confirmation_number: 'VY88RT', seat_number: '14C', passenger_name: 'Tom Silva', created_by: MARIA }),
    hotel('Hotel Oderberger', 'Oderberger Str. 57, Berlin', 10, 12, BER, 52.5390, 13.4080),
    leg('transport', 'train', 'Berlin → Dresden', 'Berlin Hauptbahnhof', 'Dresden Hbf', [12, '09:40'], [12, '11:44'], BER, BER, { airline: 'Deutsche Bahn', confirmation_number: 'DB55120' }),
    hotel('Hotel Taschenbergpalais', 'Taschenberg 3, Dresden', 12, 13, BER, 51.0530, 13.7360),
    leg('transport', 'train', 'Dresden → Munich', 'Dresden Hbf', 'München Hbf', [13, '08:58'], [13, '13:40'], BER, BER, { airline: 'Deutsche Bahn', confirmation_number: 'DB55121' }),
    hotel('Hotel Louis', 'Viktualienmarkt 6, Munich', 13, 15, BER, 48.1351, 11.5761),
    leg('transport', 'train', 'Night train to Rome', 'München Hbf', 'Roma Termini', [15, '20:15'], [16, '09:40'], BER, ROM, { airline: 'ÖBB Nightjet', confirmation_number: 'NJ40233' }),
    hotel('Hotel Artemide', 'Via Nazionale 22, Rome', 16, 18, ROM, 41.9009, 12.4936),
    visit('activity', 'Vatican Museums', 'Musei Vaticani', 'Viale Vaticano, Rome', 17, '09:00', ROM, 41.9065, 12.4536, { ticket_quantity: 2 }),
    leg('flight', null, 'FCO → SEA', 'FCO', 'SEA', [18, '10:30'], [18, '14:55'], ROM, SEA, { airline: 'Delta', flight_number: 'DL 225', confirmation_number: 'K7Q2LN', currency: 'USD' }),
  ]
  return { trip, bookings }
}

/** The answers to check: where the traveller is on each trip day. */
export const FLAGSHIP_DAYS = {
  0: 'Seattle → Madrid', 1: 'Madrid', 2: 'Madrid', 3: 'Toledo', 4: 'Madrid → Granada', 5: 'Granada',
  6: 'Granada → Seville', 7: 'Seville', 8: 'Seville → Barcelona', 9: 'Barcelona', 10: 'Barcelona → Berlin',
  11: 'Berlin', 12: 'Berlin → Dresden', 13: 'Dresden → Munich', 14: 'Munich', 15: 'Munich → Rome', 16: 'Rome',
  17: 'Rome', 18: 'Rome → Seattle',
}
export const FLAGSHIP_ROUTE = ['Seattle', 'Madrid', 'Granada', 'Seville', 'Barcelona', 'Berlin', 'Dresden', 'Munich', 'Rome', 'Seattle']
