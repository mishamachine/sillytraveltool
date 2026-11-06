// The animated mocks for the section tours, as data. Each scene is a few phone screens and sheets built from blocks,
// plus a script of stages. A stage may name a `screen` or `sheet` to show (both carry forward until changed; `sheet: null`
// closes it), a `toast`, a `tap` (the data-tap target the finger presses) and a caption `cap`. Sample data only.
// Rendered by components/shared/SectionTourArt.jsx; checked by scripts/test-section-tours.mjs.
//
// Blocks: hero, rows, chips, tabs, tiles, facts, note, field, btn, big, stepper, label, badges.

const trip = (extra = {}) => ({ icon: 'trips', tone: 'neutral', ...extra })

export const SCENES = {
  // ---------- Trips ----------
  'trips-paste': {
    screens: {
      list: {
        title: 'Trips', action: { icon: 'clipboard', label: 'Paste', tap: 'clip' },
        blocks: [
          { t: 'rows', items: [trip({ title: 'Spain', meta: '12–22 May · 4 stops' }), trip({ title: 'Lisbon weekend', meta: '6–8 Jun · 3 bookings' }), trip({ title: 'Iceland road trip', meta: 'Sep · 2 travelers' })] },
        ],
      },
    },
    sheets: {
      paste: { title: 'Paste a confirmation', blocks: [
        { t: 'field', icon: 'mail', text: 'Paste the email or booking text here' },
        { t: 'btn', icon: 'sparkles', label: 'Read it', tap: 'read' },
      ] },
      reading: { title: 'Paste a confirmation', blocks: [{ t: 'note', icon: 'sparkles', text: 'Goose is reading your confirmation' }] },
      preview: { title: 'Paste a confirmation', blocks: [
        { t: 'rows', items: [{ icon: 'stay', tone: 'stay', title: 'Hotel Alfonso XIII', meta: 'Sevilla · 3 nights · Conf. 8XK2Q' }] },
        { t: 'btn', label: 'Save to Spain', tap: 'save' },
      ] },
    },
    script: [
      { ms: 2400, screen: 'list', cap: 'Got a booking confirmation?' },
      { tap: 'clip', cap: 'Tap the clipboard' },
      { ms: 2400, sheet: 'paste', cap: 'Paste the email or booking text' },
      { tap: 'read' },
      { ms: 2000, sheet: 'reading', cap: 'Goose reads it for you' },
      { ms: 3200, sheet: 'preview', cap: 'Check it, then save it to a trip' },
      { ms: 2400, sheet: null, toast: 'Filed in Spain', cap: 'Filed, with times and confirmation number' },
    ],
  },
  'trips-recap': {
    screens: {
      list: {
        title: 'Trips', blocks: [
          { t: 'label', text: 'Past' },
          { t: 'rows', items: [
            { icon: 'flag', tone: 'neutral', title: 'Lisbon weekend', meta: '6–8 Jun 2026 · 2 nights', end: 'Recap', tap: 'recap' },
            { icon: 'flag', tone: 'neutral', title: 'Berlin', meta: 'Mar 2026 · 4 nights', end: 'Recap' },
          ] },
        ],
      },
      recap: {
        back: true, over: 'Completed', title: 'Lisbon weekend', blocks: [
          { t: 'tiles', items: [{ big: '2', meta: 'nights' }, { big: '2', meta: 'flights' }, { big: '6', meta: 'bookings' }] },
          { t: 'label', text: 'Badges earned' },
          { t: 'badges', items: [['plane-takeoff', 'info'], ['pin', 'success'], ['trips', 'accent']] },
          { t: 'tiles', items: [{ icon: 'cloud-sun', tone: 'info', big: '21° avg', meta: 'Weather was' }, { big: '5 of 6', meta: 'Plans ticked off' }] },
        ],
      },
    },
    script: [
      { ms: 2800, screen: 'list', cap: 'Finished trips move to Past' },
      { tap: 'recap', cap: 'Tap Recap' },
      { ms: 4200, screen: 'recap', cap: 'Nights, flights, bookings and the weather' },
      { ms: 3000, cap: 'Plus the badges you earned, and the weather' },
    ],
  },
  'trips-new': {
    screens: {
      list: {
        title: 'Trips', action: { icon: 'plus', label: 'New trip', tap: 'new' },
        blocks: [{ t: 'rows', items: [trip({ title: 'Lisbon weekend', meta: '6–8 Jun · 3 bookings' })] }],
      },
    },
    sheets: {
      form: { title: 'New trip', blocks: [
        { t: 'field', icon: 'search', text: 'Destination: Tokyo, Japan' },
        { t: 'field', icon: 'edit', text: 'Trip name: Tokyo in spring' },
        { t: 'facts', items: [['Depart', '10 Apr'], ['Return', '20 Apr']] },
        { t: 'switch', label: 'Not sure of the dates yet', on: false },
        { t: 'btn', label: 'Add trip', tap: 'add' },
      ] },
      undated: { title: 'New trip', blocks: [
        { t: 'field', icon: 'search', text: 'Destination: Tokyo, Japan' },
        { t: 'switch', label: 'Not sure of the dates yet', on: true },
        { t: 'note', icon: 'calendar', text: 'Goose fills in the dates when flights or hotels are added.' },
        { t: 'btn', label: 'Add trip', tap: 'add' },
      ] },
    },
    script: [
      { ms: 2400, screen: 'list', cap: 'Tap New trip' },
      { tap: 'new' },
      { ms: 3200, sheet: 'form', cap: 'Pick a destination, name and dates' },
      { ms: 3400, sheet: 'undated', cap: 'No dates yet? Plan now, fill them later' },
      { tap: 'add' },
      { ms: 2400, sheet: null, toast: 'Trip added', cap: 'Then forward or paste your bookings in' },
    ],
  },

  // ---------- Today ----------
  'today-tiles': {
    screens: {
      today: { over: 'Day 3 of 10 · Thursday', title: 'Granada', blocks: [
        { t: 'tiles', items: [{ icon: 'sun', tone: 'sun', big: '26°', meta: 'Sunny now', tap: 'weather' }, { icon: 'train', tone: 'accent', big: 'Tomorrow', meta: 'Granada to Sevilla', tap: 'tomorrow' }] },
        { t: 'label', text: 'Later today' },
        { t: 'rows', items: [{ icon: 'restaurant', tone: 'accent', title: 'Dinner at Damasqueros', meta: '21:00', end: 'Plan' }, { icon: 'museum', tone: 'success', title: 'Sunset at Mirador San Nicolás', meta: '19:45', end: 'Plan' }] },
      ] },
      plan: { back: true, over: '12–22 May', title: 'Spain', blocks: [
        { t: 'tabs', prefix: 'tab', active: 'plan', items: [['plan', 'Plan'], ['weather', 'Weather'], ['pack', 'Pack']] },
        { t: 'label', text: 'Fri 15 May · Granada to Sevilla' },
        { t: 'rows', items: [{ icon: 'train', tone: 'accent', title: 'Granada to Sevilla', meta: '09:10 · ALSA bus' }] },
      ] },
    },
    script: [
      { ms: 3000, screen: 'today', cap: 'The weather where you are, right now' },
      { tap: 'weather' },
      { ms: 2600, cap: 'Later today lists what’s still to come' },
      { tap: 'tomorrow', cap: 'Tap Tomorrow' },
      { ms: 3200, screen: 'plan', cap: 'It opens the trip plan' },
    ],
  },
  'today-fill': {
    screens: {
      today: { over: 'Day 5 of 10 · Saturday', title: 'Sevilla', blocks: [
        { t: 'hero', over: 'Today', title: 'Nothing planned yet.', meta: 'An open day in Sevilla', btn: { label: 'Let Goose fill it', icon: 'sparkles', tap: 'fill' } },
      ] },
    },
    sheets: {
      ask: { title: 'Plan me a day, Goose', blocks: [
        { t: 'label', text: 'How hard are we going?' },
        { t: 'chips', items: ['Here to relax', 'Steady pace', 'FULL HONK!'], on: 1 },
        { t: 'label', text: 'What’s the mood?' },
        { t: 'label', text: 'Pick up to three, or none for a mix.' },
        { t: 'chips', items: ['Cafés', 'Museums', 'Markets', 'Views'], on: [1, 3] },
        { t: 'btn', label: 'Fill it up', tap: 'go' },
      ] },
      picks: { title: 'Plan me a day, Goose', blocks: [
        { t: 'rows', items: [
          { icon: 'museum', tone: 'success', title: 'Real Alcázar', meta: '10:00 · 2 hours' },
          { icon: 'restaurant', tone: 'accent', title: 'Mercado de Triana', meta: '13:00 · lunch' },
          { icon: 'camera', tone: 'success', title: 'Plaza de España', meta: '18:30 · golden hour' },
        ] },
        { t: 'btn', label: 'Add to my day', tap: 'add' },
      ] },
    },
    script: [
      { ms: 2600, screen: 'today', cap: 'A day with nothing on it' },
      { tap: 'fill', cap: 'Tap Let Goose fill it' },
      { ms: 3400, sheet: 'ask', cap: 'Pick a pace and up to three moods' },
      { tap: 'go' },
      { ms: 3600, sheet: 'picks', cap: 'Goose suggests a day. Check times first' },
      { tap: 'add' },
      { ms: 2400, sheet: null, toast: 'Added to your day', cap: 'Your picks land on the plan' },
    ],
  },

  // ---------- Explore ----------
  'explore-search': {
    screens: {
      explore: { title: 'Explore', blocks: [
        { t: 'field', icon: 'search', text: 'Sevilla, Spain' },
        { t: 'chips', items: ['Madrid', 'Sevilla', 'Granada'], on: 1 },
        { t: 'label', text: 'Sevilla guide' },
        { t: 'tiles', items: [
          { icon: 'info', tone: 'accent', big: 'Know', meta: 'History, numbers and local quirks', tap: 'know' },
          { icon: 'restaurant', tone: 'accent', big: 'Eat', meta: 'Cheap eats to a proper splurge' },
          { icon: 'eye', tone: 'accent', big: 'See', meta: 'Museums, areas, parks, day trips' },
          { icon: 'metro', tone: 'accent', big: 'Transit', meta: 'Metro, taxis and apps like a local' },
        ] },
      ] },
    },
    script: [
      { ms: 3000, screen: 'explore', cap: 'Search any city, or tap one from your trip' },
      { ms: 3000, cap: 'Five sections, each with a teaser' },
      { tap: 'know', cap: 'Tap a section to open it' },
      { ms: 2200 },
    ],
  },
  'explore-save': {
    screens: {
      eat: { back: true, over: 'Sevilla guide', title: 'Eat', blocks: [
        { t: 'chips', items: ['Cheap', 'Mid-range', 'Splurge'], on: 0 },
        { t: 'rows', items: [
          { icon: 'restaurant', tone: 'accent', title: 'Bodega Santa Cruz', meta: 'Tapas from €3', end: '+', tap: 'plus' },
          { icon: 'restaurant', tone: 'accent', title: 'Eslava', meta: 'Mid-range · book ahead', end: '+' },
        ] },
      ] },
    },
    sheets: {
      pick: { title: 'Save to', blocks: [
        { t: 'rows', items: [{ icon: 'trips', tone: 'accent', title: 'Spain', meta: '12–22 May', tap: 'spain' }, trip({ title: 'Lisbon weekend', meta: '6–8 Jun' })] },
      ] },
    },
    script: [
      { ms: 2400, screen: 'eat', cap: 'Found a place you like?' },
      { tap: 'plus', cap: 'Tap +' },
      { ms: 2600, sheet: 'pick', cap: 'Pick the trip it belongs to' },
      { tap: 'spain' },
      { ms: 3200, sheet: null, toast: 'Saved to Spain ideas', cap: 'Saved as an idea. Book it when you’re ready' },
    ],
  },

  // ---------- HONK (own tour, used once HONK has its own tab) ----------
  'honk-moods': {
    screens: {
      honk: { title: 'HONK', blocks: [
        { t: 'hero', title: 'What are you in the mood for?', meta: 'One great place, walkable from where you are.' },
        { t: 'chips', items: ['I’m hungry', 'Show me something', 'I’m bored', 'Treat myself', 'On a budget', 'Culture me', 'Night out', 'Be a local'], on: 0, tap: 'hungry' },
      ] },
    },
    script: [
      { ms: 3000, screen: 'honk', cap: 'Eight moods to choose from' },
      { tap: 'hungry', cap: 'Tap the one that fits' },
      { ms: 2400, cap: 'Goose goes scouting, usually under ten seconds' },
    ],
  },
  'honk-result': {
    screens: {
      result: { title: 'HONK', blocks: [
        { t: 'hero', over: 'Goose says go here', title: 'Bodega Castañeda', meta: 'Tapas bar, open now · 4 min walk', btn: { label: 'Get there', icon: 'navigation', tap: 'go' } },
        { t: 'btn', label: 'Another spot', icon: 'refresh', tap: 'again' },
      ] },
    },
    script: [
      { ms: 3200, screen: 'result', cap: 'One spot, close enough to walk' },
      { tap: 'go', cap: 'Get there opens your route' },
      { ms: 2400, toast: 'Opening Maps' },
      { tap: 'again', cap: 'Not feeling it? Ask for another' },
      { ms: 2200 },
    ],
  },
  'honk-where': {
    screens: {
      where: { title: 'HONK', blocks: [
        { t: 'note', icon: 'pin', text: 'Goose uses your location to pick somewhere walkable.' },
        { t: 'label', text: 'Where are you?' },
        { t: 'field', icon: 'search', text: 'Type your city' },
      ] },
    },
    script: [
      { ms: 3200, screen: 'where', cap: 'HONK uses where you are' },
      { ms: 3200, cap: 'Location off? Type your city instead' },
    ],
  },

  // ---------- Tools ----------
  'tools-hub': {
    screens: {
      hub: { over: 'Set for Spain', title: 'Tools', blocks: [
        { t: 'rows', items: [{ icon: 'sos', tone: 'danger', title: 'SOS', meta: 'Emergency numbers · embassy · emergency card', tap: 'sos' }] },
        { t: 'hero', over: 'Currency', title: 'EUR to USD', meta: 'Live rates', tap: 'currency' },
        { t: 'tiles', items: [{ icon: 'translate', tone: 'info', big: 'Translate', meta: 'Pocket phrase book', tap: 'translate' }, { icon: 'receipt', tone: 'accent', big: 'Tip & split', meta: 'In Spain', tap: 'tip' }] },
      ] },
    },
    script: [
      { ms: 3000, screen: 'hub', cap: 'Everything is set for the country you’re in' },
      { tap: 'sos', cap: 'SOS sits on top, one tap from any screen' },
      { tap: 'currency', cap: 'Currency converts to your home money' },
      { tap: 'translate', cap: 'Phrase book and tipping are one tap away' },
      { ms: 2200 },
    ],
  },
  'tools-sos': {
    screens: {
      sos: { back: true, over: 'Spain', title: 'SOS', blocks: [
        { t: 'big', over: 'All emergencies', value: '112', sub: 'Tap to call' },
        { t: 'label', text: 'Nearest help' },
        { t: 'chips', items: ['Hospitals', 'Police', 'Pharmacies'], on: 0, tap: 'kind' },
        { t: 'rows', items: [{ icon: 'medical', tone: 'danger', title: 'Hospital Universitario', meta: '1.2 km · Calle Mayor', end: 'Call' }] },
        { t: 'btn', label: 'Emergency card', icon: 'id-card', tap: 'card' },
      ] },
    },
    sheets: {
      card: { title: 'Emergency card', blocks: [
        { t: 'facts', items: [['Police', 'Local number'], ['Ambulance', 'Local number'], ['Fire', 'Local number'], ['My name', 'Sam']] },
      ] },
    },
    script: [
      { ms: 3000, screen: 'sos', cap: 'The local emergency number, one tap to call' },
      { tap: 'kind', cap: 'Switch between hospitals, police and pharmacies' },
      { ms: 2400, cap: 'Call or get directions to the nearest' },
      { tap: 'card' },
      { ms: 3000, sheet: 'card', cap: 'An emergency card to show someone' },
    ],
  },
  'tools-translate': {
    screens: {
      tr: { back: true, over: 'Picked for Madrid', title: 'Translate', blocks: [
        { t: 'hero', title: 'La cuenta, por favor', meta: 'The bill, please', actions: [{ label: 'Play', tap: 'play' }, { label: 'Show big', ghost: true }] },
        { t: 'chips', items: ['Food & dining', 'Transport', 'Hotel'], on: 0 },
        { t: 'rows', items: [{ icon: 'volume', tone: 'info', title: 'Una mesa para dos', meta: 'A table for two' }, { icon: 'volume', tone: 'info', title: '¿Qué me recomienda?', meta: 'What do you recommend?' }] },
      ] },
      playing: { back: true, over: 'Picked for Madrid', title: 'Translate', blocks: [
        { t: 'hero', title: 'La cuenta, por favor', meta: 'Playing aloud', actions: [{ label: 'Pause' }, { label: 'Show big', ghost: true }] },
        { t: 'chips', items: ['Food & dining', 'Transport', 'Hotel'], on: 0 },
        { t: 'rows', items: [{ icon: 'volume', tone: 'info', title: 'Una mesa para dos', meta: 'A table for two' }] },
      ] },
      type: { back: true, over: 'Picked for Madrid', title: 'Translate', blocks: [
        { t: 'field', icon: 'edit', text: 'My bag is lost. Where is the police station?' },
        { t: 'hero', title: 'Mi bolso se ha perdido. ¿Dónde está la comisaría?', meta: 'Means: my bag is lost, where is the police station?', actions: [{ label: 'Play', tap: 'play' }, { label: 'Show big', ghost: true }] },
      ] },
    },
    script: [
      { ms: 3000, screen: 'tr', cap: 'Phrases in the local language' },
      { tap: 'play' },
      { ms: 2200, screen: 'playing', cap: 'Tap Play to hear it read aloud' },
      { ms: 3400, screen: 'type', cap: 'Or type anything and Goose translates it' },
    ],
  },
  'tools-tip': {
    screens: {
      tip: { back: true, over: 'Spain', title: 'Tip & split', blocks: [
        { t: 'note', icon: 'lightbulb', text: 'Tipping in Spain: round up or leave a few percent for good service.' },
        { t: 'chips', items: ['5%', '10%', '15%', '20%'], on: 1, tap: 'pct' },
        { t: 'stepper', label: 'Split between', value: 3, tap: 'more' },
        { t: 'big', over: 'Each pays', value: '€17.60', sub: 'Bill €48 · tip 10%' },
      ] },
    },
    script: [
      { ms: 3000, screen: 'tip', cap: 'How tipping works where you are' },
      { tap: 'pct', cap: 'Pick a percentage' },
      { tap: 'more', cap: 'Set how many are splitting' },
      { ms: 3000, cap: 'See what each person pays' },
    ],
  },
  'tools-currency': {
    screens: {
      ccy: { back: true, title: 'Currency', blocks: [
        { t: 'tiles', items: [{ big: '€48.00', meta: 'You pay · Euro' }, { big: '$52.03', meta: 'At home · US Dollar' }] },
        { t: 'btn', label: 'Swap currencies', icon: 'exchange', tap: 'swap' },
        { t: 'label', text: 'Quick glance' },
        { t: 'rows', items: [{ title: '€5', end: '$5.42' }, { title: '€20', end: '$21.68' }] },
      ] },
    },
    script: [
      { ms: 3200, screen: 'ccy', cap: 'Local price on top, your money below' },
      { tap: 'swap', cap: 'Swap the direction in one tap' },
      { ms: 3200, cap: 'Quick glance: small amounts, already converted' },
    ],
  },

  // ---------- Profile ----------
  'profile-score': {
    screens: {
      home: { title: 'Profile', blocks: [
        { t: 'hero', over: 'Goose score', title: '1,240', meta: '3 badges earned', big: true },
        { t: 'label', text: 'Badges' },
        { t: 'badges', items: [['trips', 'accent'], ['plane-takeoff', 'info'], ['pin', 'success']], tap: 'badges' },
        { t: 'tiles', items: [{ big: '8', meta: 'trips' }, { big: '5', meta: 'countries' }, { big: '41', meta: 'days abroad' }, { big: '12', meta: 'flights' }] },
      ] },
    },
    script: [
      { ms: 3200, screen: 'home', cap: 'Your score grows with every trip' },
      { ms: 3000, cap: 'Trips, countries, days abroad and flights' },
      { tap: 'badges', cap: 'Badges mark the milestones' },
      { ms: 2200 },
    ],
  },
  'profile-docs': {
    screens: {
      docs: { back: true, title: 'Travel documents', blocks: [
        { t: 'rows', items: [
          { icon: 'passport', tone: 'info', title: 'UK passport', meta: 'Ends in 4821 · Expires Mar 2031', end: 'Details', tap: 'details' },
          { icon: 'id-card', tone: 'success', title: 'Global Entry', meta: 'Expires Aug 2029', end: 'Details' },
          { icon: 'medical', tone: 'danger', title: 'Travel insurance', meta: 'Policy and helpline', end: 'Details' },
        ] },
      ] },
    },
    sheets: {
      detail: { title: 'UK passport', blocks: [{ t: 'facts', items: [['Issued by', 'United Kingdom'], ['Expiry', 'Mar 2031'], ['Number', 'Hidden: tap to reveal']] }] },
    },
    script: [
      { ms: 3000, screen: 'docs', cap: 'Passports, visas and insurance together' },
      { tap: 'details', cap: 'Tap Details' },
      { ms: 3400, sheet: 'detail', cap: 'Numbers stay hidden until you reveal them' },
    ],
  },
  'profile-loyalty': {
    screens: {
      cards: { back: true, title: 'Loyalty cards', blocks: [
        { t: 'btn', label: 'Add a card', icon: 'plus', tap: 'add' },
        { t: 'rows', items: [{ icon: 'plane', tone: 'info', title: 'Iberia Plus', meta: 'Silver member' }, { icon: 'stay', tone: 'stay', title: 'Marriott Bonvoy', meta: 'Member number saved' }] },
      ] },
    },
    sheets: {
      form: { title: 'Add a loyalty card', blocks: [
        { t: 'field', icon: 'card', text: 'Program name: British Airways Executive Club' },
        { t: 'field', icon: 'edit', text: 'Membership number: BA123456789' },
        { t: 'btn', label: 'Save', tap: 'save' },
      ] },
    },
    script: [
      { ms: 2800, screen: 'cards', cap: 'Your programs, all in one list' },
      { tap: 'add', cap: 'Add a card' },
      { ms: 3000, sheet: 'form', cap: 'Program name and membership number' },
      { tap: 'save' },
      { ms: 2400, sheet: null, toast: 'Card saved', cap: 'Ready at check-in' },
    ],
  },
  'profile-settings': {
    screens: {
      settings: { back: true, title: 'Settings', blocks: [
        { t: 'label', text: 'Goose inbox' },
        { t: 'rows', items: [{ icon: 'mail', tone: 'accent', title: 'Your private address', meta: 'Forward bookings here', end: 'Copy', tap: 'copy' }] },
        { t: 'label', text: 'Appearance' },
        { t: 'chips', items: ['System', 'Light', 'Dark'], on: 0 },
        { t: 'facts', items: [['Home currency', 'USD'], ['Passport country', 'GB']] },
      ] },
    },
    script: [
      { ms: 2800, screen: 'settings', cap: 'Your private Goose inbox address' },
      { tap: 'copy', cap: 'Tap Copy, then forward bookings to it' },
      { ms: 2600, toast: 'Inbox address copied', cap: 'Light, dark, or follow your phone' },
      { ms: 2600, cap: 'Home currency and passport country tune Tools' },
    ],
  },
  'profile-help': {
    screens: {
      profile: { title: 'Profile', blocks: [
        { t: 'rows', items: [
          { icon: 'help', tone: 'success', title: 'Help and FAQ', meta: 'How everything works', tap: 'help' },
          { icon: 'compass', tone: 'accent', title: 'Take the tour', meta: 'A two-minute look at everything STT does' },
        ] },
      ] },
      help: { back: true, title: 'Help and FAQ', blocks: [
        { t: 'field', icon: 'search', text: 'Search, e.g. forward email' },
        { t: 'rows', items: [{ icon: 'inbox', tone: 'accent', title: 'Forward a booking', meta: 'Send it to your Goose inbox' }, { icon: 'users', tone: 'info', title: 'Travel together', meta: 'Invite people to a trip' }] },
      ] },
    },
    script: [
      { ms: 2600, screen: 'profile', cap: 'Help and FAQ lives on Profile' },
      { tap: 'help' },
      { ms: 3400, screen: 'help', cap: 'Search for any question' },
      { ms: 2600, cap: 'Or take the full tour any time' },
    ],
  },
}

/**
 * Per-stage view state for a scene: screen and sheet carry forward (sheet: null closes it), toast and tap do not.
 * Captions are numbered 1, 2, 3 in order. Pure, so the test can walk every stage.
 */
export function resolveStages(scene) {
  let screen = Object.keys(scene.screens)[0], sheet = null, n = 0
  return scene.script.map(st => {
    if (st.screen) screen = st.screen
    if (st.sheet !== undefined) sheet = st.sheet
    const cap = st.cap ? { n: ++n, text: st.cap } : undefined
    return { ms: st.ms, tap: st.tap, cap, screen, sheet, toast: st.toast }
  })
}

/** Every data-tap name a stage of this scene can find on its visible screen or sheet. */
export function tapsOn(scene, stage) {
  const out = new Set()
  const view = [scene.screens[stage.screen], stage.sheet && scene.sheets?.[stage.sheet]].filter(Boolean)
  const walk = (b) => {
    if (b.tap) out.add(b.tap)
    ;(b.items || []).forEach(i => { if (i && typeof i === 'object' && i.tap) out.add(i.tap) })
    ;(b.actions || []).forEach(a => a.tap && out.add(a.tap))
    if (b.btn?.tap) out.add(b.btn.tap)
  }
  view.forEach(v => { (v.blocks || []).forEach(walk); if (v.action?.tap) out.add(v.action.tap); if (v.back) out.add('back') })
  return out
}
