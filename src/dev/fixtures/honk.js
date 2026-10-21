// Demo-mode response for goosey-discover (HONK): one place near the user.
export default function honkFixture(body) {
  return {
    name: 'Bar Los Diamantes',
    type: 'Seafood tapas',
    neighbourhood: 'Centro',
    price_range: '€',
    goose_rating: '9.1',
    why: `Fried fish, cold beer and free tapas, five minutes from you in ${body?.city || 'town'}. Locals pack it from 9pm.`,
    best_time: 'Before 9pm to get a spot at the bar',
    insider_tip: 'Order the berenjenas con miel. Thank Goose later.',
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Los%20Diamantes%20Granada',
  }
}
