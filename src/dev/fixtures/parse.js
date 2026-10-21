// Demo-mode response for parse-booking-email: { bookings: [...], ultimate_destination }.
export default function parseFixture() {
  return {
    bookings: [{
      type: 'restaurant', title: 'Dinner · Bodegas Castañeda', venue_name: 'Bodegas Castañeda',
      venue_address: 'Calle Almireceros 1, Granada', activity_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      activity_time: '21:00', confirmation_number: 'TF-88213', party_size: 2,
    }],
    ultimate_destination: { city: 'Granada', airport_code: 'GRX' },
  }
}
