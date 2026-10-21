// Demo-mode response for generate-guide. Shapes mirror what guideStore.getGuideData() reads.
const r = (name, cuisine, score, extra = {}) => ({
  name, cuisine, goose_score: score, address: `${name}, Granada`, google_maps_query: `${name} Granada`,
  description: `${name} is a local favourite: short menu, long queue, worth it.`, ...extra,
})
const a = (name, type, extra = {}) => ({
  name, type, address: `${name}, Granada`, google_maps_query: `${name} Granada`,
  description: `${name}: go early, take your time, bring water.`, ...extra,
})

const SECTIONS = {
  overview: {
    history: 'Granada sits at the foot of the Sierra Nevada, where the Darro and Genil rivers meet. It was the last Moorish kingdom in Spain until 1492, and the Alhambra palace complex above the city is its most famous legacy. Today it is a university town with a big student crowd, free tapas with every drink and flamenco in the caves of Sacromonte.',
    wikipedia_url: 'https://en.wikipedia.org/wiki/Granada',
    britannica_url: 'https://www.britannica.com/place/Granada-Spain',
    city_stats: {
      population: '231,000', language: 'Spanish', currency: 'Euro (EUR)', timezone: 'CET (UTC+1)',
      avg_temp_summer: '34°C', avg_temp_winter: '12°C', founded: '5th century BC', area_km2: 88,
      comparisons: ['About the size of Reno, with twice the tapas', 'The Alhambra gets around 2.7 million visitors a year'],
      goose_facts: [
        { fact: 'Tapas come free with every drink in most bars.', goose_take: 'Order a second drink. For science.' },
        { fact: 'Alhambra tickets sell out weeks ahead in spring.', goose_take: 'Book before you book the flight.' },
      ],
    },
  },
  eat_cheap: { items: [
    r('Bodegas Castañeda', 'Tapas bar', 8.8, { is_goose_pick: true, goose_quip: 'Stand at the bar, point at things.' }),
    r('Los Diamantes', 'Seafood tapas', 9.1),
    r('Bar Poë', 'Global tapas', 8.4),
  ] },
  eat_mid: { items: [r('Carmen de San Miguel', 'Andalusian', 8.6), r('La Fábula', 'Modern Spanish', 8.2)] },
  eat_splurge: { items: [r('Restaurante Arriaga', 'Tasting menu', 9.3, { is_goose_pick: true })] },
  see_temples: { items: [a('Alhambra', 'Palace and fortress', { is_goose_pick: true, official_url: 'https://www.alhambra-patronato.es', wikipedia_url: 'https://en.wikipedia.org/wiki/Alhambra' }), a('Granada Cathedral', 'Cathedral')] },
  see_neighbourhoods: { items: [a('Albaicín', 'Old Moorish quarter', { goose_quip: 'Get lost on purpose.' }), a('Sacromonte', 'Cave district')] },
  see_museums: { items: [a('Museo de la Alhambra', 'Museum', { is_goose_pick: true }), a('Centro José Guerrero', 'Contemporary art'), a('Parque de las Ciencias', 'Science museum')] },
  see_parks: { items: [a('Jardines del Generalife', 'Gardens'), a('Carmen de los Mártires', 'Garden')] },
  see_daytrips: { items: [a('Sierra Nevada', 'Mountains, 45 min'), a('Las Alpujarras', 'White villages, 1h 30m')] },
  move: { move: {
    overview: 'The old town is steep and best on foot. Small red minibuses climb to the Alhambra and Albaicín.',
    options: [
      { type: 'Alhambra minibus (C30, C31, C32)', app_name: 'Moovit', official_url: 'https://www.transportesrober.com', description: 'Tiny buses that squeeze through the old lanes. Pay with a contactless card.', tip: 'Take the C32 up to the Alhambra, walk down through the woods.' },
      { type: 'Metro (light rail)', description: 'One line, north to south. Handy for the train station.' },
      { type: 'Taxi', app_name: 'Cabify', description: 'Plentiful outside the old town. Fixed fare from the airport.' },
      { type: 'Walking', description: 'Most sights are within 20 minutes. Good shoes, the cobbles are slippery.' },
    ],
  } },
  events: { events: [
    { name: 'Corpus Christi fair', month: 'June', type: 'Festival', description: 'A week of fairground, flamenco and late nights.' },
    { name: 'International Music and Dance Festival', month: 'July', type: 'Music', description: 'Concerts inside the Alhambra.' },
    { name: 'Día de la Toma', month: 'January', type: 'Historic', description: 'Marks the 1492 handover, parade in the centre.' },
  ] },
}

export default function guideFixture(body) {
  const section = SECTIONS[body?.section] || {}
  // "Load more": return fresh items not in exclude_names
  if (body?.exclude_names?.length && section.items) {
    return { items: section.items.map((it, i) => ({ ...it, name: `${it.name} (more ${i + 1})`, is_goose_pick: false })) }
  }
  return section
}
