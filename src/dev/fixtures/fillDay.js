// Demo-mode response for fill-my-day: a proposal in Granada. The demo client cannot call the real function.
export default function fillDayFixture(body) {
  const stop = (n, name, type, category, start, minutes, walk, reason, lat, lng) => ({
    place_id: `demo-fmd-${n}`, name, type, category, address: `Granada, ${name}`, lat, lng, rating: 4.6, maps_url: '',
    start, minutes, walk_min: walk, reason,
  })
  if (body?.vibes?.length === 1 && body.vibes[0] === 'parks') return { date: body.date, stops: [] }
  const seville = /sevill/i.test(body?.city || '')
  const all = seville ? [
    stop(11, 'Café Central', 'Cafe', 'food', '09:30', 45, null, 'Coffee and tostada in the old centre before the heat.', 37.3891, -5.9945),
    stop(12, 'Real Alcázar', 'Palace', 'sight', '10:30', 90, 6, 'Book ahead; mornings are calmer in the gardens.', 37.3837, -5.9906),
    stop(13, 'Mercado de Triana', 'Market', 'sight', '13:00', 60, 18, 'Across the river, stalls and small bars for lunch.', 37.3826, -6.0030),
    stop(14, 'Metropol Parasol', 'Viewpoint', 'sight', '16:30', 45, 20, 'Rooftop walkway with views over the old town.', 37.3932, -5.9917),
    stop(15, 'Bar El Rinconcillo', 'Tapas bar', 'food', '19:30', 60, 7, 'One of the oldest tapas bars in the city.', 37.3948, -5.9901),
  ] : [
    stop(1, 'Pastelería Lopez-Mezquita', 'Bakery', 'food', '09:30', 45, null, 'Start with a proper Granada breakfast of pastries and coffee.', 37.1761, -3.5995),
    stop(2, 'Cathedral of Granada', 'Cathedral', 'sight', '10:30', 60, 4, 'Right around the corner, and quiet before the tour groups arrive.', 37.1763, -3.5994),
    stop(3, 'Alcaicería', 'Market', 'sight', '11:45', 45, 3, 'The old silk market lanes, good for a slow browse.', 37.1759, -3.5981),
    stop(4, 'Bar Los Diamantes', 'Tapas bar', 'food', '13:00', 60, 8, 'Lunch with free tapas, a local favourite.', 37.1745, -3.5997),
    stop(5, 'Mirador de San Nicolás', 'Viewpoint', 'sight', '17:30', 45, 22, 'The classic view of the Alhambra, best in the evening light.', 37.1810, -3.5924),
  ]
  const n = ({ slow: 3, steady: 5, packed: 5 })[body?.pace] || 5
  return { date: body?.date, source: 'ai', stops: all.slice(0, n) }
}
