// What the AI answers for each email in supabase/tests/fixtures/live-emails-2026-11-06.json, in the shape the new prompt
// asks for (_shared/emailParse.js). Hand-written to that prompt from each email's printed facts (times as printed,
// local), not recorded from a live model: the live runs of 6 Nov used the old prompt. Where a model has been seen to
// slip (an airport code as destination_city, a co-traveller's ID in notes), the answer keeps the slip, so the filing
// code is tested against it.
const fl = (num, from, to, dep, arr, x = {}) => ({ type: 'flight', flight_number: num, departure_airport: from, arrival_airport: to, departure_time: dep, arrival_time: arr, ...x })
const tr = (mode, num, from, to, dep, arr, x = {}) => ({ type: 'transport', transport_mode: mode, flight_number: num, departure_airport: from, arrival_airport: to, departure_time: dep, arrival_time: arr, ...x })
const ht = (name, addr, city, inn, out, x = {}) => ({ type: 'hotel', title: name, hotel_name: name, hotel_address: addr, destination_city: city, check_in_date: inn, check_out_date: out, ...x })
const booking = (bookings, travelers = [], x = {}) => ({ email_kind: 'booking', change_type: 'new', loyalty: [], travelers, bookings, unclear: null, ...x })
const people = (...names) => names.map(n => (Array.isArray(n) ? { name: n[0], type: n[1] } : { name: n, type: 'adult' }))
const cards = (...l) => ({ email_kind: 'loyalty', change_type: 'new', loyalty: l, travelers: [], bookings: [] })
const other = () => ({ email_kind: 'other', change_type: 'new', loyalty: [], travelers: [], bookings: [] })

export const ANSWERS = {
  // ── Batch 1 ──
  E1: booking([fl('NW 218', 'SEA', 'JFK', '2026-11-14T19:05', '2026-11-15T03:40', { confirmation_number: 'TST1A1', airline: 'Northwind Air', arrival_city: 'New York', destination_city: 'New York', seat_number: '14C', flight_class: 'Economy', price: 412.6, currency: 'USD' })], people('Jordan Ellis')),
  E2: booking([
    fl('NW 71', 'SEA', 'LHR', '2026-11-20T19:05', '2026-11-21T12:50', { confirmation_number: 'TST2B2', arrival_city: 'London', destination_city: 'London' }),
    fl('NW 1304', 'LHR', 'CDG', '2026-11-22T09:30', '2026-11-22T11:50', { confirmation_number: 'TST2B2', arrival_city: 'Paris', destination_city: 'Paris' }),
    // The live slip: a code where a city belongs
    fl('NW 72', 'CDG', 'SEA', '2026-11-27T12:10', '2026-11-27T13:55', { confirmation_number: 'TST2B2', destination_city: 'SEA' }),
  ], people('Priya Raman')),
  E3: booking([fl('NW 108', 'SFO', 'CDG', '2026-12-20T15:40', '2026-12-21T11:25', { confirmation_number: 'TST3C3', arrival_city: 'Paris', destination_city: 'Paris', seat_number: '31A 31B 31C 31D' })],
    people('Søren Nuñez-Whitaker', 'Amélie Nuñez-Whitaker', ['Zoë Nuñez-Whitaker', 'child'], ['Ismaël Nuñez-Whitaker', 'child'], ['Léa-Marie Nuñez-Whitaker', 'infant'])),
  E4: booking([ht('Hotel Lumière Test', "12 rue de l'Exemple, 75011 Paris, France", 'Paris', '2026-11-22', '2026-11-27', { confirmation_number: 'TST4D4', room_type: '2 x Double room', price: 1480, currency: 'EUR' })], people('Priya Raman')),
  E5: booking([
    fl('NW 2038', 'JFK', 'LIS', '2027-03-05T21:30', '2027-03-06T09:40', { confirmation_number: 'TST5E5', arrival_city: 'Lisbon', destination_city: 'Lisbon' }),
    ht('Casa Teste Alfama', 'Rua da Amostra 5, Lisbon', 'Lisbon', '2027-03-06', '2027-03-09', { confirmation_number: 'TST5E5' }),
    tr('car', null, 'Lisbon Airport', 'Porto Airport', '2027-03-09T10:00', '2027-03-12T18:00', { title: 'Car rental Lisbon to Porto', confirmation_number: 'CAR-TST5E5', departure_city: 'Lisbon', arrival_city: 'Porto', destination_city: 'Porto' }),
    ht('Palacete Prova', 'Rua do Ensaio 9, Porto', 'Porto', '2027-03-09', '2027-03-12', { confirmation_number: 'TST5E5' }),
    fl('NW 4410', 'OPO', 'MAD', '2027-03-12T20:45', '2027-03-12T22:45', { confirmation_number: 'TST5E5', destination_city: 'MAD' }),
    ht('Hostal Prueba Centro', 'Calle de la Muestra 3, Madrid', 'Madrid', '2027-03-12', '2027-03-15', { confirmation_number: 'TST5E5' }),
  ], people('Marcus Oyelaran')),
  E6: booking([
    tr('train', 'AR 701', 'Berlin Hbf', 'Hamburg Hbf', '2026-11-12T07:15', '2026-11-12T08:56', { confirmation_number: 'TST6F6', airline: 'Aurora Rail', departure_city: 'Berlin', arrival_city: 'Hamburg', destination_city: 'Hamburg' }),
    tr('train', 'AR 718', 'Hamburg Hbf', 'Berlin Hbf', '2026-11-14T19:05', '2026-11-14T20:46', { confirmation_number: 'TST6F6', airline: 'Aurora Rail', departure_city: 'Hamburg', arrival_city: 'Berlin', destination_city: 'Berlin' }),
  ], people('Kim Becker')),
  E7: booking([
    fl('NW 7', 'LAX', 'SYD', '2026-11-14T22:30', '2026-11-16T08:50', { confirmation_number: 'TST7G7', arrival_city: 'Sydney', destination_city: 'Sydney' }),
    fl('NW 8', 'SYD', 'LAX', '2026-11-24T11:00', '2026-11-24T05:10', { confirmation_number: 'TST7G7', arrival_city: 'Los Angeles', destination_city: 'Los Angeles' }),
  ], people('Aiko Tanaka')),
  E8a: booking([tr('train', 'EC 99', 'München Hbf', 'Zürich HB', '2027-03-20T09:03', '2027-03-20T12:58', { confirmation_number: 'TST8H8', airline: 'Alpenrail', departure_city: 'Munich', arrival_city: 'Zürich', destination_city: 'Zürich' })], people('Lena Hofmann')),
  E8b: booking([tr('ferry', null, 'Dover', 'Calais', '2027-04-02T14:00', '2027-04-02T16:30', { confirmation_number: 'TST8J8', airline: 'Channel Ferries', arrival_city: 'Calais', destination_city: 'Calais', notes: '1 car' })], people('Lena Hofmann')),
  E9a: booking([{ type: 'restaurant', title: 'Dinner at Le Petit Atelier', confirmation_number: 'TST9K9', venue_name: 'Le Petit Atelier', venue_address: '8 rue de la Maquette, 75003 Paris', activity_date: '2026-12-22', activity_time: '19:00', party_size: 5, destination_city: 'Paris' }], people('Nuñez-Whitaker')),
  E9b: booking([{ type: 'activity', title: 'Balade des lumières', confirmation_number: 'TST9L9', venue_name: 'Balade des lumières', venue_address: "Place de l'Exemple, Paris", activity_date: '2026-12-23', activity_time: '19:00', ticket_quantity: 5, destination_city: 'Paris' }]),
  // "tomorrow" read against the day it arrived (the test sends it on 2026-11-06)
  E9c: booking([{ type: 'restaurant', title: 'Dinner at Osteria Prova', confirmation_number: 'TST9M9', venue_name: 'Osteria Prova', venue_address: "Via dell'Esempio 4, Rome", activity_date: '2026-11-07', activity_time: '19:00', party_size: 2, destination_city: 'Rome' }]),
  E10a: booking([ht('Harbourview Test Hotel', '1 Sample Quay, Sydney NSW 2000, Australia', 'Sydney', '2026-11-16', '2026-11-24', { confirmation_number: 'TST10N1', price: 2160, currency: 'AUD' })], people('Aiko Tanaka')),
  E10b: booking([]), // the body only points at the PDF; the PDF is read on its own (PDF_ANSWER)
  E11a: booking([fl('NW 1304', 'LHR', 'CDG', '2026-11-22T10:15', '2026-11-22T12:35', { confirmation_number: 'TST2B2', change_type: 'change', changed: ['departure_time', 'arrival_time'], destination_city: 'Paris' })], people('Priya Raman'), { change_type: 'change' }),
  E11b: booking([ht('Hotel Lumière Test', null, 'Paris', '2026-11-22', '2026-11-27', { confirmation_number: 'TST4D4', change_type: 'cancellation' })], [], { change_type: 'cancellation' }),
  E12: booking([ht('Hotel Prueba Mar', 'Avenida del Ejemplo 10, Valencia, España', 'Valencia', '2027-02-12', '2027-02-15', { confirmation_number: 'TST12Q1', price: 1234.56, currency: 'EUR' })], people('Carmen Ruiz')),
  E13a: booking([ht('Stranger Sender Hotel', 'Rua do Teste 1, Lisbon', 'Lisbon', '2027-01-10', '2027-01-12', { confirmation_number: 'TST13R1' })], people('Aiko Tanaka')),
  E13b: booking([ht('Consent Gate Hotel', 'Via del Test 2, Rome', 'Rome', '2027-01-20', '2027-01-22', { confirmation_number: 'TST13S2' })], people('Test Eight')),
  // ── Batch 1 loyalty ──
  L1: cards({ program_name: 'Northwind Miles', member_number: 'TST-NW-118204', member_name: 'Jordan Ellis', tier: 'Silver', points_balance: 8420, points_as_of: '2026-11-01' }),
  L2: cards({ program_name: 'Lumière Rewards', member_number: 'TST-LR-55012', member_name: 'Priya Raman', tier: 'Gold', points_balance: 12450, expiry_date: '2027-03-31' }),
  L3: cards({ program_name: 'SwiftDrive Club', member_number: 'TST-SD-7731', member_name: 'Kim Becker', tier: 'Preferred' }),
  // The slip kept: the FF number pasted into notes
  L4: booking([fl('NW 220', 'SEA', 'JFK', '2026-12-03T08:00', '2026-12-03T16:30', { confirmation_number: 'TST1A9', arrival_city: 'New York', destination_city: 'New York', notes: 'Frequent flyer: Northwind Miles TST-NW-118204' })], people('Jordan Ellis')),

  // ── Batch 2 ──
  'B2-01': booking([
    fl('CA 418', 'BOS', 'LIS', '2027-03-12T21:40', '2027-03-13T09:55', { confirmation_number: 'TSTB101', airline: 'Cirrus Air', arrival_city: 'Lisbon', destination_city: 'LIS', seat_number: '31A 31B 32A 32B', price: 2318.4, currency: 'USD' }),
    fl('CA 419', 'LIS', 'BOS', '2027-03-20T11:20', '2027-03-20T14:05', { confirmation_number: 'TSTB101', airline: 'Cirrus Air', arrival_city: 'Boston', destination_city: 'Boston', seat_number: '29A 29B 30A 30B' }),
  ], people('Daniel Okafor', 'Lucia Reyes', ['Noah Okafor', 'child'], ['Zoe Reyes', 'child'], ['Mia Okafor', 'infant'])),
  'B2-02': booking([
    fl('TN 91', 'ORD', 'FRA', '2027-03-16T17:25', '2027-03-17T07:40', { confirmation_number: 'TSTB102', airline: 'Tern Airways', arrival_city: 'Frankfurt', destination_city: 'FRA', price: 7964, currency: 'USD' }),
    fl('TN 756', 'FRA', 'BOM', '2027-03-17T10:35', '2027-03-17T23:35', { confirmation_number: 'TSTB102', arrival_city: 'Mumbai', destination_city: 'Mumbai' }),
    fl('TN 757', 'BOM', 'FRA', '2027-03-31T02:45', '2027-03-31T08:15', { confirmation_number: 'TSTB102', arrival_city: 'Frankfurt', destination_city: 'FRA' }),
    fl('TN 92', 'FRA', 'ORD', '2027-03-31T11:20', '2027-03-31T13:30', { confirmation_number: 'TSTB102', arrival_city: 'Chicago', destination_city: 'Chicago' }),
  ], people('Arjun Mehta', 'Priya Mehta', ['Kabir Mehta', 'child'], ['Anaya Mehta', 'child'], 'Sunita Kapoor', 'Vikram Kapoor', 'James Holloway')),
  'B2-03': booking([
    fl('KA 88', 'SEA', 'HNL', '2027-02-06T08:15', '2027-02-06T12:20', { confirmation_number: 'KQ7T2M', airline: 'Kestrel Air', arrival_city: 'Honolulu', destination_city: 'Honolulu', price: 1102.4, currency: 'USD' }),
    fl('KA 89', 'HNL', 'SEA', '2027-02-13T13:30', '2027-02-13T21:15', { confirmation_number: 'KQ7T2M', airline: 'Kestrel Air', arrival_city: 'Seattle', destination_city: 'SEA' }),
    ht('Lanai Breeze Waikiki (Test)', '2 Example Beach Rd, Honolulu, HI 96815', 'Honolulu', '2027-02-06', '2027-02-13', { confirmation_number: 'LB-558201', room_type: 'Ocean View King, 1 room', price: 2184, currency: 'USD' }),
    tr('car', null, 'Honolulu Airport (HNL)', 'Honolulu Airport (HNL)', '2027-02-06T13:15', '2027-02-09T11:00', { title: 'PalmRent car rental', airline: 'PalmRent', confirmation_number: 'PR-90417', destination_city: 'Honolulu', price: 168.2, currency: 'USD' }),
    tr('car', null, 'Lanai Breeze Waikiki', 'Honolulu Airport (HNL)', '2027-02-13T10:45', null, { title: 'Transfer to Honolulu Airport', airline: 'Aloha Private Transfers', confirmation_number: 'APT-3318', destination_city: 'Honolulu', price: 31.6, currency: 'USD' }),
  ], people('Hannah Brightwell', 'Owen Llewellyn')),
  'B2-04': booking([tr('ferry', null, 'Barcelona', 'Barcelona', '2027-05-08T18:00', '2027-05-15T06:30', {
    title: 'Cruise: MV Test Horizon', airline: 'Meridian Voyages', confirmation_number: 'TSTB104', destination_city: 'Barcelona', room_type: 'Cabins 9146 and 9148 (Balcony)',
    price: 6382, currency: 'EUR', notes: 'Board from 14:00. 9 May at sea; 10 May Marseille 08:00-17:30; 11 May Genoa 08:00-18:00; 12 May Civitavecchia (Rome) 07:00-19:00; 13 May Naples 08:00-17:00; 14 May at sea. Disembark by 09:00.' })],
  people('Theo Andersen', 'Sofie Andersen', ['Lukas Andersen', 'child'], 'Harald Andersen', 'Ingrid Andersen')),
  'B2-05': booking([
    ht('Seaglass Inn Monterey (Test)', '10 Example Wharf Rd, Monterey, CA', 'Monterey', '2027-06-14', '2027-06-16', { confirmation_number: 'TSTB105-A', price: 578, currency: 'USD' }),
    ht('Big Sur Pines Lodge (Test)', 'Highway 1 Mile 41 (Test), Big Sur, CA', 'Big Sur', '2027-06-16', '2027-06-17', { confirmation_number: 'TSTB105-B', price: 455, currency: 'USD', notes: 'Free cancellation until 2027-06-14 18:00' }),
    ht('Cambria Harbor Hotel (Test)', '1 Example Pier, Cambria, CA', 'Cambria', '2027-06-17', '2027-06-19', { confirmation_number: 'TSTB105-C', price: 603, currency: 'USD' }),
  ], people('Rosalind Achterberg')),
  'B2-06': booking([
    fl('TN 2290', 'DEN', 'ATL', '2027-03-08T14:20', '2027-03-08T19:20', { confirmation_number: 'TSTB106', arrival_city: 'Atlanta', destination_city: 'Atlanta', price: 611.8, currency: 'USD' }),
    fl('TN 5502', 'ATL', 'SJO', '2027-03-09T06:15', '2027-03-09T09:00', { confirmation_number: 'TSTB106', arrival_city: 'San José', destination_city: 'SJO' }),
  ], people('Elena Vasquez-Lindqvist')),
  'B2-07': booking([
    fl('MP 5', 'YVR', 'HND', '2027-04-21T11:45', '2027-04-22T13:55', { confirmation_number: 'TSTB107', airline: 'Marlin Pacific', arrival_city: 'Tokyo', destination_city: 'Tokyo', price: 1301.46, currency: 'CAD', notes: 'Operated by Sakura Wings as SW 18' }),
    fl('MP 6', 'HND', 'YVR', '2027-05-05T17:10', '2027-05-05T10:05', { confirmation_number: 'TSTB107', airline: 'Marlin Pacific', arrival_city: 'Vancouver', destination_city: 'Vancouver', notes: 'Operated by Sakura Wings as SW 17' }),
  ], people('Gabriel Tremblay')),
  'B2-08': booking([
    tr('train', '9014', 'London St Pancras Intl', 'Paris Gare du Nord', '2027-03-19T08:31', '2027-03-19T11:47', { confirmation_number: 'TSTB108', airline: 'Channel Tunnel Express', departure_city: 'London', arrival_city: 'Paris', destination_city: 'Paris', seat_number: 'Coach 7, 41 and 42', price: 412, currency: 'GBP' }),
    tr('train', '9041', 'Paris Gare du Nord', 'London St Pancras Intl', '2027-03-21T18:13', '2027-03-21T19:29', { confirmation_number: 'TSTB108', airline: 'Channel Tunnel Express', departure_city: 'Paris', arrival_city: 'London', destination_city: 'London', seat_number: 'Coach 3, 62 and 63' }),
  ], people('Toby Wren', ['Imogen Wren', 'child'])),
  'B2-09': booking([
    tr('train', 'Tsubame 233', 'Tokyo', 'Shin-Osaka', '2027-04-12T09:03', '2027-04-12T11:33', { confirmation_number: 'TSTB109', departure_city: 'Tokyo', arrival_city: 'Osaka', destination_city: 'Osaka', seat_number: 'Car 8, 12A 12B', price: 49060, currency: 'JPY' }),
    tr('train', 'Tsubame 541', 'Shin-Osaka', 'Hiroshima', '2027-04-15T14:11', '2027-04-15T15:41', { confirmation_number: 'TSTB109', departure_city: 'Osaka', arrival_city: 'Hiroshima', destination_city: 'Hiroshima', seat_number: 'Car 3, 7D 7E' }),
  ], people('Hiro Takahashi', 'Emma Takahashi-Lee')),
  // The organizer's address is a contact detail: never a traveller
  'B2-10': booking([tr('bus', null, 'Prague Florenc Bus Station', 'Vienna Erdberg Bus Terminal', '2027-07-03T08:30', '2027-07-03T12:45', { confirmation_number: 'TSTB110', airline: 'SprintCoach', departure_city: 'Prague', arrival_city: 'Vienna', destination_city: 'Vienna', seat_number: '14, 15', price: 31.8, currency: 'EUR' })],
    [{ name: 'Mina Horvat', type: 'adult', email: 'mina.horvat@example.test' }, { name: 'Leon Horvat', type: 'adult' }]),
  'B2-11': booking([ht('ホテル テスト京都', '京都府京都市下京区テスト町1-2-3', 'Kyoto', '2027-05-03', '2027-05-05', { confirmation_number: 'TSTB111', room_type: 'デラックスツイン 1室 / 大人2名', price: 38400, currency: 'JPY' })], people('山田 花子')),
  'B2-12': booking([ht('Hotel Prova Bellavista', "Via dell'Esempio 5, 50123 Firenze, Italia", 'Florence', '2027-06-25', '2027-06-28', { confirmation_number: 'TSTB112', room_type: 'Doppia Superior, 2 adulti', price: 712.5, currency: 'EUR', notes: 'Non-refundable. Pay by 2027-06-11 23:59. City tax EUR 15 at the hotel.' })], people('Giulia Ferrari')),
  'B2-13': booking([
    ht('Palmetto Cove Resort & Spa', 'Km 12 Zona Hotelera, Cancun, Mexico', 'Cancún', '2027-07-05', '2027-07-12', { confirmation_number: 'TSTB113-1', room_type: 'Oceanfront Family Suite', price: 6940, currency: 'USD', notes: 'All-inclusive. Guaranteed room 15:00.' }),
    ht('Palmetto Cove Resort & Spa', 'Km 12 Zona Hotelera, Cancun, Mexico', 'Cancún', '2027-07-05', '2027-07-12', { confirmation_number: 'TSTB113-2', room_type: 'Garden Villa', passenger_name: 'Sanjay and Lata Nair' }),
  ], people('Rahul Desai', 'Neha Desai', ['Arjun Desai', 'child'], ['Meera Desai', 'child'], 'Sanjay Nair', 'Lata Nair')),
  'B2-14': booking([ht('Aurora Nest Hotel (Test)', 'Bergsórsgata 4, 101 Reykjavík, Iceland', 'Reykjavík', '2027-03-02', '2027-03-05', { confirmation_number: 'TSTB114', price: 118400, currency: 'ISK' })], people('Berglót Sigurðardóttir')),
  'B2-15': booking([
    fl('NW 71', 'SEA', 'LHR', '2026-11-20T20:20', '2026-11-21T14:05', { confirmation_number: 'TST2B2', change_type: 'change', changed: ['departure_time', 'arrival_time', 'seat_number'], seat_number: '36K', notes: 'Aircraft now Airbus A330-300 (was Boeing 787-9)' }),
    fl('NW 1304', 'LHR', 'CDG', '2026-11-22T10:15', '2026-11-22T12:35', { confirmation_number: 'TST2B2', change_type: 'unchanged' }),
    fl('NW 72', null, null, null, null, { confirmation_number: 'TST2B2', change_type: 'unchanged' }),
  ], people('Priya Raman'), { change_type: 'change' }),
  // Only the day is printed; the seat fee is not the fare
  'B2-16': booking([
    fl('NW 7', 'LAX', 'SYD', '2026-11-14', null, { confirmation_number: 'TST7G7', change_type: 'change', changed: ['seat_number'], seat_number: '22A', price: 70, currency: 'USD' }),
    fl('NW 8', 'SYD', 'LAX', '2026-11-24', null, { confirmation_number: 'TST7G7', change_type: 'change', changed: ['seat_number'], seat_number: '22A', price: 70, currency: 'USD' }),
  ], people('Aiko Tanaka'), { change_type: 'change' }),
  'B2-17': booking([ht('Hotel Prueba Mar', 'Avenida del Ejemplo 10, Valencia, España', 'Valencia', '2027-02-13', '2027-02-16', { confirmation_number: 'TST12Q1', change_type: 'change', changed: ['check_in_date', 'check_out_date'], price: 1234.56, currency: 'EUR' })], people('Carmen Ruiz'), { change_type: 'change' }),
  'B2-18': booking([
    fl('MP 6', 'HND', 'YVR', '2027-05-05T17:10', '2027-05-05T10:05', { confirmation_number: 'TSTB107', change_type: 'cancellation', title: 'Flight to Vancouver (cancelled)' }),
    fl('MP 5', 'YVR', 'HND', '2027-04-21T11:45', '2027-04-22T13:55', { confirmation_number: 'TSTB107', change_type: 'unchanged' }),
  ], people('Gabriel Tremblay'), { change_type: 'cancellation' }),
  'B2-19': cards({ program_name: 'Tern Rewards', member_number: 'TSTB-TR-5521097', member_name: 'Elena Vasquez-Lindqvist', tier: 'Silver', points_balance: 48215, points_as_of: '2027-02-28', expiry_date: '2027-03-31' }),
  'B2-20': cards({ program_name: 'Harbourline Honors', member_number: 'HH-TSTB-90377', previous_number: 'HH-TSTB-88214', member_name: 'Marcus Oyelaran', tier: 'Platinum', points_balance: 23400 }),
  'B2-21': cards({ program_name: 'Kestrel Club', member_number: 'TSTB-KC-770132', member_name: 'Paolo Bianchi-Ross', tier: 'Silver Elite', points_balance: 0 }),
  'B2-22': cards(
    { program_name: 'Albatross Air Plus', member_number: 'TSTB-AA-30415', member_name: 'Imani Wanjiku', tier: 'Silver', points_balance: 12904 },
    { program_name: 'Cobalt Hotels Circle', member_number: 'TSTB-CHC-7719053', member_name: 'Imani Wanjiku', tier: 'Member', points_balance: 3200 },
    { program_name: 'Zephyr Rental Rewards', member_number: 'TSTB-ZR-11820', member_name: 'Imani Wanjiku', tier: 'Gold', points_balance: 1440 }),
  'B2-23': other(),
  'B2-24': other(),
  // A model that still files the insurance receipt as "other" with dates: it must be ignored all the same
  'B2-25': { email_kind: 'other', change_type: 'new', loyalty: [], travelers: [], bookings: [{ type: 'other', title: 'Safeguard Travel Insurance', confirmation_number: 'TSTB-INS-2209', activity_date: '2027-02-06', destination_city: 'Honolulu', price: 118.4, currency: 'USD' }] },
}

// E10b: what the AI reads from the PDF (the itinerary prompt's shape)
export const PDF_ANSWER = { bookings: [{ type: 'activity', title: 'Harbour Test Cruise', confirmation_number: 'TST10P2', venue_name: 'Harbour Test Cruise', venue_address: 'Circular Quay, Sydney', activity_date: '2026-11-18', activity_time: '10:30', ticket_quantity: 2, destination_city: 'Sydney' }], ultimate_destination: { city: 'Sydney' } }

// A co-traveller's identity and contact data, in every place a model might put it: none of it may be stored
export const PRIVATE_ANSWER = booking([fl('NW 300', 'SEA', 'LHR', '2027-01-10T19:05', '2027-01-11T12:50', {
  confirmation_number: 'TSTPRIV1', arrival_city: 'London', destination_city: 'London',
  notes: 'Window seats requested\nPassport (Ana Ruiz): X1234567\nDate of birth (Ana Ruiz): 2015-04-02\nFrequent flyer: Northwind Miles TST-NW-990011\nContact: ana.parent@example.test, +1 206 555 0100' })],
[{ name: 'Sam Rivera', type: 'adult', date_of_birth: '1985-01-01', passport: 'P7654321' },
  { name: 'Ana Ruiz', type: 'child', age: 11, dob: '2015-04-02', passport_number: 'X1234567', frequent_flyer: 'TST-NW-990011', email: 'ana.parent@example.test', phone: '+1 206 555 0100' }])
export const PRIVATE_SECRETS = ['X1234567', 'P7654321', '2015-04-02', '1985-01-01', 'TST-NW-990011', 'ana.parent@example.test', '555 0100', 'Passport', 'birth']
